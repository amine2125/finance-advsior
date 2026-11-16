"""The three reference personas of the brief (PDF p.5-7), as PRE-FILLED PROFILES and TEST CASES.

This is the only package allowed to contain persona names (test_engine_has_no_persona_names).
Capital, amounts and portfolios are NOT in the brief: they are fictitious, plausible values,
labelled as hypotheses and documented in docs/hypotheses.md.
"""
from __future__ import annotations

from ulysse.contract.defaults import Reponses, construire
from ulysse.contract.schema import Clause, Contrat, Profil

REPONSES = {
    "amira": Reponses(
        nom="Amira", age=26, experience="intermediaire", tolerance="eleve",
        description="Ingénieure logicielle, célibataire. Croissance à long terme ; IA, technos émergentes, crypto ; veut rester diversifiée.",
        objectifs=[{"libelle": "Faire croître mon capital à long terme", "horizon_annees": 15}],
        capital_cad=40_000, constitue_le="2025-01-02",
        allocation={"SPY": 0.28, "XIU.TO": 0.15, "NVDA": 0.08, "SHOP.TO": 0.07, "MSFT": 0.05, "GOOGL": 0.04,
                    "BTC-USD": 0.04, "ETH-USD": 0.01, "XBB.TO": 0.10, "GLD": 0.06, "CASH": 0.12},
        interet_crypto=True, interet_techno=True, limites={"techno_max": 45, "crypto_max": 10},
        notifications_min="attention"),
    "mateo": Reponses(
        nom="Mateo", age=41, experience="intermediaire", tolerance="modere",
        description="Gestionnaire des opérations, en couple, deux enfants. Croissance équilibrée ; ESG important ; peu de spéculatif.",
        objectifs=[{"libelle": "Études des enfants", "horizon_annees": 8, "part_pct": 35, "montant_cible_cad": 60_000},
                   {"libelle": "Croissance équilibrée", "horizon_annees": 12, "part_pct": 65}],
        capital_cad=180_000, constitue_le="2025-01-02",
        allocation={"ESGV": 0.25, "XIU.TO": 0.12, "XBB.TO": 0.22, "AGG": 0.05, "FTS.TO": 0.05, "CNR.TO": 0.05, "MSFT": 0.04,
                    "AAPL": 0.03, "JNJ": 0.04, "PG": 0.03, "GLD": 0.04, "CASH": 0.08},
        esg_important=True, eviter_controverses=True, interet_techno=True, limites={"speculatif_max": 5},
        notifications_min="attention"),
    "robert": Reponses(
        nom="Robert", age=59, experience="avance", tolerance="faible_modere",
        description="Professionnel de la santé, retraite dans 3 à 5 ans. Préserver le capital ; entreprises établies ; suit les marchés.",
        objectifs=[{"libelle": "Retraite", "horizon_annees": 3, "part_pct": 100}],
        capital_cad=650_000, constitue_le="2025-01-02",
        allocation={"XBB.TO": 0.30, "ZST.TO": 0.12, "XIU.TO": 0.13, "SPY": 0.08, "RY.TO": 0.05, "TD.TO": 0.04, "ENB.TO": 0.04,
                    "FTS.TO": 0.04, "JNJ": 0.04, "PG": 0.03, "GLD": 0.04, "CASH": 0.09},
        limites={"crypto_max": 0}, notifications_min="ok"),
}

PERSONA_IDS = list(REPONSES)
LISTES_SURVEILLANCE = {"amira": ["NVDA", "ETH-USD", "SHOP.TO"], "mateo": ["XOM", "ENB.TO", "ESGV"], "robert": ["TSLA", "NVDA", "RY.TO"]}


def persona(pid: str) -> tuple[Profil, Contrat]:
    return construire(REPONSES[pid], pid)


def all_personas() -> dict[str, tuple[Profil, Contrat]]:
    return {pid: persona(pid) for pid in PERSONA_IDS}
