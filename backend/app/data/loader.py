"""Market data loader: reads the normalized dataset (see scripts/import_datathon_zip.py) into an immutable,
point-in-time aware `MarketData` object.

Rules enforced here (never bypassed by callers):
  * No forward-fill beyond METHODOLOGY.returns.max_forward_fill_days, no back-fill, no zero-filling.
  * A price, FX rate or macro value is only returned if it was observed (or, for macro, published) on or
    before the requested date. Missing data raises DataUnavailableError instead of being invented.
  * Split ratios are never re-applied: `close` is already split-adjusted, `adj_close` split+dividend adjusted.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import pandas as pd

from ..methodology import METHODOLOGY


class DataUnavailableError(Exception):
    """Raised when requested data does not exist in the loaded dataset (never silently filled)."""


@dataclass
class QualityReport:
    first_date: str | None
    last_date: str | None
    n_obs: int
    flags: list[str] = field(default_factory=list)
    stale_days: int | None = None
    split_checks: list[str] = field(default_factory=list)
    zero_volume_days: int = 0

    @property
    def __dict__(self):  # used by routes for JSON serialisation
        return asdict(self)


def _iso(ts) -> str:
    return pd.Timestamp(ts).date().isoformat()


class MarketData:
    def __init__(self, universe: pd.DataFrame, prices_long: pd.DataFrame, fx: pd.Series | pd.DataFrame,
                 macro: pd.DataFrame, actions: pd.DataFrame, sources: pd.DataFrame, warnings: list[str],
                 origin: str, dataset_version: str):
        u = universe.copy()
        if "asset_id" in u.columns:
            u = u.set_index("asset_id")
        u.index = u.index.astype(str).str.upper()
        for c, d in (("sub_class", ""), ("region", ""), ("exchange", ""), ("is_single_issuer", 1), ("is_leveraged", 0),
                     ("is_inverse", 0), ("cik", ""), ("coingecko_id", ""), ("aliases", "")):
            if c not in u.columns:
                u[c] = d
        u = u.fillna({"cik": "", "coingecko_id": "", "aliases": "", "sub_class": "", "region": "", "exchange": ""})

        def _cik(v) -> str:  # pandas reads the CIK column as float (1318605.0): normalise to SEC's 10-digit string
            s = str(v).strip()
            if s in ("", "nan", "None"):
                return ""
            s = s[:-2] if s.endswith(".0") else s
            return s.zfill(10) if s.isdigit() else ""
        u["cik"] = [_cik(v) for v in u["cik"]]
        self.universe = u

        p = prices_long.copy()
        p["date"] = pd.to_datetime(p["date"])
        p["asset_id"] = p["asset_id"].astype(str).str.upper()
        p = p[p["asset_id"].isin(u.index)].sort_values(["asset_id", "date"]).drop_duplicates(["asset_id", "date"], keep="last")
        self.prices_long = p.reset_index(drop=True)
        self.close = p.pivot(index="date", columns="asset_id", values="close").sort_index()
        self.adj_close = p.pivot(index="date", columns="asset_id", values="adj_close").sort_index() \
            if "adj_close" in p.columns else self.close.copy()
        if "volume" in p.columns and p["volume"].notna().any():
            self.volume = p.pivot(index="date", columns="asset_id", values="volume").sort_index()
            self.volume = self.volume.loc[:, self.volume.notna().any()]
        else:
            self.volume = pd.DataFrame(index=self.close.index)

        if isinstance(fx, pd.DataFrame):
            f = fx.copy()
            f["date"] = pd.to_datetime(f["date"])
            fx = f.set_index("date")["usdcad"].astype(float)
        self.fx = fx.sort_index().dropna()

        m = macro.copy() if macro is not None else pd.DataFrame()
        if not m.empty:
            m["date"] = pd.to_datetime(m["date"]).dt.date.astype(str)
            m["value"] = pd.to_numeric(m["value"], errors="coerce")
            for c, d in (("publication_lag_days", 0), ("pit_safe", 0), ("source_id", "macro"), ("unit", "")):
                if c not in m.columns:
                    m[c] = d
            m["publication_lag_days"] = pd.to_numeric(m["publication_lag_days"], errors="coerce").fillna(0).astype(int)
            m["pit_safe"] = pd.to_numeric(m["pit_safe"], errors="coerce").fillna(0).astype(int)
            m = m.dropna(subset=["value"])
            m["available_date"] = (pd.to_datetime(m["date"]) + pd.to_timedelta(m["publication_lag_days"], unit="D")).dt.date.astype(str)
        self.macro = m
        self.actions = actions if actions is not None else pd.DataFrame()
        self.sources = sources if sources is not None else pd.DataFrame()
        self.warnings = warnings
        self.origin = origin
        self.dataset_version = dataset_version
        if self.close.empty:
            raise DataUnavailableError("Le jeu de données ne contient aucun prix")
        self.start_date: pd.Timestamp = self.close.index.min()
        self.end_date: pd.Timestamp = self.close.index.max()
        self._quality: dict[str, QualityReport] = {}

    # ------------------------------------------------------------------ metadata
    def has_asset(self, asset_id: str | None) -> bool:
        return bool(asset_id) and str(asset_id).upper() in self.universe.index

    def asset(self, asset_id: str) -> dict:
        aid = str(asset_id).upper()
        if aid not in self.universe.index:
            raise DataUnavailableError(f"actif inconnu « {asset_id} » (hors de l'univers du jeu de données)")
        d = self.universe.loc[aid].to_dict()
        d["asset_id"] = aid
        return d

    def calendar_of(self, asset_id: str) -> str:
        return "crypto" if self.asset(asset_id)["asset_class"] == "crypto" else "business"

    def periods_per_year(self, asset_id: str) -> int:
        return METHODOLOGY["returns"]["annualization"][self.calendar_of(asset_id)]

    def source_references(self) -> list[dict]:
        if self.sources is None or self.sources.empty:
            return []
        out = []
        for i, r in self.sources.fillna("").iterrows():
            d = {k: (str(v) if not isinstance(v, (int, float)) else v) for k, v in r.to_dict().items()}
            d.setdefault("source_id", f"source_{i}")
            out.append(d)
        return out

    def source_ids_for(self, asset_id: str) -> list[str]:
        """Source ids backing an asset's prices (and FX when it is USD-denominated)."""
        refs = self.source_references()
        ids = [r["source_id"] for r in refs if "prices" in str(r.get("file", r.get("dataset", ""))).lower()]
        if str(self.asset(asset_id).get("currency", "")).upper() == "USD":
            ids += [r["source_id"] for r in refs if "fx" in str(r.get("file", r.get("dataset", ""))).lower()]
        return ids or [r["source_id"] for r in refs][:1]

    # ------------------------------------------------------------------ prices
    def native_series(self, asset_id: str, field: str = "adj_close") -> pd.Series:
        aid = str(asset_id).upper()
        self.asset(aid)
        frame = {"close": self.close, "adj_close": self.adj_close, "volume": self.volume}[field]
        if aid not in frame.columns:
            raise DataUnavailableError(f"{field} indisponible pour {aid}")
        s = frame[aid].dropna()
        if s.empty:
            raise DataUnavailableError(f"aucune observation {field} pour {aid}")
        return s

    def last_price(self, asset_id: str, as_of=None, field: str = "close") -> tuple[float, pd.Timestamp]:
        s = self.native_series(asset_id, field)
        ts = pd.Timestamp(as_of) if as_of is not None else self.end_date
        s = s[s.index <= ts]
        if s.empty:
            raise DataUnavailableError(f"aucun cours pour {asset_id} au {_iso(ts)} ou avant")
        return float(s.iloc[-1]), s.index[-1]

    # ------------------------------------------------------------------ FX
    def fx_rate(self, date) -> tuple[float, pd.Timestamp]:
        ts = pd.Timestamp(date)
        f = self.fx[self.fx.index <= ts]
        if f.empty:
            raise DataUnavailableError(f"aucun taux USD/CAD publié au {_iso(ts)} ou avant")
        return float(f.iloc[-1]), f.index[-1]

    def fx_factor(self, currency: str, date) -> tuple[float, pd.Timestamp | None]:
        cur = str(currency).upper()
        if cur == "CAD":
            return 1.0, pd.Timestamp(date)
        if cur == "USD":
            return self.fx_rate(date)
        raise DataUnavailableError(f"devise non prise en charge: {currency}")

    def cad_panel(self, assets: list[str], end=None, field: str = "adj_close") -> tuple[pd.DataFrame, str]:
        """Prices converted to CAD on a common calendar.

        Calendar: business days (union of the non-crypto assets' trading days) when any non-crypto asset is
        present, crypto then being sampled on those days; all calendar days when only crypto. Gaps (holidays)
        are forward-filled for at most `max_forward_fill_days`; never back-filled.
        """
        assets = [str(a).upper() for a in assets]
        for a in assets:
            self.asset(a)
        src = self.adj_close if field == "adj_close" else self.close
        missing = [a for a in assets if a not in src.columns]
        if missing:
            raise DataUnavailableError(f"aucun prix pour {', '.join(missing)}")
        endts = pd.Timestamp(end) if end is not None else self.end_date
        frame = src.loc[src.index <= endts, assets]
        non_crypto = [a for a in assets if self.calendar_of(a) != "crypto"]
        cal = "business" if non_crypto else "crypto"
        if cal == "business":
            idx = frame[non_crypto].dropna(how="all").index
        else:
            idx = frame.dropna(how="all").index
        lim = METHODOLOGY["returns"]["max_forward_fill_days"]
        panel = frame.ffill(limit=lim).reindex(idx)
        if cal == "business":
            panel = panel.loc[panel.index.dayofweek <= 4]
        usd = [a for a in assets if str(self.asset(a)["currency"]).upper() == "USD"]
        if usd:
            fx = self.fx.reindex(self.fx.index.union(panel.index)).ffill(limit=lim).reindex(panel.index)
            panel[usd] = panel[usd].mul(fx, axis=0)
        return panel, cal

    # ------------------------------------------------------------------ macro
    def macro_value(self, series_id: str, as_of=None, require_pit: bool = True) -> dict | None:
        if self.macro.empty:
            return None
        d = _iso(as_of if as_of is not None else self.end_date)
        m = self.macro[(self.macro["series_id"] == series_id) & (self.macro["available_date"] <= d)]
        if require_pit:
            m = m[m["pit_safe"] == 1]
        if m.empty:
            return None
        r = m.sort_values("date").iloc[-1]
        return {"series_id": series_id, "value": float(r["value"]), "date": r["date"], "unit": r.get("unit", ""),
                "source_id": str(r.get("source_id", "")), "available_date": r["available_date"]}

    # ------------------------------------------------------------------ point in time
    def as_of(self, date) -> "MarketData":
        ts = pd.Timestamp(date)
        p = self.prices_long[self.prices_long["date"] <= ts]
        if p.empty:
            raise DataUnavailableError(f"aucune donnée au {_iso(ts)} ou avant")
        macro = self.macro
        if not macro.empty:
            macro = macro[macro["available_date"] <= _iso(ts)].drop(columns=["available_date"])
        view = MarketData(self.universe.reset_index().rename(columns={"index": "asset_id"}), p, self.fx[self.fx.index <= ts],
                          macro, self.actions, self.sources, self.warnings, self.origin, self.dataset_version)
        return view

    # ------------------------------------------------------------------ quality
    def quality(self, asset_id: str) -> QualityReport:
        aid = str(asset_id).upper()
        if aid in self._quality:
            return self._quality[aid]
        self.asset(aid)
        try:
            s = self.native_series(aid, "adj_close")
        except DataUnavailableError:
            q = QualityReport(None, None, 0, ["NO_DATA"])
            self._quality[aid] = q
            return q
        flags: list[str] = []
        stale = int(len(pd.bdate_range(s.index[-1], self.end_date)) - 1) if self.calendar_of(aid) == "business" \
            else int((self.end_date - s.index[-1]).days)
        if stale > METHODOLOGY["guardian"]["stale_business_days"]:
            flags.append("STALE")
        if len(s) < METHODOLOGY["windows"]["min_obs_tier"]:
            flags.append("SHORT_HISTORY")
        zero = 0
        if aid in self.volume.columns:
            zero = int((self.volume[aid].dropna() == 0).sum())
            if zero:
                flags.append("ZERO_VOLUME_DAYS")
        split_checks: list[str] = []
        if not self.actions.empty and "action_type" in self.actions.columns:
            a = self.actions[(self.actions["asset_id"].astype(str).str.upper() == aid)
                             & (self.actions["action_type"].astype(str).str.lower() == "split")]
            for _, r in a.iterrows():
                d = pd.Timestamp(r["date"])
                around = self.close[aid].dropna()
                before, after = around[around.index < d], around[around.index >= d]
                if len(before) and len(after):
                    jump = float(after.iloc[0] / before.iloc[-1] - 1)
                    split_checks.append(f"split {r['value']} le {_iso(d)}: variation du cours {jump:+.1%} "
                                        "(déjà ajusté dans la source, non réappliqué)")
        big = s.pct_change().abs()
        if (big > 0.40).any():
            flags.append("LARGE_ONE_DAY_MOVE")
        q = QualityReport(_iso(s.index[0]), _iso(s.index[-1]), int(len(s)), flags, stale, split_checks, zero)
        self._quality[aid] = q
        return q


def _read(path: Path, name: str, required: bool = True) -> pd.DataFrame:
    f = path / name
    if not f.exists():
        if required:
            raise DataUnavailableError(f"fichier requis manquant: {f}")
        return pd.DataFrame()
    return pd.read_csv(f)


def load_dataset(path: str | Path) -> MarketData:
    path = Path(path)
    universe = _read(path, "assets_universe.csv")
    prices = _read(path, "prices_daily.csv")
    fx = _read(path, "fx_usdcad_daily.csv")
    if "ticker" in universe.columns and "asset_id" in universe.columns and universe["asset_id"].astype(str).str.match(r"^A\d+$").all():
        raise DataUnavailableError(
            f"{path} contient le format brut du ZIP officiel. Lancez: python scripts/import_datathon_zip.py <dossier ou zip>")
    macro = _read(path, "macro_rates.csv", required=False)
    actions = _read(path, "corporate_actions.csv", required=False)
    sources = _read(path, "sources_metadata.csv", required=False)
    wfile = path / "data_quality_warnings.txt"
    warnings = [l for l in wfile.read_text().splitlines() if l.strip()] if wfile.exists() else []
    origin = "unknown"
    ofile = path / "DATASET_ORIGIN.json"
    if ofile.exists():
        origin = json.loads(ofile.read_text()).get("origin", "unknown")
    h = hashlib.sha256()
    for name in ("assets_universe.csv", "prices_daily.csv", "fx_usdcad_daily.csv", "macro_rates.csv"):
        f = path / name
        if f.exists():
            h.update(f.read_bytes())
    return MarketData(universe, prices, fx, macro, actions, sources, warnings, origin, "ds-" + h.hexdigest()[:12])
