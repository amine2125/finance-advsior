"""« Connaître son client » : three measures, and the LOWEST sets the risk tolerance of the contract.

  tolérance      what the person is willing to risk (declared level, bearable decline), capped by what they say
                 they would actually DO in a fall (behaviour). A contradiction between the two is flagged.
  capacité       what their situation allows: horizon, emergency fund in months of expenses, high-interest debt,
                 debt-to-income, job stability, dependants, monthly margin, need for cash.
  connaissances  a three-question quiz plus the products already held: a beginner is not given the highest level
                 nor cryptoassets.

A documented heuristic inspired by « Connaître son client » questionnaires (IIROC/CIRO rule 3200), NOT a regulatory
suitability assessment (docs/hypotheses.md). Every rule that fired is returned. Age is never used. Persona-agnostic.
"""
from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, Field

NIVEAUX = ["faible", "faible_modere", "modere", "eleve"]
NIVEAU_FR = {"faible": "Faible", "faible_modere": "Faible à modéré", "modere": "Modéré", "eleve": "Élevé"}
CONNAISSANCES_FR = {0: "Débutant", 1: "Intermédiaire", 2: "Avancé"}
EXPERIENCE = {0: "debutant", 1: "intermediaire", 2: "avance"}

# Thresholds (hypotheses, docs/hypotheses.md § KYC)
BAISSE_SEUILS = [10, 20, 30]                       # bearable decline (%) -> level 0..3
HORIZON_SEUILS = [2, 5, 10]                        # nearest objective (years) -> capacity 0..3 (same cuts as the equity cap)
REACTION_PLAFOND = {"vendre_tout": 0, "vendre_partie": 1, "attendre": 3, "acheter_plus": 3}
RESSENTI_PLAFOND = {"stresse": 1, "mal_a_l_aise": 2, "serein": 3, "enthousiaste": 3}
REACTION_FR = {"vendre_tout": "je vendrais tout", "vendre_partie": "je vendrais une partie", "attendre": "j'attendrais",
               "acheter_plus": "j'en profiterais pour investir plus"}
RESSENTI_FR = {"stresse": "très stressé", "mal_a_l_aise": "mal à l'aise", "serein": "serein", "enthousiaste": "enthousiaste"}
EPARGNE_MOIS_MIN = 3
EPARGNE_MOIS_CRITIQUE = 1
EPARGNE_MOIS_COMPENSE = 6
DETTE_REVENU_ELEVE = 0.40
TAUX_CARTE_HYPOTHESE = 0.20
EMPLOIS_INSTABLES = ("contrat", "autonome", "etudiant", "sans_emploi")
QUIZ = {"quiz_diversification": "b", "quiz_obligations": "a", "quiz_inflation": "c"}
PLAFOND_DEBUTANT = 2                                # a beginner is capped at « modéré »


class Kyc(BaseModel):
    """Answers to the questionnaire (all optional except the behaviour question)."""
    baisse_max_pct: float = Field(gt=0, le=100)
    reaction_baisse: Literal["vendre_tout", "vendre_partie", "attendre", "acheter_plus"]
    ressenti: Literal["stresse", "mal_a_l_aise", "serein", "enthousiaste"] | None = None
    revenu_mensuel: float | None = Field(default=None, ge=0)
    depenses_mensuelles: float | None = Field(default=None, ge=0)
    epargne_cad: float | None = Field(default=None, ge=0)
    dette_carte_cad: float | None = Field(default=None, ge=0)
    autres_dettes_cad: float | None = Field(default=None, ge=0)
    emploi: Literal["permanent", "contrat", "autonome", "etudiant", "sans_emploi", "retraite"] | None = None
    personnes_a_charge: int | None = Field(default=None, ge=0, le=15)
    besoin_liquidites: Literal["faible", "modere", "eleve"] | None = None
    connaissances_declarees: Literal["aucune", "base", "bonnes", "expert"] | None = None
    quiz_diversification: str | None = None
    quiz_obligations: str | None = None
    quiz_inflation: str | None = None
    produits_detenus: list[Literal["epargne", "cpg", "fonds", "fnb", "actions", "crypto", "options"]] = Field(default_factory=list)


def _cad(x: float) -> str:
    return f"{x:,.0f} $".replace(",", " ")


def _tolerance(k: Kyc, declaree: str) -> tuple[int, list[str], dict]:
    lignes = []
    decl = NIVEAUX.index(declaree)
    baisse = sum(1 for s in BAISSE_SEUILS if k.baisse_max_pct > s)
    dit = int(math.floor((decl + baisse) / 2 + 0.5))
    lignes.append(f"Tolérance déclarée « {NIVEAU_FR[declaree]} » et baisse supportable de {k.baisse_max_pct:g} % "
                  f"→ « {NIVEAU_FR[NIVEAUX[dit]]} »")
    caps = [(REACTION_PLAFOND[k.reaction_baisse], REACTION_FR[k.reaction_baisse])]
    if k.ressenti:
        caps.append((RESSENTI_PLAFOND[k.ressenti], RESSENTI_FR[k.ressenti]))
    comportement, raison = min(caps)
    niveau = min(dit, comportement)
    if niveau < dit:
        lignes.append(f"Ce que tu ferais vraiment (« {raison} ») compte plus que ce que tu dis → « {NIVEAU_FR[NIVEAUX[niveau]]} »")
    contradiction = dit - comportement >= 2
    note = (f"Tes réponses se contredisent : tu dis accepter un risque « {NIVEAU_FR[NIVEAUX[dit]].lower()} », mais face à une baisse, "
            f"{raison}. La réponse la plus prudente est retenue.") if contradiction else None
    return niveau, lignes, {"dit": dit, "comportement": comportement, "contradiction": contradiction, "note": note}


def _capacite(k: Kyc, horizon: float) -> tuple[int, list[str], dict, list[dict]]:
    lignes: list[str] = []
    etapes: list[dict] = []
    cap = sum(1 for s in HORIZON_SEUILS if horizon >= s)
    if cap < 3:
        lignes.append(f"Objectif le plus proche dans {horizon:g} an(s) : l'argent ne doit pas risquer une forte baisse juste avant "
                      f"→ au plus « {NIVEAU_FR[NIVEAUX[cap]]} »")

    def baisser(raison: str, de: int = 1) -> None:
        nonlocal cap
        nouveau = max(0, cap - de)
        lignes.append(f"{raison} → « {NIVEAU_FR[NIVEAUX[nouveau]]} »" if nouveau < cap else raison)
        cap = nouveau

    dep, rev = k.depenses_mensuelles, k.revenu_mensuel
    mois = (k.epargne_cad / dep) if (k.epargne_cad is not None and dep) else None
    dettes = (k.dette_carte_cad or 0) + (k.autres_dettes_cad or 0)
    situation = {"mois_epargne": round(mois, 1) if mois is not None else None,
                 "marge_mensuelle": round(rev - dep, 2) if rev is not None and dep is not None else None,
                 "dettes_cad": round(dettes, 2), "dette_revenu": round(dettes / (rev * 12), 3) if rev else None}
    if mois is not None and mois < EPARGNE_MOIS_MIN:
        baisser(f"Épargne d'urgence : {mois:.1f} mois de dépenses", 2 if mois < EPARGNE_MOIS_CRITIQUE else 1)
        manque = max(0.0, EPARGNE_MOIS_MIN * dep - (k.epargne_cad or 0))
        etapes.append({"type": "urgence", "montant_cad": round(manque, -1), "titre": "Constituer un fonds d'urgence",
                       "texte": f"Garder au moins {EPARGNE_MOIS_MIN} mois de dépenses ({_cad(EPARGNE_MOIS_MIN * dep)}) disponibles. Il manque environ {_cad(manque)}."})
    if k.dette_carte_cad:
        baisser(f"Dette de carte de crédit : {_cad(k.dette_carte_cad)}")
        etapes.insert(0, {"type": "carte", "montant_cad": k.dette_carte_cad, "titre": "Rembourser la carte de crédit d'abord",
                          "texte": f"Hypothèse : environ {TAUX_CARTE_HYPOTHESE:.0%} d'intérêt par an. La rembourser rapporte ce taux à coup sûr, "
                                   "ce qu'aucun placement n'offre."})
    if rev and dettes / (rev * 12) > DETTE_REVENU_ELEVE:
        baisser(f"Dettes (hors hypothèque) de {dettes / (rev * 12):.0%} du revenu annuel")
    if k.emploi in EMPLOIS_INSTABLES:
        if mois is not None and mois >= EPARGNE_MOIS_COMPENSE:
            lignes.append(f"Revenu moins stable, compensé par {mois:.0f} mois d'épargne")
        else:
            baisser(f"Revenu moins stable sans {EPARGNE_MOIS_COMPENSE} mois d'épargne de côté")
    if k.personnes_a_charge and (mois is None or mois < EPARGNE_MOIS_COMPENSE):
        baisser(f"{k.personnes_a_charge} personne(s) à charge et moins de {EPARGNE_MOIS_COMPENSE} mois d'épargne")
    if rev is not None and dep is not None and rev - dep <= 0:
        baisser("Toutes les rentrées du mois sont dépensées")
        etapes.append({"type": "budget", "titre": "Dégager une marge dans le budget",
                       "texte": "Pour investir régulièrement, il faut d'abord qu'il reste de l'argent à la fin du mois."})
    if k.besoin_liquidites == "eleve":
        baisser("Cet argent pourrait servir rapidement")
    return cap, lignes, situation, etapes


def _connaissances(k: Kyc) -> tuple[int, dict]:
    reponses = {q: getattr(k, q) for q in QUIZ}
    bonnes = sum(1 for q, r in reponses.items() if r and r == QUIZ[q])
    p = set(k.produits_detenus)
    score = bonnes + (1 if p & {"fnb", "actions", "fonds"} else 0) + (1 if p & {"actions", "options", "crypto"} and len(p) >= 3 else 0)
    score += 1 if k.connaissances_declarees in ("bonnes", "expert") else -1 if k.connaissances_declarees == "aucune" else 0
    niveau = 0 if score <= 2 else 1 if score <= 4 else 2
    return niveau, {"quiz_bonnes": bonnes, "quiz_total": len(QUIZ)}


def evaluer(k: Kyc, tolerance_declaree: str, horizon_min: float, interet_crypto: bool) -> dict:
    """Returns the retained tolerance (lowest measure) and the full, displayable reasoning."""
    tol, tol_l, tol_info = _tolerance(k, tolerance_declaree)
    cap, cap_l, situation, etapes = _capacite(k, horizon_min)
    con, con_info = _connaissances(k)
    raisons = tol_l + cap_l
    niveau = min(tol, cap)
    if con == 0 and niveau > PLAFOND_DEBUTANT:
        raisons.append(f"Tu débutes en placement → plafonné à « {NIVEAU_FR[NIVEAUX[PLAFOND_DEBUTANT]]} » pour commencer")
        niveau = PLAFOND_DEBUTANT
    crypto = interet_crypto and con > 0
    if interet_crypto and not crypto:
        raisons.append("Cryptoactifs : pas tant que tu débutes (produits très volatils et complexes)")
    if niveau < min(tol, cap):
        mesure = "connaissances"
    else:
        mesure = "capacité" if cap < tol else "tolérance" if tol < cap else "tolérance et capacité"
    return {
        "version": 1, "tolerance_retenue": NIVEAUX[niveau], "niveau": NIVEAU_FR[NIVEAUX[niveau]], "mesure_determinante": mesure,
        "tolerance": {"niveau": NIVEAU_FR[NIVEAUX[tol]], "raisons": tol_l, **tol_info},
        "capacite": {"niveau": NIVEAU_FR[NIVEAUX[cap]], "raisons": cap_l, "situation": situation},
        "connaissances": {"niveau": CONNAISSANCES_FR[con], "experience": EXPERIENCE[con], **con_info},
        "crypto_permise": crypto, "avant_d_investir": etapes, "raisons": raisons,
        "ecart": (f"Tu es prêt à prendre plus de risque (« {NIVEAU_FR[NIVEAUX[tol]]} ») que ta situation ne le permet aujourd'hui "
                  f"(« {NIVEAU_FR[NIVEAUX[cap]]} »)." if tol > cap else None),
        "cadre": "Heuristique documentée inspirée des questionnaires « Connaître son client » (OCRI, règle 3200) ; "
                 "pas une évaluation réglementaire de convenance. L'âge n'est jamais utilisé.",
    }
