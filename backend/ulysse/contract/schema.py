"""The investor's « contrat »: rules written cold, by the investor, versioned.

Generic: the engine reads ANY profile. Persona data lives in ulysse/personas (fixtures only).
Each clause states its origin: "dit" (the investor said it) or "defaut" (default value, a
documented hypothesis the investor can change).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Origine = Literal["dit", "defaut"]
Tolerance = Literal["faible", "faible_modere", "modere", "eleve"]
Experience = Literal["debutant", "intermediaire", "avance"]

ClauseType = Literal[
    "concentration_titre",      # max % of the portfolio in one issuer (direct + through funds)
    "concentration_secteur",    # max % in any single sector (look-through)
    "techno_max",               # max % in technology (IT + communication services, look-through)
    "crypto_max",               # max % in crypto-assets (0 = none)
    "speculatif_max",           # max % in highly volatile assets (vol > threshold, or crypto)
    "actions_max",              # max % in equities (look-through)
    "liquidites_min",           # min % kept in cash
    "perte_max",                # max tolerated portfolio fall in the worst historical episode available
    "horizon",                  # money needed within N years: no position whose worst past fall took longer to heal
    "devise_etrangere_max",     # max % outside CAD
    "esg_controverses",         # avoid companies with documented significant E/S controversies
    "esg_exclusion_secteurs",   # sectors the investor excludes
]

CLAUSE_UNITS = {"horizon": "années"}


class Clause(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    type: ClauseType
    parametres: dict = Field(default_factory=dict)
    libelle: str                                  # one plain sentence, in the investor's words
    origine: Origine
    justification: str | None = None              # why this default value (documented hypothesis)
    importante: bool = False                      # a large excess calls for a pause (⛔)

    @model_validator(mode="after")
    def _check(self):
        p = self.parametres
        need = {"concentration_titre": "max_pct", "concentration_secteur": "max_pct", "techno_max": "max_pct",
                "crypto_max": "max_pct", "speculatif_max": "max_pct", "actions_max": "max_pct",
                "liquidites_min": "min_pct", "perte_max": "max_pct", "horizon": "annees",
                "devise_etrangere_max": "max_pct", "esg_exclusion_secteurs": "secteurs"}.get(self.type)
        if need and need not in p:
            raise ValueError(f"clause {self.id} ({self.type}) needs parameter '{need}'")
        for k in ("max_pct", "min_pct"):
            if k in p and not (0 <= float(p[k]) <= 100):
                raise ValueError(f"clause {self.id}: {k} must be within [0, 100]")
        if self.origine == "defaut" and not self.justification:
            raise ValueError(f"default clause {self.id} must carry its justification")
        return self


class Objectif(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    libelle: str
    horizon_annees: float                          # years until the money is needed
    part_pct: float = 100.0                        # share of the portfolio serving this goal
    montant_cible_cad: float | None = None
    origine: Origine = "dit"


class Allocation(BaseModel):
    """Fictitious portfolio: capital split by weights at a constitution date (hypothesis)."""
    model_config = ConfigDict(extra="forbid")
    capital_cad: float
    poids: dict[str, float]                        # ticker -> weight, plus "CASH"
    constitue_le: str = "2025-01-02"

    @model_validator(mode="after")
    def _sum(self):
        s = sum(self.poids.values())
        if abs(s - 1.0) > 1e-6:
            raise ValueError(f"weights must sum to 1 (got {s:.4f})")
        return self


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    esg_important: bool = False
    interet_crypto: bool = False
    interet_techno: bool = False
    notifications_min: Literal["ok", "attention", "pause"] = "attention"   # least level pushed by the Vigie
    langue: Literal["fr", "en"] = "fr"


class Profil(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    nom: str
    age: int | None = None
    experience: Experience = "intermediaire"
    tolerance: Tolerance
    description: str = ""
    objectifs: list[Objectif]
    preferences: Preferences = Field(default_factory=Preferences)
    allocation: Allocation
    fictif: bool = True                            # always true: no real client data (PDF p.14)


class Contrat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profil_id: str
    version: int = 1
    cree_le: str = Field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))
    clauses: list[Clause]
    historique: list[dict] = Field(default_factory=list)   # every change: when, what, context

    def clause(self, type_: str) -> list[Clause]:
        return [c for c in self.clauses if c.type == type_]

    def amend(self, clause_id: str, nouveaux_parametres: dict, contexte: str) -> "Contrat":
        """A rule change is logged with its context (e.g. 'the day this stock rose 30 %')."""
        cl = []
        old = None
        for c in self.clauses:
            if c.id == clause_id:
                old = c
                c = c.model_copy(update={"parametres": {**c.parametres, **nouveaux_parametres}, "origine": "dit",
                                         "justification": None})
            cl.append(c)
        if old is None:
            raise KeyError(clause_id)
        entry = {"version": self.version + 1, "le": datetime.now().isoformat(timespec="seconds"), "clause": clause_id,
                 "avant": old.parametres, "apres": {**old.parametres, **nouveaux_parametres}, "contexte": contexte}
        return Contrat(profil_id=self.profil_id, version=self.version + 1, cree_le=self.cree_le, clauses=cl,
                       historique=self.historique + [entry])


# ------------------------------------------------------------------ evaluation outputs

Statut = Literal["respectee", "approchee", "depassee", "donnees_insuffisantes", "non_applicable"]
Niveau = Literal["aucun", "ok", "attention", "pause"]


class StatutClause(BaseModel):
    clause_id: str
    type: ClauseType
    libelle: str
    origine: Origine
    importante: bool
    statut: Statut
    valeur_avant: float | None = None
    valeur_apres: float | None = None
    limite: float | None = None
    unite: str = "%"
    explication: str                                # deterministic template sentence
    preuves: list[str] = Field(default_factory=list)  # evidence ids
    incertain: bool = False                          # e.g. part of the portfolio not transparent
    cause_par_intention: bool = False                # exceeded because of (or worsened by) the intention
    deja_depassee_avant: bool = False                # already exceeded before the intention (context)


class Option(BaseModel):
    code: Literal["position_plus_petite", "meme_exposition_via_fnb", "continuer", "modifier_regle", "autre_titre"]
    libelle: str
    details: dict = Field(default_factory=dict)
    preuves: list[str] = Field(default_factory=list)


class Signal(BaseModel):
    niveau: Niveau
    afficher: bool
    mode: Literal["aucun", "discret", "encadre", "interruption"] = "aucun"
    gravite: float = 0.0
    titre: str
    regles_declenchees: list[str]                    # which policy rule decided the level (named, tested)
    clauses: list[StatutClause]
    options: list[Option] = Field(default_factory=list)
    preuves: list[dict] = Field(default_factory=list)  # evidence objects (serialised)
    as_of: str
    latence_ms: float | None = None
