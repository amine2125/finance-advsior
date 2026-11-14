"""Reference cases from the official datathon brief (fictional personas). NEVER auto-loaded: the app starts empty and
builds the profile from the user's own answers. These are only loaded when the user explicitly asks for a reference
case (POST /api/v1/reference-cases/{id}/load), e.g. to compare two contrasting investors in a demo, and in tests."""
from __future__ import annotations

from ..models import InvestorProfile, RiskBudget

TOLERANCE_NOTE = ("valeur de démonstration dérivée du profil de risque déclaré dans le cas officiel; "
                  "modifiable dans Paramètres")

REFERENCE_PERSONAS: list[InvestorProfile] = [
    InvestorProfile(
        persona_id="amira", display_name="Amira", age=26, risk_profile_label="Élevé",
        horizon_years_min=15, horizon_years_max=None, objective="Croissance du capital à long terme",
        preferences=["Technologies émergentes", "Entreprises liées à l'IA", "Possiblement des cryptoactifs",
                     "Accepte une volatilité importante", "Ne veut pas être investie uniquement en technologie"],
        stated_max_decline=0.40, stated_max_decline_provenance=TOLERANCE_NOTE,
        stable_income=True, emergency_reserve=True, liquidity_needs="low", dependants=False, experience="beginner",
        fictional_capital_cad=10000, benchmark_id="BLEND_GROWTH",
        budget=RiskBudget(growth_min=0.80, growth_max=0.95, max_single_issuer=0.15, max_single_sector=0.40,
                          max_speculative=0.10, drawdown_review=-0.30,
                          binding_constraint_note="Veut de la croissance, mais pas uniquement de la technologie"),
        watchlist=["NVDA", "BTC-USD", "ETH-USD"], is_official=True),
    InvestorProfile(
        persona_id="mateo", display_name="Mateo", age=41, risk_profile_label="Modéré",
        horizon_years_min=8, horizon_years_max=12, objective="Croissance équilibrée du capital",
        preferences=["Considérations ESG", "Éviter les controverses environnementales ou sociales importantes",
                     "Équilibre croissance/stabilité", "Intérêt limité pour la spéculation"],
        stated_max_decline=0.25, stated_max_decline_provenance=TOLERANCE_NOTE,
        stable_income=True, emergency_reserve=True, liquidity_needs="moderate", dependants=True, experience="intermediate",
        fictional_capital_cad=50000, esg_preference=True, benchmark_id="BLEND_ESG_BALANCED",
        budget=RiskBudget(growth_min=0.55, growth_max=0.70, max_single_issuer=0.10, max_single_sector=0.30,
                          max_speculative=0.05, drawdown_review=-0.20,
                          binding_constraint_note="Filtre ESG et équilibre"),
        watchlist=["ESGV", "XBB.TO"], is_official=True),
    InvestorProfile(
        persona_id="robert", display_name="Robert", age=59, risk_profile_label="Faible à modéré",
        horizon_years_min=3, horizon_years_max=5, objective="Préservation du capital avec un peu de croissance",
        preferences=["Stabilité", "Entreprises établies", "Placements compréhensibles", "Intérêt limité pour les cryptoactifs",
                     "Attiré par les titres très médiatisés"],
        stated_max_decline=0.18, stated_max_decline_provenance=TOLERANCE_NOTE,
        stable_income=True, emergency_reserve=True, liquidity_needs="moderate", dependants=False, experience="intermediate",
        fictional_capital_cad=100000, benchmark_id="BLEND_CONSERVATIVE",
        budget=RiskBudget(growth_min=0.30, growth_max=0.45, max_single_issuer=0.05, max_single_sector=0.25,
                          max_speculative=0.02, drawdown_review=-0.10,
                          binding_constraint_note="Horizon de 3 à 5 ans et préservation du capital"),
        watchlist=["BTC-USD", "NVDA", "TSLA"], is_official=True),
]

# Example fictional portfolios for the reference cases (official starter universe tickers only; CAD amounts are
# converted to simulated quantities at the dataset end date).
REFERENCE_PORTFOLIOS = {
    "robert": {"name": "Exemple – quatre placements « populaires »",
               "holdings": [{"asset_id": "NVDA", "amount_cad": 3000}, {"asset_id": "MSFT", "amount_cad": 2500},
                            {"asset_id": "QQQ", "amount_cad": 2500}, {"asset_id": "SPY", "amount_cad": 2000}]},
    "amira": {"name": "Exemple – portefeuille croissance",
              "holdings": [{"asset_id": "NVDA", "amount_cad": 2000}, {"asset_id": "MSFT", "amount_cad": 1500},
                           {"asset_id": "SHOP.TO", "amount_cad": 1000}, {"asset_id": "QQQ", "amount_cad": 2500},
                           {"asset_id": "XIU.TO", "amount_cad": 1500}, {"asset_id": "ESGV", "amount_cad": 800},
                           {"asset_id": "BTC-USD", "amount_cad": 700}]},
    "mateo": {"name": "Exemple – portefeuille équilibré",
              "holdings": [{"asset_id": "ESGV", "amount_cad": 3500}, {"asset_id": "XIU.TO", "amount_cad": 1500},
                           {"asset_id": "XBB.TO", "amount_cad": 2500}, {"asset_id": "AGG", "amount_cad": 1500},
                           {"asset_id": "FTS.TO", "amount_cad": 500}, {"asset_id": "CNR.TO", "amount_cad": 500}]},
}
