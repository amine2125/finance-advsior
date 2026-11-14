"""Process-wide access to the active dataset (local folder, or S3 prefix on AWS Lambda)."""
from __future__ import annotations

import threading
from pathlib import Path

from ..config import get_settings
from .loader import DataUnavailableError, MarketData, load_dataset

_LOCK = threading.Lock()
_MD: MarketData | None = None
FILES = ["assets_universe.csv", "prices_daily.csv", "fx_usdcad_daily.csv", "macro_rates.csv", "corporate_actions.csv",
         "sources_metadata.csv", "data_quality_warnings.txt", "DATASET_ORIGIN.json"]


def _download_from_s3(bucket: str, prefix: str) -> Path:
    import boto3  # provided by the Lambda runtime

    s = get_settings()
    target = Path("/tmp/aegis-data")
    target.mkdir(parents=True, exist_ok=True)
    client = boto3.client("s3", region_name=s.aws_region)
    for name in FILES:
        try:
            client.download_file(bucket, prefix.rstrip("/") + "/" + name, str(target / name))
        except Exception as exc:  # noqa: BLE001
            if name in ("assets_universe.csv", "prices_daily.csv", "fx_usdcad_daily.csv"):
                raise DataUnavailableError(f"s3://{bucket}/{prefix}{name} introuvable: {exc}") from exc
    return target


def get_market_data() -> MarketData:
    global _MD
    if _MD is not None:
        return _MD
    with _LOCK:
        if _MD is None:
            s = get_settings()
            path = s.data_dir
            if not (path / "prices_daily.csv").exists() and s.data_s3_bucket:
                path = _download_from_s3(s.data_s3_bucket, s.data_s3_prefix)
            if not (path / "prices_daily.csv").exists():
                raise DataUnavailableError(
                    f"Aucun jeu de données dans {path}. Lancez: python scripts/import_datathon_zip.py ~/Datathon2026/alphaforge_starter")
            _MD = load_dataset(path)
    return _MD


def reset_market_data(md: MarketData | None) -> None:
    global _MD
    with _LOCK:
        _MD = md
