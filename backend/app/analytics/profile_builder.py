"""« Connaître son client » : turns the investor's own answers into an InvestorProfile with an explained, versioned risk budget.

Like a bank's KYC questionnaire, three things are measured separately, and the LOWEST wins:
  * tolérance  – what the person is willing to risk (stated answers), capped by what they say they would actually DO
                 when markets fall (revealed behaviour). A contradiction between the two is flagged, never ignored;
  * capacité   – what their situation allows: horizon, emergency fund in months of expenses, high-interest debt,
                 debt-to-income, job stability, dependants, monthly budget margin, need for cash;
  * connaissances – a 3-question quiz plus the products already held: a novice is not given the highest level or crypto.
The objective also caps the level (someone who wants to preserve capital is not given a growth budget).

Nothing here is a regulatory suitability assessment: the rules are a documented heuristic (METHODOLOGY["profile_builder"]),
and every rule that fired is returned in `derivation`. Age is stored for display only and NEVER used to infer tolerance.
"""
from __future__ import annotations

import math
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
FEELING_FR = {"anxious": "très stressé", "uneasy": "mal à l'aise", "ok": "serein", "excited": "enthousiaste"}
PAST_FR = {"sold": "vous avez vendu", "held": "vous avez attendu", "bought": "vous avez acheté plus"}
KNOW_FR = {0: "Débutant", 1: "Intermédiaire", 2: "Avancé"}


class OnboardingAnswers(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    age: int | None = Field(default=None, ge=16, le=110)
    # objective and horizon
    objective: Literal["preserve", "income", "balanced", "growth"]
    horizon_years: float = Field(gt=0, le=60)
    liquidity_needs: Literal["low", "moderate", "high"] | None = None
    # tolerance (stated)
    max_decline: float = Field(gt=0, le=1, description="Baisse temporaire que la personne dit pouvoir traverser")
    portfolio_choice: Literal["A", "B", "C", "D"] | None = None
    gamble: Literal["sure", "small_risk", "big_risk"] | None = None
    # tolerance (behaviour)
    drop_reaction: Literal["sell_all", "sell_some", "hold", "buy_more"]
    volatility_feeling: Literal["anxious", "uneasy", "ok", "excited"] | None = None
    past_behavior: Literal["sold", "held", "bought", "none"] | None = None
    # situation
    household: Literal["single", "couple", "couple_kids", "single_parent"] | None = None
    dependants_count: int | None = Field(default=None, ge=0, le=15)
    employment: Literal["permanent", "contract", "self_employed", "student", "unemployed", "retired"] | None = None
    income_outlook: Literal["up", "stable", "down", "uncertain"] | None = None
    # finances (monthly, after tax; balances in CAD)
    income_net_monthly: float | None = Field(default=None, ge=0, le=1_000_000)
    expenses_monthly: float | None = Field(default=None, ge=0, le=1_000_000)
    savings_cad: float | None = Field(default=None, ge=0, le=100_000_000)
    investments_cad: float | None = Field(default=None, ge=0, le=100_000_000)
    credit_card_debt_cad: float | None = Field(default=None, ge=0, le=10_000_000)
    other_debt_cad: float | None = Field(default=None, ge=0, le=100_000_000)
    home_owner: bool | None = None
    # knowledge and experience
    knowledge_self: Literal["none", "basic", "good", "expert"] | None = None
    quiz_diversification: str | None = None
    quiz_bonds: str | None = None
    quiz_inflation: str | None = None
    products_held: list[Literal["savings", "gic", "mutual_funds", "etf", "stocks", "crypto", "options"]] = []
    # legacy short-form fields (still accepted)
    stable_income: bool | None = None
    emergency_reserve: bool | None = None
    dependants: bool | None = None
    experience: Literal["none", "beginner", "intermediate", "advanced"] | None = None
    # preferences
    crypto_interest: Literal["no", "maybe", "yes"] = "no"
    esg_preference: bool = False
    excluded_sectors: list[str] = []
    interests: list[str] = []
    capital_cad: float | None = Field(default=None, ge=0, le=100_000_000)


def _slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return (s or "profil")[:30]


def _cad(x: float) -> str:
    return f"{x:,.0f} $".replace(",", " ")


def _half_up(x: float) -> int:
    return int(math.floor(x + 0.5))


def _tolerance(a: OnboardingAnswers, cfg: dict, k: dict) -> tuple[int, list[str], dict]:
    lines: list[str] = []
    decl = 0
    for i, cut in enumerate(cfg["decline_cutoffs"]):
        if a.max_decline > cut:
            decl = i + 1
    stated = [decl]
    lines.append(f"Baisse que vous dites pouvoir traverser : {a.max_decline:.0%} → « {LEVEL_FR[LEVELS[decl]]} »")
    if a.portfolio_choice:
        stated.append(k["portfolio_choice"][a.portfolio_choice])
        lines.append(f"Portefeuille préféré parmi quatre : {a.portfolio_choice}")
    if a.gamble:
        stated.append(k["gamble"][a.gamble])
    stated_level = min(3, _half_up(sum(stated) / len(stated)))

    caps = {"drop_reaction": (a.drop_reaction, REACTION_FR)}
    if a.volatility_feeling:
        caps["volatility_feeling"] = (a.volatility_feeling, FEELING_FR)
    if a.past_behavior and a.past_behavior != "none":
        caps["past_behavior"] = (a.past_behavior, PAST_FR)
    behaviour = 3
    binding = None
    for key, (val, fr) in caps.items():
        c = k["behaviour_cap"][key][val]
        if c < behaviour:
            behaviour, binding = c, fr[val]
    level = min(stated_level, behaviour)
    inconsistent = stated_level - behaviour >= k["inconsistency_gap"]
    if level < stated_level:
        lines.append(f"Ce que vous feriez vraiment (« {binding} ») compte plus que ce que vous dites → « {LEVEL_FR[LEVELS[level]]} »")
    note = None
    if inconsistent:
        note = (f"Vos réponses se contredisent : vous dites accepter un risque « {LEVEL_FR[LEVELS[stated_level]].lower()} », "
                f"mais face à une baisse, {binding}. Je retiens la réponse la plus prudente.")
    return level, lines, {"stated": stated_level, "behaviour": behaviour, "inconsistent": inconsistent, "note": note}


def _capacity(a: OnboardingAnswers, cfg: dict, k: dict) -> tuple[int, list[str], dict, list[dict]]:
    lines: list[str] = []
    steps: list[dict] = []
    cap = 3
    hz = 0
    for i, cut in enumerate(cfg["horizon_cutoffs_years"]):
        if a.horizon_years >= cut:
            hz = i + 1
    if hz < cap:
        yrs = f"{a.horizon_years:g} an{'s' if a.horizon_years >= 2 else ''}"
        lines.append(f"Horizon de {yrs} : l'argent ne doit pas risquer une forte baisse juste avant → au plus « {LEVEL_FR[LEVELS[hz]]} »")
        cap = hz

    snap: dict = {}
    exp, inc = a.expenses_monthly, a.income_net_monthly
    months = None
    if a.savings_cad is not None and exp:
        months = a.savings_cad / exp
        snap["emergency_months"] = round(months, 1)
    if inc is not None and exp is not None:
        snap["monthly_margin"] = round(inc - exp, 2)
    debt = (a.credit_card_debt_cad or 0) + (a.other_debt_cad or 0)
    if inc:
        snap["debt_to_income"] = round(debt / (inc * 12), 3) if inc else None
    if any(v is not None for v in (a.savings_cad, a.investments_cad, a.credit_card_debt_cad, a.other_debt_cad)):
        snap["net_worth_excl_home"] = round((a.savings_cad or 0) + (a.investments_cad or 0) - debt, 2)
    snap["debts_cad"] = round(debt, 2)

    def lower(reason: str, by: int = 1) -> None:
        nonlocal cap
        new = max(0, cap - by)
        if new < cap:
            lines.append(f"{reason} → « {LEVEL_FR[LEVELS[new]]} »")
        else:
            lines.append(reason)
        cap = new

    # emergency fund
    low_reserve = (months is not None and months < k["emergency_months_low"]) or (months is None and a.emergency_reserve is False)
    if low_reserve:
        crit = months is not None and months < k["emergency_months_critical"]
        lower(f"Épargne d'urgence : {months:.1f} mois de dépenses" if months is not None else "Pas d'épargne d'urgence", 2 if crit else 1)
        if exp:
            need = max(0.0, k["emergency_months_low"] * exp - (a.savings_cad or 0))
            steps.append({"kind": "emergency", "amount_cad": round(need, -1),
                          "title": "Constituez votre fonds d'urgence",
                          "text": f"Gardez au moins 3 mois de dépenses ({_cad(3 * exp)}) dans un compte disponible. Il vous manque environ {_cad(need)}."})
        else:
            steps.append({"kind": "emergency", "title": "Constituez votre fonds d'urgence", "text": "Gardez 3 à 6 mois de dépenses dans un compte disponible avant d'investir en bourse."})
    # high-interest debt
    if a.credit_card_debt_cad and a.credit_card_debt_cad > 0:
        lower(f"Dette de carte de crédit non remboursée : {_cad(a.credit_card_debt_cad)}")
        steps.insert(0, {"kind": "credit_card", "amount_cad": a.credit_card_debt_cad, "title": "Remboursez d'abord votre carte de crédit",
                         "text": f"Elle vous coûte environ {k['credit_card_rate_assumption']:.0%} d'intérêt par année. La rembourser, c'est un « rendement » garanti qu'aucun placement n'offre."})
    if inc and debt / (inc * 12) > k["debt_to_income_high"]:
        lower(f"Dettes (hors hypothèque) de {debt / (inc * 12):.0%} de votre revenu annuel")
    # income stability
    unstable = (a.employment in k["unstable_employment"]) if a.employment else (a.stable_income is False)
    if unstable or a.income_outlook in ("down", "uncertain"):
        if months is not None and months >= k["unstable_offset_months"]:
            lines.append(f"Revenu instable ou incertain, mais compensé par {months:.0f} mois d'épargne de côté")
        else:
            lower("Revenu instable ou incertain, sans au moins 6 mois d'épargne de côté")
    # dependants
    deps = a.dependants_count if a.dependants_count is not None else (1 if a.dependants else 0)
    if deps and months is not None and months < k["dependants_savings_months"]:
        lower(f"{deps} personne(s) à charge et moins de {k['dependants_savings_months']} mois d'épargne")
    # budget margin
    if inc is not None and exp is not None and inc - exp <= 0:
        lower("Vous dépensez tout ce que vous gagnez chaque mois")
        steps.append({"kind": "budget", "title": "Dégagez une marge dans votre budget",
                      "text": "Pour investir régulièrement, il faut d'abord qu'il reste de l'argent à la fin du mois. Même 50 $ par mois, c'est un début."})
    if a.liquidity_needs == "high":
        lower("Vous pourriez avoir besoin de cet argent rapidement")
    return cap, lines, snap, steps


def _knowledge(a: OnboardingAnswers, k: dict) -> tuple[int | None, dict]:
    quiz = {q: getattr(a, q) for q in k["quiz_answers"]}
    answered = [q for q, v in quiz.items() if v]
    if not answered and not a.products_held and not a.knowledge_self and not a.experience:
        return None, {}
    correct = sum(1 for q in answered if quiz[q] == k["quiz_answers"][q])
    held = set(a.products_held)
    score = correct
    if held & {"etf", "stocks", "mutual_funds"}:
        score += 1
    if held & {"stocks", "options", "crypto"} and len(held) >= 3:
        score += 1
    if a.knowledge_self in ("good", "expert") or a.experience in ("intermediate", "advanced"):
        score += 1
    if a.knowledge_self == "none" or a.experience == "none":
        score -= 1
    level = 0 if score <= 2 else 1 if score <= 4 else 2
    return level, {"quiz_correct": correct, "quiz_total": len(k["quiz_answers"]), "quiz_answered": len(answered)}


def build_profile(a: OnboardingAnswers, persona_id: str | None = None) -> tuple[InvestorProfile, list[str]]:
    cfg = METHODOLOGY["profile_builder"]
    k = cfg["kyc"]
    derivation: list[str] = []

    tol, tol_lines, tol_info = _tolerance(a, cfg, k)
    cap, cap_lines, snap, steps = _capacity(a, cfg, k)
    know, know_info = _knowledge(a, k)
    derivation += tol_lines + cap_lines

    level_i = min(tol, cap)
    obj_cap = cfg["objective_cap"][a.objective]
    if level_i > obj_cap:
        derivation.append(f"Objectif « {OBJECTIVE_FR[a.objective]} » → plafonné à « {LEVEL_FR[LEVELS[obj_cap]]} »")
        level_i = obj_cap
    if know == 0 and level_i > k["novice_cap"]:
        derivation.append(f"Vous débutez en placement → plafonné à « {LEVEL_FR[LEVELS[k['novice_cap']]]} » pour commencer")
        level_i = k["novice_cap"]

    level = LEVELS[level_i]
    b = cfg["budgets"][level]
    spec = b["max_speculative"] if a.crypto_interest != "no" and know != 0 else 0.0
    if a.crypto_interest == "no" and b["max_speculative"] > 0:
        derivation.append("Aucun intérêt pour les cryptoactifs → poche spéculative fixée à 0 %")
    elif know == 0 and a.crypto_interest != "no" and b["max_speculative"] > 0:
        derivation.append("Cryptoactifs : pas tant que vous débutez (produits très volatils et complexes)")
    benchmark = "BLEND_ESG_BALANCED" if a.esg_preference else cfg["benchmark"][level]
    budget = RiskBudget(growth_min=b["growth_min"], growth_max=b["growth_max"], max_single_issuer=b["max_single_issuer"],
                        max_single_sector=b["max_single_sector"], max_speculative=spec, drawdown_review=b["drawdown_review"],
                        binding_constraint_note="; ".join(derivation[-2:]))
    derivation.append(f"Limites de démonstration du niveau « {LEVEL_FR[level]} » (heuristique versionnée, pas une règle réglementaire)")

    if level_i < min(tol, cap):
        binding = "connaissances" if know == 0 and level_i == k["novice_cap"] and obj_cap > level_i else "objectif"
    else:
        binding = "capacité" if cap < tol else "tolérance" if tol < cap else "tolérance et capacité"
    caps_lines = [d for d in derivation if d.startswith(("Objectif", "Vous débutez"))]
    first_cap_reason = next((l for l in cap_lines if "→" in l), None)
    kyc = {
        "version": k["version"], "level": LEVEL_FR[level],
        "tolerance": {"level": LEVEL_FR[LEVELS[tol]], "index": tol, "reasons": tol_lines, **tol_info},
        "capacity": {"level": LEVEL_FR[LEVELS[cap]], "index": cap, "reasons": cap_lines},
        "other_caps": caps_lines,
        "knowledge": {"level": KNOW_FR[know] if know is not None else None, "index": know, **know_info},
        "binding": binding, "snapshot": snap, "before_investing": steps,
        "gap_note": ((f"Vous êtes prêt à prendre plus de risque (« {LEVEL_FR[LEVELS[tol]]} ») que votre situation ne le permet aujourd'hui "
                      f"(« {LEVEL_FR[LEVELS[cap]]} »). "
                      + ("Elle remontera quand les étapes ci-dessous seront faites." if steps else
                         f"Ce qui limite : {first_cap_reason.split(' →')[0].lower()}." if first_cap_reason else ""))
                     if tol > cap else None),
    }

    prefs = list(a.interests)
    if a.esg_preference:
        prefs.append("Préférences ESG")
    if a.crypto_interest == "yes":
        prefs.append("Intéressé(e) par les cryptoactifs")
    elif a.crypto_interest == "no":
        prefs.append("Peu d'intérêt pour les cryptoactifs")
    months = snap.get("emergency_months")
    profile = InvestorProfile(
        persona_id=persona_id or _slug(a.display_name), display_name=a.display_name.strip(), age=a.age,
        risk_profile_label=LEVEL_FR[level], horizon_years_min=a.horizon_years, objective=OBJECTIVE_FR[a.objective],
        preferences=prefs, stated_max_decline=a.max_decline, stated_max_decline_provenance="user_input",
        stable_income=(a.employment in ("permanent", "retired")) if a.employment else a.stable_income,
        emergency_reserve=(months >= k["emergency_months_low"]) if months is not None else a.emergency_reserve,
        liquidity_needs=a.liquidity_needs,
        dependants=(a.dependants_count > 0) if a.dependants_count is not None else a.dependants,
        experience=a.experience or ({0: "beginner", 1: "intermediate", 2: "advanced"}[know] if know is not None else None),
        fictional_capital_cad=a.capital_cad, esg_preference=a.esg_preference, excluded_sectors=a.excluded_sectors,
        benchmark_id=benchmark, budget=budget, kyc=kyc, is_official=False)
    return profile, derivation
