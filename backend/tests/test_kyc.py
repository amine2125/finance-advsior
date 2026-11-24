"""« Connaître son client »: the lowest of tolerance, capacity and knowledge sets the contract; every rule is explained."""
from ulysse.contract.defaults import Reponses, construire
from ulysse.contract.kyc import Kyc, evaluer

SOLIDE = dict(baisse_max_pct=35, reaction_baisse="acheter_plus", ressenti="serein", revenu_mensuel=7000, depenses_mensuelles=4000,
              epargne_cad=40000, emploi="permanent", connaissances_declarees="bonnes", quiz_diversification="b", quiz_obligations="a",
              quiz_inflation="c", produits_detenus=["fnb", "actions", "crypto"])


def _rep(kyc: dict | None, tolerance="eleve", horizon=15, crypto=True):
    return Reponses(nom="Test", tolerance=tolerance, objectifs=[{"libelle": "x", "horizon_annees": horizon}], capital_cad=50000,
                    interet_crypto=crypto, kyc=Kyc(**kyc) if kyc else None)


def test_solid_situation_keeps_the_declared_level():
    r = evaluer(Kyc(**SOLIDE), "eleve", 15, True)
    assert r["tolerance_retenue"] == "eleve" and r["crypto_permise"] and not r["avant_d_investir"]


def test_behaviour_beats_words_and_the_contradiction_is_flagged():
    r = evaluer(Kyc(**{**SOLIDE, "reaction_baisse": "vendre_tout"}), "eleve", 15, True)
    assert r["tolerance_retenue"] == "faible" and r["tolerance"]["contradiction"] and r["tolerance"]["note"]


def test_capacity_limits_without_emergency_fund_and_with_card_debt():
    r = evaluer(Kyc(**{**SOLIDE, "epargne_cad": 2000, "dette_carte_cad": 3000}), "eleve", 15, True)
    assert r["mesure_determinante"] == "capacité" and NIVEAU(r) < 3
    assert [e["type"] for e in r["avant_d_investir"]][:2] == ["carte", "urgence"] and r["ecart"]


def test_short_horizon_caps_capacity():
    r = evaluer(Kyc(**SOLIDE), "eleve", 1.5, False)
    assert r["tolerance_retenue"] == "faible"


def test_beginner_is_capped_and_gets_no_crypto():
    r = evaluer(Kyc(**{**SOLIDE, "connaissances_declarees": "aucune", "quiz_diversification": "a", "quiz_obligations": "b",
                       "quiz_inflation": "a", "produits_detenus": []}), "eleve", 15, True)
    assert r["tolerance_retenue"] == "modere" and not r["crypto_permise"] and r["connaissances"]["experience"] == "debutant"


def test_contract_follows_the_retained_level_and_says_why():
    prof, con = construire(_rep({**SOLIDE, "epargne_cad": 2000}), "p-test")
    assert prof.tolerance != "eleve" and prof.kyc["mesure_determinante"] == "capacité"
    assert any("Connaître son client" in (c.justification or "") for c in con.clauses)


def test_without_questionnaire_nothing_changes():
    prof, _ = construire(_rep(None), "p-test")
    assert prof.tolerance == "eleve" and prof.kyc is None


def NIVEAU(r):
    return ["faible", "faible_modere", "modere", "eleve"].index(r["tolerance_retenue"])
