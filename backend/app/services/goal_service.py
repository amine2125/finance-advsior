"""Goals: « je veux 30 000 $ pour ma maison dans 4 ans » → combien mettre par mois, dans quel compte, avec quelle répartition,
et suis-je en bonne voie ? Everything is deterministic and documented:

* Mix: the profile's recommended plan (plan_service), with less stock exposure when the money is needed soon
  (< 3 years: no stocks, mostly near-cash; 3 to 7 years: at most 40 % growth; emergency fund: near-cash only).
* Expected return: FP Canada / Institut de planification financière, Normes d'hypothèses de projection 2026 (before fees),
  per asset class, weighted by the mix, minus 0.20 %/year of fund fees (broad index ETFs). This is the reference planners use
  in Québec and Canada; it is a planning hypothesis, not a forecast.
* Range: 2 000 simulated paths (fixed seed) with the mix's own historical volatility measured on the dataset; the median path
  equals the expected-return path. Shown as « défavorable » (10th percentile) / « médian » / « favorable » (90th percentile).
* Accounts: Canadian 2026 rules (CELI 7 000 $; CELIAPP 8 000 $/an, 40 000 $ à vie; REER 18 % du revenu, max 33 810 $;
  REEE: SCEE 20 % jusqu'à 500 $/an, 7 200 $ à vie, included in the projection).
"""
from __future__ import annotations

import math

import numpy as np

from ..data.loader import MarketData
from ..ids import new_id
from ..models import InvestorProfile, utcnow
from .plan_service import recommended_plan

# FP Canada / IFP Projection Assumption Guidelines 2026 (nominal, before fees) — institutpf.org/en/projection-assumption-guidelines
PAG_2026 = {"short_term": 0.024, "fixed_income": 0.032, "cad_equity": 0.063, "us_equity": 0.064, "inflation": 0.021}
ASSET_CLASS_PAG = {"ZST.TO": "short_term", "XBB.TO": "fixed_income", "AGG": "fixed_income", "TLT": "fixed_income",
                   "XIU.TO": "cad_equity", "SPY": "us_equity", "ESGV": "us_equity", "QQQ": "us_equity"}
FUND_FEES = 0.002
LIMITS_2026 = {"celi": 7000, "celiapp_year": 8000, "celiapp_life": 40000, "reer_max": 33810, "reee_grant_rate": 0.20,
               "reee_grant_year": 500, "reee_grant_life": 7200}
SOURCES = [
    {"label": "Normes d'hypothèses de projection 2026 (FP Canada et Institut de planification financière)", "url": "https://institutpf.org/en/projection-assumption-guidelines"},
    {"label": "Plafonds 2026 CELI, REER, CELIAPP (Agence du revenu du Canada)", "url": "https://www.canada.ca/fr/agence-revenu.html"},
    {"label": "Subvention canadienne pour l'épargne-études (EDSC)", "url": "https://www.canada.ca/fr/emploi-developpement-social/services/aide-financiere-etudiants/epargne-etudes/reee/promoteurs-reee/infocapsules/droits-subventions.html"},
]

TYPES = {
    "maison": "Acheter une maison", "retraite": "Ma retraite", "etudes": "Les études de mon enfant",
    "projet": "Un projet", "urgence": "Mon fonds d'urgence", "fructifier": "Faire fructifier mon argent",
}


def _cad(x: float) -> str:
    return f"{x:,.0f} $".replace(",", " ")


def account_for(gtype: str, monthly: float, initial: float) -> dict:
    yearly = monthly * 12
    if gtype == "maison":
        notes = [f"Vos cotisations réduisent vos impôts, et le retrait pour acheter votre première maison n'est pas imposé.",
                 f"Plafond : {_cad(LIMITS_2026['celiapp_year'])} par année, {_cad(LIMITS_2026['celiapp_life'])} au total."]
        if yearly > LIMITS_2026["celiapp_year"] or initial > LIMITS_2026["celiapp_year"]:
            notes.append(f"Au-delà de {_cad(LIMITS_2026['celiapp_year'])} par année, mettez le surplus dans votre CELI.")
        return {"code": "CELIAPP", "name": "CELIAPP", "full": "Compte d'épargne libre d'impôt pour l'achat d'une première propriété",
                "why": "C'est le compte fait pour votre première maison : il combine les avantages du REER et du CELI.", "notes": notes}
    if gtype == "retraite":
        return {"code": "REER", "name": "REER", "full": "Régime enregistré d'épargne-retraite",
                "why": "Vos cotisations réduisent vos impôts aujourd'hui; l'argent fructifie à l'abri de l'impôt jusqu'à la retraite.",
                "notes": [f"Plafond : 18 % de votre revenu de l'année précédente, jusqu'à {_cad(LIMITS_2026['reer_max'])} en 2026.",
                          "Si votre revenu est encore modeste, le CELI peut être plus avantageux : demandez-moi."]}
    if gtype == "etudes":
        return {"code": "REEE", "name": "REEE", "full": "Régime enregistré d'épargne-études",
                "why": f"Le gouvernement ajoute 20 % à vos cotisations : jusqu'à {_cad(LIMITS_2026['reee_grant_year'])} gratuits par année.",
                "notes": [f"Cotisez {_cad(2500)} par année (environ 208 $ par mois) pour recevoir la subvention maximale.",
                          f"Subvention maximale : {_cad(LIMITS_2026['reee_grant_life'])} par enfant."]}
    notes = [f"Plafond 2026 : {_cad(LIMITS_2026['celi'])}, plus vos droits inutilisés des années passées."]
    if gtype == "urgence":
        return {"code": "CELI", "name": "CELI", "full": "Compte d'épargne libre d'impôt",
                "why": "Votre argent reste disponible à tout moment, et ce qu'il rapporte n'est pas imposé.",
                "notes": notes + ["Un fonds d'urgence ne va pas en bourse : il doit être là quand vous en avez besoin."]}
    return {"code": "CELI", "name": "CELI", "full": "Compte d'épargne libre d'impôt",
            "why": "Ce que votre argent rapporte n'est jamais imposé, et vous pouvez le retirer quand vous voulez.", "notes": notes}


def _horizon_rule(gtype: str, years: float) -> tuple[float | None, dict | None, str | None]:
    if gtype == "urgence":
        return 0.0, {"ZST.TO": 1.0}, "Fonds d'urgence : 100 % en quasi-épargne, pour qu'il soit toujours disponible."
    if years < 3:
        return 0.0, {"ZST.TO": 0.7, "XBB.TO": 0.3}, "Vous aurez besoin de cet argent dans moins de 3 ans : pas d'actions, pour qu'une baisse de la bourse ne compromette pas votre projet."
    if years < 7:
        return 0.40, None, "Échéance de 3 à 7 ans : au plus 40 % en actions, la part stable augmente à mesure que la date approche."
    return None, None, None


def _expected_return(weights: dict[str, float]) -> tuple[float, dict]:
    gross = sum(w * PAG_2026[ASSET_CLASS_PAG.get(a, "us_equity")] for a, w in weights.items())
    return gross - FUND_FEES, {"gross": gross, "fees": FUND_FEES}


def _simulate(initial: float, monthly: float, years: float, r: float, sigma: float, grant: bool) -> dict:
    months = max(1, int(round(years * 12)))
    rng = np.random.default_rng(42)
    mu, sd = math.log1p(r) / 12, sigma / math.sqrt(12)
    paths = np.full(2000, float(initial))
    det = float(initial)
    contributed, granted = float(initial), 0.0
    points = [{"year": 0, "p10": initial, "p50": initial, "p90": initial, "contributed": initial}]
    yearly_grant_left = LIMITS_2026["reee_grant_year"]
    for m in range(1, months + 1):
        if (m - 1) % 12 == 0:
            yearly_grant_left = LIMITS_2026["reee_grant_year"]
        g = 0.0
        if grant and monthly > 0:
            g = min(monthly * LIMITS_2026["reee_grant_rate"], yearly_grant_left, LIMITS_2026["reee_grant_life"] - granted)
            yearly_grant_left -= g
            granted += g
        c = monthly + g
        contributed += monthly
        z = rng.standard_normal(paths.shape[0])
        paths = (paths + c) * np.exp(mu + sd * z)  # log-normal: the median grows at (1+r)^(1/12), like the planning path
        det = (det + c) * (1 + r) ** (1 / 12)
        if m % 12 == 0 or m == months:
            p10, p50, p90 = np.percentile(paths, [10, 50, 90])
            points.append({"year": round(m / 12, 2), "p10": round(float(p10), 2), "p50": round(det, 2), "p90": round(float(p90), 2),
                           "contributed": round(contributed, 2)})
    last = points[-1]
    return {"points": points, "final_p10": last["p10"], "final_p50": last["p50"], "final_p90": last["p90"],
            "contributed": round(contributed, 2), "grant": round(granted, 2)}


def required_monthly(target: float, initial: float, years: float, r: float, grant: bool) -> float:
    n = max(1, int(round(years * 12)))
    g = (1 + r) ** (1 / 12)
    fv_initial = initial * g ** n
    if fv_initial >= target:
        return 0.0
    c = (target - fv_initial) * (g - 1) / (g * (g ** n - 1)) if g != 1 else (target - fv_initial) / n
    if grant:  # own money + 20 % grant (capped at 500 $/year ≈ 41.67 $/month)
        cap = LIMITS_2026["reee_grant_year"] / 12
        c = c / 1.2 if c / 1.2 * 0.2 <= cap else c - cap
    return max(0.0, math.ceil(c))


def evaluate(md: MarketData, persona: InvestorProfile, g: dict, current_value: float | None = None) -> dict:
    gtype, years = g["type"], float(g["years"])
    initial = float(current_value if current_value is not None else g.get("initial_cad") or 0)
    monthly = float(g.get("monthly_cad") or 0)
    target = float(g["target_cad"]) if g.get("target_cad") else None
    cap, stable, horizon_note = _horizon_rule(gtype, years)
    plan = recommended_plan(md, persona, max(initial, 1000.0), None, growth_cap=cap, stable_override=stable)
    r, rinfo = _expected_return(plan["weights"])
    sigma = plan["history"].get("volatility") or (0.04 + 0.12 * plan["growth_share"])
    grant = gtype == "etudes"
    sim = _simulate(initial, monthly, years, r, sigma, grant)
    need = required_monthly(target, initial, years, r, grant) if target else None
    if target is None:
        status = "no_target"
    elif sim["final_p50"] >= target:
        status = "on_track"
    elif sim["final_p50"] >= 0.9 * target:
        status = "close"
    else:
        status = "off_track"
    acct = account_for(gtype, monthly, initial)
    actions = []
    if target and need is not None and status != "on_track":
        actions.append({"kind": "raise_monthly", "monthly_cad": need,
                        "text": f"Passez à {_cad(need)} par mois pour atteindre {_cad(target)} d'ici {years:g} an{'s' if years >= 2 else ''} (scénario médian)."})
    if target and status == "off_track" and years < 30 and gtype != "urgence":
        actions.append({"kind": "later", "text": "Ou repoussez un peu la date : chaque année de plus laisse le temps à votre argent de fructifier."})
    if grant and monthly < 2500 / 12 - 1:
        actions.append({"kind": "grant", "monthly_cad": 209, "text": "Montez à 209 $ par mois pour recevoir toute la subvention de 500 $ par année : c'est de l'argent gratuit."})
    return {
        "type": gtype, "type_label": TYPES.get(gtype, gtype), "target_cad": target, "years": years, "initial_cad": initial, "monthly_cad": monthly,
        "status": status, "required_monthly_cad": need, "progress": (initial / target) if target else None,
        "account": acct, "horizon_note": horizon_note if plan.get("horizon_capped") else None,
        "plan": {k: plan[k] for k in ("sleeves", "growth_share", "stable_share", "profile_level", "fits_profile", "checks")} | {"weights": plan["weights"]},
        "assumptions": {"expected_return": round(r, 4), "gross_return": round(rinfo["gross"], 4), "fees": FUND_FEES, "volatility": sigma,
                        "inflation": PAG_2026["inflation"], "source": SOURCES[0]["label"]},
        "projection": sim, "actions": actions, "sources": SOURCES,
        "label": "Projection basée sur des hypothèses de planification (pas une prévision). Simulation éducative.",
    }


def new_goal(data: dict) -> dict:
    return {"goal_id": new_id("goal"), "created_at": utcnow(), **data}
