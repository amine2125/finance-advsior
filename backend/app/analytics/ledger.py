"""Metric ledger: every number shown to a user or an agent is registered here with its provenance."""
from __future__ import annotations

import math
from typing import Any

from ..methodology import CALCULATION_VERSION
from ..models import InfoClass, MetricRecord


def fmt_number(value: float | None, unit: str) -> str:
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return "n/d"
    if unit == "pct":
        return f"{value * 100:,.1f} %".replace(",", " ").replace(".", ",")
    if unit in ("cad", "usd"):
        s = f"{value:,.0f}".replace(",", " ")
        return f"{s} $ CA" if unit == "cad" else f"{s} $ US"
    if unit == "count":
        return f"{value:,.0f}".replace(",", " ")
    if unit == "days":
        return f"{value:,.0f} j".replace(",", " ")
    if unit == "years":
        return f"{value:,.1f} ans".replace(".", ",")
    if unit == "x":
        return f"{value:,.2f}x".replace(".", ",")
    return f"{value:,.2f}".replace(",", " ").replace(".", ",")


def clean(value: Any) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else f


class MetricLedger:
    def __init__(self) -> None:
        self._records: dict[str, MetricRecord] = {}

    def add(self, metric_id: str, label: str, value: Any, unit: str, method: str, *,
            window: tuple[str | None, str | None] = (None, None), assets: list[str] | None = None,
            params: dict | None = None, source_ids: list[str] | None = None, flags: list[str] | None = None,
            info_class: InfoClass = InfoClass.COMPUTED_RESULT) -> MetricRecord:
        v = clean(value)
        rec = MetricRecord(metric_id=metric_id, label=label, value=v, unit=unit, display=fmt_number(v, unit),
                           method=method, info_class=info_class, window_start=window[0], window_end=window[1],
                           assets=assets or [], params=params or {}, source_ids=source_ids or ["dataset_prices"],
                           quality_flags=flags or [], calculation_version=CALCULATION_VERSION)
        self._records[metric_id] = rec
        return rec

    def merge(self, other: "MetricLedger") -> None:
        self._records.update(other._records)

    def get(self, metric_id: str) -> MetricRecord | None:
        return self._records.get(metric_id)

    def __contains__(self, metric_id: str) -> bool:
        return metric_id in self._records

    def ids(self) -> list[str]:
        return list(self._records)

    def records(self) -> list[MetricRecord]:
        return list(self._records.values())

    def as_dict(self) -> dict[str, dict]:
        return {k: v.model_dump() for k, v in self._records.items()}

    @classmethod
    def from_dict(cls, data: dict[str, dict]) -> "MetricLedger":
        led = cls()
        for k, v in data.items():
            led._records[k] = MetricRecord(**v)
        return led

