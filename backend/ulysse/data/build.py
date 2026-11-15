"""Build the ULYSSE datapack (reproducible): `python -m ulysse.data.build [--fetch]`.

Inputs  : starter kit (reference 2021-11-12 -> 2026-11-12) + documented public additions.
Output  : data/build/datapack/  (numpy .npy arrays + JSON), loadable without pandas.

Every series carries the information needed for temporal coherence (PDF p.14):
- prices/volumes: observation date = availability date (end of day);
- macro: `available_from` = observation date + documented publication lag;
- Wikipedia views of day D: available from D+1;
- ETF holdings snapshot dated D: available from the next business day.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from ulysse import __version__
from ulysse.config import DATAPACK_DIR, EXT_START, KIT_START, MANUAL_DIR
from ulysse.data import kit
from ulysse.data.sources import boc_fred, issuers, wikipedia, yahoo_ext

SPLICE = pd.Timestamp(KIT_START)

# --- CNQ.TO: Yahoo recorded the C$1.50 special dividend of 2022 (0.75 after the 2024 2:1 split)
# both as a dividend AND as a 1.021 'split'. Source of the special dividend: CNQ press release
# 2022-08-04 (SEC EDGAR 0001017413-22-000049, record date 2022-08-23 -> ex-date 2022-08-22).
CNQ_EVENT = pd.Timestamp("2022-08-22")
CNQ_FAKE_SPLIT = 1.021
CNQ_SPECIAL_DIV = 0.75   # per current (post-2024-split) share

# Conservative publication lags (hypotheses, documented in docs/donnees.md)
DAILY_LAG_BDAYS = 1                      # daily rates usable the next business day
MONTHLY_RELEASE_DAY = {                  # monthly series dated to the reference month M
    "STATIC_TOTALCPICHANGE": 25,         # Canada CPI: Statistics Canada, ~3rd week of M+1 -> use M+1 day 25
    "CPIAUCSL": 20,                      # U.S. CPI: BLS, ~10-15th of M+1 -> use M+1 day 20
    "UNRATE": 12,                        # U.S. unemployment: BLS, 1st/2nd Friday of M+1 -> use M+1 day 12
}


def fix_cnq(prices: pd.DataFrame, actions: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Undo the spurious 1.021 split on CNQ.TO and re-apply the special-dividend factor correctly."""
    p = prices.copy()
    m = (p.ticker == "CNQ.TO") & (p.date < CNQ_EVENT)
    if not m.any():
        return p, actions, {}
    prev_close_kit = p.loc[m].sort_values("date").close.iloc[-1]          # deflated by 1.021
    prev_close_true = prev_close_kit * CNQ_FAKE_SPLIT
    yahoo_factor = 1 - CNQ_SPECIAL_DIV / prev_close_kit
    true_factor = 1 - CNQ_SPECIAL_DIV / prev_close_true
    for c in ("open", "high", "low", "close"):
        p.loc[m, c] = p.loc[m, c] * CNQ_FAKE_SPLIT
    p.loc[m, "adj_close"] = p.loc[m, "adj_close"] * CNQ_FAKE_SPLIT * (true_factor / yahoo_factor)
    a = actions.copy()
    a = a[~((a.ticker == "CNQ.TO") & (a.action == "split") & (a.ex_date == CNQ_EVENT))]
    ma = (a.ticker == "CNQ.TO") & (a.action == "dividend") & (a.ex_date < CNQ_EVENT)
    a.loc[ma, "value"] = a.loc[ma, "value"] * CNQ_FAKE_SPLIT
    info = {"prev_close_true": float(prev_close_true), "yahoo_factor": float(yahoo_factor),
            "true_factor": float(true_factor), "rows_rescaled": int(m.sum())}
    return p, a, info


def splice_prices(kit_p: pd.DataFrame, ext_p: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Chain extension (before KIT_START) to kit (from KIT_START) by returns, per ticker."""
    out, report = [], {}
    for t, k in kit_p.groupby("ticker"):
        k = k.set_index("date").sort_index()
        e = ext_p[ext_p.ticker == t].set_index("date").sort_index()
        e = e[e.index <= SPLICE]
        if SPLICE not in e.index or SPLICE not in k.index:
            raise ValueError(f"{t}: splice date missing in one source")
        s_adj = k.at[SPLICE, "adj_close"] / e.at[SPLICE, "adj_close"]
        s_cls = k.at[SPLICE, "close"] / e.at[SPLICE, "close"]
        before = e[e.index < SPLICE].copy()
        before["adj_close"] *= s_adj
        for c in ("open", "high", "low", "close"):
            before[c] *= s_cls
        cols = ["open", "high", "low", "close", "adj_close", "volume"]
        merged = pd.concat([before[cols], k[cols]])
        merged.index.name = "date"
        merged["ticker"] = t
        merged["source"] = np.where(merged.index < SPLICE, "yahoo_extension", "starter_kit")
        out.append(merged.reset_index())
        report[t] = {"adj_scale": float(s_adj), "close_scale": float(s_cls), "first_date": str(merged.index.min().date())}
    return pd.concat(out, ignore_index=True), report


def master_calendar(prices: pd.DataFrame, universe: pd.DataFrame) -> pd.DatetimeIndex:
    """Weekdays on which at least one equity/ETF market of the universe traded (decision D-008)."""
    non_crypto = universe.loc[universe.asset_class != "crypto", "ticker"]
    days = prices.loc[prices.ticker.isin(non_crypto), "date"].unique()
    cal = pd.DatetimeIndex(sorted(days))
    assert (cal.day_of_week < 5).all(), "master calendar must contain weekdays only"
    return cal[cal >= pd.Timestamp(EXT_START)]


def fx_series(kit_fx: pd.DataFrame, ext: dict[str, pd.DataFrame], refresh: bool) -> pd.DataFrame:
    """USD->CAD: BoC FXUSDCAD (kit from 2021-11-12, Valet before, from 2017-01-03) and the BoC
    legacy noon rate IEXE0101 for 2016 (different methodology, documented)."""
    noon = boc_fred.boc("IEXE0101", refresh)
    noon = noon[noon.date < pd.Timestamp("2017-01-03")].assign(source="BoC IEXE0101 (noon rate)")
    fx_ext = ext["FXUSDCAD"]
    fx_ext = fx_ext[(fx_ext.date >= pd.Timestamp("2017-01-03")) & (fx_ext.date < SPLICE)].assign(source="BoC FXUSDCAD (Valet)")
    k = kit_fx.rename(columns={"usdcad": "value"})[["date", "value"]].assign(source="BoC FXUSDCAD (starter kit)")
    fx = pd.concat([noon, fx_ext, k], ignore_index=True).sort_values("date")
    assert not fx.date.duplicated().any()
    return fx


def macro_series(kit_m: pd.DataFrame, ext: dict[str, pd.DataFrame]) -> dict:
    out = {}
    meta = kit_m.drop_duplicates("series_id").set_index("series_id")
    for sid in meta.index:
        k = kit_m[kit_m.series_id == sid][["date", "value"]]
        e = ext[sid]
        e = e[e.date < SPLICE]
        if meta.at[sid, "frequency"] == "monthly":
            k = k[k.date >= pd.Timestamp("2021-12-01")]          # kit monthly rows start at the reference month
            e = e[e.date < pd.Timestamp("2021-12-01")]
        s = pd.concat([e, k]).drop_duplicates("date", keep="last").sort_values("date")
        if sid in MONTHLY_RELEASE_DAY:
            avail = [(d + pd.offsets.MonthBegin(1)) + pd.Timedelta(days=MONTHLY_RELEASE_DAY[sid] - 1) for d in s.date]
            rule = f"reference month M -> usable from day {MONTHLY_RELEASE_DAY[sid]} of M+1 (conservative)"
        else:
            avail = [d + pd.offsets.BDay(DAILY_LAG_BDAYS) for d in s.date]
            rule = "usable from the next business day"
        out[sid] = {
            "label": meta.at[sid, "label"], "unit": meta.at[sid, "unit"], "frequency": meta.at[sid, "frequency"],
            "source": meta.at[sid, "source"], "publication_rule": rule,
            "date": [d.strftime("%Y-%m-%d") for d in s.date], "value": [float(v) for v in s.value],
            "available_from": [pd.Timestamp(a).strftime("%Y-%m-%d") for a in avail],
        }
    return out


def align(prices: pd.DataFrame, cal: pd.DatetimeIndex, tickers: list[str], col: str) -> np.ndarray:
    wide = prices.pivot(index="date", columns="ticker", values=col).reindex(columns=tickers)
    return wide.reindex(cal).to_numpy(dtype="float64")


def ffill_within_life(a: np.ndarray) -> np.ndarray:
    """Forward-fill NaNs that occur after an asset's first observation (market closed that day)."""
    df = pd.DataFrame(a)
    return df.ffill().to_numpy()


def etf_snapshots(refresh: bool) -> dict:
    """Look-through compositions with as_of and available_from dates."""
    sector_map = issuers.ssga_sector_map(refresh)
    smap = dict(zip(sector_map.holding_ticker, sector_map.sector))
    funds: dict[str, list] = {}
    spy = issuers.ssga_holdings("SPY", refresh)
    funds["SPY"] = [_snapshot(spy.as_of.iloc[0], [
        {"ticker": r.holding_ticker, "name": r.name, "weight": round(float(r.weight), 6),
         "sector": smap.get(r.holding_ticker, "Non classé"), "country": "US", "currency": "USD"}
        for r in spy.itertuples() if r.holding_ticker not in ("-", "CASH_USD")], "SSGA daily holdings (public download)")]
    xiu_hist = issuers.ishares_ca_history("XIU.TO", EXT_START[:7], "2026-10", refresh)
    xiu_now = issuers.ishares_ca_holdings("XIU.TO", None, refresh)
    snaps = []
    for as_of, g in pd.concat([xiu_hist, xiu_now]).groupby("as_of"):
        snaps.append(_snapshot(as_of, [
            {"ticker": _tsx(r.holding_ticker), "name": r.name, "weight": round(float(r.weight), 6),
             "sector": _norm_sector(r.sector), "country": "CA" if r.location in ("Canada", "") else r.location,
             "currency": r.currency or "CAD"}
            for r in g.itertuples() if r.asset_class == "Equity"], "iShares Canada holdings (public download)"))
    funds["XIU.TO"] = snaps
    xbb = issuers.ishares_ca_holdings("XBB.TO", None, refresh)
    groups = xbb.groupby("sector").weight.sum()
    funds["XBB.TO"] = [_snapshot(xbb.as_of.iloc[0], [
        {"ticker": None, "name": f"Obligations — {sec}", "weight": round(float(w), 6), "sector": "Obligations",
         "bond_segment": sec, "country": "CA", "currency": "CAD"} for sec, w in groups.items()],
        "iShares Canada holdings (public download), aggregated by issuer segment")]
    return {"funds": funds, "sector_map_as_of": str(sector_map.as_of.iloc[0]),
            "sector_map_source": "Membership of the 11 Select Sector SPDR funds (SSGA public downloads)"}


# Holding tickers that designate a universe issuer under another symbol (documented in docs/donnees.md)
ALIASES = {
    "ATD-B.TO": "ATD.TO",      # Couche-Tard class B (subordinate voting) before the share-class consolidation
    "2299955D.TO": "CSU.TO",   # temporary iShares code for Constellation Software Inc. during a corporate action
    "GOOG": "GOOGL",           # Alphabet class C: same issuer as GOOGL (class A); combined for exposure
}


def tag_universe(etf: dict, universe: set[str]) -> dict:
    for snaps in etf["funds"].values():
        for s in snaps:
            for h in s["holdings"]:
                t = ALIASES.get(h["ticker"], h["ticker"]) if h["ticker"] else None
                h["universe_ticker"] = t if t in universe else None
    return etf


def _snapshot(as_of, holdings: list[dict], source: str) -> dict:
    as_of = pd.Timestamp(as_of)
    avail = as_of + pd.offsets.BDay(1)
    total = sum(h["weight"] for h in holdings)
    return {"as_of": as_of.strftime("%Y-%m-%d"), "available_from": avail.strftime("%Y-%m-%d"),
            "source": source, "weight_sum": round(total, 6), "holdings": holdings}


def _tsx(t: str) -> str:
    t = str(t).strip().replace(".", "-")
    return f"{t}.TO"


_SECTOR_ALIASES = {"Communication": "Communication Services", "Info Technology": "Information Technology"}


def _norm_sector(s: str) -> str:
    return _SECTOR_ALIASES.get(s, s)


def build(fetch: bool = False, out: Path = DATAPACK_DIR) -> dict:
    refresh = fetch
    u = kit.load_universe()
    tickers = u.ticker.tolist()
    kp, ka = kit.load_prices(), kit.load_actions()
    ep, ea = yahoo_ext.download(tickers, refresh=refresh)
    ext = boc_fred.download_all(refresh=refresh)

    kp, ka, cnq_info = fix_cnq(kp, ka)
    ep, ea, _ = fix_cnq(ep, ea)  # the extension carries the same deflation before 2022-08-22
    prices, splice_report = splice_prices(kp, ep)
    cal = master_calendar(prices, u)

    traded = ~np.isnan(align(prices, cal, tickers, "adj_close"))
    adj = ffill_within_life(align(prices, cal, tickers, "adj_close"))
    close = ffill_within_life(align(prices, cal, tickers, "close"))
    vol = np.nan_to_num(align(prices, cal, tickers, "volume"), nan=0.0) * traded

    fx = fx_series(kit.load_fx(), ext, refresh)
    fx_w = fx.set_index("date").value.reindex(cal.union(fx.date)).ffill().reindex(cal)
    fx_published = cal.isin(fx.date)
    is_usd = (u.currency == "USD").to_numpy()
    fx_arr = fx_w.to_numpy()
    adj_cad = np.where(is_usd[None, :], adj * fx_arr[:, None], adj)
    close_cad = np.where(is_usd[None, :], close * fx_arr[:, None], close)

    # Wikipedia views on a daily calendar (weekends included)
    wv = wikipedia.download_all(refresh=refresh)
    days = pd.date_range(EXT_START, cal[-1], freq="D")
    views = (wv.pivot(index="date", columns="ticker", values="views").reindex(index=days, columns=tickers)
             .to_numpy(dtype="float64"))

    macro = macro_series(kit.load_macro(), ext)
    etf = tag_universe(etf_snapshots(refresh), set(tickers))

    actions = pd.concat([ea[ea.ex_date < SPLICE].assign(source="yahoo_extension"),
                         ka.assign(source="starter_kit")], ignore_index=True)
    actions = actions[["ex_date", "ticker", "action", "value", "source"]].sort_values(["ticker", "ex_date"])

    out.mkdir(parents=True, exist_ok=True)
    np.save(out / "calendar.npy", cal.values.astype("datetime64[D]"))
    np.save(out / "pv_days.npy", days.values.astype("datetime64[D]"))
    for name, arr in {"adj_local": adj, "close_local": close, "adj_cad": adj_cad, "close_cad": close_cad,
                      "volume": vol, "fx_usdcad": fx_arr, "pageviews": views}.items():
        np.save(out / f"{name}.npy", arr.astype("float64"))
    np.save(out / "traded.npy", traded)
    np.save(out / "fx_published.npy", fx_published)
    first = {t: str(cal[np.argmax(traded[:, i])].date()) for i, t in enumerate(tickers)}
    wmap = wikipedia.mapping().set_index("ticker")
    assets = []
    for r in u.itertuples():
        assets.append({"asset_id": r.asset_id, "ticker": r.ticker, "name": r.name, "asset_class": r.asset_class,
                       "market": r.market, "currency": r.currency, "sector": r.sector,
                       "first_date": first[r.ticker],
                       "wikipedia": wmap.at[r.ticker, "article"] if r.ticker in wmap.index else None})
    (out / "macro.json").write_text(json.dumps(macro))
    (out / "etf_holdings.json").write_text(json.dumps(etf))
    (out / "corporate_actions.json").write_text(actions.assign(ex_date=actions.ex_date.dt.strftime("%Y-%m-%d"))
                                                .to_json(orient="records"))
    meta = {
        "datapack_version": 1, "code_version": __version__,
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "calendar": {"start": str(cal[0].date()), "end": str(cal[-1].date()), "n_days": len(cal),
                     "rule": "weekdays with at least one TSX or U.S. session; prices carried forward when a market is closed"},
        "base_currency": "CAD", "assets": assets, "splice": {"date": KIT_START, "per_ticker": splice_report},
        "corrections": {"CNQ.TO": {"what": "spurious 1.021 split on 2022-08-22 removed; special dividend applied once",
                                   "evidence": "CNQ press release 2022-08-04, SEC EDGAR accession 0001017413-22-000049", **cnq_info}},
        "fx": {"sources": sorted(fx.source.unique().tolist()), "rule": "last published rate carried forward on Canadian holidays"},
        "pageviews": {"rule": "views of day D usable from D+1", "project": "en.wikipedia", "agent": "user"},
        "inputs": _input_hashes(),
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    return meta


def _input_hashes() -> dict:
    files = {f"kit/{p.name}": p for p in sorted(kit.KIT_DIR.glob("*.csv"))}
    files.update({f"manual/{p.name}": p for p in sorted(MANUAL_DIR.glob("*")) if p.is_file()})
    return {k: hashlib.sha256(p.read_bytes()).hexdigest()[:16] for k, p in files.items()}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true", help="re-download sources instead of using the cache")
    args = ap.parse_args()
    m = build(fetch=args.fetch)
    print(json.dumps({k: m[k] for k in ("calendar", "corrections", "fx")}, indent=1))
