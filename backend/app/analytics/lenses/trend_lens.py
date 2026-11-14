"""Lens 4 - trend and momentum: context, never a signal (section 8A.5)."""
from __future__ import annotations

import pandas as pd

from ...data.loader import MarketData
from ...models import LensStatus
from ..ledger import MetricLedger
from ..trend import momentum_12_1, moving_average_state, relative_strength, rsi, volume_zscore

BLIND_SPOTS = ["Ignore l'entreprise et sa valeur", "Signaux contradictoires en marché sans tendance",
               "Invalidé instantanément par une nouvelle majeure"]
EVIDENCE_NOTE = ("Les règles de graphiques favorables souffrent largement de « data snooping »; aucune moyenne mobile ni RSI "
                 "n'est présenté comme un signal d'achat ou de vente. Le momentum est documenté jusqu'à ~12 mois puis s'inverse, "
                 "avec des krachs violents lors des rebonds (2009). Avec 31 actifs, les tests transversaux sont de faible puissance.")


def run(md: MarketData, asset_id: str, as_of: pd.Timestamp, benchmark_asset: str, led: MetricLedger) -> dict:
    p = f"asset.{asset_id}"
    prices = md.native_series(asset_id, "adj_close")
    prices = prices[prices.index <= as_of]
    crypto = md.calendar_of(asset_id) == "crypto"
    long, skip = (365, 30) if crypto else (252, 21)
    ma = moving_average_state(prices)
    mom = momentum_12_1(prices, long, skip)
    r = rsi(prices)
    if ma is None and mom is None:
        return {"lens": 4, "status": LensStatus.UNAVAILABLE.value, "reason": "historique < 220 observations", "blind_spots": BLIND_SPOTS}
    end = prices.index[-1].date().isoformat()
    if ma:
        led.add(f"{p}.dist_ma200", f"Écart au cours moyen 200 j {asset_id}", ma["distance_to_ma200"], "pct", "prix/MM200 − 1",
                window=(None, end), assets=[asset_id])
        led.add(f"{p}.ma200_slope", f"Pente de la MM200 sur 20 j {asset_id}", ma["ma200_slope_20d"], "pct", "MM200_t / MM200_(t−20) − 1",
                window=(None, end), assets=[asset_id])
    led.add(f"{p}.mom_12_1", f"Momentum 12-1 {asset_id}", mom, "pct", f"prix_(t−{skip}) / prix_(t−{long}) − 1", window=(None, end), assets=[asset_id])
    led.add(f"{p}.rsi14", f"RSI(14) {asset_id}", r, "index", "RSI de Wilder, 14 périodes", window=(None, end), assets=[asset_id])
    rs = None
    if benchmark_asset and benchmark_asset != asset_id:
        try:
            panel, _ = md.cad_panel([asset_id, benchmark_asset], end=as_of)
            rs = relative_strength(panel[asset_id], panel[benchmark_asset])
        except Exception:  # noqa: BLE001
            rs = None
    led.add(f"{p}.rel_strength_6m", f"Force relative 6 mois {asset_id} vs {benchmark_asset}", rs, "pct", "rendement 126 obs. actif − indice (CAD)",
            window=(None, end), assets=[asset_id])
    vz = volume_zscore(md.native_series(asset_id, "volume")[lambda s: s.index <= as_of]) if asset_id in md.volume.columns else None
    led.add(f"{p}.volume_z", f"Z-score du volume (5 j vs 60 j) {asset_id}", vz["zscore"] if vz else None, "ratio",
            "(moyenne 5 j − moyenne 60 j)/écart-type 60 j, volumes nuls exclus", window=(None, end), assets=[asset_id])
    return {"lens": 4, "status": LensStatus.COMPUTED.value, "moving_averages": ma, "momentum_12_1": mom,
            "momentum_window": {"long": long, "skip": skip}, "rsi14": r, "relative_strength_6m": rs, "volume": vz,
            "context_flags": (["falling_knife_caution: prix sous une MM200 descendante (mise en garde, pas un signal)"]
                              if ma and ma["falling_knife_caution"] else []),
            "evidence_note": EVIDENCE_NOTE, "blind_spots": BLIND_SPOTS, "not_a_signal": True,
            "metric_ids": [k for k in led.ids() if k.startswith(p + ".") and any(t in k for t in ("ma200", "mom", "rsi", "rel_", "volume"))]}
