"""Lens 4 primitives: trend and momentum. Context only, never a buy/sell signal."""
from __future__ import annotations

import numpy as np
import pandas as pd


def moving_average_state(prices: pd.Series, short: int = 50, long: int = 200, slope_lag: int = 20) -> dict | None:
    p = prices.dropna()
    if len(p) < long + slope_lag:
        return None
    ma_s = p.rolling(short).mean()
    ma_l = p.rolling(long).mean()
    last = float(p.iloc[-1])
    slope = float(ma_l.iloc[-1] / ma_l.iloc[-1 - slope_lag] - 1)
    return {
        "price": last, "ma50": float(ma_s.iloc[-1]), "ma200": float(ma_l.iloc[-1]),
        "above_ma50": bool(last > ma_s.iloc[-1]), "above_ma200": bool(last > ma_l.iloc[-1]),
        "ma200_slope_20d": slope,
        "falling_knife_caution": bool(last < ma_l.iloc[-1] and slope < 0),
        "distance_to_ma200": last / float(ma_l.iloc[-1]) - 1,
    }


def momentum_12_1(prices: pd.Series, long: int = 252, skip: int = 21) -> float | None:
    """Return from t-long to t-skip observations (12-1 momentum on the asset's own calendar)."""
    p = prices.dropna()
    if len(p) < long + 1:
        return None
    return float(p.iloc[-1 - skip] / p.iloc[-1 - long] - 1)


def rsi(prices: pd.Series, period: int = 14) -> float | None:
    """Wilder RSI."""
    p = prices.dropna()
    if len(p) < period * 3:
        return None
    d = p.diff().dropna()
    gain = d.clip(lower=0)
    loss = -d.clip(upper=0)
    avg_g = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_l = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    if avg_l.iloc[-1] == 0:
        return 100.0
    rs = avg_g.iloc[-1] / avg_l.iloc[-1]
    return float(100 - 100 / (1 + rs))


def relative_strength(asset: pd.Series, bench: pd.Series, window: int = 126) -> float | None:
    df = pd.concat([asset, bench], axis=1, join="inner").dropna()
    if len(df) < window + 1:
        return None
    a = df.iloc[-1, 0] / df.iloc[-1 - window, 0] - 1
    b = df.iloc[-1, 1] / df.iloc[-1 - window, 1] - 1
    return float(a - b)


def volume_zscore(volume: pd.Series, window: int = 60, recent: int = 5) -> dict | None:
    """z-score of the mean volume of the last `recent` days vs a `window`-day baseline. Zero volumes excluded."""
    v = volume.dropna()
    zeros = int((v == 0).sum())
    v = v[v > 0]
    if len(v) < window + recent:
        return None
    base = v.iloc[-(window + recent):-recent]
    rec = v.iloc[-recent:]
    sd = float(base.std(ddof=1))
    if sd == 0 or np.isnan(sd):
        return None
    return {"zscore": float((rec.mean() - base.mean()) / sd), "recent_mean": float(rec.mean()),
            "baseline_mean": float(base.mean()), "zero_volume_excluded": zeros, "window": window, "recent": recent}
