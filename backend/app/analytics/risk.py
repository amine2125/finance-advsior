"""Deterministic risk statistics. Pure functions over pandas Series; no I/O, no LLM."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd


def simple_returns(prices: pd.Series) -> pd.Series:
    """return_t = price_t / price_(t-1) - 1 over consecutive available observations."""
    p = prices.dropna()
    return (p / p.shift(1) - 1).dropna()


def annualized_vol(returns: pd.Series, periods_per_year: int, min_obs: int = 2) -> float | None:
    r = returns.dropna()
    if len(r) < max(min_obs, 2):
        return None
    return float(r.std(ddof=1) * math.sqrt(periods_per_year))


def rolling_vol(returns: pd.Series, window: int, periods_per_year: int) -> pd.Series:
    return returns.rolling(window).std(ddof=1) * math.sqrt(periods_per_year)


def ewma_vol(returns: pd.Series, periods_per_year: int, lam: float = 0.94, seed_obs: int = 30) -> float | None:
    """RiskMetrics EWMA: s2_t = lam * s2_(t-1) + (1-lam) * r_(t-1)^2, seeded with the sample variance."""
    r = returns.dropna().to_numpy()
    if len(r) <= seed_obs:
        return None
    var = float(np.var(r[:seed_obs], ddof=1))
    for x in r[seed_obs:]:
        var = lam * var + (1 - lam) * x * x
    return math.sqrt(var * periods_per_year)


def drawdown_series(values: pd.Series) -> pd.Series:
    """drawdown_t = value_t / running_peak_t - 1"""
    v = values.dropna()
    return v / v.cummax() - 1


def max_drawdown(values: pd.Series) -> dict | None:
    v = values.dropna()
    if len(v) < 2:
        return None
    dd = drawdown_series(v)
    trough = dd.idxmin()
    mdd = float(dd.min())
    peak = v[:trough].idxmax()
    after = v[trough:]
    recovered = after[after >= v[peak]]
    rec_date = recovered.index[0] if not recovered.empty else None
    return {
        "max_drawdown": mdd,
        "peak_date": peak.date().isoformat(),
        "trough_date": trough.date().isoformat(),
        "recovery_date": rec_date.date().isoformat() if rec_date is not None else None,
        "days_peak_to_trough": int((trough - peak).days),
        "days_to_recover": int((rec_date - trough).days) if rec_date is not None else None,
        "current_drawdown": float(dd.iloc[-1]),
    }


def recovery_gain_needed(drawdown: float) -> float:
    """Gain needed to recover a loss: -20% needs +25%, -50% needs +100%, -80% needs +400%."""
    if drawdown <= -1:
        return math.inf
    return 1 / (1 + drawdown) - 1


def historical_var_cvar(returns: pd.Series, level: float = 0.95, min_obs: int = 250) -> dict | None:
    """Historical 1-day VaR/CVaR reported as positive loss fractions. Suppressed below min_obs."""
    r = returns.dropna()
    if len(r) < min_obs:
        return None
    q = float(np.quantile(r.to_numpy(), 1 - level, method="linear"))
    tail = r[r <= q]
    return {"level": level, "var": -q, "cvar": float(-tail.mean()), "n_obs": int(len(r)), "tail_obs": int(len(tail))}


def beta(asset_r: pd.Series, bench_r: pd.Series, min_obs: int = 60) -> dict | None:
    df = pd.concat([asset_r, bench_r], axis=1, join="inner").dropna()
    if len(df) < min_obs:
        return None
    a, b = df.iloc[:, 0].to_numpy(), df.iloc[:, 1].to_numpy()
    var_b = float(np.var(b, ddof=1))
    if var_b == 0:
        return None
    cov = float(np.cov(a, b, ddof=1)[0, 1])
    corr = float(np.corrcoef(a, b)[0, 1])
    return {"beta": cov / var_b, "r2": corr * corr, "n_obs": int(len(df))}


def sharpe_ratio(returns: pd.Series, rf_annual: float, periods_per_year: int, min_obs: int = 60) -> float | None:
    r = returns.dropna()
    if len(r) < min_obs:
        return None
    excess = r - rf_annual / periods_per_year
    sd = float(excess.std(ddof=1))
    if sd == 0:
        return None
    return float(excess.mean() / sd * math.sqrt(periods_per_year))


def vol_regime_percentile(returns: pd.Series, window: int = 21) -> float | None:
    rv = returns.rolling(window).std(ddof=1).dropna()
    if len(rv) < window * 3:
        return None
    return float((rv <= rv.iloc[-1]).mean())


def rolling_window_base_rate(prices: pd.Series, window: int, threshold: float) -> dict | None:
    """Count rolling `window`-observation windows whose return fell below `threshold` (non-overlapping start step 1)."""
    p = prices.dropna()
    if len(p) <= window + 20:
        return None
    fwd = (p.shift(-window) / p - 1).dropna()
    n = int(len(fwd))
    hits = int((fwd <= threshold).sum())
    return {"windows": n, "loss_hits": hits, "min": float(fwd.min()), "median": float(fwd.median()),
            "max": float(fwd.max()), "p10": float(fwd.quantile(0.10)), "p90": float(fwd.quantile(0.90)),
            "gain_windows": int((fwd > 0).sum()), "note": "overlapping windows; observations are not independent"}


def spearman(x: list[float], y: list[float]) -> float | None:
    if len(x) < 3 or len(x) != len(y):
        return None
    rx = pd.Series(x).rank().to_numpy()
    ry = pd.Series(y).rank().to_numpy()
    if np.std(rx) == 0 or np.std(ry) == 0:
        return None
    return float(np.corrcoef(rx, ry)[0, 1])
