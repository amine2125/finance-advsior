"""Phase 1 data tests: kit invariants, CNQ correction, splice, calendar, FX, as-of coherence."""
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from ulysse.data import build, kit

pytestmark = pytest.mark.datapack


def test_kit_invariants():
    u = kit.load_universe()
    p = kit.load_prices()
    assert len(u) == 31 and p.ticker.nunique() == 31
    assert kit.load_macro().series_id.nunique() == 9
    assert len(p) == 40049


def test_cnq_fake_split_removed_and_special_dividend_counted_once():
    p, a, info = build.fix_cnq(kit.load_prices(), kit.load_actions())
    c = p[p.ticker == "CNQ.TO"].set_index("date")
    prev, ex = c.loc["2022-08-19"], c.loc["2022-08-22"]
    # the evidence: CNQ closed at C$72.39 (pre 2024 split) on 2022-08-19 -> 36.195 after the 2:1 split
    assert prev.close == pytest.approx(36.195, abs=1e-3)
    total_return = ex.adj_close / prev.adj_close - 1
    # Yahoo's adj_close convention (used for every other dividend of the kit): multiplicative factor
    # (1 - D / P_prev) on earlier prices, i.e. return = P_ex / (P_prev - D) - 1. The special dividend
    # must be counted exactly once with this convention (before the fix it was counted twice: +2.78%).
    expected = ex.close / (prev.close - build.CNQ_SPECIAL_DIV) - 1
    assert total_return == pytest.approx(expected, abs=1e-6)
    assert total_return < 0.01  # was +2.78% with the double count
    assert not ((a.ticker == "CNQ.TO") & (a.action == "split") & (a.ex_date == build.CNQ_EVENT)).any()
    # the genuine 2:1 split of 2024 is untouched
    assert ((a.ticker == "CNQ.TO") & (a.action == "split") & (a.value == 2.0)).any()


def test_splice_overlap_returns_match():
    from ulysse.data.sources import yahoo_ext
    u = kit.load_universe()
    ep, _ = yahoo_ext.download(u.ticker.tolist())
    kp = kit.load_prices()
    for t in u.ticker:
        k = kp[kp.ticker == t].set_index("date").adj_close.loc[:"2022-03-31"]
        e = ep[ep.ticker == t].set_index("date").adj_close
        common = k.index.intersection(e.index)
        diff = (k.loc[common].pct_change() - e.loc[common].pct_change()).abs().max()
        assert diff < 1e-5, f"{t}: extension and kit disagree on overlap ({diff})"


def test_master_calendar(dp):
    cal = dp.calendar.astype("datetime64[D]")
    assert len(cal) == len(np.unique(cal)) and (np.diff(cal).astype(int) > 0).all()
    assert (pd.DatetimeIndex(cal).day_of_week < 5).all()
    # contains a Canadian-only holiday (Civic Holiday, US open) and a US-only holiday (Independence Day, TSX open)
    assert np.datetime64("2022-08-01") in cal and np.datetime64("2022-07-04") in cal
    assert str(cal[0]) == "2016-01-04" and str(cal[-1]) == "2026-11-12"


def test_prices_filled_after_inception_and_traded_mask(dp):
    v = dp.asof()
    for t in dp.tickers:
        s = v.series(t)
        first = np.flatnonzero(~np.isnan(s))[0]
        assert not np.isnan(s[first:]).any(), t
    # RY.TO did not trade on Civic Holiday 2022-08-01; SPY did
    i = int(np.searchsorted(dp.calendar, np.datetime64("2022-08-01")))
    assert not v.traded("RY.TO")[i] and v.traded("SPY")[i]


def test_fx_carried_forward_on_canadian_holiday(dp):
    v = dp.asof()
    fx = v.fx_usdcad()
    assert not np.isnan(fx).any() and ((fx > 1.0) & (fx < 2.0)).all()
    i = int(np.searchsorted(dp.calendar, np.datetime64("2022-08-01")))
    pub = np.load(dp.path / "fx_published.npy")
    assert not pub[i] and fx[i] == fx[i - 1]


def test_cad_conversion(dp):
    v = dp.asof()
    usd_local, usd_cad = v.series("SPY", currency="local"), v.series("SPY")
    assert np.allclose(usd_cad, usd_local * v.fx_usdcad(), equal_nan=True)
    assert np.allclose(v.series("RY.TO"), v.series("RY.TO", currency="local"), equal_nan=True)


@pytest.mark.parametrize("day", ["2017-03-15", "2020-03-16", "2021-12-15", "2022-10-14", "2026-11-12"])
def test_asof_never_exposes_future(dp, day):
    v = dp.asof(day)
    d = np.datetime64(day)
    assert v.dates[-1] <= d
    pv_days, _ = v.pageviews("TSLA")
    assert pv_days[-1] <= d - np.timedelta64(1, "D")
    for sid in dp.macro:
        _, _, avail = v.macro(sid)
        assert (avail <= d).all()
    for fund in dp.etf["funds"]:
        s = v.etf_snapshot(fund)
        assert s is None or np.datetime64(s["available_from"]) <= d


def test_cpi_publication_lag(dp):
    # U.S. CPI for November 2021 was released in December 2021: invisible on 2021-12-15
    obs, _, _ = dp.asof("2021-12-15").macro("CPIAUCSL")
    assert obs[-1] == np.datetime64("2021-10-01")


def test_time_machine_has_no_current_spy_composition(dp):
    assert dp.asof("2021-12-15").etf_snapshot("SPY") is None
    assert dp.asof("2021-12-15").etf_snapshot("XIU.TO")["as_of"] == "2021-11-30"


def test_engine_has_no_persona_names():
    """Decision D-017: nothing in the engine may branch on a persona's name."""
    root = Path(__file__).resolve().parents[1] / "ulysse"
    pattern = re.compile(r"\b(amira|mateo|robert)\b", re.I)
    offenders = [str(p) for p in root.rglob("*.py")
                 if "personas" not in p.parts and pattern.search(p.read_text(encoding="utf-8"))]
    assert offenders == []
