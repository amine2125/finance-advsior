"""Agent 2 - Quantitative Analysis: deterministic engine plus execution of permitted verification tests."""
from __future__ import annotations

import pandas as pd

from ..analytics.forecast_policy import four_part_answer
from ..analytics.ledger import MetricLedger
from ..analytics.portfolio import portfolio_risk_metrics, returns_panel, value_holdings
from ..analytics.scenarios import SHOCK_PRESETS, apply_shock, diversified_alternatives
from ..data.loader import DataUnavailableError, MarketData
from ..methodology import METHODOLOGY
from ..models import Portfolio
from .data_agent import collect  # noqa: F401  (re-exported for orchestration clarity)

AGENT_ID = "quant_agent"
PERMITTED = METHODOLOGY["debate"]["permitted_followup_tests"]


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


def run_test(md: MarketData, pf: Portfolio, xr: dict, test: dict, led: MetricLedger, n: int, impact_fn=None, persona=None) -> dict:
    name, params = test.get("test"), test.get("params") or {}
    tag = f"test.{n}"
    try:
        if name == "stress_shock":
            preset = params.get("preset") if params.get("preset") in SHOCK_PRESETS else "tech_crash_30"
            pos = value_holdings(md, [h.model_dump() for h in pf.holdings], md.end_date)
            r = apply_shock(md, pos, SHOCK_PRESETS[preset]["shocks"])
            led.add(f"{tag}.shock_return", f"Choc hypothétique « {SHOCK_PRESETS[preset]['name']} » – variation", r["return"], "pct",
                    "Σ valeur × (1 + choc) / Σ valeur − 1", info_class="HYPOTHETICAL")
            led.add(f"{tag}.shock_pnl", "Choc hypothétique – variation en CAD", r["pnl"], "cad", "Σ valeur × choc", info_class="HYPOTHETICAL")
            return {"test": name, "status": "done", "summary": f"{SHOCK_PRESETS[preset]['name']}: {r['return'] * 100:.1f} % ({r['pnl']:.0f} CAD)",
                    "metric_ids": [f"{tag}.shock_return", f"{tag}.shock_pnl"]}
        if name == "stressed_correlation":
            st = xr["risk"].get("stressed")
            if not st:
                return {"test": name, "status": "unavailable", "summary": "historique insuffisant"}
            return {"test": name, "status": "done", "summary": f"Fenêtre {st['window_start']}→{st['window_end']}: vol. {st['stressed_vol'] * 100:.1f} %"
                    f" vs {st['normal_vol'] * 100:.1f} %", "metric_ids": ["pf.stress.vol", "pf.stress.normal_vol", "pf.stress.avg_corr"]}
        if name == "rolling_correlation":
            a, b = params.get("a"), params.get("b")
            assets = [p["asset_id"] for p in xr["positions"]]
            if a not in assets or b not in assets:
                a, b = (assets + assets)[:2]
            rp = returns_panel(md, [a, b], md.end_date, None)
            full = float(rp.returns.corr().iloc[0, 1])
            last = float(rp.returns.iloc[-63:].corr().iloc[0, 1])
            led.add(f"{tag}.corr_full", f"Corrélation {a}/{b} sur toute la fenêtre", full, "ratio", "Pearson", window=(rp.start, rp.end))
            led.add(f"{tag}.corr_63d", f"Corrélation {a}/{b} sur les 63 dernières séances", last, "ratio", "Pearson", window=(None, rp.end))
            return {"test": name, "status": "done", "summary": f"{a}/{b}: {full:.2f} (complet) vs {last:.2f} (63 j)",
                    "metric_ids": [f"{tag}.corr_full", f"{tag}.corr_63d"]}
        if name == "risk_contribution":
            rc = xr["risk"]["risk"].get("contributions", {})
            top = sorted(rc.items(), key=lambda kv: -kv[1])[:3]
            return {"test": name, "status": "done", "summary": "; ".join(f"{a}: {c * 100:.1f} %" for a, c in top),
                    "metric_ids": [f"pf.rc.{a}" for a, _ in top]}
        if name == "drawdown_episodes":
            dd = xr["risk"].get("drawdown") or {}
            return {"test": name, "status": "done", "summary": f"Pire épisode: {dd.get('peak_date')} → {dd.get('trough_date')}, "
                    f"récupération {dd.get('recovery_date') or 'non atteinte'}", "metric_ids": ["pf.mdd"]}
        if name == "scenario_compare":
            alts = compare_alternatives(md, xr, led)
            return {"test": name, "status": "done", "summary": "; ".join(f"{k}: vol {v.get('vol', 0) * 100:.1f} %, choc tech {v.get('tech_shock_return', 0) * 100:.1f} %"
                                                                         for k, v in alts.items() if "vol" in v),
                    "metric_ids": [m for m in led.ids() if m.startswith("alt.")]}
        if name == "base_rates":
            asset = params.get("asset") if params.get("asset") and md.has_asset(params.get("asset")) else xr["positions"][0]["asset_id"]
            fp = four_part_answer(md, asset, md.end_date, led)
            br = fp["base_rates"] or {}
            return {"test": name, "status": "done" if br else "unavailable",
                    "summary": f"{asset}: {br.get('loss_hits')} fenêtres de 12 mois sur {br.get('windows')} avec perte ≤ −20 %",
                    "metric_ids": fp["metric_ids"]}
        if name == "hypothetical_addition" and impact_fn:
            asset = params.get("asset")
            amt = float(params.get("amount_cad") or 0)
            if not asset or not md.has_asset(asset) or amt <= 0:
                return {"test": name, "status": "rejected", "summary": "paramètres invalides"}
            imp, ileds = impact_fn(md, pf, persona, asset, amt, False)
            led.merge(ileds)
            return {"test": name, "status": "done", "summary": f"Ajout de {amt:.0f} CAD de {asset}: nouvelles violations "
                    f"{[b['rule_id'] for b in imp['new_breaches']] or 'aucune'}", "metric_ids": [m for m in ileds.ids() if m.startswith("hyp.")]}
    except DataUnavailableError as exc:
        return {"test": name, "status": "unavailable", "summary": str(exc)}
    return {"test": name, "status": "rejected", "summary": "test non permis"}
