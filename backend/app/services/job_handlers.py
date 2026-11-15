"""Registered job kinds: the agentic mandate, Léa (copilot chat) and the news research shown on a security's page."""
from __future__ import annotations

from ..data.registry import get_market_data
from ..storage.store import get_store
from . import portfolio_service as ps
from .jobs import handler


@handler("hype")
def _hype(tracker, owner, req):
    from ..agents.market_intelligence_agent import investigate

    md = get_market_data()
    tracker.add("market_intelligence.resolve", "market_intelligence_agent", "Identification de l'actif")
    tracker.start("market_intelligence.resolve")
    asset_id = req["asset_id"]
    md.asset(asset_id)
    tracker.done("market_intelligence.resolve", asset_id)
    persona = ps.resolve_persona(owner, req.get("persona_id"))
    pf = ps.get_portfolio(owner, req["portfolio_id"]) if req.get("portfolio_id") else None
    res = investigate(md, asset_id, req.get("question") or f"Pourquoi {asset_id} attire-t-il l'attention ?", persona, pf,
                      req.get("amount_cad"), use_fixture=bool(req.get("use_fixture")), progress=tracker.progress_cb("market_intelligence_agent"))
    res["portfolio_id"] = req.get("portfolio_id")
    get_store().put(owner, "HYPE", res["research_id"], res)
    return {"research_id": res["research_id"]}, res["research_id"]


@handler("news_warm")
def _news_warm(tracker, owner, req):
    """A security's page was opened: read its sources and extract its claims now, so « Analyser » finds them ready."""
    from ..hype_research.pipeline import warm

    tracker.add("market_intelligence.warm", "market_intelligence_agent", "Lecture anticipée des sources")
    tracker.start("market_intelligence.warm")
    out = warm(get_market_data(), req["asset_id"])
    tracker.done("market_intelligence.warm", f"{out['articles']} article(s), {out['claims']} affirmation(s), lus le {out['read_at']}")
    return out, None


@handler("chat")
def _chat(tracker, owner, req):
    from ..agents.copilot import run_chat

    out = run_chat(tracker, owner, req)
    return out, out.get("message_id")


@handler("mandate")
def _mandate(tracker, owner, req):
    from ..agents.mandate import run_mandate

    out = run_mandate(tracker, owner, req)
    return {"mandate_id": out["mandate_id"]}, out["mandate_id"]
