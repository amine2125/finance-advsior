"""Test configuration. SYNTHETIC FIXTURES ONLY: the market data generated here is fictional and exists solely for tests.

The LLM is disabled by default; agent tests inject a clearly labeled scripted stub (tests/stubs.py).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("AEGIS_LLM_ENABLED", "false")
os.environ.setdefault("AEGIS_JOB_RUNNER", "inline")
os.environ.setdefault("AEGIS_WEB_RESEARCH_ENABLED", "false")
# Never touch real AWS resources from tests, whatever the local .env says.
os.environ["AEGIS_STORAGE_BACKEND"] = "local"
os.environ["AEGIS_AUTH"] = "header"
os.environ["AEGIS_DEMO_ACCOUNTS"] = "false"
os.environ["AEGIS_LOCAL_STORE"] = str(Path(os.environ.get("TMPDIR", "/tmp")) / f"aegis-pytest-{os.getpid()}")

REAL_DATA = ROOT.parent / "data" / "active"


def _walk(n, mu, sigma, seed, start=100.0):
    rng = np.random.default_rng(seed)
    r = rng.normal(mu, sigma, n)
    return start * np.cumprod(1 + r)


def build_synthetic_dataset(tmp: Path, n_days: int = 700) -> Path:
    """SYNTHETIC test fixture (not market data)."""
    tmp.mkdir(parents=True, exist_ok=True)
    bdays = pd.bdate_range("2022-01-03", periods=n_days)
    alldays = pd.date_range(bdays[0], bdays[-1], freq="D")
    universe = pd.DataFrame([
        ["AAA", "Synthetic Tech Corp", "equity", "common_stock", "Information Technology", "United States", "USD", "TEST", 1, 0, 0, "", "", "aaa corp"],
        ["BBB.TO", "Synthetic Bank", "equity", "common_stock", "Financials", "Canada", "CAD", "TEST", 1, 0, 0, "", "", "bbb bank"],
        ["ETF1", "Synthetic Equity Index ETF", "etf", "equity_etf", "Diversified", "United States", "USD", "TEST", 0, 0, 0, "", "", ""],
        ["BND.TO", "Synthetic Bond ETF", "etf", "bond_etf", "Fixed Income", "Canada", "CAD", "TEST", 0, 0, 0, "", "", ""],
        ["CRY-USD", "Synthetic Coin", "crypto", "cryptoasset", "Cryptoassets", "Global", "USD", "CRYPTO", 1, 0, 0, "", "", "synthcoin"],
        ["SHORT", "Synthetic Newcomer", "equity", "common_stock", "Industrials", "United States", "USD", "TEST", 1, 0, 0, "", "", ""],
    ], columns=["asset_id", "name", "asset_class", "sub_class", "sector", "region", "currency", "exchange", "is_single_issuer",
                "is_leveraged", "is_inverse", "cik", "coingecko_id", "aliases"])
    universe["classification_source"] = "synthetic_test_fixture"
    rows = []
    specs = {"AAA": (bdays, 0.0008, 0.025, 1), "BBB.TO": (bdays, 0.0003, 0.012, 2), "ETF1": (bdays, 0.0004, 0.011, 3),
             "BND.TO": (bdays, 0.0000, 0.004, 4), "CRY-USD": (alldays, 0.001, 0.04, 5), "SHORT": (bdays[-100:], 0.0, 0.02, 6)}
    for aid, (days, mu, sig, seed) in specs.items():
        px = _walk(len(days), mu, sig, seed)
        vol = np.full(len(days), 1_000_000.0)
        vol[10] = 0.0  # zero-volume anomaly
        for d, p, v in zip(days, px, vol):
            rows.append({"date": d.date().isoformat(), "asset_id": aid, "open": p, "high": p, "low": p, "close": p, "adj_close": p,
                         "volume": v, "currency": universe.set_index("asset_id").loc[aid, "currency"]})
    # BBB.TO missing on a US-only trading day (Canadian holiday simulation)
    rows = [r for r in rows if not (r["asset_id"] == "BBB.TO" and r["date"] == bdays[50].date().isoformat())]
    pd.DataFrame(rows).to_csv(tmp / "prices_daily.csv", index=False)
    fx = pd.DataFrame({"date": [d.date().isoformat() for d in bdays], "usdcad": np.linspace(1.25, 1.40, len(bdays)), "source_id": "synthetic"})
    fx.to_csv(tmp / "fx_usdcad_daily.csv", index=False)
    universe.to_csv(tmp / "assets_universe.csv", index=False)
    pd.DataFrame([{"date": bdays[0].date().isoformat(), "series_id": "CA_TBILL_3M", "value": 2.0, "unit": "percent", "publication_lag_days": 1,
                   "pit_safe": 1, "source_id": "synthetic"}]).to_csv(tmp / "macro_rates.csv", index=False)
    pd.DataFrame(columns=["date", "asset_id", "action_type", "value", "currency", "note"]).to_csv(tmp / "corporate_actions.csv", index=False)
    pd.DataFrame([{"source_id": "synthetic", "dataset": "all", "provider": "pytest", "url": "", "license_note": "SYNTHETIC TEST FIXTURE",
                   "notes": "", "extracted_at": "", "coverage_start": "", "coverage_end": "", "dataset_origin": "synthetic_fixture"}]).to_csv(tmp / "sources_metadata.csv", index=False)
    (tmp / "DATASET_ORIGIN.json").write_text('{"origin": "synthetic_fixture", "official_datathon_zip": false}')
    return tmp


@pytest.fixture(scope="session")
def synth_dir(tmp_path_factory):
    return build_synthetic_dataset(tmp_path_factory.mktemp("synth"))


@pytest.fixture(scope="session")
def md(synth_dir):
    from app.data.loader import load_dataset
    return load_dataset(synth_dir)


@pytest.fixture(scope="session")
def real_md():
    if not (REAL_DATA / "prices_daily.csv").exists():
        pytest.skip("real dataset not present (import the Datathon ZIP or run the public bootstrap)")
    from app.data.loader import load_dataset
    return load_dataset(REAL_DATA)


@pytest.fixture()
def use_real_registry(real_md):
    from app.data import registry
    registry.reset_market_data(real_md)
    yield real_md
    registry.reset_market_data(None)


@pytest.fixture()
def fresh_store(tmp_path):
    from app.storage import store
    s = store.LocalStore(tmp_path / "store")
    store.set_store(s)
    yield s
    store.set_store(None)
