"""Backward extension of prices (decision D-006): same source and library as the kit
(Yahoo Finance via yfinance), downloaded 2016-01-01 -> 2022-03-31 so that the overlap with the
kit (2021-11-12 -> 2022-03-31) can be checked before splicing."""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from ulysse.config import CACHE_DIR, EXT_OVERLAP_END, EXT_START

OUT = CACHE_DIR / "yahoo"


def download(tickers: list[str], refresh: bool = False) -> tuple[pd.DataFrame, pd.DataFrame]:
    import yfinance as yf  # data extra only

    OUT.mkdir(parents=True, exist_ok=True)
    pf, af = OUT / "ext_prices.csv", OUT / "ext_actions.csv"
    if pf.exists() and af.exists() and not refresh:
        return pd.read_csv(pf, parse_dates=["date"]), pd.read_csv(af, parse_dates=["ex_date"])
    end_excl = (date.fromisoformat(EXT_OVERLAP_END) + timedelta(days=1)).isoformat()
    raw = yf.download(tickers, start=EXT_START, end=end_excl, auto_adjust=False, actions=True,
                      group_by="ticker", progress=False, threads=True)
    prices, actions = [], []
    for t in tickers:
        d = raw[t].dropna(subset=["Close"]).reset_index()
        d["Date"] = pd.to_datetime(d["Date"]).dt.tz_localize(None).dt.normalize()
        prices.append(pd.DataFrame({
            "date": d["Date"], "ticker": t, "open": d["Open"], "high": d["High"], "low": d["Low"],
            "close": d["Close"], "adj_close": d["Adj Close"], "volume": d["Volume"].fillna(0).astype("int64"),
        }))
        for col, kind in (("Dividends", "dividend"), ("Stock Splits", "split")):
            if col in d:
                for _, r in d.loc[d[col] > 0, ["Date", col]].iterrows():
                    actions.append({"ex_date": r["Date"], "ticker": t, "action": kind, "value": r[col]})
    p = pd.concat(prices, ignore_index=True).sort_values(["ticker", "date"])
    a = pd.DataFrame(actions, columns=["ex_date", "ticker", "action", "value"])
    p.to_csv(pf, index=False)
    a.to_csv(af, index=False)
    (OUT / "RETRIEVED.txt").write_text(f"retrieved {date.today().isoformat()} via yfinance; window {EXT_START}..{EXT_OVERLAP_END}\n")
    return p, a
