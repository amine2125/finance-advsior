"""Shared cache of the live research sources (SEC EDGAR, GDELT, CoinGecko), so an analysis does not wait for them.

Reading the sources at analysis time cost 15 to 30 s per « Je veux X $ de NVIDIA »: GDELT accepts one request every 5 s and the
attention timeline often needs retries, then a language model extracts the claims. The same reads now happen ahead of time:
  - a scheduled refresh (AEGIS_NEWS_REFRESH_MIN, 15 min by default: GDELT itself updates every 15 min, so polling faster
    brings nothing new) re-reads the free sources for every single security and crypto of the universe;
  - opening a security's page warms its sources AND its claim extraction, while the person reads the page.
An analysis then reuses what is still fresh and reads live only what is missing or too old, exactly as before.

Nothing about the result changes except its age, and the age is never hidden: each part keeps the moment it was really read,
the audit trail logs « cache » with that moment, and the dates note uses it (énoncé p. 14: date d'observation vs publication).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import logging
import time
from concurrent.futures import ThreadPoolExecutor

from ..storage.store import get_store

log = logging.getLogger("aegis.news_cache")
OWNER = "_shared"   # one copy for everyone: these are public sources, never personal data
KIND = "NEWS"
# How long a part is reused by an analysis. Articles slightly over the refresh period, so a refresh always lands first;
# the 90-day attention timeline and the filings change slowly.
MAX_AGE_S = {"filings": 3600, "articles": 20 * 60, "timeline": 6 * 3600, "cg_snap": 20 * 60, "cg_trend": 20 * 60}
STALE_FALLBACK_S = 24 * 3600  # a live source that fails: a dated copy up to a day old beats no source at all
PROVIDER = {"filings": ("sec_filings", "sec_edgar"), "articles": ("news_search", "gdelt"), "timeline": ("news_attention_timeline", "gdelt"),
            "cg_snap": ("crypto_snapshot", "coingecko"), "cg_trend": ("crypto_trending", "coingecko")}


def _iso(t: float) -> str:
    return dt.datetime.fromtimestamp(t, tz=dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def load(asset_id: str) -> dict:
    try:
        return get_store().get(OWNER, KIND, asset_id) or {}
    except Exception:  # noqa: BLE001 - the cache is an accelerator: a failure means « read live », never an error
        return {}


def _save_part(asset_id: str, updates: dict) -> None:
    try:
        rec = load(asset_id)  # re-read: a refresh and an analysis may write the same record
        rec.setdefault("parts", {}).update(updates.get("parts", {}))
        if "claims" in updates:
            rec["claims"] = updates["claims"]
        rec["asset_id"] = asset_id
        get_store().put(OWNER, KIND, asset_id, rec, ttl_s=2 * 86400)
    except Exception as exc:  # noqa: BLE001
        log.warning("news cache write failed for %s: %s", asset_id, exc)


def news_query(name: str) -> str:
    import re

    base = re.sub(r"\b(inc|corp|corporation|class a|ltd|plc|co)\b\.?", "", name, flags=re.IGNORECASE).strip(" .,&")
    return f'"{base}"'


def gather(md, asset_id: str, tool, max_age: dict | None = None) -> dict:
    """The raw sources for one security: {part: data or None} plus `read_at` (ISO, oldest read actually used).
    Parts still fresh come from the cache; the others are read live, in parallel across providers."""
    meta = md.asset(asset_id)
    ages = MAX_AGE_S | (max_age or {})
    query = news_query(meta["name"])
    today = dt.date.today()
    wanted = []
    if meta.get("cik"):
        wanted.append("filings")
    if meta["asset_class"] == "crypto" and meta.get("coingecko_id"):
        wanted += ["cg_snap", "cg_trend"]
    wanted += ["articles", "timeline"]
    fetch = {
        "filings": lambda: tool.filings(meta["cik"], days=120, until=today),
        "cg_snap": lambda: tool.crypto_snapshot(meta["coingecko_id"]),
        "cg_trend": lambda: tool.crypto_trending(),
        "articles": lambda: tool.news(query, days=14),
        "timeline": lambda: tool.news_timeline(query, days=90),
    }
    out: dict = {p: None for p in PROVIDER}
    if not tool.enabled:  # no Internet: behave exactly as before (each call logged as disabled), never serve an old copy
        for p in wanted:
            if p != "timeline":
                out[p] = fetch[p]()
        out["read_at"] = None
        return out
    cached = load(asset_id).get("parts", {})
    now = time.time()
    used_at: list[float] = []
    fresh_writes: dict = {}

    def one(p: str):
        c = cached.get(p)
        if c and now - c["at"] < ages[p]:
            tool.cached(*PROVIDER[p], _iso(c["at"]), len(c["data"]) if isinstance(c["data"], list) else 1)
            return c["data"], c["at"]
        data = fetch[p]()
        if data is not None:
            t = time.time()
            fresh_writes[p] = {"data": data, "at": t}
            return data, t
        if c and now - c["at"] < STALE_FALLBACK_S:
            tool.cached(*PROVIDER[p], _iso(c["at"]), len(c["data"]) if isinstance(c["data"], list) else 1, stale=True)
            return c["data"], c["at"]
        return None, None

    def gdelt_chain():  # one provider, one rate limit: the timeline follows the articles, as before
        res = {"articles": one("articles")}
        res["timeline"] = one("timeline") if res["articles"][0] is not None else (None, None)
        return res

    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = [ex.submit(gdelt_chain)]
        futs += [ex.submit(lambda p=p: {p: one(p)}) for p in wanted if p not in ("articles", "timeline")]
        for f in futs:
            for p, (data, at) in f.result().items():
                out[p] = data
                if data is not None and at:
                    used_at.append(at)
    if fresh_writes:
        _save_part(asset_id, {"parts": fresh_writes})
    out["read_at"] = _iso(min(used_at)) if used_at else None
    return out


def claims_key(asset_id: str, clusters: list[dict], max_clusters: int = 25) -> str:
    sig = "|".join(f"{c['cluster_id']}:{c['title']}:{c.get('first_seen')}" for c in clusters[:max_clusters])
    return hashlib.sha256(f"{asset_id}|{sig}".encode()).hexdigest()[:24]


def cached_claims(asset_id: str, key: str):
    c = load(asset_id).get("claims") or {}
    if c.get("key") == key:
        return c["raw"], dict(c["extraction"], cached_at=_iso(c["at"]))
    return None


def store_claims(asset_id: str, key: str, raw: list[dict], extraction: dict) -> None:
    if extraction.get("method") not in ("llm", "none"):  # a fallback after a model error must not stick: retry next time
        return
    _save_part(asset_id, {"claims": {"key": key, "raw": raw, "extraction": {k: v for k, v in extraction.items() if k != "usage"}, "at": time.time()}})


def is_warm(md, asset_id: str) -> bool:
    """True when an analysis of this security would read nothing live (sources fresh, claims extracted for these articles)."""
    rec = load(asset_id)
    parts, now = rec.get("parts", {}), time.time()
    meta = md.asset(asset_id)
    need = ["articles"] + (["filings"] if meta.get("cik") else []) + (["cg_snap"] if meta["asset_class"] == "crypto" else [])
    return all(p in parts and now - parts[p]["at"] < MAX_AGE_S[p] * 0.75 for p in need) and bool(rec.get("claims"))


def refresh_targets(md) -> list[str]:
    """What the scheduled refresh keeps warm: single securities and cryptos (diversified funds are not researched by name)."""
    u = md.universe
    return [aid for aid, r in u.iterrows() if int(r.get("is_single_issuer", 0) or 0) == 1]
