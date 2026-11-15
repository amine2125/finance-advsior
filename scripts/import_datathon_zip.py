#!/usr/bin/env python3
"""Import the official AlphaForge starter data (Datathon2026.zip or its extracted folder) into AEGIS' normalized schema.

The official column names were not available when AEGIS was built, so this importer maps common variants
(ticker/symbol/asset_id, Adj Close/adj_close, ...) and FAILS LOUDLY on anything it cannot map. It never invents values:
missing adjusted closes, unknown sectors or unknown publication lags are reported, not filled.

Usage:
  python scripts/import_datathon_zip.py /path/to/Datathon2026.zip [--out data/active]
  python scripts/import_datathon_zip.py /path/to/alphaforge_starter/ [--out data/active]
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import shutil
import sys
import zipfile
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bootstrap_public_data import ALIASES, COINGECKO_IDS, UNIVERSE  # noqa: E402  (metadata only, never prices)

KNOWN_META = {u[0]: u for u in UNIVERSE}
FILES = ["assets_universe.csv", "prices_daily.csv", "corporate_actions.csv", "fx_usdcad_daily.csv", "macro_rates.csv",
         "sources_metadata.csv", "data_quality_warnings.txt", "README.md", "build_dataset.py"]


def norm(c: str) -> str:
    return c.strip().lower().replace(" ", "_").replace("-", "_")


def pick(cols: list[str], *cands: str) -> str | None:
    n = {norm(c): c for c in cols}
    for c in cands:
        if c in n:
            return n[c]
    return None


def read_sources(src: Path) -> dict[str, bytes]:
    out: dict[str, bytes] = {}
    if src.is_file() and src.suffix == ".zip":
        with zipfile.ZipFile(src) as z:
            for name in z.namelist():
                base = Path(name).name
                if base in FILES:
                    out[base] = z.read(name)
    else:
        for f in FILES:
            hits = list(src.rglob(f))
            if hits:
                out[f] = hits[0].read_bytes()
    missing = [f for f in ("assets_universe.csv", "prices_daily.csv", "fx_usdcad_daily.csv") if f not in out]
    if missing:
        raise SystemExit(f"ERROR: required files not found in {src}: {missing}")
    return out


OFFICIAL_SUBCLASS = {"etf_bond": "bond_etf", "etf_commodity": "gold_etf", "etf_equity": "equity_etf",
                     "equity": "common_stock", "crypto": "cryptoasset"}
EXTRA_ALIASES = {"MFC.TO": "manulife", "FTS.TO": "fortis", "CSU.TO": "constellation software", "ESGV": "vanguard esg",
                 "ZST.TO": "bmo ultra short", "TLT": "20+ year treasury", "XBB.TO": "canadian universe bond", "AGG": "aggregate bond"}


def official_sector(cls: str, raw_sector: str) -> str:
    """Normalize the official ETF/crypto sector labels to AEGIS sector buckets (ETFs are never looked through)."""
    if cls == "crypto":
        return "Cryptoassets"
    if cls == "etf":
        s = raw_sector.lower()
        if "bond" in s:
            return "Fixed Income"
        if "gold" in s or "commod" in s:
            return "Commodities"
        return "Diversified"
    return raw_sector


def map_class(v: str) -> str:
    s = str(v).lower()
    if "crypto" in s or "coin" in s:
        return "crypto"
    if "etf" in s or "fund" in s or "fnb" in s:
        return "etf"
    return "equity"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "data" / "active"))
    a = ap.parse_args()
    raw = read_sources(Path(a.source))
    out = Path(a.out)
    if out.exists():
        shutil.move(str(out), str(out.with_name(out.name + "_backup_" + dt.datetime.now().strftime("%Y%m%d%H%M%S"))))
    out.mkdir(parents=True)
    report: list[str] = []

    # ---- universe
    u = pd.read_csv(io.BytesIO(raw["assets_universe.csv"]))
    c_id = pick(list(u.columns), "ticker", "symbol", "yahoo_ticker", "asset_id", "code")  # official file: asset_id=A01, ticker=NVDA
    if not c_id:
        raise SystemExit(f"ERROR: no ticker column in assets_universe.csv: {list(u.columns)}")
    c_name = pick(list(u.columns), "name", "asset_name", "long_name", "company", "description")
    c_cls = pick(list(u.columns), "asset_class", "class", "type", "asset_type", "category")
    c_sec = pick(list(u.columns), "sector", "gics_sector", "industry_sector")
    c_ccy = pick(list(u.columns), "currency", "ccy", "native_currency", "listing_currency")
    c_exch = pick(list(u.columns), "exchange", "market", "listing")
    c_reg = pick(list(u.columns), "region", "country", "geography")
    rows = []
    for _, r in u.iterrows():
        aid = str(r[c_id]).strip().upper()
        known = KNOWN_META.get(aid)
        cls = map_class(r[c_cls]) if c_cls else (known[2] if known else None)
        if cls is None:
            raise SystemExit(f"ERROR: asset class unknown for {aid}")
        ccy = str(r[c_ccy]).upper() if c_ccy and pd.notna(r[c_ccy]) else (known[6] if known else ("CAD" if aid.endswith(".TO") else "USD"))
        raw_sector = str(r[c_sec]) if c_sec and pd.notna(r[c_sec]) else ""
        sector = official_sector(cls, raw_sector) if raw_sector else (known[4] if known else ("Cryptoassets" if cls == "crypto" else "Unclassified"))
        if sector == "Unclassified":
            report.append(f"{aid}: sector not provided - labelled Unclassified (never guessed)")
        raw_cls = str(r[c_cls]).strip().lower() if c_cls else ""
        sub = OFFICIAL_SUBCLASS.get(raw_cls) or (known[3] if known else {"crypto": "cryptoasset", "etf": "equity_etf", "equity": "common_stock"}[cls])
        if sub == "equity_etf" and "esg" in raw_sector.lower():
            sub = "esg_equity_etf"
        if sub == "gold_etf" and "gold" not in raw_sector.lower():
            sub = "commodity_etf"
        if cls == "etf" and not known and raw_cls not in OFFICIAL_SUBCLASS:
            report.append(f"{aid}: ETF sub-class unknown, assumed equity_etf - verify (bond/gold ETFs must be re-labelled)")
        rows.append({"asset_id": aid, "name": r[c_name] if c_name else (known[1] if known else aid), "asset_class": cls, "sub_class": sub,
                     "sector": sector, "region": (r[c_reg] if c_reg and pd.notna(r[c_reg]) else (known[5] if known else
                               ("Global" if cls == "crypto" or sub == "gold_etf" else ("Canada" if aid.endswith(".TO") else "United States")))),
                     "sector_label": raw_sector or sector,
                     "currency": ccy, "exchange": r[c_exch] if c_exch else (known[7] if known else ""),
                     "is_single_issuer": 0 if cls == "etf" else 1, "is_leveraged": 0, "is_inverse": 0, "cik": "",
                     "coingecko_id": COINGECKO_IDS.get(aid, ""), "aliases": ALIASES.get(aid, EXTRA_ALIASES.get(aid, "")),
                     "classification_source": "official_starter" if c_sec else "aegis_manual_classification"})
    uni = pd.DataFrame(rows)
    try:
        import httpx
        m = httpx.get("https://www.sec.gov/files/company_tickers.json", headers={"User-Agent": "AEGIS datathon aegis-demo@example.org"}, timeout=20).json()
        ciks = {v["ticker"].upper(): str(v["cik_str"]).zfill(10) for v in m.values()}
        uni["cik"] = [ciks.get(a, "") if (c == "USD" and k == "equity") else "" for a, c, k in zip(uni.asset_id, uni.currency, uni.asset_class)]
    except Exception as exc:  # noqa: BLE001
        report.append(f"SEC CIK mapping unavailable ({exc}); lens 1 will show UNAVAILABLE")
    uni.to_csv(out / "assets_universe.csv", index=False)

    # ---- prices
    p = pd.read_csv(io.BytesIO(raw["prices_daily.csv"]))
    cols = list(p.columns)
    c_date, c_tk = pick(cols, "date", "datetime", "timestamp"), pick(cols, "asset_id", "ticker", "symbol")
    c_close, c_adj = pick(cols, "close", "close_price", "price"), pick(cols, "adj_close", "adjclose", "adjusted_close", "adj_close_price")
    if not (c_date and c_tk and c_close):
        raise SystemExit(f"ERROR: prices_daily.csv must be long format with date/ticker/close; got {cols}")
    if not c_adj:
        report.append("No adjusted close column: adj_close = close (returns EXCLUDE dividends; documented limitation)")
    pr = pd.DataFrame({"date": pd.to_datetime(p[c_date]).dt.date.astype(str), "asset_id": p[c_tk].astype(str).str.upper(),
                       "close": pd.to_numeric(p[c_close], errors="coerce")})
    pr["adj_close"] = pd.to_numeric(p[c_adj], errors="coerce") if c_adj else pr["close"]
    for k in ("open", "high", "low", "volume"):
        c = pick(cols, k)
        pr[k] = pd.to_numeric(p[c], errors="coerce") if c else None
    c_ccy = pick(cols, "currency")
    pr["currency"] = p[c_ccy] if c_ccy else pr["asset_id"].map(dict(zip(uni.asset_id, uni.currency)))
    n_bad = int(pr["close"].isna().sum())
    if n_bad:
        report.append(f"{n_bad} price rows without a close were dropped")
    pr = pr.dropna(subset=["close"])
    unknown = sorted(set(pr.asset_id) - set(uni.asset_id))
    if unknown:
        report.append(f"prices for assets absent from the universe ignored: {unknown}")
        pr = pr[pr.asset_id.isin(uni.asset_id)]
    pr.to_csv(out / "prices_daily.csv", index=False)

    # ---- fx
    f = pd.read_csv(io.BytesIO(raw["fx_usdcad_daily.csv"]))
    fc = list(f.columns)
    c_fd = pick(fc, "date")
    c_fv = pick(fc, "usdcad", "usd_cad", "fxusdcad", "rate", "close", "value")
    if not (c_fd and c_fv):
        raise SystemExit(f"ERROR: cannot map fx_usdcad_daily.csv columns {fc}")
    fx = pd.DataFrame({"date": pd.to_datetime(f[c_fd]).dt.date.astype(str), "usdcad": pd.to_numeric(f[c_fv], errors="coerce"), "source_id": "official_fx"}).dropna()
    if fx["usdcad"].median() < 1:
        report.append("FX median < 1: series looks like CAD→USD; inverted to CAD per USD")
        fx["usdcad"] = 1 / fx["usdcad"]
    fx.to_csv(out / "fx_usdcad_daily.csv", index=False)

    # ---- macro (publication timing unknown => excluded from strict point-in-time replay)
    if "macro_rates.csv" in raw:
        m = pd.read_csv(io.BytesIO(raw["macro_rates.csv"]))
        mc = list(m.columns)
        c_md = pick(mc, "date")
        c_ms, c_mv = pick(mc, "series_id", "series", "indicator", "name"), pick(mc, "value", "rate")
        if c_ms and c_mv:
            mm = pd.DataFrame({"date": m[c_md], "series_id": m[c_ms], "value": m[c_mv]})
        else:
            mm = m.melt(id_vars=[c_md], var_name="series_id", value_name="value").rename(columns={c_md: "date"})
        mm["date"] = pd.to_datetime(mm["date"]).dt.date.astype(str)
        # Official series -> AEGIS ids. Daily market rates are published on (or the day after) the observation date and
        # are not revised: point-in-time safe with a 1-day lag. Monthly CPI/unemployment are dated to the reference
        # month, released weeks later and revised: NOT point-in-time safe (excluded from strict replay).
        spec = {"V39079": ("CA_POLICY_RATE", 0, 1, "boc_valet"), "BD.CDN.2YR.DQ.YLD": ("CA_GOC_2Y", 1, 1, "boc_valet"),
                "BD.CDN.10YR.DQ.YLD": ("CA_GOC_10Y", 1, 1, "boc_valet"), "STATIC_TOTALCPICHANGE": ("CA_CPI_YOY", 45, 0, "boc_valet"),
                "DFF": ("US_FED_FUNDS", 1, 1, "fred"), "DGS2": ("US_TREASURY_2Y", 1, 1, "fred"),
                "DGS10": ("US_TREASURY_10Y", 1, 1, "fred"), "CPIAUCSL": ("US_CPI_INDEX", 45, 0, "fred"),
                "UNRATE": ("US_UNEMPLOYMENT", 35, 0, "fred")}
        raw_ids = mm["series_id"].astype(str)
        mm["unit"] = m[pick(mc, "unit")] if pick(mc, "unit") else "as_provided"
        mm["series_id"] = [spec.get(x, (x,))[0] for x in raw_ids]
        mm["publication_lag_days"] = [spec.get(x, (x, 0))[1] for x in raw_ids]
        mm["pit_safe"] = [spec.get(x, (x, 0, 0))[2] for x in raw_ids]
        mm["source_id"] = [spec.get(x, (x, 0, 0, "official_macro"))[3] for x in raw_ids]
        mm["original_series_id"] = raw_ids
        mm.dropna(subset=["value"]).to_csv(out / "macro_rates.csv", index=False)
        unknown_m = sorted(set(raw_ids) - set(spec))
        report.append("Macro: daily rates marked point-in-time safe (1-day lag); monthly CPI/unemployment pit_safe=0"
                      + (f"; unmapped series kept as-is: {unknown_m}" if unknown_m else ""))

    # ---- corporate actions
    if "corporate_actions.csv" in raw:
        c = pd.read_csv(io.BytesIO(raw["corporate_actions.csv"]))
        cc = list(c.columns)
        ca = pd.DataFrame({"date": pd.to_datetime(c[pick(cc, "date", "ex_date")]).dt.date.astype(str),
                           "asset_id": c[pick(cc, "asset_id", "ticker", "symbol")].astype(str).str.upper(),
                           "action_type": c[pick(cc, "action_type", "type", "action", "event")].astype(str).str.lower(),
                           "value": pd.to_numeric(c[pick(cc, "value", "ratio", "amount", "split_ratio", "dividend")], errors="coerce")})
        ca["currency"], ca["note"] = "", ""
        ca.to_csv(out / "corporate_actions.csv", index=False)

    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    if "sources_metadata.csv" in raw:
        s = pd.read_csv(io.BytesIO(raw["sources_metadata.csv"]))
        if "source_id" not in s.columns:
            s.insert(0, "source_id", [f"official_{i}" for i in range(len(s))])
        s["dataset_origin"] = "official_datathon_zip"
        s.to_csv(out / "sources_metadata.csv", index=False)
    warnings = raw.get("data_quality_warnings.txt", b"").decode("utf-8", "replace")
    (out / "data_quality_warnings.txt").write_text(warnings + "\n# AEGIS import notes\n" + "\n".join(report) + "\n")
    (out / "DATASET_ORIGIN.json").write_text(json.dumps({"origin": "official_datathon_zip", "official_datathon_zip": True, "imported_at": now,
                                                         "source": str(a.source), "import_notes": report}, indent=2))
    print("\n".join(report) or "no issues")
    print(f"imported {len(uni)} assets, {len(pr)} price rows -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
