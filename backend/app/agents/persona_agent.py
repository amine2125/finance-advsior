"""Agent 5 - Persona & Suitability: deterministic rules (already computed) + an LLM narrative bounded by them."""
from __future__ import annotations

from ..models import InvestorProfile

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
            f"revue si perte {b.drawdown_review * 100:.0f} %. Contrainte déterminante: {b.binding_constraint_note}."
            + _kyc_text(p))


def _kyc_text(p: InvestorProfile) -> str:
    k = p.kyc or {}
    if not k:
        return ""
    snap = k.get("snapshot") or {}
    bits = [f"tolérance {k['tolerance']['level']}", f"capacité {k['capacity']['level']}", f"limite fixée par: {k['binding']}"]
    if k.get("knowledge", {}).get("level"):
        bits.append(f"connaissances {k['knowledge']['level']}")
    if k["tolerance"].get("inconsistent"):
        bits.append("réponses contradictoires sur le risque (la plus prudente est retenue)")
    if "emergency_months" in snap:
        bits.append(f"épargne d'urgence {snap['emergency_months']:g} mois de dépenses")
    if "monthly_margin" in snap:
        bits.append(f"marge mensuelle {snap['monthly_margin']:.0f} $")
    steps = [s["title"] for s in k.get("before_investing", [])]
    out = "\nCONNAISSANCE DU CLIENT: " + "; ".join(bits) + "."
    if steps:
        out += " AVANT D'INVESTIR EN BOURSE, signale que ces étapes sont habituellement prioritaires: " + "; ".join(steps) + "."
    return out


