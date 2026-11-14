"""Research provider adapters. Each returns normalized dicts with provenance; none fabricates content."""
from __future__ import annotations

import datetime as dt
import hashlib
from urllib.parse import urlparse

from ..fundamentals_providers import edgar
from ..models import utcnow
from .http import STATUS, ResearchError, fetch_json
from .sanitize import sanitize_text

ITEMS_8K = {
    "1.01": "Conclusion d'une entente importante", "1.02": "Résiliation d'une entente importante", "1.03": "Faillite ou mise sous séquestre",
    "1.05": "Incident de cybersécurité important", "2.01": "Acquisition ou cession d'actifs conclue", "2.02": "Résultats d'exploitation",
    "2.03": "Nouvelle obligation financière directe", "2.05": "Coûts de sortie ou de restructuration", "2.06": "Dépréciations importantes",
    "3.01": "Avis de radiation de la cote", "3.02": "Ventes de titres non enregistrées", "4.01": "Changement d'auditeur",
    "4.02": "Les états financiers antérieurs ne sont plus fiables", "5.02": "Départ ou nomination de dirigeants/administrateurs",
    "5.03": "Modification des statuts", "5.07": "Vote des actionnaires", "7.01": "Divulgation Reg FD", "8.01": "Autres événements",
    "9.01": "États financiers et pièces jointes",
}
RED_FLAG_ITEMS = {"1.03": "faillite", "2.06": "dépréciation", "4.01": "changement d'auditeur", "4.02": "non-fiabilité des états antérieurs",
                  "3.01": "radiation", "1.05": "incident cyber"}


def _hash(*parts: str) -> str:
    return hashlib.sha256("|".join(p or "" for p in parts).encode()).hexdigest()[:16]


# ------------------------------------------------------------------------------------------- SEC EDGAR
def sec_filings(cik: str, since: dt.date, until: dt.date) -> list[dict]:
    try:
        rows = edgar.recent_filings(cik, since, until)
        STATUS["sec_edgar"].calls += 1
        STATUS["sec_edgar"].last_success = utcnow()
    except edgar.ProviderError as exc:
        STATUS["sec_edgar"].errors += 1
        STATUS["sec_edgar"].last_error, STATUS["sec_edgar"].last_error_at = str(exc), utcnow()
        raise ResearchError("sec_edgar", str(exc))
    out = []
    for f in rows:
        items = [i.strip() for i in (f.get("items") or "").split(",") if i.strip()]
        labels = [ITEMS_8K.get(i, i) for i in items]
        title = f"{f['form']} déposé le {f['filing_date']}" + (f" – {', '.join(labels)}" if labels else "")
        out.append({"evidence_id": f"sec.{f['accession_number']}", "kind": "filing", "provider": "sec_edgar",
                    "publisher": "U.S. SEC EDGAR (dépôt de l'émetteur)", "title": title, "canonical_url": f["url"],
                    "published_at": f.get("acceptance") or f["filing_date"], "event_at": f.get("report_date") or f["filing_date"],
                    "retrieved_at": utcnow(), "is_original": True, "form": f["form"], "items": items, "item_labels": labels,
                    "red_flags": [RED_FLAG_ITEMS[i] for i in items if i in RED_FLAG_ITEMS],
                    "content_hash": _hash(f["accession_number"]), "access_rights": "Données publiques SEC; lien vers le document original"})
    return out


# ------------------------------------------------------------------------------------------- GDELT
def _gdelt(params: dict) -> dict:
    data = fetch_json("gdelt", "https://api.gdeltproject.org/api/v2/doc/doc", params={**params, "format": "json"}, ttl_s=1800,
                      retries=1)
    if not isinstance(data, dict):
        raise ResearchError("gdelt", "réponse inattendue")
    return data


def gdelt_articles(query: str, days: int = 14, max_records: int = 75) -> list[dict]:
    try:
        data = _gdelt({"query": query, "mode": "artlist", "maxrecords": max_records, "timespan": f"{days}d", "sort": "datedesc"})
    except ResearchError as exc:
        if "non JSON" in str(exc) and "limit requests" in str(exc):
            STATUS["gdelt"].rate_limited += 1
            raise ResearchError("gdelt", "GDELT refuse la requête (limite d'une requête / 5 s par IP; IP partagée possible)", "rate_limited")
        raise
    out = []
    for a in data.get("articles", []) or []:
        title, flags = sanitize_text(a.get("title"), 300)
        url = a.get("url")
        domain = a.get("domain") or (urlparse(url).hostname if url else None)
        seen = a.get("seendate")
        published = None
        if seen and len(seen) >= 15:
            published = f"{seen[0:4]}-{seen[4:6]}-{seen[6:8]}T{seen[9:11]}:{seen[11:13]}:{seen[13:15]}Z"
        out.append({"evidence_id": f"gdelt.{_hash(url or title)}", "kind": "news_article", "provider": "gdelt", "publisher": domain,
                    "title": title, "canonical_url": url, "published_at": published, "retrieved_at": utcnow(),
                    "language": a.get("language"), "source_country": a.get("sourcecountry"), "injection_flags": flags,
                    "content_hash": _hash(title or "", domain or ""),
                    "access_rights": "Métadonnées GDELT (titre, lien, date); article non copié",
                    "note": "date = première détection par GDELT, proxy de la date de publication"})
    return out


def gdelt_timeline(query: str, days: int = 90) -> list[dict]:
    data = _gdelt({"query": query, "mode": "timelinevolraw", "timespan": f"{days}d"})
    tl = (data.get("timeline") or [{}])[0].get("data", [])
    out = []
    for p in tl:
        d = p.get("date", "")
        out.append({"date": f"{d[0:4]}-{d[4:6]}-{d[6:8]}" if len(d) >= 8 else d, "count": p.get("value"), "norm": p.get("norm")})
    return out


# ------------------------------------------------------------------------------------------- CoinGecko
CG = "https://api.coingecko.com/api/v3"


def coingecko_snapshot(coin_id: str) -> dict:
    d = fetch_json("coingecko", f"{CG}/coins/{coin_id}", params={"localization": "false", "tickers": "false", "community_data": "false",
                                                                 "developer_data": "false", "sparkline": "false"}, ttl_s=300)
    m = d.get("market_data", {})
    return {"evidence_id": f"cg.{coin_id}.{(d.get('last_updated') or '')[:16]}", "kind": "market_snapshot", "provider": "coingecko",
            "publisher": "CoinGecko", "title": f"Instantané de marché {d.get('name')}", "canonical_url": f"https://www.coingecko.com/en/coins/{coin_id}",
            "published_at": d.get("last_updated"), "retrieved_at": utcnow(), "coin_id": coin_id, "name": d.get("name"),
            "symbol": (d.get("symbol") or "").upper(), "market_cap_rank": d.get("market_cap_rank"),
            "price_usd": m.get("current_price", {}).get("usd"), "price_cad": m.get("current_price", {}).get("cad"),
            "change_24h": m.get("price_change_percentage_24h"), "change_7d": m.get("price_change_percentage_7d"),
            "change_30d": m.get("price_change_percentage_30d"), "ath_usd": m.get("ath", {}).get("usd"),
            "ath_date": m.get("ath_date", {}).get("usd"), "ath_change_pct": m.get("ath_change_percentage", {}).get("usd"),
            "volume_usd": m.get("total_volume", {}).get("usd"), "market_cap_usd": m.get("market_cap", {}).get("usd"),
            "access_rights": "API publique CoinGecko; attribution « Data provided by CoinGecko »"}


def coingecko_trending() -> dict:
    d = fetch_json("coingecko", f"{CG}/search/trending", ttl_s=600)
    coins = []
    for i, c in enumerate(d.get("coins", [])):
        it = c.get("item", {})
        coins.append({"rank": i + 1, "id": it.get("id"), "name": it.get("name"), "symbol": it.get("symbol"),
                      "market_cap_rank": it.get("market_cap_rank")})
    return {"evidence_id": f"cg.trending.{utcnow()[:13]}", "kind": "attention_series", "provider": "coingecko", "publisher": "CoinGecko",
            "title": "Cryptoactifs les plus recherchés sur CoinGecko (24 h)", "canonical_url": "https://www.coingecko.com/en/highlights/trending-crypto",
            "retrieved_at": utcnow(), "coins": coins,
            "note": "Mesure d'attention (recherches sur CoinGecko), pas une mesure de qualité"}


def coingecko_search(query: str) -> list[dict]:
    d = fetch_json("coingecko", f"{CG}/search", params={"query": query}, ttl_s=3600)
    return [{"id": c.get("id"), "name": c.get("name"), "symbol": c.get("symbol"), "market_cap_rank": c.get("market_cap_rank")}
            for c in (d.get("coins") or [])[:8]]


def coingecko_history(coin_id: str, days: int = 365) -> list[dict]:
    d = fetch_json("coingecko", f"{CG}/coins/{coin_id}/market_chart", params={"vs_currency": "usd", "days": days, "interval": "daily"},
                   ttl_s=3600)
    prices = d.get("prices", [])
    vols = {int(v[0]): v[1] for v in d.get("total_volumes", [])}
    out = []
    for ts, px in prices:
        out.append({"date": dt.datetime.fromtimestamp(ts / 1000, tz=dt.timezone.utc).date().isoformat(), "price_usd": px,
                    "volume_usd": vols.get(int(ts))})
    return out


# ------------------------------------------------------------------------------------------- Bank of Canada
def boc_latest_fx() -> dict:
    d = fetch_json("bank_of_canada", "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json", params={"recent": 1}, ttl_s=3600)
    obs = (d.get("observations") or [{}])[-1]
    return {"date": obs.get("d"), "usdcad": float(obs.get("FXUSDCAD", {}).get("v")) if obs.get("FXUSDCAD") else None,
            "provider": "bank_of_canada", "retrieved_at": utcnow()}
