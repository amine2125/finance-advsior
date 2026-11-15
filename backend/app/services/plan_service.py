"""« Combien voulez-vous investir ? » → a simulated model portfolio that fits THIS declared profile (an example to compare, not advice).

Deterministic and explainable:
  1. growth share = middle of the profile's growth band (actions), rounded to 5 %; the rest is the stability sleeve (bonds);
  2. stability sleeve: very short-term bonds first when the profile only allows a LOW risk level, else Canadian + US bonds;
     growth sleeve: Canadian large caps + US large caps (ESG fund instead when the person asked for ESG criteria);
  3. the plan is checked with the same engine as any portfolio (run_xray); while it breaks a limit of the profile or is above
     the allowed risk level, 5 % moves from growth to very short-term bonds (never below the bottom of the growth band).
Only broad index funds (FNB): no single company, no crypto. The history shown is what the plan WOULD have done, not a forecast.
"""
from __future__ import annotations

from ..analytics.persona_rules import allowed_tier
from ..data.loader import MarketData
from ..models import InvestorProfile, Portfolio
from .analysis_service import run_xray
from .portfolio_service import _build_holdings

ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "UNKNOWN": 3}

ROLES = {
    "ZST.TO": ("Obligations à très court terme", "Se comporte presque comme de l'épargne : bouge très peu, rapporte peu."),
    "XBB.TO": ("Obligations canadiennes", "Des prêts aux gouvernements et aux entreprises du Canada : un revenu régulier, plus stable que les actions."),
    "AGG": ("Obligations américaines", "La même idée aux États-Unis : ajoute de la stabilité et une autre économie."),
    "XIU.TO": ("60 grandes entreprises canadiennes", "Banques, énergie, chemins de fer, commerce… les plus grandes entreprises du pays en un seul achat."),
    "SPY": ("500 grandes entreprises américaines", "Apple, Microsoft, Amazon et 497 autres : le cœur de l'économie américaine."),
    "ESGV": ("Entreprises américaines responsables", "Des milliers d'entreprises américaines, en excluant celles qui ne respectent pas des critères environnementaux et sociaux."),
    "QQQ": ("100 grandes entreprises technologiques", "Le Nasdaq-100 : surtout la technologie. Plus de croissance possible, mais des hauts et des bas plus forts."),
}
SLEEVES = {
    "stable": ("Stabilité", "Amortit les baisses. C'est la partie qui vous permet de dormir tranquille."),
    "growth": ("Croissance", "Fait fructifier votre argent à long terme. C'est elle qui monte et descend le plus."),
}


def _round5(x: float) -> float:
    return round(round(x / 0.05) * 0.05, 4)


def _mix(persona: InvestorProfile, growth: float, allowed: str, stable_override: dict[str, float] | None = None) -> dict[str, float]:
    if stable_override:
        stable = stable_override
    elif allowed == "LOW":
        stable = {"ZST.TO": 0.40, "XBB.TO": 0.35, "AGG": 0.25}
    else:
        stable = {"XBB.TO": 0.60, "AGG": 0.40}
    us = "ESGV" if persona.esg_preference else "SPY"
    tech = any("techno" in p.lower() for p in persona.preferences) and "Information Technology" not in persona.excluded_sectors
    if allowed == "HIGH" and tech:
        grow = {"XIU.TO": 0.35, us: 0.45, "QQQ": 0.20}
    else:
        grow = {"XIU.TO": 0.40, us: 0.60}
    w: dict[str, float] = {}
    for a, s in stable.items():
        w[a] = w.get(a, 0) + s * (1 - growth)
    for a, s in grow.items():
        w[a] = w.get(a, 0) + s * growth
    return {a: v for a, v in w.items() if v > 1e-9}


def _portfolio(persona: InvestorProfile, weights: dict[str, float], amount: float) -> Portfolio:
    holdings, _ = _build_holdings([{"asset_id": a, "amount_cad": amount * w} for a, w in weights.items()], None)
    return Portfolio(portfolio_id="plan", owner_id="-", name="Portefeuille modèle (simulation)", persona_id=persona.persona_id, holdings=holdings)


def _fits(xr: dict, below_band_ok: bool = False) -> bool:
    """No limit of the profile broken. A share of growth BELOW the profile's band is accepted when the goal's horizon asks for it
    (money needed soon is kept away from the stock market on purpose)."""
    pa = xr.get("persona_assessment") or {}
    breaches = [c for c in pa.get("budget_checks", []) if c["status"] not in ("OK", "UNKNOWN")
                and not (below_band_ok and c["status"] == "BELOW_BAND")]
    pt, at = pa.get("portfolio_tier"), pa.get("allowed_tier")
    return not breaches and not (pt in ORDER and at in ORDER and ORDER[pt] > ORDER[at])


def recommended_plan(md: MarketData, persona: InvestorProfile, amount_cad: float, current: Portfolio | None = None,
                     growth_cap: float | None = None, stable_override: dict[str, float] | None = None) -> dict:
    """growth_cap / stable_override: set by a goal whose horizon is shorter than the profile's (see goal_service)."""
    b = persona.budget
    allowed = allowed_tier(persona)["allowed_tier"].value
    growth = min(b.growth_max, max(b.growth_min, _round5((b.growth_min + b.growth_max) / 2)))
    capped = growth_cap is not None and growth_cap < growth
    if capped:
        growth = round(max(0.0, growth_cap), 4)
    floor = 0.0 if capped else b.growth_min
    weights = _mix(persona, growth, allowed, stable_override)
    xr = run_xray(md, _portfolio(persona, weights, amount_cad), persona)
    while not _fits(xr, capped) and growth - 0.05 >= floor - 1e-9:
        growth = round(growth - 0.05, 4)
        weights = _mix(persona, growth, allowed, stable_override)
        xr = run_xray(md, _portfolio(persona, weights, amount_cad), persona)

    sleeves = []
    STABLE = ("ZST.TO", "XBB.TO", "AGG")
    for key, members in (("stable", [a for a in weights if a in STABLE]), ("growth", [a for a in weights if a not in STABLE])):
        share = sum(weights[a] for a in members)
        if share <= 0:
            continue
        sleeves.append({
            "key": key, "label": SLEEVES[key][0], "explanation": SLEEVES[key][1], "share": round(share, 4),
            "holdings": [{"asset_id": a, "name": md.asset(a)["name"], "role": ROLES[a][0], "explanation": ROLES[a][1],
                          "share": round(weights[a], 4), "amount_cad": round(amount_cad * weights[a], 2)}
                         for a in sorted(members, key=lambda x: -weights[x])],
        })

    r = xr["risk"]
    dd = r.get("drawdown") or {}
    series = [{"date": s["date"], "value": round(amount_cad * s["portfolio"], 2)} for s in r.get("series", [])]
    pa = xr["persona_assessment"] or {}
    out = {
        "amount_cad": amount_cad, "profile_level": persona.risk_profile_label, "allowed_tier": allowed,
        "portfolio_tier": pa.get("portfolio_tier"), "growth_share": growth, "stable_share": round(1 - growth, 4),
        "growth_band": [b.growth_min, b.growth_max], "sleeves": sleeves, "fits_profile": _fits(xr, capped), "horizon_capped": capped,
        "checks": [{"rule_id": c["rule_id"], "status": "OK" if capped and c["status"] == "BELOW_BAND" else c["status"], "label": c["label"],
                    "measured": c["measured"], "limit": c["limit"]} for c in pa.get("budget_checks", [])],
        "history": {
            "window_start": r.get("window_start"), "window_end": r.get("window_end"),
            "value_end": round(amount_cad * (1 + r["total_return"]), 2) if r.get("total_return") is not None else None,
            "total_return": r.get("total_return"), "annualized_return": r.get("annualized_return"), "volatility": r.get("volatility"),
            "max_drawdown": dd.get("max_drawdown"), "drawdown_peak": dd.get("peak_date"), "drawdown_trough": dd.get("trough_date"),
            "series": series,
        },
        "weights": {a: round(w, 4) for a, w in weights.items()},
        "data_as_of": md.end_date.date().isoformat(),
        "label": "Portefeuille modèle calculé à partir de votre profil (simulation éducative). Le passé ne garantit pas l'avenir.",
    }
    if current is not None and current.holdings:
        cur = run_xray(md, current, persona, include_series=False)
        total = cur["total_value_cad"]
        out["current"] = {
            "total_value_cad": total, "fits_profile": _fits(cur),
            "positions": [{"asset_id": p["asset_id"], "name": p["name"], "value_cad": p["value_cad"], "weight": p["weight"]} for p in cur["positions"]],
        }
    return out
