"""Benchmarks. Blends are synthetic, daily-rebalanced, total-return (adj_close) in CAD, costs omitted."""
from __future__ import annotations

BENCHMARKS: dict[str, dict] = {
    "SPY": {"label": "S&P 500 (SPY), en CAD", "weights": {"SPY": 1.0}},
    "XIU.TO": {"label": "S&P/TSX 60 (XIU.TO)", "weights": {"XIU.TO": 1.0}},
    "QQQ": {"label": "Nasdaq-100 (QQQ), en CAD", "weights": {"QQQ": 1.0}},
    "AGG": {"label": "Obligations US agrégées (AGG), en CAD", "weights": {"AGG": 1.0}},
    "BLEND_GROWTH": {"label": "Mixte croissance : 50 % SPY / 30 % XIU.TO / 20 % QQQ",
                     "weights": {"SPY": 0.5, "XIU.TO": 0.3, "QQQ": 0.2}},
    "BLEND_BALANCED": {"label": "Mixte équilibré 60/40 : 30 % SPY / 30 % XIU.TO / 25 % XBB.TO / 15 % AGG",
                       "weights": {"SPY": 0.3, "XIU.TO": 0.3, "XBB.TO": 0.25, "AGG": 0.15}},
    "BLEND_ESG_BALANCED": {"label": "Mixte équilibré ESG : 60 % ESGV / 20 % XBB.TO / 20 % AGG",
                           "weights": {"ESGV": 0.6, "XBB.TO": 0.2, "AGG": 0.2}},
    "BLEND_CONSERVATIVE": {"label": "Mixte prudent 40/60 : 20 % XIU.TO / 20 % SPY / 35 % XBB.TO / 25 % AGG",
                           "weights": {"XIU.TO": 0.2, "SPY": 0.2, "XBB.TO": 0.35, "AGG": 0.25}},
}


def benchmark_weights(benchmark_id: str) -> dict[str, float]:
    if benchmark_id not in BENCHMARKS:
        raise KeyError(f"Unknown benchmark {benchmark_id}")
    return BENCHMARKS[benchmark_id]["weights"]
