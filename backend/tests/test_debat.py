"""Pros/cons agents: both sides argue on the same evidence, every sentence passes the verifier, a bad draft is retried then replaced."""
import copy

import pytest

from ulysse.llm import LLMError, MockLLM

pytestmark = pytest.mark.datapack


@pytest.fixture()
def store(tmp_path):
    from ulysse import demo
    from ulysse.store import LocalStore, set_store
    st = LocalStore(tmp_path / "state")
    set_store(st)
    demo.reset(st)
    return st


def _run(store, llm, it=None, pid="robert"):
    from ulysse import orchestrator
    it = it or {"type": "ordre", "ticker": "TSLA", "montant_cad": 160000}
    return orchestrator.executer(store, orchestrator.creer(store, pid, it, "2026-11-14"), llm)


def _verifie(d):
    from ulysse import verifier
    from ulysse.evidence import Evidence
    preuves = {k: Evidence(**v) for k, v in d["preuves"].items()}
    return {c: verifier.verifier_phrases(d["debat"][c]["phrases"], preuves) for c in ("pour", "contre")}


def test_both_sides_argue_and_are_verified(store):
    d = _run(store, MockLLM())
    assert d["etat"] == "termine"
    steps = {e["etape"]: e for e in d["etapes"]}
    assert steps["debat"]["statut"] == "termine"
    for c in ("pour", "contre"):
        assert 1 <= len(d["debat"][c]["phrases"]) <= 4
    assert _verifie(d) == {"pour": [], "contre": []}
    assert any("dépassée" in ph["texte"] for ph in d["debat"]["contre"]["phrases"])   # a 160 k$ TSLA order breaks Robert's rules


class Pousseur(MockLLM):
    """First draft of each side contains a forbidden recommendation; the second one is clean."""
    def __init__(self):
        super().__init__()
        self.n = {"pour": 0, "contre": 0}

    def debattre(self, faits, cote, brouillon, defauts=None):
        self.n[cote] += 1
        out = copy.deepcopy(brouillon)
        if self.n[cote] == 1:
            out[0]["texte"] = "Achète maintenant, c'est une bonne affaire."
        return out, {"modele": "test", "jetons_entree": 0, "jetons_sortie": 0}


def test_forbidden_wording_is_sent_back_with_its_name(store):
    llm = Pousseur()
    d = _run(store, llm)
    for c in ("pour", "contre"):
        essais = d["debat"][c]["essais"]
        assert essais[0]["resultat"] == "rejete" and any(x.startswith("V4") for x in essais[0]["defauts_nommes"])
        assert essais[1]["resultat"] == "accepte"
    assert _verifie(d) == {"pour": [], "contre": []}


class Panne(MockLLM):
    def debattre(self, *a, **k):
        raise LLMError("Bedrock indisponible")


def test_llm_failure_falls_back_to_the_template(store):
    d = _run(store, Panne(), it={"type": "titre", "ticker": "XBB.TO"})
    assert d["etat"] == "termine"
    assert all(d["debat"][c]["redige_par"] == "gabarit" for c in ("pour", "contre"))
    assert _verifie(d) == {"pour": [], "contre": []}
