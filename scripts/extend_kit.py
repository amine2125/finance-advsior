#!/usr/bin/env python3
"""Extend the official AlphaForge starter kit forward, to the last complete trading day.

Why: the official kit stops on 2026-11-12, while the research tools (SEC EDGAR, news) are queried live. Extending the
prices keeps one date for the whole analysis (énoncé p. 14: temporal coherence) instead of mixing two.

How (énoncé p. 10: the kit may be completed with public data; p. 13-14: document source, dates, processing, limits):
  * the official `build_dataset.py` is imported as is; only its START and END are changed, so the sources, the
    columns and the processing are the organizers' own (Yahoo Finance via yfinance, Bank of Canada Valet, FRED);
  * official rows are never modified; prices are only added after the official end; FX and macro observations
    missing from the official files are added (some are dated on or before the official end because they were
    published after the kit was downloaded; their publication lag still applies downstream);
  * the download starts a few weeks before the official end, and the closes on the common days must match the
    official ones (same source), otherwise the script stops;
  * adj_close of the added days is chained by returns to the last official adj_close (Yahoo re-adjusts the whole
    history after each dividend, so its raw adj_close is not on the same scale as the kit's);
  * the kit's own quality checks run on the merged data;
  * EXTENSION.json, sources_metadata.csv and data_quality_warnings.txt record what was added, when and from where.

Usage:  python scripts/extend_kit.py context/Datathon2026/alphaforge_starter --out data/kit [--end YYYY-MM-DD]
The output folder has the kit's layout, so `make data KIT=data/kit` (or `make data-refresh`) consumes it unchanged.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import importlib.util
import io
import json
import shutil
import sys
from pathlib import Path

import pandas as pd

OVERLAP_DAYS = 30          # calendar days downloaded before the official end, to compare with the official closes
MACRO_LOOKBACK_DAYS = 120  # monthly series are dated to their reference month and published weeks later
CLOSE_TOLERANCE = 0.005    # largest relative gap allowed between official and re-downloaded closes on common days


def load_kit_module(kit: Path):
    spec = importlib.util.spec_from_file_location("alphaforge_build_dataset", kit / "build_dataset.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def last_complete_day(today: dt.date) -> dt.date:
    """Yesterday: today's bar is not complete while markets are open."""
    return today - dt.timedelta(days=1)


def extend_prices(official: pd.DataFrame, fresh: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    report, added = {}, []
    for t, off in official.groupby("ticker"):
        off = off.sort_values("date")
        new = fresh[fresh["ticker"] == t].sort_values("date")
        last = off["date"].max()
        common = off.merge(new, on="date", suffixes=("_off", "_new"))
        if common.empty:
            raise SystemExit(f"{t}: no common day with the official data; cannot check the source, stopping.")
        gap = float(((common["close_new"] - common["close_off"]).abs() / common["close_off"]).max())
        if gap > CLOSE_TOLERANCE:
            raise SystemExit(f"{t}: re-downloaded closes differ from the official ones by up to {gap:.2%} "
                             f"(tolerance {CLOSE_TOLERANCE:.1%}); stopping rather than splicing two sources.")
        anchor = new[new["date"] == last]
        if anchor.empty:
            raise SystemExit(f"{t}: the official last day {last} is missing from the new download; cannot chain adj_close.")
        after = new[new["date"] > last].copy()
        if not after.empty:
            scale = float(off["adj_close"].iloc[-1]) / float(anchor["adj_close"].iloc[0])
            after["adj_close"] = (after["adj_close"] * scale).round(6)
            added.append(after)
        report[t] = {"common_days": int(len(common)), "max_close_gap": round(gap, 6), "added_days": int(len(after)),
                     "last_day": str(after["date"].max() if not after.empty else last)}
    out = pd.concat([official, *added], ignore_index=True).sort_values(["ticker", "date"]).reset_index(drop=True)
    return out, report


def append_new(official: pd.DataFrame, fresh: pd.DataFrame, keys: list[str]) -> tuple[pd.DataFrame, int]:
    """Rows of `fresh` whose keys are not in `official` (official values are never replaced)."""
    off = official.copy()
    new = fresh.copy()
    for k in keys:
        off[k], new[k] = off[k].astype(str), new[k].astype(str)
    seen = set(map(tuple, off[keys].to_numpy()))
    mask = [tuple(r) not in seen for r in new[keys].to_numpy()]
    extra = fresh[mask]
    out = pd.concat([official, extra], ignore_index=True)
    return out.sort_values(keys).reset_index(drop=True), int(len(extra))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("kit", type=Path, help="official kit folder (with build_dataset.py)")
    ap.add_argument("--out", type=Path, default=Path("data/kit"))
    ap.add_argument("--end", type=dt.date.fromisoformat, default=None, help="last day to add (default: yesterday)")
    a = ap.parse_args()

    kit, out = a.kit.resolve(), a.out.resolve()
    today = dt.date.today()
    end = a.end or last_complete_day(today)
    mod = load_kit_module(kit)
    official_start, official_end = mod.START, mod.END
    if end <= dt.date.fromisoformat(official_end):
        raise SystemExit(f"Nothing to add: requested end {end} is not after the official end {official_end}.")

    prices = pd.read_csv(kit / "prices_daily.csv", dtype={"date": str})
    actions = pd.read_csv(kit / "corporate_actions.csv", dtype={"ex_date": str})
    fx = pd.read_csv(kit / "fx_usdcad_daily.csv", dtype={"date": str})
    macro = pd.read_csv(kit / "macro_rates.csv", dtype={"date": str})
    universe = pd.read_csv(kit / "assets_universe.csv")

    off_end = dt.date.fromisoformat(official_end)
    mod.START, mod.END = (off_end - dt.timedelta(days=OVERLAP_DAYS)).isoformat(), end.isoformat()
    print(f"Downloading prices {mod.START} -> {mod.END} with the official kit's build_prices() ...")
    with contextlib.redirect_stdout(io.StringIO()):
        new_prices, new_actions = mod.build_prices(mod.build_universe())
    new_prices["date"] = new_prices["date"].astype(str)
    new_actions["ex_date"] = new_actions["ex_date"].astype(str)
    prices2, report = extend_prices(prices, new_prices)
    actions2, n_actions = append_new(actions, new_actions[new_actions["ex_date"] > official_end], ["ticker", "ex_date", "action"])

    mod.START = (off_end - dt.timedelta(days=MACRO_LOOKBACK_DAYS)).isoformat()
    print(f"Downloading FX and macro {mod.START} -> {mod.END} with the official kit's build_macro() ...")
    new_fx, new_macro = mod.build_macro()
    new_fx["date"], new_macro["date"] = new_fx["date"].astype(str), new_macro["date"].astype(str)
    fx2, n_fx = append_new(fx, new_fx, ["date"])
    macro2, n_macro = append_new(macro, new_macro, ["series_id", "date"])

    # The kit's check() warns when a series stops before END: use the earliest last day (stock markets), not crypto's.
    data_end = max(r["last_day"] for r in report.values())
    mod.START, mod.END = official_start, min(r["last_day"] for r in report.values())
    with contextlib.redirect_stdout(io.StringIO()):
        warnings = mod.check(universe, prices2.assign(date=prices2["date"].astype(str)), actions2, fx2, macro2)

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for f in ("assets_universe.csv", "README.md", "build_dataset.py"):
        shutil.copy2(kit / f, out / f)
    prices2.to_csv(out / "prices_daily.csv", index=False)
    actions2.to_csv(out / "corporate_actions.csv", index=False)
    fx2.to_csv(out / "fx_usdcad_daily.csv", index=False)
    macro2.to_csv(out / "macro_rates.csv", index=False)

    added_from = (off_end + dt.timedelta(days=1)).isoformat()
    meta = pd.read_csv(kit / "sources_metadata.csv")
    note = (f"Extension by the team, not part of the official kit: rows dated {added_from} to {data_end} only; official rows unchanged; "
            f"downloaded {today} with the official build_dataset.py functions (START/END changed)")
    ext_rows = [
        {"file": "prices_daily.csv", "content": "Daily prices added after the official end (same columns)",
         "source": "Yahoo Finance via yfinance (official kit function build_prices)", "source_url": "https://finance.yahoo.com",
         "retrieved_on": today.isoformat(), "coverage": f"{added_from} to {data_end}", "frequency": "daily",
         "processing": f"{note}; closes on {OVERLAP_DAYS} overlapping calendar days checked against the official ones "
                       f"(tolerance {CLOSE_TOLERANCE:.1%}); adj_close chained by returns to the last official adj_close",
         "limitations": "Not checked by the organizers; Yahoo data is not exchange-certified; official adj_close is not re-adjusted "
                        "for dividends paid after the official end",
         "terms_of_use": "Yahoo terms: https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html"},
        {"file": "fx_usdcad_daily.csv / macro_rates.csv", "content": "FX and macro observations not in the official files",
         "source": "Bank of Canada Valet API; FRED (official kit function build_macro)", "source_url": "https://www.bankofcanada.ca/valet/docs",
         "retrieved_on": today.isoformat(), "coverage": f"up to {data_end}", "frequency": "daily / monthly",
         "processing": (f"Extension by the team, not part of the official kit: observations missing from the official files, "
                        f"downloaded {today} with the official build_dataset.py functions (START/END changed); some are dated on or before "
                        f"{official_end} because they were published after the kit was built; a (series, date) already in the official "
                        f"file is never replaced"),
         "limitations": "Monthly series keep their reference-month date and publication lag; FRED values are latest vintage",
         "terms_of_use": "https://www.bankofcanada.ca/terms/ ; https://fred.stlouisfed.org/legal/"},
    ]
    pd.concat([meta, pd.DataFrame(ext_rows)], ignore_index=True).to_csv(out / "sources_metadata.csv", index=False)

    official_warn = (kit / "data_quality_warnings.txt").read_text()
    (out / "data_quality_warnings.txt").write_text(
        official_warn.rstrip() + f"\n\nExtension {added_from} to {data_end} (downloaded {today}):\n"
        + ("\n".join(warnings) or "No warnings.") + "\n")
    summary = {"official_window": [official_start, official_end], "extended_to": data_end, "added_from": added_from,
               "retrieved_on": today.isoformat(), "source_script": "build_dataset.py (official kit, START/END changed)",
               "rows_added": {"prices": int(len(prices2) - len(prices)), "corporate_actions": n_actions, "fx": n_fx, "macro": n_macro},
               "overlap_check": {"calendar_days": OVERLAP_DAYS, "close_tolerance": CLOSE_TOLERANCE, "per_ticker": report},
               "warnings": warnings}
    (out / "EXTENSION.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")

    print(f"Official kit {official_start} -> {official_end}; extended to {data_end} in {out}")
    print(f"Rows added: prices {summary['rows_added']['prices']}, actions {n_actions}, fx {n_fx}, macro {n_macro}; "
          f"largest close gap on the overlap {max(r['max_close_gap'] for r in report.values()):.3%}; {len(warnings)} warnings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
