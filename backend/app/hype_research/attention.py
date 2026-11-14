"""Heuristic attention indicator (section G3). NOT a probability of a crash, NOT intrinsic value, NOT confidence.

Components (each 0–100, documented):
  news_volume      = clip(50 + 25·log2(mean articles last 7 d / mean prior days), 0, 100)       [GDELT timelinevolraw]
  trading_volume   = clip(50 + 15·z), z = volume z-score 5 d vs 60 d, zero volumes excluded       [dataset or CoinGecko]
  price_momentum   = percentile of |20-obs return| within the asset's own history × 100          [dataset]
  source_diversity = min(100, 100·log10(1+n)/log10(51)), n = independent reports after dedup      [GDELT, after clustering]
Missing components are EXCLUDED (never set to zero); weights are renormalized over available components;
the index is computed only if at least `min_components` are available.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from ..methodology import METHODOLOGY


def _clip(x: float) -> float:
    return float(max(0.0, min(100.0, x)))


def news_volume_component(timeline: list[dict] | None, recent_days: int = 7) -> dict:
    if not timeline:
        return {"status": "UNAVAILABLE", "reason": "série d'attention médiatique indisponible"}
    counts = [p["count"] for p in timeline if p.get("count") is not None]
    if len(counts) < recent_days + 14:
        return {"status": "UNAVAILABLE", "reason": f"série trop courte ({len(counts)} jours)"}
    recent, base = np.mean(counts[-recent_days:]), np.mean(counts[:-recent_days])
    if base <= 0:
        return {"status": "UNAVAILABLE", "reason": "ligne de base nulle"}
    ratio = recent / base
    return {"status": "OK", "ratio": float(ratio), "recent_mean": float(recent), "baseline_mean": float(base),
            "baseline_days": len(counts) - recent_days, "score": _clip(50 + 25 * math.log2(max(ratio, 1e-6)))}


def trading_volume_component(vz: dict | None) -> dict:
    if not vz:
        return {"status": "UNAVAILABLE", "reason": "volume insuffisant ou absent"}
    return {"status": "OK", "zscore": vz["zscore"], "score": _clip(50 + 15 * vz["zscore"]), "window": vz.get("window"),
            "zero_volume_excluded": vz.get("zero_volume_excluded", 0)}


def momentum_component(prices: pd.Series, window: int = 20) -> dict:
    p = prices.dropna()
    if len(p) < window * 6:
        return {"status": "UNAVAILABLE", "reason": "historique insuffisant"}
    r = (p / p.shift(window) - 1).dropna().abs()
    cur = float(r.iloc[-1])
    pct = float((r <= cur).mean())
    return {"status": "OK", "abs_return": cur, "signed_return": float(p.iloc[-1] / p.iloc[-1 - window] - 1), "window": window,
            "percentile": pct, "score": _clip(pct * 100)}


def diversity_component(independent_reports: int | None) -> dict:
    if independent_reports is None:
        return {"status": "UNAVAILABLE", "reason": "aucune source d'actualités connectée"}
    return {"status": "OK", "independent_reports": independent_reports,
            "score": _clip(100 * math.log10(1 + independent_reports) / math.log10(51))}


def attention_index(components: dict[str, dict]) -> dict:
    cfg = METHODOLOGY["hype"]
    w = cfg["weights"]
    avail = {k: v for k, v in components.items() if v.get("status") == "OK" and k in w}
    coverage = len(avail) / len(w)
    if len(avail) < cfg["min_components"]:
        return {"status": "UNAVAILABLE", "value": None, "coverage": coverage, "components": components,
                "reason": f"{len(avail)} composante(s) disponible(s) < minimum {cfg['min_components']}: indice non calculé "
                          "(l'absence de données n'est jamais interprétée comme « pas de hype »)",
                "label": cfg["kind"]}
    tot = sum(w[k] for k in avail)
    value = sum(w[k] / tot * v["score"] for k, v in avail.items())
    band = "élevée" if value >= 70 else ("modérée" if value >= 45 else "faible")
    return {"status": "OK", "value": round(value, 1), "band": band, "coverage": coverage,
            "weights_used": {k: w[k] / tot for k in avail}, "components": components, "label": cfg["kind"],
            "formula": "Σ poids_normalisés × score_composante sur les composantes disponibles"}
