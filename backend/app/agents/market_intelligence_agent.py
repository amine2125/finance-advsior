"""Agent 7 - Market Intelligence & Hype Research (uses WebResearchTool through the research pipeline)."""
from __future__ import annotations

from ..data.loader import MarketData
from ..hype_research.pipeline import resolve_asset, run_research
from ..services.impact_service import hypothetical_addition

AGENT_ID = "market_intelligence_agent"


def investigate(md: MarketData, asset_id: str, question: str, persona, portfolio, amount_cad, use_fixture=False, progress=None) -> dict:
    return run_research(md, asset_id, question, persona, portfolio, amount_cad, use_fixture=use_fixture,
                        impact_fn=hypothetical_addition, progress=progress)


def events_text(research: dict) -> str:
    lines = []
    for e in research.get("events", [])[:25]:
        lines.append(f"{e['event_id']} | {e.get('published_at') or e.get('occurred_at') or 'date inconnue'} | {e['status']} | "
                     f"{'source primaire' if e['primary_source'] else 'couverture médiatique'} | {e['title'][:140]}")
    return "\n".join(lines)


def claims_text(research: dict) -> str:
    lines = [f"{c['claim_id']} | {c['status']} | {c['claim_type']} | {c['proposition'][:160]} | {c['rationale'][:160]}"
             for c in research.get("claims", [])[:20]]
    head = ""
    if research.get("is_fixture"):
        head = "ATTENTION: " + (research.get("fixture_label") or "fixture") + "\n"
    att = research.get("attention", {})
    head += (f"Indice d'attention heuristique: {att.get('value')} ({att.get('band')}) – couverture {att.get('coverage', 0) * 100:.0f} %"
             if att.get("value") is not None else f"Indice d'attention: INDISPONIBLE ({att.get('reason')})")
    ind = research.get("independence", {})
    head += f"\nArticles: {ind.get('articles')} → rapports indépendants: {ind.get('independent_reports')} (copies: {ind.get('syndicated_or_duplicate')})"
    return head + "\n" + "\n".join(lines)


__all__ = ["investigate", "resolve_asset", "events_text", "claims_text"]
