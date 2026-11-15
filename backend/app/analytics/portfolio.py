"""Portfolio valuation, exposures and risk analytics (deterministic, tested)."""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..data.loader import DataUnavailableError, MarketData
from ..methodology import METHODOLOGY
from .benchmarks import BENCHMARKS, benchmark_weights
from .risk import annualized_vol, historical_var_cvar, max_drawdown, sharpe_ratio


# --------------------------------------------------------------------------- valuation
def quantities_from_amounts(md: MarketData, inputs: list[dict], as_of: pd.Timestamp) -> list[dict]:
    """Convert CAD amounts into (fractional, simulated) quantities at the close of `as_of`."""
    out = []
    for h in inputs:
        aid = h["asset_id"]
        md.asset(aid)
        if h.get("quantity"):
            out.append({"asset_id": aid, "quantity": float(h["quantity"])})
            continue
        amount = float(h["amount_cad"])
        price, pdate = md.last_price(aid, as_of, "close")
        fx, _ = md.fx_factor(md.asset(aid)["currency"], pdate)
        out.append({"asset_id": aid, "quantity": amount / (price * fx),
                    "note": f"quantité simulée = {amount:.2f} CAD / (cours {price:.4f} × FX {fx:.4f}) au {pdate.date()}"})
    return out


def value_holdings(md: MarketData, holdings: list[dict], as_of: pd.Timestamp) -> pd.DataFrame:
    """value_i = quantity_i × price_i × FX_i (close on or before as_of; FX on the price date)."""
    agg: dict[str, float] = {}
    lines: dict[str, int] = {}
    for h in holdings:
        agg[h["asset_id"]] = agg.get(h["asset_id"], 0.0) + float(h["quantity"])
        lines[h["asset_id"]] = lines.get(h["asset_id"], 0) + 1
    rows = []
    for aid, qty in agg.items():
        meta = md.asset(aid)
        price, pdate = md.last_price(aid, as_of, "close")
        fx, fxdate = md.fx_factor(meta["currency"], pdate)
        q = md.quality(aid)
        age = (as_of - pdate).days
        rows.append({
            "asset_id": aid, "name": meta["name"], "quantity": qty, "lines": lines[aid], "currency": meta["currency"],
            "price_native": price, "price_date": pdate.date().isoformat(), "fx_usdcad": fx if meta["currency"] == "USD" else None,
            "fx_date": fxdate.date().isoformat() if fxdate is not None else None, "value_cad": qty * price * fx,
            "asset_class": meta["asset_class"], "sub_class": meta.get("sub_class", ""), "sector": meta["sector"],
            "region": meta.get("region", ""), "is_single_issuer": bool(int(meta.get("is_single_issuer", 1))),
            "price_age_days": age, "quality_flags": q.flags,
        })
    df = pd.DataFrame(rows).set_index("asset_id")
    total = df["value_cad"].sum()
    if total <= 0:
        raise DataUnavailableError("Portfolio has no positive value")
    df["weight"] = df["value_cad"] / total
    return df.sort_values("value_cad", ascending=False)


def hhi(weights: pd.Series | dict) -> float:
    w = pd.Series(weights, dtype=float)
    return float((w ** 2).sum())


def exposures(df: pd.DataFrame) -> dict[str, dict[str, float]]:
    out = {}
    for key, col in [("sector", "sector"), ("asset_class", "asset_class"), ("region", "region"), ("currency", "currency")]:
        out[key] = {k: float(v) for k, v in df.groupby(col)["weight"].sum().sort_values(ascending=False).items()}
    growth = df[df["asset_class"].isin(["equity", "crypto"]) | df["sub_class"].isin(["equity_etf", "esg_equity_etf"])]["weight"].sum()
    out["growth_assets"] = {"growth": float(growth), "defensive": float(1 - growth)}
    return out


# --------------------------------------------------------------------------- returns
@dataclass
class ReturnsPanel:
    returns: pd.DataFrame
    calendar: str
    periods_per_year: int
    start: str
    end: str


def returns_panel(md: MarketData, assets: list[str], as_of: pd.Timestamp, lookback: int | None = None,
                  common: bool = True) -> ReturnsPanel:
    panel, cal = md.cad_panel(assets, end=as_of)
    rets = panel / panel.shift(1) - 1
    rets = rets.iloc[1:]
    if common:
        rets = rets.dropna(how="any")
    if lookback:
        rets = rets.iloc[-lookback:]
    if rets.empty:
        raise DataUnavailableError("No overlapping return observations for the requested assets")
    ppy = METHODOLOGY["returns"]["annualization"][cal]
    return ReturnsPanel(rets, cal, ppy, rets.index[0].date().isoformat(), rets.index[-1].date().isoformat())


def weighted_returns(rp: ReturnsPanel, weights: dict[str, float]) -> pd.Series:
    w = pd.Series(weights, dtype=float).reindex(rp.returns.columns).fillna(0.0)
    return rp.returns @ w


def benchmark_returns(md: MarketData, benchmark_id: str, as_of: pd.Timestamp, index: pd.DatetimeIndex) -> pd.Series:
    bw = benchmark_weights(benchmark_id)
    panel, _ = md.cad_panel(list(bw), end=as_of)
    r = (panel / panel.shift(1) - 1)
    r = r.reindex(index)
    w = pd.Series(bw)
    return (r[w.index] @ w).dropna()


def correlation_matrix(returns: pd.DataFrame, min_obs: int) -> pd.DataFrame:
    return returns.corr(min_periods=min_obs)


def avg_pairwise_corr(corr: pd.DataFrame, weights: dict[str, float] | None = None) -> float | None:
    cols = list(corr.columns)
    if len(cols) < 2:
        return None
    vals, wts = [], []
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            c = corr.iloc[i, j]
            if pd.notna(c):
                vals.append(c)
                wts.append((weights or {}).get(cols[i], 1.0) * (weights or {}).get(cols[j], 1.0) if weights else 1.0)
    if not vals:
        return None
    return float(np.average(vals, weights=wts))


def risk_decomposition(returns: pd.DataFrame, weights: dict[str, float], ppy: int) -> dict:
    cols = list(returns.columns)
    w = np.array([weights.get(c, 0.0) for c in cols])
    cov = returns.cov().to_numpy() * ppy
    var_p = float(w @ cov @ w)
    sig_p = math.sqrt(var_p) if var_p > 0 else 0.0
    asset_vol = np.sqrt(np.diag(cov))
    if sig_p == 0:
        return {"portfolio_vol": 0.0, "contributions": {}, "diversification_ratio": None, "asset_vol": {}}
    mcr = cov @ w / sig_p
    rc = w * mcr
    return {
        "portfolio_vol": sig_p,
        "portfolio_variance": var_p,
        "contributions": {c: float(rc[i] / sig_p) for i, c in enumerate(cols)},
        "marginal": {c: float(mcr[i]) for i, c in enumerate(cols)},
        "asset_vol": {c: float(asset_vol[i]) for i, c in enumerate(cols)},
        "diversification_ratio": float((w * asset_vol).sum() / sig_p),
    }


def stressed_correlation(returns: pd.DataFrame, weights: dict[str, float], ppy: int, window: int) -> dict | None:
    """Portfolio vol recomputed with the correlation matrix of the worst rolling window (stress test, not a forecast)."""
    if len(returns) < window * 2 or returns.shape[1] < 2:
        return None
    pr = weighted_returns(ReturnsPanel(returns, "", ppy, "", ""), weights)
    roll = (1 + pr).rolling(window).apply(np.prod, raw=True) - 1
    end = roll.idxmin()
    end_pos = returns.index.get_loc(end)
    win = returns.iloc[end_pos - window + 1:end_pos + 1]
    c_s = win.corr().fillna(0).to_numpy()
    np.fill_diagonal(c_s, 1.0)
    cols = list(returns.columns)
    w = np.array([weights.get(c, 0.0) for c in cols])
    vols = returns.std(ddof=1).to_numpy() * math.sqrt(ppy)
    d = np.diag(vols)
    stressed_var = float(w @ d @ c_s @ d @ w)
    normal_corr = returns.corr().fillna(0).to_numpy()
    np.fill_diagonal(normal_corr, 1.0)
    normal_var = float(w @ d @ normal_corr @ d @ w)
    return {
        "window_start": win.index[0].date().isoformat(), "window_end": win.index[-1].date().isoformat(),
        "window_return": float(roll.min()), "normal_vol": math.sqrt(normal_var), "stressed_vol": math.sqrt(stressed_var),
        "avg_corr_normal": avg_pairwise_corr(returns.corr(), weights),
        "avg_corr_stressed": avg_pairwise_corr(win.corr(), weights),
        "label": "test de résistance (corrélations de la pire fenêtre historique), pas une prévision",
    }


def rolling_avg_corr(returns: pd.DataFrame, weights: dict[str, float], window: int, step: int = 5) -> pd.Series:
    if returns.shape[1] < 2 or len(returns) < window:
        return pd.Series(dtype=float)
    out = {}
    for end in range(window, len(returns) + 1, step):
        win = returns.iloc[end - window:end]
        out[win.index[-1]] = avg_pairwise_corr(win.corr(), weights)
    return pd.Series(out, dtype=float).dropna()


def risk_free_rate(md: MarketData, start: str, end: str) -> dict:
    if md.macro.empty:
        return {"value": 0.0, "source_id": None, "note": "taux sans risque indisponible: 0 utilisé"}
    labels = {"CA_TBILL_3M": "bon du Trésor canadien 3 mois", "CA_POLICY_RATE": "taux directeur de la Banque du Canada"}
    for sid, label in labels.items():  # first available, point-in-time safe series wins
        m = md.macro[(md.macro["series_id"] == sid) & (md.macro["date"] >= start) & (md.macro["date"] <= end)
                     & (md.macro["pit_safe"] == 1)]
        if not m.empty:
            return {"value": float(m["value"].mean()) / 100, "source_id": str(m["source_id"].iloc[0]),
                    "note": f"moyenne du {label} sur la fenêtre", "series_id": sid}
    return {"value": 0.0, "source_id": None, "note": "taux sans risque indisponible: 0 utilisé"}


def portfolio_risk_metrics(md: MarketData, weights: dict[str, float], as_of: pd.Timestamp,
                           lookback: int | None = None, benchmark_id: str | None = None) -> dict:
    cfg = METHODOLOGY["windows"]
    lookback = lookback or cfg["default_lookback_days"]
    assets = [a for a, w in weights.items() if w > 0]
    rp = returns_panel(md, assets, as_of, lookback)
    pr = weighted_returns(rp, weights)
    n = len(pr)
    value_index = (1 + pr).cumprod()
    out: dict = {"window_start": rp.start, "window_end": rp.end, "n_obs": n, "calendar": rp.calendar,
                 "periods_per_year": rp.periods_per_year, "flags": []}
    if n < cfg["min_obs_volatility"]:
        out["flags"].append(f"INSUFFICIENT_OBS: {n} < {cfg['min_obs_volatility']}")
    out["volatility"] = annualized_vol(pr, rp.periods_per_year, cfg["min_obs_volatility"])
    out["drawdown"] = max_drawdown(pd.concat([pd.Series([1.0], index=[pr.index[0] - pd.Timedelta(days=1)]), value_index]))
    out["var"] = {str(lvl): historical_var_cvar(pr, lvl, cfg["min_obs_var"]) for lvl in METHODOLOGY["var"]["levels"]}
    out["total_return"] = float(value_index.iloc[-1] - 1)
    years = n / rp.periods_per_year
    out["annualized_return"] = float(value_index.iloc[-1] ** (1 / years) - 1) if years >= 1 else None
    rf = risk_free_rate(md, rp.start, rp.end)
    out["risk_free"] = rf
    out["sharpe"] = sharpe_ratio(pr, rf["value"], rp.periods_per_year)
    corr = correlation_matrix(rp.returns, cfg["min_obs_correlation"])
    out["correlation"] = {"assets": list(corr.columns), "matrix": corr.round(4).fillna(np.nan).values.tolist()}
    out["avg_pairwise_corr"] = avg_pairwise_corr(corr, weights)
    out["risk"] = risk_decomposition(rp.returns, weights, rp.periods_per_year)
    out["stressed"] = stressed_correlation(rp.returns, weights, rp.periods_per_year, cfg["stress_window"])
    roll = rolling_avg_corr(rp.returns, weights, cfg["rolling_corr_window"])
    out["rolling_avg_corr"] = [{"date": d.date().isoformat(), "value": round(float(v), 4)} for d, v in roll.items()]
    dd = value_index / value_index.cummax() - 1
    step = max(1, n // 260)
    series = [{"date": d.date().isoformat(), "portfolio": round(float(v), 5), "drawdown": round(float(dd.loc[d]), 5)}
              for d, v in value_index.iloc[::step].items()]
    br = None
    if benchmark_id:
        try:
            br = benchmark_returns(md, benchmark_id, as_of, pr.index)
        except (DataUnavailableError, KeyError) as exc:
            out["benchmark"] = None
            out["benchmark_error"] = f"indice {benchmark_id} indisponible: {exc}"
    if br is not None and len(br) > 1:
        common = pr.index.intersection(br.index)
        bidx = (1 + br.loc[common]).cumprod()
        pidx = (1 + pr.loc[common]).cumprod()
        bvol = annualized_vol(br.loc[common], rp.periods_per_year)
        bmdd = max_drawdown(pd.concat([pd.Series([1.0], index=[common[0] - pd.Timedelta(days=1)]), bidx]))
        te = float((pr.loc[common] - br.loc[common]).std(ddof=1) * math.sqrt(rp.periods_per_year))
        out["benchmark"] = {
            "benchmark_id": benchmark_id, "label": BENCHMARKS[benchmark_id]["label"], "total_return": float(bidx.iloc[-1] - 1),
            "volatility": bvol, "max_drawdown": bmdd["max_drawdown"] if bmdd else None,
            "excess_return": float(pidx.iloc[-1] - bidx.iloc[-1]), "tracking_error": te,
            "n_obs": int(len(common)), "note": "même devise (CAD), même fenêtre, rendements totaux (adj_close)",
        }
        # Crypto trades every day, the benchmark only on market days: carry the last known index value over
        # weekends/holidays (no change on a closed market). Before the first common day there is no value (null).
        bfull = bidx.reindex(value_index.index).ffill()
        for row in series:
            v = bfull.get(pd.Timestamp(row["date"]))
            row["benchmark"] = round(float(v), 5) if v is not None and np.isfinite(v) else None
    out["series"] = series
    return out


def asset_correlation_pairs(corr_assets: list[str], matrix: list[list[float]], threshold: float) -> list[dict]:
    pairs = []
    for i in range(len(corr_assets)):
        for j in range(i + 1, len(corr_assets)):
            c = matrix[i][j]
            if c is not None and not (isinstance(c, float) and math.isnan(c)) and c >= threshold:
                pairs.append({"a": corr_assets[i], "b": corr_assets[j], "corr": float(c)})
    return sorted(pairs, key=lambda p: -p["corr"])
