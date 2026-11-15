"""A tiny synthetic datapack with answers computable by hand (phase 2 unit tests)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

N = 700
FX = 1.25


def build(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    days = np.arange(np.datetime64("2020-01-06"), np.datetime64("2023-12-31"))
    cal = days[np.isin((days.astype("datetime64[D]").view("int64") - 4) % 7, [0, 1, 2, 3, 4])][:N]
    rng = np.random.default_rng(7)
    aaa = 100 * np.cumprod(np.r_[1.0, np.where(np.arange(N - 1) % 2 == 0, 1.01, 0.99)])
    ddd = np.r_[np.linspace(100, 150, 200), np.linspace(150, 90, 101)[1:], np.linspace(90, 160, N - 300)]
    bbb = 50 * np.cumprod(np.r_[1.0, 1 + rng.normal(0.0005, 0.02, N - 1)])
    etf = 0.6 * aaa / aaa[0] + 0.4 * bbb * FX / (bbb[0] * FX)
    cry = 1000 * np.cumprod(np.r_[1.0, 1 + rng.normal(0.001, 0.05, N - 1)])
    local = np.column_stack([aaa, ddd, bbb, bbb.copy(), etf * 20, cry])
    tickers = ["AAA", "DDD", "BBB", "BBB2", "ETF1", "CRY"]
    ccy = ["CAD", "CAD", "USD", "USD", "CAD", "USD"]
    usd = np.array([c == "USD" for c in ccy])
    cad = np.where(usd[None, :], local * FX, local)
    for name, arr in {"adj_local": local, "close_local": local, "adj_cad": cad, "close_cad": cad,
                      "volume": np.full_like(local, 1e6), "fx_usdcad": np.full(N, FX),
                      "pageviews": np.full((N, len(tickers)), np.nan)}.items():
        np.save(path / f"{name}.npy", arr.astype("float64"))
    np.save(path / "calendar.npy", cal.astype("datetime64[D]"))
    np.save(path / "pv_days.npy", cal.astype("datetime64[D]"))
    np.save(path / "traded.npy", np.ones_like(local, dtype=bool))
    np.save(path / "fx_published.npy", np.ones(N, dtype=bool))
    assets = [
        {"ticker": "AAA", "name": "Alpha", "asset_class": "equity", "market": "TSX", "currency": "CAD", "sector": "Financials"},
        {"ticker": "DDD", "name": "Delta", "asset_class": "equity", "market": "TSX", "currency": "CAD", "sector": "Energy"},
        {"ticker": "BBB", "name": "Beta", "asset_class": "equity", "market": "NYSE", "currency": "USD", "sector": "Information Technology"},
        {"ticker": "BBB2", "name": "Beta bis", "asset_class": "equity", "market": "NYSE", "currency": "USD", "sector": "Information Technology"},
        {"ticker": "ETF1", "name": "Fonds 1", "asset_class": "etf_equity", "market": "TSX", "currency": "CAD", "sector": "Broad"},
        {"ticker": "CRY", "name": "Crypto", "asset_class": "crypto", "market": "Crypto (24/7)", "currency": "USD", "sector": "Crypto asset"},
    ]
    for i, a in enumerate(assets):
        a.update({"asset_id": f"T{i}", "first_date": str(cal[0]), "wikipedia": None})
    (path / "meta.json").write_text(json.dumps({"datapack_version": 0, "assets": assets, "calendar": {}}))
    (path / "macro.json").write_text(json.dumps({}))
    snap = {"as_of": str(cal[0]), "available_from": str(cal[1]), "source": "synthétique", "weight_sum": 1.0,
            "holdings": [{"ticker": "AAA", "universe_ticker": "AAA", "weight": 0.6, "sector": "Financials", "country": "CA", "currency": "CAD"},
                         {"ticker": "BBB", "universe_ticker": "BBB", "weight": 0.4, "sector": "Information Technology", "country": "US", "currency": "USD"}]}
    (path / "etf_holdings.json").write_text(json.dumps({"funds": {"ETF1": [snap]}}))
    (path / "corporate_actions.json").write_text(json.dumps([{"ex_date": str(cal[-10]), "ticker": "AAA", "action": "dividend", "value": 2.0}]))
    return path
