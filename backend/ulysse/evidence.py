"""Evidence objects (« objets de preuve »).

Every number ULYSSE shows is an Evidence: computed by code (never by an LLM), reproducible,
and traceable to its data. Keys follow the prompt's schema, without accents:
{id, mesure, valeur, unite, devise, periode, date_de_calcul, donnees_source, methode,
 parametres, version_du_code} + statut, libelle, sujet, as_of, note, reference.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from ulysse import __version__

Statut = Literal["ok", "donnees_insuffisantes", "non_applicable"]


class Periode(BaseModel):
    model_config = ConfigDict(frozen=True)
    debut: str
    fin: str


class Evidence(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    mesure: str                       # machine name, e.g. "volatilite_annualisee"
    libelle: str                      # human label (fr-CA)
    sujet: str                        # what it is about: a ticker, "portefeuille", "marche"...
    valeur: Any = None                # number, or small structure (list/dict) for distributions
    unite: str                        # "%", "$", "ratio", "jours", "score", "nombre", "texte"
    devise: str | None = None
    periode: Periode | None = None
    as_of: str                        # information date (simulation date)
    date_de_calcul: str               # the as-of date of the data actually used (last observation)
    donnees_source: list[str]         # catalog ids + series, e.g. ["S1:prices_daily.adj_close[TSLA]", "S3:FXUSDCAD"]
    methode: str                      # method id + one-line description
    parametres: dict[str, Any] = Field(default_factory=dict)
    version_du_code: str
    statut: Statut = "ok"
    note: str | None = None           # e.g. why data is insufficient
    reference: str | None = None      # public reference for the method

    def short(self) -> dict:
        return {"id": self.id, "mesure": self.mesure, "valeur": self.valeur, "unite": self.unite, "statut": self.statut}


_DATAPACK_TAG = "dp?"


def set_datapack_tag(tag: str) -> None:
    global _DATAPACK_TAG
    _DATAPACK_TAG = tag


def code_version() -> str:
    return f"ulysse-{__version__}+{_DATAPACK_TAG}"


def make_id(mesure: str, sujet: str, as_of: str, parametres: dict, valeur=None) -> str:
    """Content-addressed: same computation -> same id; a different value (e.g. the portfolio before
    vs after an order) -> a different id. Prevents a text from citing the wrong number."""
    raw = json.dumps([mesure, sujet, as_of, parametres, _round(valeur), _DATAPACK_TAG], sort_keys=True, default=str)
    return "ev-" + hashlib.sha1(raw.encode()).hexdigest()[:12]


def evidence(*, mesure: str, libelle: str, sujet: str, valeur: Any, unite: str, as_of: str,
             date_de_calcul: str, donnees_source: list[str], methode: str, parametres: dict | None = None,
             devise: str | None = None, periode: tuple[str, str] | None = None, statut: Statut = "ok",
             note: str | None = None, reference: str | None = None) -> Evidence:
    p = parametres or {}
    return Evidence(
        id=make_id(mesure, sujet, as_of, p, valeur), mesure=mesure, libelle=libelle, sujet=sujet,
        valeur=_round(valeur), unite=unite, devise=devise,
        periode=Periode(debut=periode[0], fin=periode[1]) if periode else None,
        as_of=as_of, date_de_calcul=date_de_calcul, donnees_source=donnees_source, methode=methode,
        parametres=p, version_du_code=code_version(), statut=statut, note=note, reference=reference,
    )


def insufficient(*, mesure: str, libelle: str, sujet: str, unite: str, as_of: str, date_de_calcul: str,
                 donnees_source: list[str], methode: str, note: str, parametres: dict | None = None,
                 reference: str | None = None) -> Evidence:
    return evidence(mesure=mesure, libelle=libelle, sujet=sujet, valeur=None, unite=unite, as_of=as_of,
                    date_de_calcul=date_de_calcul, donnees_source=donnees_source, methode=methode,
                    parametres=parametres, statut="donnees_insuffisantes", note=note, reference=reference)


def _round(v: Any) -> Any:
    """Stable rounding so that the same input always yields byte-identical evidence."""
    if isinstance(v, float):
        return round(v, 6)
    if isinstance(v, list):
        return [_round(x) for x in v]
    if isinstance(v, dict):
        return {k: _round(x) for k, x in v.items()}
    return v
