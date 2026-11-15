"""Hypothetical addition of a position: before/after concentration, risk and persona budget (deterministic)."""
from __future__ import annotations


from ..analytics.ledger import MetricLedger
from ..analytics.portfolio import quantities_from_amounts
from ..analytics.scenarios import position_size_table
from ..data.loader import MarketData
from ..models import InvestorProfile, Portfolio, PortfolioHolding
from .analysis_service import run_xray

KEYS = [("pf.total_value", "Valeur totale"), ("pf.growth_share", "Actifs de croissance"), ("pf.single_issuers", "Titres individuels"),
        ("pf.hhi", "HHI"), ("pf.effective_n", "Positions effectives"), ("pf.vol", "Volatilité historique"),
        ("pf.mdd", "Perte maximale historique"), ("pf.var95", "VaR 1 j 95 %"), ("pf.cvar95", "CVaR 1 j 95 %"),
        ("pf.avg_corr", "Corrélation moyenne"), ("pf.div_ratio", "Ratio de diversification"), ("pf.stress.vol", "Volatilité en stress")]


def _with_addition(md: MarketData, pf: Portfolio, asset_id: str, amount_cad: float) -> Portfolio:
    q = quantities_from_amounts(md, [{"asset_id": asset_id, "amount_cad": amount_cad}], md.end_date)[0]
    return pf.model_copy(update={"holdings": pf.holdings + [PortfolioHolding(asset_id=asset_id, quantity=q["quantity"], note=q.get("note"))],
                                 "portfolio_id": pf.portfolio_id + "-hyp"})


def hypothetical_addition(md: MarketData, pf: Portfolio, persona: InvestorProfile | None, asset_id: str, amount_cad: float,
                          speculative: bool = False, sizes: list[float] | None = None) -> tuple[dict, MetricLedger]:
    md.asset(asset_id)
    extra = {asset_id} if speculative else set()
    before = run_xray(md, pf, persona, include_series=False, speculative_extra=extra)
    after_pf = _with_addition(md, pf, asset_id, amount_cad)
    after = run_xray(md, after_pf, persona, include_series=False, speculative_extra=extra)
    lb, la = before["ledger"], after["ledger"]
    led = MetricLedger()
    rows = []
    for k, label in KEYS:
        b, a = lb.get(k, {}).get("value"), la.get(k, {}).get("value")
        unit = lb.get(k, la.get(k, {})).get("unit", "ratio")
        if k in lb:
            led.add(f"hyp.before.{k}", f"Avant ajout – {label}", b, unit, lb[k]["method"], window=(lb[k]["window_start"], lb[k]["window_end"]))
        if k in la:
            led.add(f"hyp.after.{k}", f"Après ajout hypothétique – {label}", a, unit, la[k]["method"],
                    window=(la[k]["window_start"], la[k]["window_end"]), info_class="HYPOTHETICAL")
        rows.append({"metric": k, "label": label, "unit": unit, "before": b, "after": a,
                     "delta": (a - b) if a is not None and b is not None else None})
    w_after = la.get(f"pf.weight.{asset_id}", {}).get("value")
    led.add(f"hyp.after.weight.{asset_id}", f"Poids de {asset_id} après ajout hypothétique", w_after, "pct", "valeur_i / total", info_class="HYPOTHETICAL")
    led.add("hyp.amount", "Montant hypothétique ajouté", amount_cad, "cad", "saisie de l'utilisateur", info_class="HYPOTHETICAL")
    budget_before = {c["rule_id"]: c for c in (before["persona_assessment"] or {}).get("budget_checks", [])}
    budget_after = (after["persona_assessment"] or {}).get("budget_checks", [])
    budget = []
    for c in budget_after:
        b = budget_before.get(c["rule_id"], {})
        budget.append({"rule_id": c["rule_id"], "label": c["label"], "limit": c["limit"], "before": b.get("measured"),
                       "before_status": b.get("status"), "after": c["measured"], "after_status": c["status"],
                       "new_breach": c["status"] != "OK" and b.get("status") == "OK", "message": c["message"]})
    # educational sizing (section 8A.4)
    tier = after["tiers"].get(asset_id, {})
    total_before = before["total_value_cad"]
    moves = sorted({round(abs(tier.get("max_drawdown") or 0.5), 4), round(min(0.95, tier.get("volatility") or 0.3), 4),
                    round(abs(tier.get("max_drawdown") or 0.5) / 2, 4)})
    size = position_size_table(total_before, 0.01, moves)
    amounts = sizes or sorted({round(amount_cad / 4, 2), round(amount_cad / 2, 2), round(amount_cad, 2)})
    ladder = []
    for amt in amounts:
        x = run_xray(md, _with_addition(md, pf, asset_id, amt), persona, include_series=False, speculative_extra=extra)
        bl = {c["rule_id"]: c["status"] for c in (x["persona_assessment"] or {}).get("budget_checks", [])}
        ladder.append({"amount_cad": amt, "weight": x["ledger"].get(f"pf.weight.{asset_id}", {}).get("value"),
                       "vol": x["ledger"].get("pf.vol", {}).get("value"), "mdd": x["ledger"].get("pf.mdd", {}).get("value"),
                       "speculative_status": bl.get("budget.speculative"), "issuer_status": bl.get("budget.single_issuer"),
                       "breaches": [k for k, v in bl.items() if v != "OK" and v != "UNKNOWN"]})
    led.merge(MetricLedger.from_dict(la))
    return {"asset_id": asset_id, "amount_cad": amount_cad, "rows": rows, "budget": budget,
            "new_breaches": [b for b in budget if b["new_breach"]], "asset_tier": tier, "position_size_education": {
                "max_loss_per_idea_pct": 0.01, "portfolio_value_cad": total_before, "rows": size,
                "rule": "taille = (perte max. par idée × valeur du portefeuille) / baisse défavorable supposée; doubler la volatilité divise la taille par deux",
                "label": "Calcul éducatif, pas une recommandation"},
            "ladder": ladder, "before_persona": before["persona_assessment"], "after_persona": after["persona_assessment"],
            "label": "HYPOTHÈSE: ajout simulé au cours de clôture du " + md.end_date.date().isoformat() + "; aucune transaction",
            "as_of": after["as_of"]}, led
