"""ULYSSE's market signals, in the client's words: market climate, unusual attention on a security, extra risk facts.

The numbers come from the ULYSSE engine (backend/ulysse, built datapack, data public at the date used). On AWS the Lambda package
carries the same signals pre-computed at build time (app/data/ulysse_signals.json, see scripts/build_lambda.sh) instead of the
engine itself. With neither, every function returns None and the interface simply omits the signal.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

log = logging.getLogger("aegis.signals")

CLIMATE_FR = {
    "calme": ("Calme", "Les marchés bougent peu, comme la plupart du temps."),
    "agité": ("Agité", "Les marchés bougent plus que d'habitude, sans panique."),
    "tendu": ("Tendu", "Les marchés sont sous tension, comme en mars 2020 ou en 2022."),
}


PRECOMPUTED = Path(__file__).resolve().parents[1] / "data" / "ulysse_signals.json"


class _Precomputed:
    """Same interface as ulysse.signaux, reading the file written by `python -m ulysse.signaux`."""

    def __init__(self, data: dict) -> None:
        self.data = data

    def climat(self, as_of=None):
        return self.data["climat"]

    def attention(self, as_of=None):
        return self.data["attention"]

    def fiche(self, t, as_of=None):
        return self.data["fiches"].get(t)


@lru_cache(maxsize=1)
def _engine():
    try:
        from ulysse import signaux
        from ulysse.data.datapack import get_datapack
        get_datapack()  # the engine is only usable with its built datapack
        return signaux
    except Exception as exc:  # noqa: BLE001 - optional engine
        log.info("ULYSSE engine unavailable (%s); trying the pre-computed signals", exc)
    if PRECOMPUTED.is_file():
        return _Precomputed(json.loads(PRECOMPUTED.read_text()))
    return None


def _x(v: float | None) -> str:
    return "—" if v is None else f"×{v:.1f}".replace(".", ",")


def _pct(v: float | None, d: int = 1) -> str:
    return "—" if v is None else f"{v:.{d}f} %".replace(".", ",")


def climate() -> dict | None:
    s = _engine()
    if s is None:
        return None
    try:
        c = s.climat()
    except Exception as exc:  # noqa: BLE001 - datapack missing or not built
        log.info("climate unavailable: %s", exc)
        return None
    if not c.get("regime"):
        return None
    label, text = CLIMATE_FR.get(c["regime"], (c["regime"].capitalize(), ""))
    weeks = c.get("semaines") or 0
    return {"regime": c["regime"], "label": label, "text": text, "weeks": weeks, "as_of": c["as_of"],
            "since": f"depuis {weeks} semaine{'s' if weeks > 1 else ''}", "probabilities_pct": c.get("probabilites_pct"),
            "method": c.get("methode"), "source": "Moteur ULYSSE · description du présent, pas une prévision"}


def _attention_sentence(a: dict, name: str) -> str:
    return (f"{name} attire une attention inhabituelle : plus que {_pct(a['plus_inhabituel_que_pct'], 1)} des jours passés "
            f"(vues {_x(a['vues_x'])}, volume échangé {_x(a['volume_x'])} par rapport à l'habitude).")


def attention(asset_ids: list[str] | None = None, md=None) -> list[dict] | None:
    """Securities with unusual attention right now (all of them, or only those given)."""
    s = _engine()
    if s is None:
        return None
    try:
        rows = s.attention()
    except Exception as exc:  # noqa: BLE001
        log.info("attention unavailable: %s", exc)
        return None
    wanted = set(asset_ids) if asset_ids is not None else None
    out = []
    for r in rows:
        if not r["inhabituel"] or (wanted is not None and r["asset_id"] not in wanted):
            continue
        name = md.asset(r["asset_id"])["name"] if md is not None and md.has_asset(r["asset_id"]) else r["asset_id"]
        out.append({**r, "name": name, "text": _attention_sentence(r, name)})
    return out


def asset_facts(asset_id: str, name: str) -> dict | None:
    s = _engine()
    if s is None:
        return None
    try:
        f = s.fiche(asset_id)
    except Exception as exc:  # noqa: BLE001
        log.info("asset facts unavailable: %s", exc)
        return None
    if f is None:
        return None
    a = f.get("attention")
    years = f.get("sous_l_eau_annees")
    return {
        "cvar_20d_pct": f.get("cvar_20j_pct"), "recent_risk_ratio": f.get("ratio_risque_recent"), "recent_vol_pct": f.get("vol_recente_pct"),
        "underwater_years": years, "underwater_start": f.get("sous_l_eau_debut"), "underwater_end": f.get("sous_l_eau_fin"),
        "underwater_done": f.get("sous_l_eau_termine"),
        "attention": ({**a, "text": _attention_sentence(a, name)} if a and a.get("inhabituel") else
                      ({**a, "text": None} if a else None)),
        "source": "Moteur ULYSSE · calculé sur les prix passés, pas une prévision",
    }
