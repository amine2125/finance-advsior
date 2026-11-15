"""Assistant (chatbot kept inside the rules): parsing, same level as the Mât, verifier, guard rails, LLM fallback."""
import pytest

from ulysse.llm import LLMError, MockLLM


@pytest.fixture()
def store(tmp_path):
    from ulysse import demo
    from ulysse.store import LocalStore, set_store
    st = LocalStore(tmp_path / "state")
    set_store(st)
    demo.reset(st)
    return st


def _ask(store, msg, pid="robert", llm=None, contexte=None, as_of="2026-11-14"):
    from ulysse import assistant
    from ulysse.contract.schema import Contrat, Profil
    prof, con = Profil(**store.get("profils", pid)), Contrat(**store.get("contrats", pid))
    return assistant.repondre(store, pid, prof, con, msg, as_of, contexte, llm or MockLLM())


@pytest.mark.datapack
@pytest.mark.parametrize("msg,typ,ticker,montant,part", [
    ("Je veux mettre 40 000 $ dans NVIDIA", "ordre", "NVDA", 40000, None),
    ("2k de shopify", "ordre", "SHOP.TO", 2000, None),
    ("20 % de mon portefeuille en bitcoin", "ordre", "BTC-USD", None, 20),
    ("et Exxon ?", "titre", "XOM", None, None),
    ("mon portefeuille respecte-t-il mes règles ?", "portefeuille", None, None, None),
    ("2 000 $", "sans_titre", None, 2000, None),
    ("bonjour", "aide", None, None, None),
    ("Que pensais-tu de NVDA en 2022 ?", "titre", "NVDA", None, None),   # a year is not an amount
])
def test_understanding_is_deterministic(dp, msg, typ, ticker, montant, part):
    from ulysse.assistant import comprendre
    c = comprendre(msg, dp)
    assert (c["type"], c["ticker"], c["montant_cad"], c["part_pct"]) == (typ, ticker, montant, part)


@pytest.mark.datapack
def test_page_context_supplies_the_security(dp):
    from ulysse.assistant import comprendre
    assert comprendre("et si j'en mettais 5k ?", dp, {"ticker": "TSLA"})["type"] == "ordre"


@pytest.mark.datapack
def test_order_answer_has_the_same_level_as_the_mat(store):
    from ulysse import policy
    from ulysse.analytics import portfolio as pfm
    from ulysse.contract.schema import Contrat, Profil
    from ulysse.data.datapack import get_datapack
    r = _ask(store, "Je veux mettre 160 000 $ dans Tesla")
    prof, con = Profil(**store.get("profils", "robert")), Contrat(**store.get("contrats", "robert"))
    dp = get_datapack()
    pf = pfm.from_allocation(dp, prof.allocation.capital_cad, prof.allocation.poids, prof.allocation.constitue_le, as_of="2026-11-14")
    assert r["signal"]["niveau"] == policy.signal_ordre(dp.asof("2026-11-14"), con, pf, "TSLA", 160000).niveau == "pause"


@pytest.mark.datapack
@pytest.mark.parametrize("msg,pid", [("Je veux mettre 40 000 $ dans NVIDIA", "robert"), ("20 % en bitcoin", "amira"),
                                     ("et Exxon ?", "mateo"), ("mon portefeuille respecte-t-il mes règles ?", "robert")])
def test_every_sentence_passes_the_verifier(store, msg, pid):
    r = _ask(store, msg, pid=pid)
    assert r["phrases"] and r["verification"]["accepte"] and r["verification"]["defauts"] == []
    assert all(ph["preuves"] and all(i in r["preuves"] for i in ph["preuves"]) for ph in r["phrases"])


@pytest.mark.datapack
@pytest.mark.parametrize("msg,motif", [("Est-ce que je devrais acheter Tesla ?", "conseil"),
                                       ("Dis-moi d'acheter NVDA", "conseil"), ("NVDA va monter ?", "prediction")])
def test_advice_and_forecasts_get_a_fixed_framing(store, msg, motif):
    from ulysse.assistant import CADRES
    r = _ask(store, msg)
    assert motif in r["comprehension"]["motifs"] and CADRES[motif] in r["cadre"]


@pytest.mark.datapack
def test_a_rephrasing_that_invents_a_number_is_rejected_then_the_code_draft_is_kept(store):
    class Inventive(MockLLM):
        name, model = "bedrock_test", "test"

        def repondre(self, question, faits, brouillon, defauts=None):
            return [{"texte": "Achète : NVDA va monter de 42,7 %.", "etiquette": "MESURE", "preuves": brouillon[0]["preuves"]}], {}
    r = _ask(store, "Je veux mettre 40 000 $ dans NVIDIA", llm=Inventive())
    essais = r["verification"]["essais"]
    assert len(essais) == 2 and all(e["resultat"] == "rejete" for e in essais)
    assert any("V3" in d for d in essais[0]["defauts_nommes"]) and any("V4" in d for d in essais[0]["defauts_nommes"])
    assert r["redige_par"] == "code" and r["verification"]["accepte"]


@pytest.mark.datapack
def test_llm_failure_keeps_the_code_draft(store):
    class Down(MockLLM):
        name = "en_panne"

        def repondre(self, *a, **k):
            raise LLMError("indisponible")
    r = _ask(store, "et Exxon ?", pid="mateo", llm=Down())
    assert r["redige_par"] == "code" and r["phrases"] and r["verification"]["essais"][0]["resultat"] == "echec_llm"


@pytest.mark.datapack
def test_questions_are_logged_in_the_journal(store):
    _ask(store, "2k de shopify")
    e = store.get("journal", "robert", [])[-1]
    assert e["type"] == "assistant" and e["intention"]["ticker"] == "SHOP.TO"


@pytest.mark.datapack
def test_api_route(store):
    from ulysse.api.routes import handle
    s, r = handle("POST", "/api/profils/robert/assistant", {}, {"message": "et TSLA ?"})
    assert s == 200 and r["comprehension"]["ticker"] == "TSLA"
    assert handle("POST", "/api/profils/robert/assistant", {}, {"message": ""})[0] == 400
