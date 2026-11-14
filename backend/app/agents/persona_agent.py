"""Agent 5 - Persona & Suitability: deterministic rules (already computed) + an LLM narrative bounded by them."""
from __future__ import annotations

from ..config import get_settings
from ..models import AgentArgument, InvestorProfile
from .base import EvidencePacket, compact_json
from .llm import LLMClient, json_call
from .prompts import PERSONA_SYSTEM

AGENT_ID = "persona_agent"


def persona_text(p: InvestorProfile | None) -> str:
    if p is None:
        return "Aucun profil sélectionné: l'adéquation ne peut pas être évaluée."
    b = p.budget
    tol = f"{p.stated_max_decline * 100:.0f} %" if p.stated_max_decline else "non déclarée"
    return (f"{p.display_name} (id {p.persona_id}) – profil {p.risk_profile_label}; horizon {p.horizon_years_min:g}"
            f"{'–' + format(p.horizon_years_max, 'g') if p.horizon_years_max else '+'} ans; objectif: {p.objective}; préférences: "
            f"{'; '.join(p.preferences)}; baisse tolérée déclarée: {tol} ({p.stated_max_decline_provenance}); réserve d'urgence: "
            f"{p.emergency_reserve}; besoins de liquidité: {p.liquidity_needs}; ESG: {p.esg_preference}.\n"
            f"Budget de risque (ids persona.{p.persona_id}.*): croissance {b.growth_min * 100:.0f}–{b.growth_max * 100:.0f} %, émetteur max "
            f"{b.max_single_issuer * 100:.0f} %, secteur max {b.max_single_sector * 100:.0f} %, poche spéculative ≤ {b.max_speculative * 100:.0f} %, "
            f"revue si perte {b.drawdown_review * 100:.0f} %. Contrainte déterminante: {b.binding_constraint_note}.")


def assess(llm: LLMClient | None, packet: EvidencePacket, deterministic: dict | None, opp: AgentArgument | None,
           risk: AgentArgument | None) -> tuple[dict, dict]:
    if deterministic is None:
        return {"narrative": "Aucun profil sélectionné.", "incompatible_assumptions": [], "uncertainties": ["profil manquant"]}, {}
    if llm is None:
        return {"narrative": deterministic["summary"], "incompatible_assumptions": [], "uncertainties": deterministic["uncertainties"]}, {}
    s = get_settings()
    user = (f"PROFIL:\n{packet.persona_text}\n\nÉVALUATION DÉTERMINISTE (ne pas modifier):\n{compact_json(deterministic)}\n\n"
            f"MÉTRIQUES:\n{packet.metrics_text(90)}\n\nPOSITION OPPORTUNITÉ: {opp.position if opp else '(échec)'}\n"
            f"POSITION RISQUE: {risk.position if risk else '(échec)'}")
    data, usage = json_call(llm, system=PERSONA_SYSTEM, user=user, model_id=s.agent_model_id, max_tokens=1600, agent_id=AGENT_ID)
    return data, usage
