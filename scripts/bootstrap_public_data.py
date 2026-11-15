#!/usr/bin/env python3
"""Build an AEGIS dataset from public sources when the official Datathon ZIP is not available.

This is NOT the official AlphaForge starter dataset. It produces the same normalized schema
that `scripts/import_datathon_zip.py` produces, so the application behaves identically once
the official ZIP is imported (the import overwrites this bootstrap).

Sources (all fetched live, provenance written to sources_metadata.csv):
  * Prices, splits, dividends: Yahoo Finance public chart endpoint (unofficial, educational use,
    not redistributed: the output stays in the git-ignored data/ folder and a private S3 bucket).
  * USD/CAD: Bank of Canada Valet API, series FXUSDCAD (https://www.bankofcanada.ca/terms/).
  * Canadian rates: Bank of Canada Valet (V39079 policy rate, TB.CDN.90D.MID, BD.CDN.10YR.DQ.YLD).
  * US rates and CPI: FRED fredgraph CSV (DGS3MO, DGS10, CPIAUCSL).
  * US issuer CIKs: SEC company_tickers.json (official SEC mapping).

Usage:  python scripts/bootstrap_public_data.py [--out data/active] [--start 2021-11-12] [--end 2026-11-12]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import sys
import time
from pathlib import Path

import httpx

UA_BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AEGIS-datathon-bootstrap"
UA_SEC = "AEGIS datathon prototype research contact: aegis-demo@example.org"

# Universe authored for the bootstrap. Composition mirrors the case description
# (10 Canadian equities, 10 US equities, 9 ETFs, BTC, ETH) but is NOT the official list.
# Sector labels are GICS-style manual classifications (provenance: "aegis_manual_classification").
UNIVERSE = [
    # asset_id, name, asset_class, sub_class, sector, region, currency, exchange, single_issuer
    ("RY.TO", "Royal Bank of Canada", "equity", "common_stock", "Financials", "Canada", "CAD", "TSX", 1),
    ("TD.TO", "Toronto-Dominion Bank", "equity", "common_stock", "Financials", "Canada", "CAD", "TSX", 1),
    ("BMO.TO", "Bank of Montreal", "equity", "common_stock", "Financials", "Canada", "CAD", "TSX", 1),
    ("ENB.TO", "Enbridge Inc.", "equity", "common_stock", "Energy", "Canada", "CAD", "TSX", 1),
    ("CNQ.TO", "Canadian Natural Resources", "equity", "common_stock", "Energy", "Canada", "CAD", "TSX", 1),
    ("SU.TO", "Suncor Energy", "equity", "common_stock", "Energy", "Canada", "CAD", "TSX", 1),
    ("SHOP.TO", "Shopify Inc.", "equity", "common_stock", "Information Technology", "Canada", "CAD", "TSX", 1),
    ("CNR.TO", "Canadian National Railway", "equity", "common_stock", "Industrials", "Canada", "CAD", "TSX", 1),
    ("BCE.TO", "BCE Inc.", "equity", "common_stock", "Communication Services", "Canada", "CAD", "TSX", 1),
    ("ATD.TO", "Alimentation Couche-Tard", "equity", "common_stock", "Consumer Staples", "Canada", "CAD", "TSX", 1),
    ("AAPL", "Apple Inc.", "equity", "common_stock", "Information Technology", "United States", "USD", "NASDAQ", 1),
    ("MSFT", "Microsoft Corporation", "equity", "common_stock", "Information Technology", "United States", "USD", "NASDAQ", 1),
    ("NVDA", "NVIDIA Corporation", "equity", "common_stock", "Information Technology", "United States", "USD", "NASDAQ", 1),
    ("AMZN", "Amazon.com Inc.", "equity", "common_stock", "Consumer Discretionary", "United States", "USD", "NASDAQ", 1),
    ("GOOGL", "Alphabet Inc. Class A", "equity", "common_stock", "Communication Services", "United States", "USD", "NASDAQ", 1),
    ("TSLA", "Tesla Inc.", "equity", "common_stock", "Consumer Discretionary", "United States", "USD", "NASDAQ", 1),
    ("JPM", "JPMorgan Chase & Co.", "equity", "common_stock", "Financials", "United States", "USD", "NYSE", 1),
    ("JNJ", "Johnson & Johnson", "equity", "common_stock", "Health Care", "United States", "USD", "NYSE", 1),
    ("XOM", "Exxon Mobil Corporation", "equity", "common_stock", "Energy", "United States", "USD", "NYSE", 1),
    ("PG", "Procter & Gamble", "equity", "common_stock", "Consumer Staples", "United States", "USD", "NYSE", 1),
    ("SPY", "SPDR S&P 500 ETF Trust", "etf", "equity_etf", "Diversified", "United States", "USD", "NYSEARCA", 0),
    ("QQQ", "Invesco QQQ Trust (Nasdaq-100)", "etf", "equity_etf", "Diversified", "United States", "USD", "NASDAQ", 0),
    ("XIU.TO", "iShares S&P/TSX 60 Index ETF", "etf", "equity_etf", "Diversified", "Canada", "CAD", "TSX", 0),
    ("VEA", "Vanguard FTSE Developed Markets ETF", "etf", "equity_etf", "Diversified", "International", "USD", "NYSEARCA", 0),
    ("ESGU", "iShares ESG Aware MSCI USA ETF", "etf", "esg_equity_etf", "Diversified", "United States", "USD", "NASDAQ", 0),
    ("XESG.TO", "iShares ESG Aware MSCI Canada Index ETF", "etf", "esg_equity_etf", "Diversified", "Canada", "CAD", "TSX", 0),
    ("AGG", "iShares Core U.S. Aggregate Bond ETF", "etf", "bond_etf", "Fixed Income", "United States", "USD", "NYSEARCA", 0),
    ("XBB.TO", "iShares Core Canadian Universe Bond ETF", "etf", "bond_etf", "Fixed Income", "Canada", "CAD", "TSX", 0),
    ("GLD", "SPDR Gold Shares", "etf", "gold_etf", "Commodities", "Global", "USD", "NYSEARCA", 0),
    ("BTC-USD", "Bitcoin", "crypto", "cryptoasset", "Cryptoassets", "Global", "USD", "CRYPTO", 1),
    ("ETH-USD", "Ethereum", "crypto", "cryptoasset", "Cryptoassets", "Global", "USD", "CRYPTO", 1),
]
COINGECKO_IDS = {"BTC-USD": "bitcoin", "ETH-USD": "ethereum"}
ALIASES = {
    "NVDA": "nvidia", "MSFT": "microsoft", "AAPL": "apple", "TSLA": "tesla", "AMZN": "amazon",
    "GOOGL": "alphabet;google", "JPM": "jpmorgan;jp morgan", "JNJ": "johnson & johnson;j&j",
    "XOM": "exxon;exxonmobil", "PG": "procter & gamble;p&g", "BTC-USD": "bitcoin;btc",
    "ETH-USD": "ethereum;eth;ether", "SHOP.TO": "shopify", "RY.TO": "royal bank;rbc",
    "TD.TO": "td bank;toronto-dominion", "BMO.TO": "bank of montreal;bmo", "ENB.TO": "enbridge",
    "CNQ.TO": "canadian natural", "SU.TO": "suncor", "CNR.TO": "cn rail;canadian national",
    "BCE.TO": "bce;bell canada", "ATD.TO": "couche-tard;circle k", "SPY": "s&p 500 etf",
    "QQQ": "nasdaq-100 etf;invesco qqq", "GLD": "gold etf",
}


def ts_to_date(ts: int, gmtoffset: int) -> str:
    return dt.datetime.fromtimestamp(ts + gmtoffset, tz=dt.timezone.utc).date().isoformat()


def fetch_yahoo(client: httpx.Client, symbol: str, start: dt.date, end: dt.date) -> dict:
    p1 = int(dt.datetime.combine(start, dt.time(), tzinfo=dt.timezone.utc).timestamp())
    p2 = int(dt.datetime.combine(end + dt.timedelta(days=1), dt.time(), tzinfo=dt.timezone.utc).timestamp())
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"period1": p1, "period2": p2, "interval": "1d", "events": "div,split", "includeAdjustedClose": "true"}
    for attempt in range(4):
        r = client.get(url, params=params, headers={"User-Agent": UA_BROWSER})
        if r.status_code == 200:
            return r.json()["chart"]["result"][0]
        time.sleep(2 + attempt * 3)
    raise RuntimeError(f"Yahoo fetch failed for {symbol}: HTTP {r.status_code}")


def fetch_valet(client: httpx.Client, series: str, start: dt.date, end: dt.date) -> list[tuple[str, float]]:
    url = f"https://www.bankofcanada.ca/valet/observations/{series}/json"
    r = client.get(url, params={"start_date": start.isoformat(), "end_date": end.isoformat()})
    r.raise_for_status()
    out = []
    for obs in r.json()["observations"]:
        v = obs.get(series, {}).get("v")
        if v not in (None, ""):
            out.append((obs["d"], float(v)))
    return out


def fetch_fred(client: httpx.Client, series: str, start: dt.date, end: dt.date) -> list[tuple[str, float]]:
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv"
    r = client.get(url, params={"id": series, "cosd": start.isoformat(), "coed": end.isoformat()})
    r.raise_for_status()
    out = []
    for row in csv.DictReader(io.StringIO(r.text)):
        v = row.get(series)
        if v not in (None, "", "."):
            out.append((row["observation_date"], float(v)))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "data" / "active"))
    ap.add_argument("--start", default="2021-11-12")
    ap.add_argument("--end", default="2026-11-12")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    start, end = dt.date.fromisoformat(args.start), dt.date.fromisoformat(args.end)
    extracted_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

    client = httpx.Client(timeout=30.0, follow_redirects=True)

    # SEC CIK mapping (official)
    cik_map: dict[str, str] = {}
    try:
        r = client.get("https://www.sec.gov/files/company_tickers.json", headers={"User-Agent": UA_SEC})
        r.raise_for_status()
        for rec in r.json().values():
            cik_map[rec["ticker"].upper()] = str(rec["cik_str"]).zfill(10)
    except Exception as exc:  # noqa: BLE001
        print(f"WARN: SEC ticker map unavailable: {exc}", file=sys.stderr)

    price_rows, action_rows, warnings = [], [], []
    for asset in UNIVERSE:
        sym = asset[0]
        print(f"prices {sym} ...", flush=True)
        res = fetch_yahoo(client, sym, start, end)
        meta = res["meta"]
        gmt = int(meta.get("gmtoffset", 0))
        tss = res.get("timestamp", []) or []
        q = res["indicators"]["quote"][0]
        adj = (res["indicators"].get("adjclose") or [{}])[0].get("adjclose", [None] * len(tss))
        for i, ts in enumerate(tss):
            d = ts_to_date(ts, gmt) if asset[2] != "crypto" else ts_to_date(ts, 0)
            if not (start.isoformat() <= d <= end.isoformat()):
                continue
            close = q["close"][i]
            if close is None:
                warnings.append(f"{sym} {d}: missing close in source; row dropped")
                continue
            vol = q["volume"][i]
            if vol == 0 and asset[2] != "crypto":
                warnings.append(f"{sym} {d}: zero volume reported")
            price_rows.append({
                "date": d, "asset_id": sym, "open": q["open"][i], "high": q["high"][i], "low": q["low"][i],
                "close": close, "adj_close": adj[i] if adj[i] is not None else close,
                "volume": vol if vol is not None else "", "currency": meta.get("currency", asset[6]),
            })
        ev = res.get("events", {}) or {}
        for s in (ev.get("splits") or {}).values():
            action_rows.append({"date": ts_to_date(int(s["date"]), gmt), "asset_id": sym, "action_type": "split",
                                "value": s["numerator"] / s["denominator"], "currency": "", "note": s.get("splitRatio", "")})
        for dv in (ev.get("dividends") or {}).values():
            action_rows.append({"date": ts_to_date(int(dv["date"]), gmt), "asset_id": sym, "action_type": "dividend",
                                "value": dv["amount"], "currency": meta.get("currency", asset[6]), "note": ""})
        time.sleep(0.4)

    with open(out / "prices_daily.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(price_rows[0].keys()))
        w.writeheader()
        w.writerows(sorted(price_rows, key=lambda r: (r["asset_id"], r["date"])))
    with open(out / "corporate_actions.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["date", "asset_id", "action_type", "value", "currency", "note"])
        w.writeheader()
        w.writerows(sorted(action_rows, key=lambda r: (r["asset_id"], r["date"])))

    with open(out / "assets_universe.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["asset_id", "name", "asset_class", "sub_class", "sector", "region", "currency", "exchange",
                    "is_single_issuer", "is_leveraged", "is_inverse", "cik", "coingecko_id", "aliases",
                    "classification_source"])
        for a in UNIVERSE:
            cik = cik_map.get(a[0], "") if a[6] == "USD" and a[2] == "equity" else ""
            w.writerow([*a, 0, 0, cik, COINGECKO_IDS.get(a[0], ""), ALIASES.get(a[0], ""),
                        "aegis_manual_classification"])

    print("fx ...", flush=True)
    fx = fetch_valet(client, "FXUSDCAD", start, end)
    with open(out / "fx_usdcad_daily.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "usdcad", "source_id"])
        for d, v in fx:
            w.writerow([d, v, "boc_valet_fxusdcad"])

    print("macro ...", flush=True)
    macro_specs = [
        # series_id, fetcher, source_series, unit, publication_lag_days, pit_safe, source_id
        ("CA_POLICY_RATE", "valet", "V39079", "percent", 0, 1, "boc_valet_rates"),
        ("CA_TBILL_3M", "valet", "TB.CDN.90D.MID", "percent", 1, 1, "boc_valet_rates"),
        ("CA_GOC_10Y", "valet", "BD.CDN.10YR.DQ.YLD", "percent", 1, 1, "boc_valet_rates"),
        ("US_TBILL_3M", "fred", "DGS3MO", "percent", 1, 1, "fred_rates"),
        ("US_TREASURY_10Y", "fred", "DGS10", "percent", 1, 1, "fred_rates"),
        # CPI is revised and published ~2-6 weeks after the reference month: not point-in-time safe
        ("US_CPI_INDEX", "fred", "CPIAUCSL", "index_1982_84=100", 45, 0, "fred_cpi"),
    ]
    with open(out / "macro_rates.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "series_id", "value", "unit", "publication_lag_days", "pit_safe", "source_id"])
        for sid, fetcher, src, unit, lag, pit, source_id in macro_specs:
            try:
                rows = fetch_valet(client, src, start, end) if fetcher == "valet" else fetch_fred(client, src, start, end)
            except Exception as exc:  # noqa: BLE001
                warnings.append(f"macro {sid} unavailable: {exc}")
                continue
            for d, v in rows:
                w.writerow([d, sid, v, unit, lag, pit, source_id])

    sources = [
        ("yahoo_chart_prices", "prices_daily.csv;corporate_actions.csv", "Yahoo Finance (public chart endpoint, unofficial)",
         "https://query1.finance.yahoo.com/v8/finance/chart/", "Educational prototype use only; not redistributed. Replace with the official Datathon ZIP.",
         "adj_close = split- and dividend-adjusted close; close = split-adjusted close"),
        ("boc_valet_fxusdcad", "fx_usdcad_daily.csv", "Bank of Canada Valet API", "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json",
         "Bank of Canada terms of use: https://www.bankofcanada.ca/terms/", "CAD per 1 USD, published ~16:30 ET each business day"),
        ("boc_valet_rates", "macro_rates.csv", "Bank of Canada Valet API", "https://www.bankofcanada.ca/valet/",
         "Bank of Canada terms of use: https://www.bankofcanada.ca/terms/", "Daily market rates; not revised"),
        ("fred_rates", "macro_rates.csv", "Federal Reserve Bank of St. Louis (FRED)", "https://fred.stlouisfed.org/",
         "FRED terms of use: https://fred.stlouisfed.org/legal/", "Daily Treasury yields from H.15"),
        ("fred_cpi", "macro_rates.csv", "FRED (BLS CPI-U SA)", "https://fred.stlouisfed.org/series/CPIAUCSL",
         "FRED terms of use", "Reference month date, NOT publication date; revised; excluded from strict point-in-time replay"),
        ("sec_company_tickers", "assets_universe.csv (cik)", "U.S. SEC", "https://www.sec.gov/files/company_tickers.json",
         "Public domain U.S. government data; fair-access policy", "Ticker to CIK mapping"),
        ("aegis_manual_classification", "assets_universe.csv (sector)", "AEGIS team", "",
         "Authored metadata", "GICS-style sector labels assigned manually; ETFs labelled Diversified/Fixed Income/Commodities, never by look-through"),
    ]
    with open(out / "sources_metadata.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["source_id", "dataset", "provider", "url", "license_note", "notes", "extracted_at",
                    "coverage_start", "coverage_end", "dataset_origin"])
        for s in sources:
            w.writerow([*s, extracted_at, start.isoformat(), end.isoformat(), "public_bootstrap"])

    (out / "data_quality_warnings.txt").write_text(
        "AEGIS public bootstrap dataset - NOT the official AlphaForge starter ZIP\n"
        f"extracted_at={extracted_at}\n" + "\n".join(warnings) + "\n")
    (out / "DATASET_ORIGIN.json").write_text(json.dumps({
        "origin": "public_bootstrap", "official_datathon_zip": False, "extracted_at": extracted_at,
        "coverage_start": start.isoformat(), "coverage_end": end.isoformat(), "assets": len(UNIVERSE),
    }, indent=2))
    print(f"done: {len(price_rows)} price rows, {len(action_rows)} actions, {len(warnings)} warnings -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
