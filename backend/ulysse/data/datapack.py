"""Runtime access to the datapack (numpy only, no pandas) with ONE as-of filter.

Rule (PDF p.14, temporal coherence): analytics never touch the raw arrays; they receive an
`AsOf` view that only exposes what was published at the end of day `d`:
- prices, volumes, FX: observations dated <= d;
- Wikipedia views: days <= d - 1;
- macro: observations whose `available_from` <= d;
- ETF holdings: the latest snapshot whose `available_from` <= d.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from functools import cached_property
from pathlib import Path

import numpy as np

from ulysse.config import DATAPACK_DIR


def as_day(d: date | str | np.datetime64 | None) -> np.datetime64 | None:
    if d is None:
        return None
    return np.datetime64(str(d)[:10], "D")


class Datapack:
    def __init__(self, path: Path = DATAPACK_DIR):
        self.path = Path(path)
        if not (self.path / "meta.json").exists():
            raise FileNotFoundError(f"datapack not found in {self.path} — run `make data`")
        self.meta = json.loads((self.path / "meta.json").read_text())
        import hashlib
        from ulysse.evidence import set_datapack_tag
        tag = hashlib.sha1(json.dumps([self.meta.get("built_at"), self.meta.get("inputs")], sort_keys=True).encode()).hexdigest()[:8]
        self.tag = f"dp{self.meta.get('datapack_version', 0)}-{tag}"
        set_datapack_tag(self.tag)        # every evidence records which datapack it was computed from
        self.assets = self.meta["assets"]
        self.tickers = [a["ticker"] for a in self.assets]
        self.idx = {t: i for i, t in enumerate(self.tickers)}
        self.asset = {a["ticker"]: a for a in self.assets}

    def _npy(self, name: str) -> np.ndarray:
        return np.load(self.path / f"{name}.npy", mmap_mode="r")

    @cached_property
    def calendar(self) -> np.ndarray:
        return np.load(self.path / "calendar.npy")

    @cached_property
    def pv_days(self) -> np.ndarray:
        return np.load(self.path / "pv_days.npy")

    @cached_property
    def macro(self) -> dict:
        return json.loads((self.path / "macro.json").read_text())

    @cached_property
    def etf(self) -> dict:
        return json.loads((self.path / "etf_holdings.json").read_text())

    @cached_property
    def actions(self) -> list[dict]:
        return json.loads((self.path / "corporate_actions.json").read_text())

    @property
    def last_day(self) -> np.datetime64:
        return self.calendar[-1]

    def asof(self, d: date | str | None = None) -> "AsOf":
        day = as_day(d) or self.last_day
        if day < self.calendar[0]:
            raise ValueError(f"no data before {self.calendar[0]}")
        t_end = int(np.searchsorted(self.calendar, day, side="right")) - 1
        return AsOf(self, day, t_end)

    def col(self, ticker: str) -> int:
        if ticker not in self.idx:
            raise KeyError(f"{ticker} is not covered by the datapack universe")
        return self.idx[ticker]


@dataclass(frozen=True)
class AsOf:
    dp: Datapack
    day: np.datetime64          # requested date (may be a non-trading day)
    t_end: int                  # index of the last calendar day <= day

    @property
    def date(self) -> str:
        return str(self.dp.calendar[self.t_end])

    @property
    def dates(self) -> np.ndarray:
        return self.dp.calendar[: self.t_end + 1]

    def series(self, ticker: str, field: str = "adj", currency: str = "CAD") -> np.ndarray:
        """Levels up to the as-of day. field: adj (total return) | close (price). NaN before inception."""
        name = f"{field}_{'cad' if currency == 'CAD' else 'local'}"
        return np.asarray(self.dp._npy(name)[: self.t_end + 1, self.dp.col(ticker)], dtype="float64")

    def matrix(self, tickers: list[str], field: str = "adj", currency: str = "CAD") -> np.ndarray:
        name = f"{field}_{'cad' if currency == 'CAD' else 'local'}"
        cols = [self.dp.col(t) for t in tickers]
        return np.asarray(self.dp._npy(name)[: self.t_end + 1][:, cols], dtype="float64")

    def volume(self, ticker: str) -> np.ndarray:
        return np.asarray(self.dp._npy("volume")[: self.t_end + 1, self.dp.col(ticker)], dtype="float64")

    def traded(self, ticker: str) -> np.ndarray:
        return np.asarray(self.dp._npy("traded")[: self.t_end + 1, self.dp.col(ticker)], dtype=bool)

    def fx_usdcad(self) -> np.ndarray:
        return np.asarray(self.dp._npy("fx_usdcad")[: self.t_end + 1], dtype="float64")

    def pageviews(self, ticker: str) -> tuple[np.ndarray, np.ndarray]:
        """Daily views up to day-1 (views of a day are published after it ends)."""
        last = self.day - np.timedelta64(1, "D")
        k = int(np.searchsorted(self.dp.pv_days, last, side="right"))
        v = np.asarray(self.dp._npy("pageviews")[:k, self.dp.col(ticker)], dtype="float64")
        return self.dp.pv_days[:k], v

    def macro(self, series_id: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """(observation dates, values, available_from) restricted to available_from <= day."""
        m = self.dp.macro[series_id]
        avail = np.array(m["available_from"], dtype="datetime64[D]")
        keep = avail <= self.day
        return (np.array(m["date"], dtype="datetime64[D]")[keep], np.array(m["value"])[keep], avail[keep])

    def etf_snapshot(self, fund: str) -> dict | None:
        snaps = self.dp.etf["funds"].get(fund, [])
        ok = [s for s in snaps if np.datetime64(s["available_from"], "D") <= self.day]
        return ok[-1] if ok else None

    def first_valid(self, ticker: str) -> np.datetime64 | None:
        s = self.series(ticker)
        i = np.flatnonzero(~np.isnan(s))
        return self.dp.calendar[i[0]] if len(i) else None


_DP: Datapack | None = None


def get_datapack() -> Datapack:
    global _DP
    if _DP is None:
        _DP = Datapack()
    return _DP
