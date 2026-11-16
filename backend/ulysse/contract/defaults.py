"""Default clause values (documented hypotheses, docs/hypotheses.md) and the contract wizard.

The wizard turns structured answers into a contract. Every value the investor gave is "dit";
every value filled from the table below is "defaut" with its justification. Optional free text
can be drafted into extra clauses by the LLM (planning/writing role), then validated here.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from ulysse.contract.schema import Allocation, Clause, Contrat, Objectif, Preferences, Profil

DEFAUTS = {  # by risk tolerance (willingness); capacity is checked separately (horizon, perte_max)
    "faible":        {"perte_max": 10, "actions_max": 30, "concentration_titre": 5, "speculatif_max": 0, "crypto_max": 0, "liquidites_min": 10},
    "faible_modere": {"perte_max": 15, "actions_max": 60, "concentration_titre": 5, "speculatif_max": 2, "crypto_max": 0, "liquidites_min": 5},
    "modere":        {"perte_max": 25, "actions_max": 70, "concentration_titre": 8, "speculatif_max": 5, "crypto_max": 2, "liquidites_min": 3},
    "eleve":         {"perte_max": 40, "actions_max": 95, "concentration_titre": 10, "speculatif_max": 15, "crypto_max": 10, "liquidites_min": 2},
}
ACTIONS_MAX_PAR_HORIZON = [(2, 20), (5, 50), (10, 70)]   # horizon < N years -> equities at most M %
ALLOCATION_TYPE = {  # fictitious starting portfolio when the investor does not describe one
    "faible": {"ZST.TO": 0.35, "XBB.TO": 0.30, "XIU.TO": 0.10, "SPY": 0.05, "CASH": 0.20},
    "faible_modere": {"XBB.TO": 0.35, "ZST.TO": 0.10, "XIU.TO": 0.20, "SPY": 0.20, "GLD": 0.05, "CASH": 0.10},
    "modere": {"XBB.TO": 0.25, "XIU.TO": 0.25, "SPY": 0.30, "GLD": 0.05, "AGG": 0.05, "CASH": 0.10},
    "eleve": {"XIU.TO": 0.30, "SPY": 0.45, "XBB.TO": 0.10, "GLD": 0.05, "CASH": 0.10},
}
LIBELLES = {
    "perte_max": "Je n'accepte pas que mon portefeuille baisse de plus de {v} % lors d'une crise comme celles du passé.",
    "actions_max": "Pas plus de {v} % en actions (FNB compris).",
    "concentration_titre": "Pas plus de {v} % de mon portefeuille dans une seule entreprise (FNB compris).",
    "speculatif_max": "Pas plus de {v} % dans des placements très volatils.",
    "crypto_max": "Pas plus de {v} % en cryptoactifs.",
    "liquidites_min": "Garder au moins {v} % en liquidités.",
    "techno_max": "Pas plus de {v} % en techno, FNB compris.",
    "horizon": "Mon argent sert un objectif dans {v} an(s) : pas de placement qui, sur une période passée de {v} an(s), a perdu plus de {p} %.",
}


def justification(cle: str, tolerance: str, extra: str = "") -> str:
    return (f"Valeur par défaut pour une tolérance au risque « {tolerance} » (hypothèse ULYSSE, docs/hypotheses.md){extra}. "
            "À ajuster si elle ne te convient pas.")


class ObjectifReponse(BaseModel):
    libelle: str
    horizon_annees: float
    part_pct: float = 100.0
    montant_cible_cad: float | None = None


class Reponses(BaseModel):
    """Answers to the contract questionnaire (any profile, never a persona name in code)."""
    nom: str
    age: int | None = None
    experience: str = "intermediaire"
    tolerance: str
    objectifs: list[ObjectifReponse]
    capital_cad: float
    allocation: dict[str, float] | None = None
    constitue_le: str = "2025-01-02"
    esg_important: bool = False
    eviter_controverses: bool = False
    exclusions_secteurs: list[str] = Field(default_factory=list)
    interet_crypto: bool = False
    interet_techno: bool = False
    limites: dict[str, float] = Field(default_factory=dict)   # values the investor states (=> "dit")
    notifications_min: str = "attention"
    description: str = ""


def construire(rep: Reponses, profil_id: str) -> tuple[Profil, Contrat]:
    d = DEFAUTS[rep.tolerance]
    horizon_min = min(o.horizon_annees for o in rep.objectifs)
    clauses: list[Clause] = []

    def add(type_, cle_param, valeur_defaut, *, importante=False, extra=""):
        dit = cle_param_key(type_) in rep.limites
        v = rep.limites.get(cle_param_key(type_), valeur_defaut)
        clauses.append(Clause(id=f"C-{type_.upper().replace('_', '-')}", type=type_, parametres={cle_param: v},
                              libelle=LIBELLES[type_].format(v=_n(v)), origine="dit" if dit else "defaut",
                              justification=None if dit else justification(type_, rep.tolerance, extra), importante=importante))

    act = d["actions_max"]
    note = ""
    for h, cap in ACTIONS_MAX_PAR_HORIZON:
        if horizon_min < h and cap < act:
            act, note = cap, f", plafonnée à {cap} % car un objectif arrive dans moins de {h} ans"
            break
    add("perte_max", "max_pct", d["perte_max"], importante=True)
    add("actions_max", "max_pct", act, extra=note)
    add("concentration_titre", "max_pct", d["concentration_titre"], importante=rep.tolerance in ("faible", "faible_modere"))
    add("speculatif_max", "max_pct", d["speculatif_max"])
    if rep.interet_crypto or "crypto_max" in rep.limites:
        add("crypto_max", "max_pct", d["crypto_max"])
    else:
        clauses.append(Clause(id="C-CRYPTO-MAX", type="crypto_max", parametres={"max_pct": 0},
                              libelle="Pas de cryptoactifs.", origine="dit" if "crypto_max" in rep.limites else "defaut",
                              justification=None if "crypto_max" in rep.limites else
                              "Aucun intérêt déclaré pour les cryptoactifs : valeur par défaut 0 % (hypothèse ULYSSE).",
                              importante=False))
    add("liquidites_min", "min_pct", d["liquidites_min"])
    perte_h = rep.limites.get("perte_horizon", d["perte_max"])
    clauses.append(Clause(id="C-HORIZON", type="horizon", parametres={"annees": horizon_min, "max_perte_pct": perte_h},
                          libelle=LIBELLES["horizon"].format(v=_n(horizon_min), p=_n(perte_h)), origine="dit", importante=horizon_min < 5,
                          justification=None))
    if rep.interet_techno or "techno_max" in rep.limites:
        add("techno_max", "max_pct", 50)
    if rep.eviter_controverses:
        clauses.append(Clause(id="C-ESG-CONTROVERSES", type="esg_controverses", parametres={},
                              libelle="Éviter les entreprises liées à des controverses environnementales ou sociales importantes.",
                              origine="dit", importante=True))
    if rep.exclusions_secteurs:
        clauses.append(Clause(id="C-ESG-SECTEURS", type="esg_exclusion_secteurs", parametres={"secteurs": rep.exclusions_secteurs},
                              libelle="Exclure : " + ", ".join(rep.exclusions_secteurs) + ".", origine="dit"))
    prefs = Preferences(esg_important=rep.esg_important or rep.eviter_controverses, interet_crypto=rep.interet_crypto,
                        interet_techno=rep.interet_techno, notifications_min=rep.notifications_min)
    alloc = Allocation(capital_cad=rep.capital_cad, poids=rep.allocation or ALLOCATION_TYPE[rep.tolerance], constitue_le=rep.constitue_le)
    profil = Profil(id=profil_id, nom=rep.nom, age=rep.age, experience=rep.experience, tolerance=rep.tolerance,
                    description=rep.description,
                    objectifs=[Objectif(id=f"O{i + 1}", libelle=o.libelle, horizon_annees=o.horizon_annees, part_pct=o.part_pct,
                                        montant_cible_cad=o.montant_cible_cad) for i, o in enumerate(rep.objectifs)],
                    preferences=prefs, allocation=alloc)
    return profil, Contrat(profil_id=profil_id, clauses=clauses)


def cle_param_key(type_: str) -> str:
    return type_


def _n(v: float) -> str:
    return f"{v:g}".replace(".", ",")
