"""Scenario Lab engine: explicit shocks (assumptions, not predictions), historical replay, comparisons, sizing."""
from __future__ import annotations

import pandas as pd

from ..data.loader import DataUnavailableError, MarketData
from .risk import max_drawdown

SHOCK_PRESETS = {
    "tech_crash_30": {"name": "Technologie −30 %, autres actions −10 %, obligations +2 %",
                      "shocks": {"sector:Information Technology": -0.30, "asset_class:equity": -0.10, "sub_class:equity_etf": -0.15,
                                 "sub_class:esg_equity_etf": -0.12, "sub_class:bond_etf": 0.02, "asset_class:crypto": -0.40}},
    "cad_up_10": {"name": "Le dollar canadien s'apprécie de 10 % face au USD", "shocks": {"fx:USDCAD": -0.0909}},
    "rates_up_100bp": {"name": "Hausse de taux de 100 pb (hypothèse de duration ~6 ans)",
                       "shocks": {"sub_class:bond_etf": -0.06, "asset_class:equity": -0.05, "sub_class:equity_etf": -0.05,
                                  "sub_class:esg_equity_etf": -0.05}},
    "crypto_winter": {"name": "Hiver crypto : −60 % sur les cryptoactifs", "shocks": {"asset_class:crypto": -0.60}},
    "broad_bear": {"name": "Marché baissier généralisé : actions −25 %, obligations −5 %, or +5 %",
                   "shocks": {"asset_class:equity": -0.25, "sub_class:equity_etf": -0.25, "sub_class:esg_equity_etf": -0.25,
                              "sub_class:bond_etf": -0.05, "sub_class:gold_etf": 0.05, "asset_class:crypto": -0.50}},
}


def shock_for_asset(meta: pd.Series, asset_id: str, shocks: dict[str, float]) -> tuple[float, str]:
    """Most specific key wins: asset > sector > sub_class > asset_class > default."""
    for key in (f"asset:{asset_id}", f"sector:{meta['sector']}", f"sub_class:{meta.get('sub_class', '')}",
                f"asset_class:{meta['asset_class']}", "default"):
        if key in shocks:
            return float(shocks[key]), key
    return 0.0, "aucun choc"


def apply_shock(md: MarketData, positions: pd.DataFrame, shocks: dict[str, float]) -> dict:
    fx_shock = float(shocks.get("fx:USDCAD", 0.0))
    rows, before, after = [], 0.0, 0.0
    for aid, r in positions.iterrows():
        meta = md.asset(aid)
        s, key = shock_for_asset(meta, aid, shocks)
        fx_mult = (1 + fx_shock) if r["currency"] == "USD" else 1.0
        new_val = r["value_cad"] * (1 + s) * fx_mult
        rows.append({"asset_id": aid, "value_before": r["value_cad"], "value_after": new_val, "price_shock": s, "rule": key,
                     "fx_effect": fx_mult - 1, "pnl": new_val - r["value_cad"]})
        before += r["value_cad"]
        after += new_val
    return {"value_before": before, "value_after": after, "pnl": after - before, "return": after / before - 1, "positions": rows,
            "label": "HYPOTHÈSE explicite appliquée instantanément; pas une prévision statistique"}


def historical_replay(md: MarketData, weights: dict[str, float], start: str, end: str, initial_value: float,
                      rebalancing: str = "none") -> dict:
    """Buy at start using only prices known at start, then hold (or rebalance monthly). Costs omitted."""
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    assets = [a for a, w in weights.items() if w > 0]
    panel, cal = md.cad_panel(assets, end=e)
    panel = panel[panel.index >= s].dropna(how="any")
    if len(panel) < 5:
        raise DataUnavailableError("Fenêtre de rejeu trop courte ou données manquantes")
    w = pd.Series(weights)[assets] / pd.Series(weights)[assets].sum()
    if rebalancing == "monthly":
        rets = panel.pct_change().fillna(0)
        values, v, cur_w = [], initial_value, w.copy()
        month = panel.index[0].month
        for d, r in rets.iterrows():
            if d.month != month:
                cur_w, month = w.copy(), d.month
            gross = (cur_w * (1 + r[assets])).sum()
            v *= gross
            cur_w = cur_w * (1 + r[assets]) / gross
            values.append(v)
        series = pd.Series(values, index=panel.index)
    else:
        qty = initial_value * w / panel.iloc[0]
        series = (panel * qty).sum(axis=1)
    dd = max_drawdown(series)
    step = max(1, len(series) // 200)
    return {"start": panel.index[0].date().isoformat(), "end": panel.index[-1].date().isoformat(), "calendar": cal,
            "initial_value": initial_value, "final_value": float(series.iloc[-1]), "total_return": float(series.iloc[-1] / initial_value - 1),
            "max_drawdown": dd["max_drawdown"] if dd else None, "drawdown": dd, "rebalancing": rebalancing,
            "series": [{"date": d.date().isoformat(), "value": round(float(v), 2)} for d, v in series.iloc[::step].items()],
            "point_in_time": "pondérations fixées avec les seuls prix connus à la date de départ",
            "costs": "frais, écarts et impôts omis"}


def position_size_table(portfolio_value: float, max_loss_pct: float, adverse_moves: list[float]) -> list[dict]:
    """size = (max loss per idea × portfolio value) / assumed adverse move. Educational calculation."""
    out = []
    for m in adverse_moves:
        if m <= 0:
            continue
        out.append({"adverse_move": m, "max_loss_cad": portfolio_value * max_loss_pct,
                    "position_cad": portfolio_value * max_loss_pct / m, "position_pct": max_loss_pct / m})
    return out


def diversified_alternatives(weights: dict[str, float], meta: dict[str, dict]) -> dict[str, dict[str, float]]:
    """Two transparent hypothetical alternatives built by explicit rules (not optimized, not advice)."""
    singles = {a: w for a, w in weights.items() if meta[a].get("is_single_issuer") and meta[a]["asset_class"] != "crypto"}
    single_total = sum(singles.values())
    crypto_total = sum(w for a, w in weights.items() if meta[a]["asset_class"] == "crypto")
    keep_singles = {a: w * 0.4 for a, w in singles.items()}
    released = single_total * 0.6 + crypto_total * 0.5
    div = {a: w for a, w in weights.items() if a not in singles and meta[a]["asset_class"] != "crypto"}
    for a, w in weights.items():
        if meta[a]["asset_class"] == "crypto":
            div[a] = w * 0.5
    div.update(keep_singles)
    for a, add in {"XIU.TO": 0.35, "VEA": 0.35, "XBB.TO": 0.30}.items():
        div[a] = div.get(a, 0.0) + released * add
    defensive = {"XBB.TO": 0.35, "AGG": 0.20, "XIU.TO": 0.15, "SPY": 0.10, "VEA": 0.08, "GLD": 0.07}
    rest = 0.05
    for a, w in sorted(weights.items(), key=lambda kv: -kv[1]):
        if rest <= 0:
            break
        take = min(rest, w * 0.25)
        defensive[a] = defensive.get(a, 0.0) + take
        rest -= take
    norm = lambda d: {k: v / sum(d.values()) for k, v in d.items() if v > 1e-9}  # noqa: E731
    return {
        "diversified": {"label": "Diversifié hypothétique : réduit de 60 % les titres individuels, de 50 % la crypto, réalloue vers XIU.TO/VEA/XBB.TO",
                        "weights": norm(div)},
        "defensive": {"label": "Défensif hypothétique : 55 % obligations, 33 % actions larges, 7 % or, 5 % positions actuelles",
                      "weights": norm(defensive)},
    }
