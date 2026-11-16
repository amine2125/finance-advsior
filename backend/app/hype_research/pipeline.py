"""Module G deep-research pipeline: identity -> evidence -> dedup -> claims -> verification -> attention -> lenses -> persona fit."""
from __future__ import annotations

import datetime as dt
import re


from ..analytics.bias import detect_biases
from ..analytics.forecast_policy import four_part_answer, is_prediction_request
from ..analytics.lenses import coverage_report, run_asset_lenses, single_asset_status_rule, stop_flags
from ..analytics.trend import volume_zscore
from ..data.loader import MarketData
from ..ids import new_id
from ..models import InvestorProfile, Portfolio, utcnow
from ..web_research.tool import WebResearchTool
from .attention import attention_index, diversity_component, momentum_component, news_volume_component, trading_volume_component
from .claims import extract_claims, make_price_checker, verify_claims
from .dedup import cluster_articles, independence_summary
from . import news_cache
from .fixtures import FIXTURE_LABEL, fixture_articles, fixture_claims

NOT_CONNECTED = [
    {"family": "Réseaux sociaux (Reddit, X)", "status": "NOT_CONNECTED", "reason": "aucun accès autorisé configuré"},
    {"family": "Google Trends", "status": "NOT_CONNECTED", "reason": "aucun accès autorisé configuré"},
    {"family": "Consensus et révisions d'analystes", "status": "NOT_CONNECTED", "reason": "fournisseur sous licence requis"},
    {"family": "Positions vendeurs à découvert", "status": "NOT_CONNECTED", "reason": "fournisseur sous licence requis"},
    {"family": "Transactions d'initiés classées", "status": "NOT_CONNECTED", "reason": "classification routinière/non routinière non implémentée"},
    {"family": "Compositions de FNB", "status": "NOT_CONNECTED", "reason": "jeu de données daté vérifié requis"},
    {"family": "Notes ESG", "status": "NOT_CONNECTED", "reason": "aucune source ESG fiable connectée"},
]


def resolve_asset(md: MarketData, query: str) -> dict:
    q = (query or "").strip()
    if not q:
        return {"status": "empty", "candidates": []}
    qu, ql = q.upper(), q.lower()
    if md.has_asset(qu):
        return {"status": "resolved", "asset_id": qu, "match": "ticker exact"}
    cands = []
    for aid, row in md.universe.iterrows():
        names = [str(row["name"]).lower()] + [a.strip() for a in str(row.get("aliases") or "").split(";") if a.strip()]
        base = aid.split(".")[0].split("-")[0].lower()
        if ql == base or ql in names:
            cands.append({"asset_id": aid, "name": row["name"], "match": "alias exact"})
        elif len(ql) >= 3 and any(ql in n for n in names):
            cands.append({"asset_id": aid, "name": row["name"], "match": "nom partiel"})
    exact = [c for c in cands if c["match"] == "alias exact"]
    if len(exact) == 1:
        return {"status": "resolved", "asset_id": exact[0]["asset_id"], "match": exact[0]["match"], "candidates": cands}
    if len(cands) == 1:
        return {"status": "resolved", "asset_id": cands[0]["asset_id"], "match": cands[0]["match"], "candidates": cands}
    if len(cands) > 1:
        return {"status": "ambiguous", "candidates": cands, "message": "Plusieurs actifs correspondent: précisez le symbole."}
    return {"status": "not_in_universe", "candidates": [],
            "message": f"« {q} » n'est pas dans l'univers du jeu de données; aucune analyse de risque ne peut être calculée sans historique."}


def _relevance_terms(md: MarketData, asset_id: str) -> list[str]:
    row = md.asset(asset_id)
    base = re.sub(r"\b(inc|corp|corporation|class a|ltd|plc|co)\b\.?", "", str(row["name"]), flags=re.IGNORECASE).strip(" .,&").lower()
    terms = {base, base.split(" ")[0], asset_id.split(".")[0].split("-")[0].lower()}
    terms |= {a.strip().lower() for a in str(row.get("aliases") or "").split(";") if a.strip()}
    return sorted(t for t in terms if len(t) >= 3)


def _relevant(md: MarketData, asset_id: str, articles: list[dict], use_fixture: bool) -> tuple[list[dict], int]:
    """Keeps the articles whose title names the security (GDELT matches loosely); returns them and how many were dropped."""
    if use_fixture or not articles:
        return articles, 0
    terms = _relevance_terms(md, asset_id)
    kept = [a for a in articles if any(t in (a.get("title") or "").lower() for t in terms)]
    return kept, len(articles) - len(kept)


def _claims(asset_id: str, name: str, clusters: list[dict]) -> tuple[list[dict], dict]:
    """Claim extraction (language model), reused while the articles are the same ones."""
    key = news_cache.claims_key(asset_id, clusters)
    hit = news_cache.cached_claims(asset_id, key)
    if hit:
        return hit
    raw, extraction = extract_claims(clusters, name)
    news_cache.store_claims(asset_id, key, raw, extraction)
    return raw, extraction


def warm(md: MarketData, asset_id: str) -> dict:
    """Reads the sources and extracts the claims ahead of an analysis (security page opened). Same code path as run_research."""
    tool = WebResearchTool()
    src = news_cache.gather(md, asset_id, tool)
    articles, _ = _relevant(md, asset_id, src["articles"] or [], False)
    clusters = cluster_articles(articles)
    raw, extraction = _claims(asset_id, md.asset(asset_id)["name"], clusters)
    return {"asset_id": asset_id, "read_at": src["read_at"], "articles": len(articles), "claims": len(raw), "extraction": extraction.get("method"),
            "tool_calls": [{"tool": c["tool"], "status": c["status"]} for c in tool.calls]}


def refresh(md: MarketData, asset_ids: list[str] | None = None, period_s: int = 900) -> dict:
    """Scheduled refresh of the free sources (no language model: claims are extracted on demand). Parts older than ~80 % of
    the period are re-read, so the next analysis finds them fresh."""
    ages = {k: min(v, int(period_s * 0.8)) for k, v in news_cache.MAX_AGE_S.items() if k in ("articles", "cg_snap", "cg_trend")}
    done, failed = 0, []
    for aid in asset_ids or news_cache.refresh_targets(md):
        try:
            tool = WebResearchTool()
            if not tool.enabled:
                return {"refreshed": 0, "disabled": True}
            src = news_cache.gather(md, aid, tool, max_age=ages)
            missing = [k for k in ("articles", "timeline") if src.get(k) is None]
            if missing:  # a source that fails returns None instead of raising: say so, the next cycle retries it
                failed.append(f"{aid}: {'+'.join(missing)} indisponible")
            done += 1
        except Exception as exc:  # noqa: BLE001 - one security failing never stops the others
            failed.append(f"{aid}: {str(exc)[:80]}")
    return {"refreshed": done, "failed": failed}


def research_dates(prices_as_of: dt.date, researched_on: dt.date, nothing_live: bool = False, read_at: str | None = None) -> dict:
    """Prices stop at the dataset's last day; news and filings are read live. Say so when the two differ (énoncé p. 14).
    `nothing_live`: fixture, or no live source answered, so there is no later information to warn about."""
    use_fixture = nothing_live
    gap = 0 if use_fixture else max(0, (researched_on - prices_as_of).days)
    note = None
    if gap:
        note = (f"Les prix s'arrêtent au {prices_as_of.isoformat()}, mais les nouvelles et les dépôts ont été lus le "
                f"{researched_on.isoformat()} : ils peuvent décrire {gap} jour(s) que les chiffres de risque ne contiennent pas encore.")
    return {"prices_as_of": prices_as_of.isoformat(), "researched_on": None if use_fixture else researched_on.isoformat(),
            "read_at": None if use_fixture else read_at, "gap_days": gap, "note": note}


def run_research(md: MarketData, asset_id: str, question: str, persona: InvestorProfile | None, portfolio: Portfolio | None,
                 amount_cad: float | None, *, use_fixture: bool = False, impact_fn=None, progress=None) -> dict:
    def step(name, status="running", detail=None):
        if progress:
            progress(name, status, detail)

    rid = new_id("hype")
    meta = md.asset(asset_id)
    name = meta["name"]
    tool = WebResearchTool()
    today = dt.date.today()
    evidence: list[dict] = []
    step("market_intelligence.sources", "running", "Consultation des dépôts et sources d'actualités configurés")
    if use_fixture:
        src = {"filings": tool.filings(meta["cik"], days=120, until=today) if meta.get("cik") else None, "cg_snap": None, "cg_trend": None,
               "articles": fixture_articles(name.split()[0] if meta["asset_class"] == "crypto" else name, md.end_date.date().isoformat()),
               "timeline": None, "read_at": None}
        if meta["asset_class"] == "crypto" and meta.get("coingecko_id"):
            src["cg_snap"], src["cg_trend"] = tool.crypto_snapshot(meta["coingecko_id"]), tool.crypto_trending()
    else:
        src = news_cache.gather(md, asset_id, tool, live_timeline=False)  # fresh shared copy when there is one, live reads otherwise (never wait for the slow timeline)
    filings, cg_snap, cg_trend, timeline = src["filings"], src["cg_snap"], src["cg_trend"], src["timeline"]
    if filings is not None:  # None = provider failure, [] = no filing
        evidence += filings
    if cg_snap:
        evidence.append(cg_snap)
    if cg_trend:
        evidence.append({k: v for k, v in cg_trend.items() if k != "coins"} | {"coins_top": cg_trend["coins"][:15]})
    articles = src["articles"]
    news_status = "fixture" if use_fixture else ("ok" if articles is not None else "unavailable")
    articles, off_topic = _relevant(md, asset_id, articles or [], use_fixture)
    evidence += articles
    step("market_intelligence.sources", "done", f"{len(evidence)} éléments de preuve")
    step("market_intelligence.dedup", "running", "Déduplication des reprises et extraction des affirmations")
    clusters = cluster_articles(articles)
    indep = independence_summary(articles, clusters)
    if use_fixture:
        raw_claims, extraction = fixture_claims(), {"method": "fixture"}
    else:
        raw_claims, extraction = _claims(asset_id, name, clusters)
    checker = make_price_checker(md, asset_id, cg_snap)
    claims = verify_claims(raw_claims, clusters, filings, checker, md.end_date.date().isoformat())
    step("market_intelligence.dedup", "done", f"{indep['articles']} articles → {indep['independent_reports']} rapports indépendants; "
         f"{len(claims)} affirmations")
    # events timeline
    events = []
    for f in filings or []:
        events.append({"event_id": f["evidence_id"], "title": f["title"], "event_type": f["form"], "occurred_at": f.get("event_at"),
                       "published_at": f.get("published_at"), "url": f["canonical_url"], "primary_source": True, "status": "VERIFIED",
                       "red_flags": f.get("red_flags", []), "provider": "SEC EDGAR"})
    for c in clusters[:30]:
        events.append({"event_id": c["cluster_id"], "title": c["title"], "event_type": "news_cluster", "occurred_at": None,
                       "published_at": c["first_seen"], "url": next((a["canonical_url"] for a in articles if a["evidence_id"] == c["original_evidence_id"]), None),
                       "primary_source": False, "status": "REPORTED", "size": c["size"], "publishers": c["publishers"],
                       "provider": "fixture" if use_fixture else "GDELT"})
    events.sort(key=lambda e: e.get("published_at") or "", reverse=True)
    # attention indicators (computed outside the LLM)
    prices = md.native_series(asset_id, "adj_close")
    vol_series = md.native_series(asset_id, "volume") if asset_id in md.volume.columns else None
    components = {
        "news_volume": news_volume_component(timeline) if not use_fixture else {"status": "UNAVAILABLE", "reason": "fixture: pas de série"},
        "trading_volume": trading_volume_component(volume_zscore(vol_series) if vol_series is not None else None),
        "price_momentum": momentum_component(prices),
        "source_diversity": diversity_component(indep["independent_reports"] if news_status != "unavailable" else None),
    }
    trending = None
    if cg_trend:
        hit = next((c for c in cg_trend["coins"] if c["id"] == meta.get("coingecko_id")), None)
        trending = {"observed": True, "in_top": bool(hit), "rank": hit["rank"] if hit else None, "list_size": len(cg_trend["coins"]),
                    "top": cg_trend["coins"][:7], "note": "Recherches CoinGecko 24 h; affiché à part, hors indice"}
    att = attention_index(components)
    research = {"events": events, "claims": claims, "is_fixture": use_fixture}
    lenses, led = run_asset_lenses(md, asset_id, md.end_date, persona, research=research)
    impact = None
    if portfolio is not None and amount_cad and impact_fn:
        step("quant.portfolio_impact", "running", "Recalcul de la concentration et du risque avec l'ajout hypothétique")
        speculative = meta["asset_class"] == "crypto" or not any(e["primary_source"] for e in events)
        impact, impact_led = impact_fn(md, portfolio, persona, asset_id, amount_cad, speculative)
        led.merge(impact_led)
        step("quant.portfolio_impact", "done", None)
    breaches = [f"{b['label']} ({b['after']} > {b['limit']})" for b in (impact or {}).get("budget", []) if b["after_status"] not in ("OK", "UNKNOWN")]
    core_unverifiable = bool(claims) and all(c["status"] in ("UNVERIFIED", "UNKNOWN", "DISPUTED") for c in claims) and \
        not any(e["primary_source"] for e in events)
    stale = "STALE" in md.quality(asset_id).flags
    flags = stop_flags(lenses["lenses"], breaches, core_unverifiable, stale)
    rule = single_asset_status_rule(lenses["lenses"], flags, bool(breaches))
    coverage = coverage_report(lenses["lenses"], persona_limit_checked=impact is not None)
    divergence = None
    if att.get("value") is not None:
        thin = not any(e["primary_source"] for e in events)
        divergence = {"attention_high": att["value"] >= 60, "verified_evidence_thin": thin,
                      "flag": att["value"] >= 60 and thin,
                      "text": ("Attention élevée alors que les preuves vérifiées sont minces: schéma de « course à la performance »."
                               if att["value"] >= 60 and thin else "Pas de divergence attention/preuves détectée selon la règle.")}
    biases = detect_biases(question)
    forecast = four_part_answer(md, asset_id, md.end_date, led) if is_prediction_request(question) else None
    calls = tool.calls
    coverage_meter = [
        {"family": "Prix historiques (jeu de données)", "status": "OK", "detail": f"jusqu'au {md.end_date.date()}"},
        {"family": "Dépôts officiels (SEC EDGAR)", "status": ("OK" if filings is not None else "UNAVAILABLE") if meta.get("cik") else "NOT_APPLICABLE",
         "detail": f"{len(filings or [])} dépôts sur 120 jours" if filings is not None else (
             "émetteur non américain ou FNB/crypto" if not meta.get("cik") else "échec de l'appel")},
        {"family": "Actualités (GDELT)", "status": {"ok": "OK", "fixture": "FIXTURE", "unavailable": "UNAVAILABLE"}[news_status],
         "detail": (FIXTURE_LABEL if use_fixture else (f"{len(articles)} articles, 14 jours" if news_status == "ok" else
                    next((c.get("error") for c in calls if c["provider"] == "gdelt"), "indisponible")))},
        {"family": "Marché crypto en direct (CoinGecko)", "status": ("OK" if cg_snap else "UNAVAILABLE") if meta["asset_class"] == "crypto" else "NOT_APPLICABLE",
         "detail": (f"instantané {cg_snap.get('published_at')}" if cg_snap else "") if meta["asset_class"] == "crypto" else "actif non crypto"},
    ] + NOT_CONNECTED
    ok = sum(1 for c in coverage_meter if c["status"] in ("OK",))
    applicable = sum(1 for c in coverage_meter if c["status"] != "NOT_APPLICABLE")
    return {
        "research_id": rid, "asset_id": asset_id, "name": name, "asset_class": meta["asset_class"], "question": question,
        "persona_id": persona.persona_id if persona else None, "created_at": utcnow(), "data_as_of": md.end_date.date().isoformat(),
        "dates": research_dates(md.end_date.date(), dt.date.fromisoformat(src["read_at"][:10]) if src.get("read_at") else today,
                                use_fixture or not (filings is not None or news_status == "ok" or cg_snap), src.get("read_at")),
        "is_fixture": use_fixture, "fixture_label": FIXTURE_LABEL if use_fixture else None,
        "identity": {"asset_id": asset_id, "name": name, "exchange": meta.get("exchange"), "currency": meta["currency"],
                     "cik": meta.get("cik") or None, "coingecko_id": meta.get("coingecko_id") or None},
        "evidence": evidence, "clusters": clusters, "independence": indep | {"off_topic_filtered": off_topic}, "claims": claims, "extraction": extraction, "events": events,
        "attention": att, "search_trending": trending, "divergence": divergence, "market_live": cg_snap,
        "lenses": lenses["lenses"], "tier": lenses["tier"], "coverage_matrix": coverage, "status_rule": rule, "stop_flags": flags,
        "portfolio_impact": impact, "biases": biases, "forecast_policy": forecast, "tool_calls": calls,
        "coverage_meter": coverage_meter, "coverage_ratio": ok / applicable if applicable else 0,
        "ledger": led.as_dict(),
        "separation": {"attention": "indicateur heuristique d'attention", "asset_risk": "niveau et métriques de risque (lentille 3)",
                       "portfolio_impact": "effet calculé de l'ajout hypothétique", "persona_fit": "budget de risque avant/après"},
    }
