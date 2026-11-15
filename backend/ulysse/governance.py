"""Governance (code only, decision D-031): for a dossier, the status of EVERY clause, the conflicts
between clauses, the missing information, and the list of checks performed — all visible to the
user (PDF p.9: « rendre les contrôles visibles »)."""
from __future__ import annotations

from ulysse.analytics import portfolio as pfm
from ulysse.contract import contradictions
from ulysse.contract.evaluate import apres_ordre, etat, evaluer
from ulysse.contract.schema import Contrat, Profil
from ulysse.data.datapack import AsOf
from ulysse.policy import niveau

CONTROLES = [
    ("simulation", "Aucune transaction réelle : tout ordre est simulé."),
    ("as_of", "Seules les informations publiées à la date de simulation sont utilisées."),
    ("clauses", "Chaque clause du contrat est évaluée en code, avec ses preuves."),
    ("contradictions", "Les clauses sont vérifiées entre elles (contradictions)."),
    ("transparence", "Les FNB sont ouverts quand leur composition publiée est disponible à la date."),
    ("esg", "Aucune cote ESG propriétaire : seulement des preuves documentées et datées."),
    ("niveau", "Le niveau du signal est décidé par une politique écrite et testée, jamais par le LLM."),
]


def gouverner(v: AsOf, profil: Profil, contrat: Contrat, pf: pfm.Portfolio, intention: dict | None = None) -> dict:
    avant = etat(v, pf)
    base, preuves = evaluer(v, contrat, avant, None, cible=(intention or {}).get("ticker"))
    statuts = base
    if intention and intention.get("type") == "ordre":
        apres = apres_ordre(v, avant, intention["ticker"], float(intention["montant_cad"]))
        statuts, preuves = evaluer(v, contrat, avant, apres, cible=intention["ticker"], avant_statuts=base)
    lvl, regles, grav = niveau(statuts)
    manquantes = []
    if avant.opaques:
        manquantes.append({"code": "M1", "message": "Composition non disponible à cette date pour : " + ", ".join(sorted(set(avant.opaques)))
                           + ". Les expositions par secteur et par titre sont donc incomplètes."})
    for s in statuts:
        if s.statut == "donnees_insuffisantes":
            manquantes.append({"code": "M2", "clause_id": s.clause_id, "message": f"Clause « {s.libelle} » : données insuffisantes. {s.explication}"})
        if s.incertain:
            manquantes.append({"code": "M3", "clause_id": s.clause_id, "message": f"Clause « {s.libelle} » : résultat incertain. {s.explication}"})
    if not any(c.type == "perte_max" for c in contrat.clauses):
        manquantes.append({"code": "M4", "message": "Le contrat ne fixe pas de perte maximale acceptée."})
    conflits = contradictions.detecter(v, profil, contrat)
    return {"niveau": lvl, "regles": regles, "gravite": grav, "statuts": [s.model_dump() for s in statuts],
            "preuves": preuves + [p for k in conflits for p in k.get("preuves", [])],
            "conflits": [{k: x for k, x in c.items() if k != "preuves"} | {"preuves": [p.id for p in c.get("preuves", [])]}
                         for c in conflits],
            "informations_manquantes": manquantes, "controles": [{"code": c, "libelle": l} for c, l in CONTROLES]}
