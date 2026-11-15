"""« Est-ce que mon portefeuille me ressemble ? » — the portfolio checked against the investor's own profile, in plain words.

Every problem comes from a deterministic budget check (persona_rules.budget_checks) or the risk-level comparison; this module only
turns them into sentences a client understands, most serious first.
"""
from __future__ import annotations

from ..models import InvestorProfile

ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
TIER_FR = {"LOW": "faible", "MEDIUM": "moyen", "HIGH": "élevé"}


SHORT = {"budget.growth_band": "Actions et cryptos", "budget.theme_exposure": "Un seul thème", "budget.single_issuer": "Une seule entreprise",
         "budget.single_sector": "Un seul secteur", "budget.speculative": "Cryptoactifs", "budget.drawdown_review": "Pire baisse passée", "tier": "Risque global"}


def _numbers(c: dict, b) -> dict:
    """Numbers for a visual gauge: measured value against the limit (band for the growth share)."""
    rid = c["rule_id"]
    lim = {"budget.growth_band": b.growth_max, "budget.theme_exposure": b.max_single_sector, "budget.single_issuer": b.max_single_issuer,
           "budget.single_sector": b.max_single_sector, "budget.speculative": b.max_speculative, "budget.drawdown_review": b.drawdown_review}.get(rid)
    subject = c["measured"].split("(")[-1].rstrip(")") if "(" in c["measured"] else None
    return {"value": c.get("measured_value"), "limit_value": lim, "limit_min": b.growth_min if rid == "budget.growth_band" else None, "subject": subject}


def _sentence(c: dict, level: str) -> tuple[str, str] | None:
    rid, st, m, lim = c["rule_id"], c["status"], c["measured"], c["limit"]
    if st in ("OK", "UNKNOWN"):
        return None
    if rid == "budget.growth_band":
        if st == "ABOVE_BAND":
            return (f"Trop d'actions pour un profil {level}",
                    f"{m} de votre argent est en actions ou en cryptos; votre profil en prévoit {lim}. Une baisse des marchés vous ferait perdre plus que ce que vous pouvez supporter.")
        return (f"Pas assez de croissance pour votre objectif",
                f"Seulement {m} en actions; votre profil en prévoit {lim}. Votre argent risque de croître moins vite que prévu.")
    if rid == "budget.theme_exposure":
        return ("Tout repose sur un seul thème", f"{c['message']}. Si ce secteur chute, tout votre portefeuille chute avec lui. Maximum conseillé : {lim}.")
    if rid == "budget.single_issuer":
        return ("Trop d'argent dans une seule entreprise", f"{m} de votre portefeuille; maximum conseillé : {lim}. Une mauvaise nouvelle la concernant pèserait lourd.")
    if rid == "budget.single_sector":
        return ("Trop concentré dans un secteur", f"{m} en actions d'un même secteur; maximum conseillé : {lim}. Ces titres baissent souvent ensemble.")
    if rid == "budget.speculative":
        return ("Trop de cryptoactifs pour votre profil", f"{m} en cryptoactifs; votre profil en permet {lim.replace('≤ ', '')}.")
    if rid == "budget.drawdown_review":
        return ("Baisses passées trop fortes pour vous", f"Ces placements ont déjà perdu {m} par le passé, plus que le seuil de {lim} que vous avez accepté.")
    return (c["label"], c.get("message") or "")


def diagnose(xr: dict, persona: InvestorProfile) -> dict:
    level = persona.risk_profile_label.lower()
    pa = xr.get("persona_assessment") or {}
    problems = []
    for c in pa.get("budget_checks", []):
        s = _sentence(c, level)
        if s:
            problems.append({"rule_id": c["rule_id"], "title": s[0], "detail": s[1], "short": SHORT.get(c["rule_id"], s[0]), **_numbers(c, persona.budget)})
    pt, at = pa.get("portfolio_tier"), pa.get("allowed_tier")
    if pt in ORDER and at in ORDER and ORDER[pt] > ORDER[at]:
        problems.append({"rule_id": "tier", "title": "Risque global trop élevé",
                         "detail": f"Le risque mesuré de l'ensemble est {TIER_FR[pt]}; votre profil {level} permet un risque {TIER_FR[at]}.",
                         "short": SHORT["tier"], "value": ORDER[pt], "limit_value": ORDER[at], "limit_min": None, "subject": None, "tiers": [pt, at]})
    order = ["budget.growth_band", "budget.theme_exposure", "budget.speculative", "budget.single_issuer", "budget.single_sector", "tier", "budget.drawdown_review"]
    problems.sort(key=lambda p: order.index(p["rule_id"]) if p["rule_id"] in order else 99)
    return {"fits": not problems, "profile_level": persona.risk_profile_label, "problems": problems,
            "headline": (f"Votre portefeuille respecte votre profil {level}." if not problems else
                         f"Votre portefeuille ne respecte pas votre profil {level}.")}
