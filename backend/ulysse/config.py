"""Paths and global constants. Everything configurable by environment variable."""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # repository root (ULYSSE/)
KIT_DIR = Path(os.environ.get("ULYSSE_KIT_DIR", ROOT / "context" / "Datathon2026" / "alphaforge_starter"))
DATA_DIR = Path(os.environ.get("ULYSSE_DATA_DIR", ROOT / "data"))
CACHE_DIR = DATA_DIR / "cache"          # raw third-party downloads (gitignored, re-creatable)
MANUAL_DIR = DATA_DIR / "manual"        # hand-curated, sourced files (committed)
BUILD_DIR = DATA_DIR / "build"          # derived artefacts (gitignored, reproducible)
DATAPACK_DIR = Path(os.environ.get("ULYSSE_DATAPACK_DIR", BUILD_DIR / "datapack"))
STATE_DIR = Path(os.environ.get("ULYSSE_STATE_DIR", ROOT / ".ulysse"))  # local runtime state

# Starter-kit window (reference data, PDF p.14)
KIT_START = "2021-11-12"
KIT_END = "2026-11-12"
# Backward extension (decision D-006): lookback for the time machine and model training only
EXT_START = "2016-01-01"
EXT_OVERLAP_END = "2022-03-31"   # downloaded beyond KIT_START to check consistency on the overlap

BASE_CURRENCY = "CAD"
ANNUALIZATION = 252             # master calendar = weekdays (decision D-008)
SEED = 20261114                 # every random procedure is seeded with this

# Generic, non-personal user agent for public APIs (Wikimedia asks for an identifiable UA)
USER_AGENT = os.environ.get("ULYSSE_USER_AGENT", "ULYSSE-datathon-prototype/0.1 (educational, non-commercial)")

# The app's "today". Default: two days after the datapack's last day (2026-11-14 for the official kit), so that the
# Wikipedia views and issuer snapshots of that last day are usable. ULYSSE_ASOF pins it for a reproducible demo.
def kit_end() -> str:
    """Last day of the kit in use: KIT_END for the official kit, later for a kit extended by scripts/extend_kit.py."""
    ext = KIT_DIR / "EXTENSION.json"
    return json.loads(ext.read_text(encoding="utf-8"))["extended_to"] if ext.exists() else KIT_END


def _default_asof() -> str:
    from datetime import date, timedelta
    return (date.fromisoformat(kit_end()) + timedelta(days=2)).isoformat()


DEFAULT_ASOF = os.environ.get("ULYSSE_ASOF") or _default_asof()
