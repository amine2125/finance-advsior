"""Registered job kinds: debate, hype research, copilot chat, guardian replay, report generation."""
from __future__ import annotations

from ..agents.supervisor import run_debate
from ..data.registry import get_market_data
from ..storage.store import get_store
from . import portfolio_service as ps
from .jobs import handler


@handler("debate")
def _debate(tracker, owner, req):
    res = run_debate(tracker, owner, req)
    return {"debate_id": res["debate_id"], "status": res["decision"]["final_assessment"].get("status"),
            "headline": res["decision"]["final_assessment"].get("headline")}, res["debate_id"]


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


@handler("replay")
def _replay(tracker, owner, req):
    from ..guardian.replay import run_replay

    res = run_replay(tracker, owner, req)
    return {"replay_id": res["replay_id"], "alerts": len(res["alerts"])}, res["replay_id"]


@handler("report")
def _report(tracker, owner, req):
    from .report_service import generate_report

    res = generate_report(tracker, owner, req)
    return {"report_id": res["report_id"]}, res["report_id"]
