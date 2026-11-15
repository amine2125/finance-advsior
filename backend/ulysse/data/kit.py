"""Load and validate the AlphaForge starter kit (reference data, never modified on disk)."""
from __future__ import annotations

import pandas as pd

from ulysse.config import KIT_DIR

PRICE_COLS = ["date", "ticker", "open", "high", "low", "close", "adj_close", "volume", "currency"]


class KitError(ValueError):
    pass


def load_universe() -> pd.DataFrame:
    u = pd.read_csv(KIT_DIR / "assets_universe.csv")
    _require(list(u.columns) == ["asset_id", "ticker", "name", "asset_class", "market", "currency", "sector"],
             "assets_universe.csv columns changed")
    _require(len(u) == 31 and u.ticker.is_unique, "universe must hold 31 unique tickers")
    _require(set(u.currency) <= {"CAD", "USD"}, "unexpected currency in universe")
    return u


def load_prices() -> pd.DataFrame:
    p = pd.read_csv(KIT_DIR / "prices_daily.csv", parse_dates=["date"])
    _require(list(p.columns) == PRICE_COLS, "prices_daily.csv columns changed")
    _require(not p.duplicated(["date", "ticker"]).any(), "duplicate (date, ticker) rows")
    _require((p.adj_close > 0).all() and p.adj_close.notna().all(), "non-positive or missing adj_close")
    u = load_universe()
    ccy = dict(zip(u.ticker, u.currency))
    _require(set(p.ticker) == set(u.ticker), "tickers in prices differ from universe")
    _require((p.currency == p.ticker.map(ccy)).all(), "price currency differs from universe currency")
    return p.sort_values(["ticker", "date"]).reset_index(drop=True)


def load_actions() -> pd.DataFrame:
    a = pd.read_csv(KIT_DIR / "corporate_actions.csv", parse_dates=["ex_date"])
    _require(set(a.action) <= {"dividend", "split"}, "unknown corporate action type")
    return a


def load_fx() -> pd.DataFrame:
    fx = pd.read_csv(KIT_DIR / "fx_usdcad_daily.csv", parse_dates=["date"])
    _require(not fx.date.duplicated().any(), "duplicate FX dates")
    _require(fx.usdcad.between(1.0, 2.0).all(), "USD/CAD outside plausible band [1, 2]")
    return fx.sort_values("date").reset_index(drop=True)


def load_macro() -> pd.DataFrame:
    m = pd.read_csv(KIT_DIR / "macro_rates.csv", parse_dates=["date"])
    _require(m.series_id.nunique() == 9, "expected 9 macro series")
    return m


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise KitError(msg)
