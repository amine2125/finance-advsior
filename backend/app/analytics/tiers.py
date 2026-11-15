"""Section 7A.2: asset risk tiers - computed from data available at `as_of`, never asserted."""
from __future__ import annotations

import pandas as pd

from ..data.loader import DataUnavailableError, MarketData
from ..methodology import METHODOLOGY
from ..models import TIER_ORDER, RiskTier
from .risk import annualized_vol, max_drawdown, simple_returns


def _vol_tier(vol: float, cfg: dict) -> RiskTier:
    if vol < cfg["vol_low"]:
        return RiskTier.LOW
    if vol <= cfg["vol_high"]:
        return RiskTier.MEDIUM
    return RiskTier.HIGH


def _mdd_tier(mdd: float, cfg: dict) -> RiskTier:
    if mdd > cfg["mdd_low"]:
        return RiskTier.LOW
    if mdd > cfg["mdd_high"]:
        return RiskTier.MEDIUM
    return RiskTier.HIGH


def worse(a: RiskTier, b: RiskTier) -> RiskTier:
    if RiskTier.UNKNOWN in (a, b):
        return RiskTier.UNKNOWN
    return a if TIER_ORDER[a] >= TIER_ORDER[b] else b


def tier_from_stats(vol: float | None, mdd: float | None, n_obs: int, *, single_issuer: bool, crypto: bool,
                    leveraged: bool = False, inverse: bool = False, min_obs: int | None = None) -> dict:
    cfg = METHODOLOGY["risk_tiers"]
    min_obs = min_obs or METHODOLOGY["windows"]["min_obs_tier"]
    rules = []
    if n_obs < min_obs or vol is None or mdd is None:
        return {"tier": RiskTier.UNKNOWN, "rules": [f"historique insuffisant ({n_obs} obs. < {min_obs})"]}
    vt, mt = _vol_tier(vol, cfg), _mdd_tier(mdd, cfg)
    tier = worse(vt, mt)
    rules.append(f"volatilité {vol:.1%} -> {vt.value}; drawdown max {mdd:.1%} -> {mt.value}")
    structural = []
    if single_issuer and not crypto:
        structural.append("émetteur unique (perte permanente possible: jamais LOW)")
    if crypto:
        structural.append("cryptoactif (aucun flux de trésorerie)")
    if leveraged:
        structural.append("produit à effet de levier")
    if inverse:
        structural.append("produit inverse")
    if structural:
        tier = RiskTier.HIGH
        rules.append("règle structurelle -> HIGH: " + ", ".join(structural))
    return {"tier": tier, "rules": rules, "vol_tier": vt.value, "mdd_tier": mt.value}


def classify_risk_tier(md: MarketData, asset_id: str, as_of: str | pd.Timestamp | None = None) -> dict:
    """Uses only observations on or before `as_of` (point in time)."""
    view = md.as_of(as_of) if as_of is not None else md
    meta = view.asset(asset_id)
    try:
        prices = view.native_series(asset_id, "adj_close")
    except DataUnavailableError:
        prices = pd.Series(dtype=float)
    ppy = view.periods_per_year(asset_id)
    rets = simple_returns(prices)
    vol = annualized_vol(rets, ppy, METHODOLOGY["windows"]["min_obs_volatility"])
    dd = max_drawdown(prices)
    res = tier_from_stats(vol, dd["max_drawdown"] if dd else None, int(len(prices)),
                          single_issuer=bool(int(meta.get("is_single_issuer", 1))),
                          crypto=meta["asset_class"] == "crypto",
                          leveraged=bool(int(meta.get("is_leveraged", 0))), inverse=bool(int(meta.get("is_inverse", 0))))
    return {
        "asset_id": asset_id, "name": meta["name"], "tier": res["tier"].value, "rules": res["rules"],
        "volatility": vol, "max_drawdown": dd["max_drawdown"] if dd else None,
        "drawdown_detail": dd, "n_obs": int(len(prices)), "annualization": ppy,
        "window_start": prices.index[0].date().isoformat() if len(prices) else None,
        "window_end": prices.index[-1].date().isoformat() if len(prices) else None,
        "asset_class": meta["asset_class"], "sector": meta["sector"],
        "thresholds": {k: METHODOLOGY["risk_tiers"][k] for k in ("vol_low", "vol_high", "mdd_low", "mdd_high")},
        "methodology_version": METHODOLOGY["version"],
    }


def classify_universe(md: MarketData, as_of: str | None = None) -> list[dict]:
    return [classify_risk_tier(md, a, as_of) for a in md.universe.index]
