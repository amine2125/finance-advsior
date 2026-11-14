"""Sections 7A.3, 7A.4, 7A.6: horizon rule, persona risk budgets and error checks (inspectable rules)."""
from __future__ import annotations

from ..i18n import sector_fr
from ..methodology import METHODOLOGY
from ..models import TIER_ORDER, BudgetCheck, InvestorProfile, RiskTier

TIER_FR = {"LOW": "FAIBLE", "MEDIUM": "MOYEN", "HIGH": "ÉLEVÉ", "UNKNOWN": "INCONNU"}


def _pct(x: float | None) -> str:
    return "n/d" if x is None else f"{x * 100:.1f} %".replace(".", ",")


def horizon_tier(years: float) -> RiskTier:
    cfg = METHODOLOGY["horizon_rule"]
    if years < cfg["low_below_years"]:
        return RiskTier.LOW
    if years <= cfg["medium_up_to_years"]:
        return RiskTier.MEDIUM
    return RiskTier.HIGH


def tolerance_tier(max_decline: float) -> RiskTier:
    cfg = METHODOLOGY["horizon_rule"]
    if max_decline <= cfg["tolerance_low_max"]:
        return RiskTier.LOW
    if max_decline <= cfg["tolerance_medium_max"]:
        return RiskTier.MEDIUM
    return RiskTier.HIGH


def capacity_tier(p: InvestorProfile) -> tuple[RiskTier | None, list[str]]:
    """Capacity from stable income, emergency reserve, liquidity needs, dependants. Missing fields => flagged, not invented."""
    missing = [f for f in ("stable_income", "emergency_reserve", "liquidity_needs") if getattr(p, f) is None]
    if len(missing) == 3:
        return None, ["capacité de perte non renseignée (revenu stable, réserve d'urgence, besoins de liquidité)"]
    unc = [f"champ de capacité manquant: {m}" for m in missing]
    if p.emergency_reserve is False or p.liquidity_needs == "high":
        return RiskTier.LOW, unc
    if p.stable_income is False or p.liquidity_needs == "moderate" or p.dependants:
        return RiskTier.MEDIUM, unc
    return RiskTier.HIGH, unc


def allowed_tier(p: InvestorProfile) -> dict:
    """allowed_tier = min(horizon_tier, capacity_tier, tolerance_tier). Age is never an input."""
    inputs: dict[str, RiskTier] = {}
    detail: dict[str, str] = {}
    unc: list[str] = []
    h = horizon_tier(p.horizon_years_min)
    inputs["horizon"] = h
    detail["horizon"] = f"horizon minimal {p.horizon_years_min:g} ans -> {h.value}"
    cap, cap_unc = capacity_tier(p)
    unc += cap_unc
    if cap is not None:
        inputs["capacity"] = cap
        detail["capacity"] = (f"revenu stable={p.stable_income}, réserve={p.emergency_reserve}, "
                              f"liquidité={p.liquidity_needs}, personnes à charge={p.dependants} -> {cap.value}")
    else:
        detail["capacity"] = "non renseignée -> non utilisée, incertitude signalée"
    if p.stated_max_decline is not None:
        t = tolerance_tier(p.stated_max_decline)
        inputs["tolerance"] = t
        detail["tolerance"] = f"baisse tolérée déclarée {_pct(p.stated_max_decline)} -> {t.value}"
        if p.stated_max_decline_provenance != "user_input":
            unc.append(f"tolérance: {p.stated_max_decline_provenance}")
    else:
        unc.append("tolérance aux pertes non déclarée")
        detail["tolerance"] = "non déclarée"
    lowest = min(inputs.values(), key=lambda t: TIER_ORDER[t])
    binding = [k for k, v in inputs.items() if v == lowest]
    return {"allowed_tier": lowest, "binding_inputs": binding, "tier_inputs": detail, "uncertainties": unc}


def budget_checks(p: InvestorProfile, weights: dict[str, float], meta: dict[str, dict],
                  portfolio_mdd: float | None, speculative_extra: set[str] | None = None) -> list[BudgetCheck]:
    b = p.budget
    speculative_extra = speculative_extra or set()
    checks: list[BudgetCheck] = []
    growth = sum(w for a, w in weights.items()
                 if meta[a]["asset_class"] in ("equity", "crypto") or meta[a].get("sub_class") in ("equity_etf", "esg_equity_etf"))
    status = "OK" if b.growth_min <= growth <= b.growth_max else ("BELOW_BAND" if growth < b.growth_min else "ABOVE_BAND")
    checks.append(BudgetCheck(rule_id="budget.growth_band", label="Actifs de croissance (actions + crypto)",
                              limit=f"{_pct(b.growth_min)} – {_pct(b.growth_max)}", measured=_pct(growth), measured_value=growth,
                              status=status, message=("Dans la bande cible" if status == "OK" else
                                                      f"Hors bande: {_pct(growth)} vs {_pct(b.growth_min)}–{_pct(b.growth_max)}")))
    issuers = {a: w for a, w in weights.items() if meta[a].get("is_single_issuer")}
    if issuers:
        top_a = max(issuers, key=issuers.get)
        top = issuers[top_a]
        st = "BREACH" if top > b.max_single_issuer + 1e-9 else "OK"
        checks.append(BudgetCheck(rule_id="budget.single_issuer", label="Émetteur unique maximal",
                                  limit=_pct(b.max_single_issuer), measured=f"{_pct(top)} ({top_a})", measured_value=top, status=st,
                                  message=(f"{top_a} pèse {_pct(top)} > plafond {_pct(b.max_single_issuer)}" if st == "BREACH"
                                           else "Sous le plafond")))
    sectors: dict[str, float] = {}
    for a, w in weights.items():
        s = meta[a]["sector"]
        if s in ("Diversified", "Fixed Income", "Commodities", "Cryptoassets"):
            continue  # ETFs are not reclassified by look-through; crypto has its own sleeve
        sectors[s] = sectors.get(s, 0.0) + w
    if sectors:
        top_s = max(sectors, key=sectors.get)
        st = "BREACH" if sectors[top_s] > b.max_single_sector + 1e-9 else "OK"
        checks.append(BudgetCheck(rule_id="budget.single_sector", label="Secteur unique maximal (titres directs)",
                                  limit=_pct(b.max_single_sector), measured=f"{_pct(sectors[top_s])} ({sector_fr(top_s)})",
                                  measured_value=sectors[top_s], status=st,
                                  message=(f"Exposition directe {sector_fr(top_s)} {_pct(sectors[top_s])} > plafond {_pct(b.max_single_sector)}; "
                                           "les FNB ne sont pas inclus (composition non vérifiée)" if st == "BREACH"
                                           else "Sous le plafond (exposition directe; FNB exclus faute de composition vérifiée)")))
    spec = sum(w for a, w in weights.items() if meta[a]["asset_class"] == "crypto" or a in speculative_extra)
    st = "BREACH" if spec > b.max_speculative + 1e-9 else "OK"
    checks.append(BudgetCheck(rule_id="budget.speculative", label="Poche spéculative (crypto + positions d'attention non étayées)",
                              limit=f"≤ {_pct(b.max_speculative)}", measured=_pct(spec), measured_value=spec, status=st,
                              message=(f"{_pct(spec)} > plafond {_pct(b.max_speculative)}" if st == "BREACH" else "Sous le plafond")))
    if portfolio_mdd is None:
        checks.append(BudgetCheck(rule_id="budget.drawdown_review", label="Perte historique vs seuil de revue",
                                  limit=_pct(b.drawdown_review), measured="n/d", measured_value=None, status="UNKNOWN",
                                  message="Historique insuffisant pour mesurer la perte maximale"))
    else:
        st = "BREACH" if portfolio_mdd < b.drawdown_review else "OK"
        checks.append(BudgetCheck(rule_id="budget.drawdown_review", label="Perte max. historique (pondérations actuelles) vs seuil de revue",
                                  limit=_pct(b.drawdown_review), measured=_pct(portfolio_mdd), measured_value=portfolio_mdd, status=st,
                                  message=(f"La perte historique {_pct(portfolio_mdd)} dépasse le seuil de revue {_pct(b.drawdown_review)}: "
                                           "une baisse comparable déclencherait une revue" if st == "BREACH" else "Dans le seuil")))
    return checks


def error_checks(p: InvestorProfile, weights: dict[str, float], meta: dict[str, dict], tiers: dict[str, str],
                 portfolio_mdd: float | None, allowed: RiskTier, portfolio_tier: RiskTier) -> list[dict]:
    """Section 7A.6 checks with transparent triggers."""
    out = []
    hi_med = sum(w for a, w in weights.items() if tiers.get(a) in ("MEDIUM", "HIGH"))
    if p.horizon_years_min < METHODOLOGY["horizon_rule"]["low_below_years"] and hi_med > 0:
        out.append({"check": "horizon_mismatch", "triggered": True,
                    "detail": f"Horizon < 3 ans financé à {_pct(hi_med)} par des actifs MEDIUM/HIGH"})
    else:
        out.append({"check": "horizon_mismatch", "triggered": False, "detail": "Pas d'objectif < 3 ans financé par des actifs risqués"})
    if p.stated_max_decline is not None and portfolio_mdd is not None:
        trig = -portfolio_mdd > p.stated_max_decline
        out.append({"check": "likely_forced_selling", "triggered": trig,
                    "detail": f"Perte historique {_pct(portfolio_mdd)} vs tolérance déclarée −{_pct(p.stated_max_decline)}"})
    else:
        out.append({"check": "likely_forced_selling", "triggered": None, "detail": "Tolérance ou historique manquant"})
    lev = [a for a in weights if meta[a].get("is_leveraged") or meta[a].get("is_inverse")]
    out.append({"check": "leverage", "triggered": bool(lev),
                "detail": ("Produits à levier/inverses: " + ", ".join(lev)) if lev else
                "Aucun produit à levier ou inverse détecté (métadonnées de l'univers)"})
    over = TIER_ORDER.get(portfolio_tier, 0) > TIER_ORDER[allowed] if portfolio_tier != RiskTier.UNKNOWN else None
    out.append({"check": "tier_above_allowed", "triggered": over,
                "detail": f"Niveau du portefeuille {portfolio_tier.value} vs niveau permis {allowed.value}"})
    out.append({"check": "yield_vs_total_return", "triggered": False,
                "detail": "Toujours calculé en rendement total (adj_close); aucun classement par rendement de distribution"})
    out.append({"check": "costs_ignored", "triggered": True,
                "detail": "Frais, écarts et impôts omis de toutes les simulations (à garder en tête)"})
    return out
