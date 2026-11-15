"""Phase 4: verifier, orchestrator (traces, named defect loop, fallbacks), planner validation, Vigie, API."""
import json
import os
import time

import pytest

from ulysse import verifier
from ulysse.evidence import evidence


def _ev(v=37.26, unite="%", mesure="volatilite_annualisee"):
    return evidence(mesure=mesure, libelle="x", sujet="T", valeur=v, unite=unite, as_of="2026-11-14",
                    date_de_calcul="2026-11-12", donnees_source=["S1"], methode="m")


def _red(*phrases, sections=("donnees", "constats", "analyse", "options", "explication")):
    secs = [{"etape": s, "phrases": []} for s in sections]
    secs[1]["phrases"] = list(phrases)
    return {"sections": secs}


def test_verifier_accepts_numbers_within_rounding():
    e = _ev(37.26)
    assert verifier.verifier(_red({"texte": "La volatilité est de 37,3 %.", "etiquette": "MESURE", "preuves": [e.id]}), {e.id: e}) == []


def test_verifier_rejects_number_without_evidence_and_names_it():
    e = _ev(37.26)
    d = verifier.verifier(_red({"texte": "La volatilité est de 37,4 %.", "etiquette": "MESURE", "preuves": [e.id]}), {e.id: e})
    assert len(d) == 1 and d[0].startswith("V3 CHIFFRE_SANS_PREUVE") and "37,4" in d[0] and "37.26" in d[0]


def test_verifier_rounded_amounts():
    e = _ev({"perte_cad": -222312.4}, unite="$", mesure="pire_episode_historique")
    ok = verifier.verifier(_red({"texte": "Environ 222 300 $.", "etiquette": "MESURE", "preuves": [e.id]}), {e.id: e})
    bad = verifier.verifier(_red({"texte": "Environ 230 000 $.", "etiquette": "MESURE", "preuves": [e.id]}), {e.id: e})
    assert ok == [] and bad and bad[0].startswith("V3")


@pytest.mark.parametrize("phrase,code", [
    ({"texte": "Sans étiquette.", "etiquette": "AUTRE", "preuves": ["X"]}, "V1"),
    ({"texte": "Sans preuve.", "etiquette": "MESURE", "preuves": []}, "V2"),
    ({"texte": "Preuve inconnue.", "etiquette": "MESURE", "preuves": ["ev-inconnue"]}, "V2"),
    ({"texte": "Tu devrais en profiter, c'est une bonne affaire.", "etiquette": "MESURE", "preuves": ["X"]}, "V4"),
    ({"texte": "Ce titre va monter.", "etiquette": "MESURE", "preuves": ["X"]}, "V4"),
])
def test_verifier_named_defects(phrase, code):
    e = _ev()
    phrase = {**phrase, "preuves": [e.id if p == "X" else p for p in phrase["preuves"]]}
    d = verifier.verifier(_red(phrase), {e.id: e})
    assert any(x.startswith(code) for x in d)


def test_verifier_requires_the_five_steps():
    e = _ev()
    d = verifier.verifier(_red({"texte": "ok", "etiquette": "MESURE", "preuves": [e.id]}, sections=("donnees", "constats")), {e.id: e})
    assert any(x.startswith("V5") for x in d)


# ------------------------------------------------------------------ orchestrator (real data, mock LLM)

@pytest.fixture()
def store(tmp_path):
    from ulysse import demo
    from ulysse.store import LocalStore, set_store
    st = LocalStore(tmp_path / "state")
    set_store(st)
    demo.reset(st)
    return st


def _run(store, llm, pid="robert", it=None, as_of="2026-11-14"):
    from ulysse import orchestrator
    it = it or {"type": "ordre", "ticker": "TSLA", "montant_cad": 160000}
    return orchestrator.executer(store, orchestrator.creer(store, pid, it, as_of), llm)


@pytest.mark.datapack
def test_dossier_trace_is_complete_and_proved(store):
    from ulysse.llm import MockLLM
    d = _run(store, MockLLM())
    assert d["etat"] == "termine"
    steps = {e["etape"]: e for e in d["etapes"]}
    assert all(steps[s]["statut"] in ("termine",) for s in ("contexte", "planification", "outils", "gouvernance", "signal", "publication"))
    outils = steps["outils"]["details"]["appels"]
    assert outils and all(o["statut"] in ("ok", "partiel") and o["preuves"] for o in outils)
    for sec in d["redaction"]["sections"]:
        for ph in sec["phrases"]:
            assert ph["preuves"] and all(p in d["preuves"] for p in ph["preuves"])
    assert d["essais_verification"][-1]["resultat"] == "accepte"


@pytest.mark.datapack
def test_demo6_named_defect_is_corrected(store):
    from ulysse.llm import MockLLM
    d = _run(store, MockLLM(defaut_injecte="chiffre"))
    e1, e2 = d["essais_verification"][0], d["essais_verification"][1]
    assert e1["resultat"] == "rejete" and e1["defauts_nommes"][0].startswith("V3 CHIFFRE_SANS_PREUVE")
    assert e2["resultat"] == "accepte" and d["redaction"]["redige_par"] == "llm_simule"


@pytest.mark.datapack
def test_llm_failure_falls_back_to_template(store):
    from ulysse.llm import LLMError, MockLLM

    class Down(MockLLM):
        name = "en_panne"

        def planifier(self, *a, **k):
            raise LLMError("indisponible")

        def rediger(self, *a, **k):
            raise LLMError("indisponible")
    d = _run(store, Down())
    assert d["etat"] == "termine" and d["redaction"]["redige_par"] == "gabarit"
    assert d["essais_verification"][-1]["essai"] == "gabarit" and d["essais_verification"][-1]["resultat"] == "accepte"
    plan = next(e for e in d["etapes"] if e["etape"] == "planification")["details"]
    assert plan["planifie_par"] == "repli_code" and plan["rejets"]


@pytest.mark.datapack
def test_planner_cannot_invent_tools(store):
    from ulysse.llm import Appel, MockLLM, Param, Plan

    class Rogue(MockLLM):
        def planifier(self, contexte, catalogue):
            return Plan(appels=[Appel(outil="predire_prix"), Appel(outil="cvar", parametres=[Param(nom="horizon", valeur="999")]),
                                Appel(outil="regime")]), {"modele": "x", "jetons_entree": 0, "jetons_sortie": 0}
    d = _run(store, Rogue())
    plan = next(e for e in d["etapes"] if e["etape"] == "planification")["details"]
    assert "regime" in plan["modules_ajoutes"] and "predire_prix" not in plan["modules_ajoutes"]
    assert any("predire_prix" in r for r in plan["rejets"]) and any("999" in r for r in plan["rejets"])


@pytest.mark.datapack
def test_every_number_of_every_dossier_has_a_proof(store):
    """Sweep: 3 personas x several intentions x 2 dates; the published text always passes the verifier."""
    from ulysse.llm import MockLLM
    cases = [("robert", {"type": "ordre", "ticker": "TSLA", "montant_cad": 160000}, "2021-12-15"),
             ("mateo", {"type": "ordre", "ticker": "ENB.TO", "montant_cad": 5000}, "2026-11-14"),
             ("mateo", {"type": "titre", "ticker": "XOM"}, "2026-11-14"),
             ("amira", {"type": "portefeuille"}, "2026-11-14"),
             ("amira", {"type": "ordre", "ticker": "BTC-USD", "montant_cad": 2000}, "2026-11-14")]
    for pid, it, day in cases:
        d = _run(store, MockLLM(), pid, it, day)
        assert d["essais_verification"][-1]["resultat"] == "accepte", (pid, it, d["essais_verification"])


# ------------------------------------------------------------------ Vigie

@pytest.mark.datapack
def test_vigie_precomputes_and_does_not_repeat(store):
    from ulysse import vigie
    r1 = vigie.executer("2026-11-14", store=store)
    n1 = {p: len(store.get("notifications", p, [])) for p in ("amira", "mateo", "robert")}
    r2 = vigie.executer("2026-11-14", store=store)
    n2 = {p: len(store.get("notifications", p, [])) for p in ("amira", "mateo", "robert")}
    assert n1 == n2 and all(x["notifications_creees"] == 0 for x in r2["profils"].values())
    assert len(store.get("signal_packs", "robert@2026-11-14")["titres"]) == 31
    assert r1["profils"]["amira"]["notifications_creees"] >= 1      # NVDA unusual attention, held


@pytest.mark.datapack
def test_vigie_replays_a_past_date(store):
    from ulysse import vigie
    vigie.executer("2021-12-15", ["robert"], store=store)
    pack = store.get("signal_packs", "robert@2021-12-15")["titres"]
    assert "ESGV" in pack and pack["TSLA"]["niveau"] in ("attention", "pause")   # 5 % reference position


# ------------------------------------------------------------------ API and Lambda adapter

@pytest.mark.datapack
def test_api_and_lambda_share_the_router(store, monkeypatch):
    monkeypatch.setenv("ULYSSE_RUNNER", "sync")
    from ulysse.api.routes import handle
    from ulysse.lambda_handler import handler
    status, direct = handle("POST", "/api/ordres/verifier", {}, {"profil": "robert", "ticker": "TSLA", "montant_cad": 160000, "options": False})
    ev = {"requestContext": {"http": {"method": "POST"}}, "rawPath": "/api/ordres/verifier",
          "body": json.dumps({"profil": "robert", "ticker": "TSLA", "montant_cad": 160000, "options": False})}
    out = handler(ev, None)
    via = json.loads(out["body"])
    assert status == 200 and out["statusCode"] == 200 and via["niveau"] == direct["niveau"] == "pause"
    assert handler({"requestContext": {"http": {"method": "GET"}}, "rawPath": "/api/marche/NOPE"}, None)["statusCode"] == 404


@pytest.mark.datapack
def test_api_order_check_is_fast(store):
    from ulysse.api.routes import handle
    handle("POST", "/api/ordres/verifier", {}, {"profil": "mateo", "ticker": "AAPL", "montant_cad": 4000, "options": False})
    t = time.perf_counter()
    handle("POST", "/api/ordres/verifier", {}, {"profil": "mateo", "ticker": "AAPL", "montant_cad": 5000, "options": False})
    assert (time.perf_counter() - t) * 1000 < 300
