"""Onboarding: turns the investor's own answers into an InvestorProfile with an explained, versioned risk budget.

Nothing here is a regulatory suitability assessment. The mapping is a documented demonstration heuristic
(METHODOLOGY["profile_builder"]); every rule that fired is returned in `derivation` so the user sees why.
Age is stored for display only and is NEVER used to infer loss tolerance.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, Field

from ..methodology import METHODOLOGY
from ..models import InvestorProfile, RiskBudget

LEVELS = ["prudent", "low_moderate", "moderate", "high"]
LEVEL_FR = {"prudent": "Prudent", "low_moderate": "Faible à modéré", "moderate": "Modéré", "high": "Élevé"}
OBJECTIVE_FR = {"preserve": "Préserver mon capital", "income": "Préserver avec un peu de croissance",
                "balanced": "Croissance équilibrée", "growth": "Croissance à long terme"}
REACTION_FR = {"sell_all": "je vendrais tout", "sell_some": "je vendrais une partie", "hold": "j'attendrais",
               "buy_more": "j'en profiterais pour investir plus"}


class OnboardingAnswers(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    age: int | None = Field(default=None, ge=16, le=110)
    objective: Literal["preserve", "income", "balanced", "growth"]
    horizon_years: float = Field(gt=0, le=60)
    max_decline: float = Field(gt=0, le=1, description="Baisse temporaire que la personne dit pouvoir traverser")
    drop_reaction: Literal["sell_all", "sell_some", "hold", "buy_more"]
    stable_income: bool | None = None
    emergency_reserve: bool | None = None
    liquidity_needs: Literal["low", "moderate", "high"] | None = None
    dependants: bool | None = None
    experience: Literal["none", "beginner", "intermediate", "advanced"] | None = None
    crypto_interest: Literal["no", "maybe", "yes"] = "no"
    esg_preference: bool = False
    excluded_sectors: list[str] = []
    interests: list[str] = []
    capital_cad: float | None = Field(default=None, ge=0, le=100_000_000)


def _slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return (s or "profil")[:30]


def build_profile(a: OnboardingAnswers, persona_id: str | None = None) -> tuple[InvestorProfile, list[str]]:
    cfg = METHODOLOGY["profile_builder"]
    derivation: list[str] = []

    # 1. Stated tolerance: the declared bearable decline, moderated by the stated reaction to a fall.
    tol = 0
    for i, cut in enumerate(cfg["decline_cutoffs"]):
        if a.max_decline > cut:
            tol = i + 1
    derivation.append(f"Baisse que vous dites pouvoir traverser : {a.max_decline:.0%} → niveau « {LEVEL_FR[LEVELS[tol]]} »")
    adj = cfg["reaction_adjustment"][a.drop_reaction]
    if adj:
        new = max(0, min(3, tol + adj))
        derivation.append(f"Réaction à une baisse de 20 % : « {REACTION_FR[a.drop_reaction]} » → "
                          f"{'abaissé' if adj < 0 else 'relevé'} à « {LEVEL_FR[LEVELS[new]]} »")
        tol = new

    # 2. Objective caps the level (someone who wants to preserve capital is not given a growth budget).
    cap = cfg["objective_cap"][a.objective]
    if tol > cap:
        derivation.append(f"Objectif « {OBJECTIVE_FR[a.objective]} » → plafonné à « {LEVEL_FR[LEVELS[cap]]} »")
        tol = cap

    # 3. Horizon caps the level (money needed soon cannot ride out a deep fall).
    hz = 0
    for i, cut in enumerate(cfg["horizon_cutoffs_years"]):
        if a.horizon_years >= cut:
            hz = i + 1
    if tol > hz:
        derivation.append(f"Horizon de {a.horizon_years:g} ans → plafonné à « {LEVEL_FR[LEVELS[hz]]} »")
        tol = hz

    # 4. Capacity: no emergency reserve or high liquidity needs lower the level by one.
    if a.emergency_reserve is False or a.liquidity_needs == "high":
        new = max(0, tol - 1)
        if new != tol:
            derivation.append("Pas de réserve d'urgence ou besoin de liquidités élevé → un cran plus prudent")
        tol = new

    level = LEVELS[tol]
    b = cfg["budgets"][level]
    spec = b["max_speculative"] if a.crypto_interest != "no" else 0.0
    if a.crypto_interest == "no" and b["max_speculative"] > 0:
        derivation.append("Aucun intérêt pour les cryptoactifs → poche spéculative fixée à 0 %")
    benchmark = "BLEND_ESG_BALANCED" if a.esg_preference else cfg["benchmark"][level]
    budget = RiskBudget(growth_min=b["growth_min"], growth_max=b["growth_max"], max_single_issuer=b["max_single_issuer"],
                        max_single_sector=b["max_single_sector"], max_speculative=spec, drawdown_review=b["drawdown_review"],
                        binding_constraint_note="; ".join(derivation[-2:]))
    derivation.append(f"Limites de démonstration du niveau « {LEVEL_FR[level]} » (heuristique versionnée, pas une règle réglementaire)")

    prefs = list(a.interests)
    if a.esg_preference:
        prefs.append("Préférences ESG")
    if a.crypto_interest == "yes":
        prefs.append("Intéressé(e) par les cryptoactifs")
    elif a.crypto_interest == "no":
        prefs.append("Peu d'intérêt pour les cryptoactifs")
    profile = InvestorProfile(
        persona_id=persona_id or _slug(a.display_name), display_name=a.display_name.strip(), age=a.age,
        risk_profile_label=LEVEL_FR[level], horizon_years_min=a.horizon_years, objective=OBJECTIVE_FR[a.objective],
        preferences=prefs, stated_max_decline=a.max_decline, stated_max_decline_provenance="user_input",
        stable_income=a.stable_income, emergency_reserve=a.emergency_reserve, liquidity_needs=a.liquidity_needs,
        dependants=a.dependants, experience=a.experience, fictional_capital_cad=a.capital_cad,
        esg_preference=a.esg_preference, excluded_sectors=a.excluded_sectors, benchmark_id=benchmark, budget=budget,
        is_official=False)
    return profile, derivation
