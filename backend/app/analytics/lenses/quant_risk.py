"""Lens 3 - quantitative risk behaviour of a single asset (starter data, P0)."""
from __future__ import annotations

import pandas as pd

from ...data.loader import MarketData
from ...methodology import METHODOLOGY
from ...models import LensStatus
from ..benchmarks import BENCHMARKS, benchmark_weights
from ..ledger import MetricLedger
from ..portfolio import risk_free_rate
from ..risk import (annualized_vol, beta, ewma_vol, historical_var_cvar, max_drawdown, recovery_gain_needed,
                    rolling_vol, sharpe_ratio, simple_returns, vol_regime_percentile)
from ..tiers import classify_risk_tier

BLIND_SPOTS = ["Aucune opinion sur la valeur", "Le risque d'affaires est invisible tant qu'il n'atteint pas les prix",
               "Mesures issues du passé: sous-estiment le risque après une période calme"]


def run(md: MarketData, asset_id: str, as_of: pd.Timestamp, benchmark_id: str, led: MetricLedger) -> dict:
    p = f"asset.{asset_id}"
    prices = md.native_series(asset_id, "adj_close")
    prices = prices[prices.index <= as_of]
    ppy = md.periods_per_year(asset_id)
    rets = simple_returns(prices)
    if len(rets) < METHODOLOGY["windows"]["min_obs_volatility"]:
        return {"lens": 3, "status": LensStatus.UNAVAILABLE.value, "reason": f"historique insuffisant ({len(rets)} obs.)",
                "blind_spots": BLIND_SPOTS}
    w0, w1 = prices.index[0].date().isoformat(), prices.index[-1].date().isoformat()
    tier = classify_risk_tier(md, asset_id, as_of)
    vol = annualized_vol(rets, ppy)
    led.add(f"{p}.vol", f"Volatilité annualisée {asset_id}", vol, "pct", f"std(rendements quotidiens) × √{ppy}", window=(w0, w1), assets=[asset_id])
    rv = {}
    for wdw in (30, 90, 252):
        s = rolling_vol(rets, wdw, ppy).dropna()
        rv[str(wdw)] = float(s.iloc[-1]) if len(s) else None
        led.add(f"{p}.vol_{wdw}d", f"Volatilité glissante {wdw} j {asset_id}", rv[str(wdw)], "pct", f"écart-type {wdw} dernières obs. × √{ppy}",
                window=(None, w1), assets=[asset_id])
    lam = METHODOLOGY["windows"]["ewma_lambda"]
    ew = ewma_vol(rets, ppy, lam)
    led.add(f"{p}.vol_ewma", f"Volatilité EWMA (λ={lam}) {asset_id}", ew, "pct", "RiskMetrics EWMA; seule prévision autorisée (volatilité)",
            window=(w0, w1), assets=[asset_id], params={"lambda": lam})
    regime = vol_regime_percentile(rets)
    led.add(f"{p}.vol_regime_pct", f"Percentile du régime de volatilité 21 j {asset_id}", regime, "pct",
            "rang de la vol. 21 j actuelle dans son propre historique", window=(w0, w1), assets=[asset_id])
    dd = max_drawdown(prices)
    led.add(f"{p}.mdd", f"Perte maximale historique {asset_id}", dd["max_drawdown"], "pct", "min(valeur/pic courant − 1)",
            window=(w0, w1), assets=[asset_id])
    led.add(f"{p}.current_dd", f"Recul actuel depuis le sommet {asset_id}", dd["current_drawdown"], "pct", "valeur/pic courant − 1",
            window=(w0, w1), assets=[asset_id])
    led.add(f"{p}.recovery_needed", f"Gain requis pour effacer la perte max {asset_id}", recovery_gain_needed(dd["max_drawdown"]), "pct",
            "1/(1+drawdown) − 1", window=(w0, w1), assets=[asset_id])
    var = {}
    for lvl in METHODOLOGY["var"]["levels"]:
        v = historical_var_cvar(rets, lvl, METHODOLOGY["windows"]["min_obs_var"])
        var[str(lvl)] = v
        tag = int(lvl * 100)
        led.add(f"{p}.var{tag}", f"VaR historique 1 j {tag} % {asset_id}", v["var"] if v else None, "pct", "−quantile(rendements, 1−niveau)",
                window=(w0, w1), assets=[asset_id], flags=[] if v else ["SUPPRESSED_INSUFFICIENT_OBS"])
        led.add(f"{p}.cvar{tag}", f"CVaR historique 1 j {tag} % {asset_id}", v["cvar"] if v else None, "pct", "−moyenne des rendements ≤ quantile",
                window=(w0, w1), assets=[asset_id])
    # beta in CAD vs persona benchmark
    bw = benchmark_weights(benchmark_id)
    b, bwin = None, (None, None)
    try:
        panel, _ = md.cad_panel([asset_id] + [a for a in bw if a != asset_id], end=as_of)
        r = (panel / panel.shift(1) - 1).dropna()
        bench_r = r[list(bw)] @ pd.Series(bw)
        b = beta(r[asset_id], bench_r)
        bwin = (r.index[0].date().isoformat(), r.index[-1].date().isoformat())
    except Exception:  # noqa: BLE001 - benchmark components may be absent from an imported universe
        b = None
    led.add(f"{p}.beta", f"Bêta {asset_id} vs {benchmark_id}", b["beta"] if b else None, "ratio", "cov(a,b)/var(b), rendements CAD",
            window=bwin, assets=[asset_id], params={"benchmark": benchmark_id})
    led.add(f"{p}.beta_r2", f"R² du bêta {asset_id}", b["r2"] if b else None, "ratio", "corr²", assets=[asset_id])
    rf = risk_free_rate(md, w0, w1)
    sh = sharpe_ratio(rets, rf["value"], ppy)
    flags = []
    if sh is not None and sh > METHODOLOGY["sharpe_overfit_flag"]:
        flags.append("SHARPE_ABOVE_1_5_DO_NOT_EXTRAPOLATE")
    led.add(f"{p}.sharpe", f"Ratio de Sharpe historique {asset_id}", sh, "ratio", "moyenne(excès)/écart-type × √périodes; taux sans risque CA 3 mois",
            window=(w0, w1), assets=[asset_id], flags=flags, source_ids=["dataset_prices", rf["source_id"] or "aegis_methodology"])
    return {
        "lens": 3, "status": LensStatus.COMPUTED.value, "tier": tier, "volatility": vol, "rolling_vol": rv, "ewma_vol": ew,
        "vol_regime_percentile": regime, "drawdown": dd, "var": var, "beta": b, "benchmark": BENCHMARKS[benchmark_id]["label"],
        "sharpe": sh, "sharpe_flags": flags, "risk_free": rf, "annualization": ppy, "window": [w0, w1],
        "recovery_table": [{"loss": x, "gain_needed": recovery_gain_needed(x)} for x in (-0.2, -0.5, -0.8)],
        "var_caveat": METHODOLOGY["var"]["caveat"], "blind_spots": BLIND_SPOTS,
        "metric_ids": [k for k in led.ids() if k.startswith(p + ".")],
    }
