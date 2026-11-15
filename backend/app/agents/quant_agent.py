"""Agent 2 - Quantitative Analysis: the deterministic engine behind Léa's comparisons (alternatives, shocks)."""
from __future__ import annotations

import pandas as pd

from ..analytics.ledger import MetricLedger
from ..analytics.portfolio import portfolio_risk_metrics
from ..analytics.scenarios import SHOCK_PRESETS, apply_shock, diversified_alternatives
from ..data.loader import DataUnavailableError, MarketData

AGENT_ID = "quant_agent"


def compare_alternatives(md: MarketData, xr: dict, led: MetricLedger) -> dict:
    weights = {p["asset_id"]: p["weight"] for p in xr["positions"]}
    meta = {p["asset_id"]: {"asset_class": p["asset_class"], "sub_class": p["sub_class"], "sector": p["sector"],
                            "is_single_issuer": p["is_single_issuer"]} for p in xr["positions"]}
    alts = diversified_alternatives(weights, meta)
    out = {"original": {"label": "Portefeuille actuel", "weights": weights}}
    out.update(alts)
    for key, alt in out.items():
        try:
            r = portfolio_risk_metrics(md, alt["weights"], md.end_date, None, xr["benchmark_id"])
        except DataUnavailableError as exc:
            alt["error"] = str(exc)
            continue
        h = sum(w * w for w in alt["weights"].values())
        tech = sum(w for a, w in alt["weights"].items() if md.asset(a)["sector"] == "Information Technology")
        shock = apply_shock(md, pd.DataFrame([{"asset_id": a, "value_cad": w * xr["total_value_cad"], "currency": md.asset(a)["currency"]}
                                              for a, w in alt["weights"].items()]).set_index("asset_id"), SHOCK_PRESETS["tech_crash_30"]["shocks"])
        alt.update({"vol": r["volatility"], "mdd": (r["drawdown"] or {}).get("max_drawdown"), "hhi": h, "tech_direct": tech,
                    "total_return": r["total_return"], "avg_corr": r["avg_pairwise_corr"], "tech_shock_return": shock["return"],
                    "window": [r["window_start"], r["window_end"]], "benchmark_excess": (r.get("benchmark") or {}).get("excess_return")})
        for m, label, unit in (("vol", "Volatilité", "pct"), ("mdd", "Perte max.", "pct"), ("hhi", "HHI", "ratio"),
                               ("tech_shock_return", "Résultat du choc tech −30 %", "pct"), ("total_return", "Rendement total historique", "pct")):
            led.add(f"alt.{key}.{m}", f"{label} – {alt['label'][:40]}", alt[m], unit, "même méthode que la radiographie",
                    window=(r["window_start"], r["window_end"]), info_class="HYPOTHETICAL" if key != "original" else "COMPUTED_RESULT")
    return out


