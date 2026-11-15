"""Phase 3: contract schema, wizard, contradictions, signal policy, governance."""
import re
import time
from pathlib import Path

import pytest

from ulysse.contract.defaults import Reponses, construire
from ulysse.contract.schema import Clause, Contrat, StatutClause
from ulysse import policy


def st(type_, statut, va=None, vb=None, lim=None, imp=False, caused=True):
    return StatutClause(clause_id=f"C-{type_}", type=type_, libelle=type_, origine="dit", importante=imp, statut=statut,
                        valeur_avant=va, valeur_apres=vb, limite=lim, explication="", cause_par_intention=caused)


# ------------------------------------------------------------------ schema and wizard

def test_clause_validation():
    with pytest.raises(ValueError):
        Clause(id="x", type="concentration_titre", parametres={}, libelle="x", origine="dit")
    with pytest.raises(ValueError):
        Clause(id="x", type="crypto_max", parametres={"max_pct": 120}, libelle="x", origine="dit")
    with pytest.raises(ValueError):   # a default must say why
        Clause(id="x", type="crypto_max", parametres={"max_pct": 5}, libelle="x", origine="defaut")


def _rep(**kw):
    base = dict(nom="Test", tolerance="faible", objectifs=[{"libelle": "Mise de fonds", "horizon_annees": 1.5, "part_pct": 70}],
                capital_cad=70_000)
    base.update(kw)
    return Reponses(**base)


def test_wizard_marks_origin_and_caps_equities_for_short_horizons():
    prof, con = construire(_rep(limites={"perte_max": 8}), "p-test")
    by = {c.type: c for c in con.clauses}
    assert by["perte_max"].origine == "dit" and by["perte_max"].parametres["max_pct"] == 8
    assert by["actions_max"].origine == "defaut" and by["actions_max"].justification
    assert by["actions_max"].parametres["max_pct"] == 20          # goal in 1.5 years -> equities capped at 20 %
    assert by["horizon"].importante is True                        # short horizon matters
    assert by["crypto_max"].parametres["max_pct"] == 0
    assert all(c.origine == "dit" or c.justification for c in con.clauses)


def test_contract_amendment_is_versioned_with_context():
    _, con = construire(_rep(), "p-test")
    new = con.amend("C-CONCENTRATION-TITRE", {"max_pct": 7}, "le jour où ce titre a pris 30 %")
    assert new.version == con.version + 1
    assert new.historique[-1]["contexte"] == "le jour où ce titre a pris 30 %"
    assert new.historique[-1]["avant"]["max_pct"] != new.historique[-1]["apres"]["max_pct"]
    assert next(c for c in new.clauses if c.id == "C-CONCENTRATION-TITRE").origine == "dit"


# ------------------------------------------------------------------ policy rules (named, each tested)

def test_p1_important_clause_far_above_limit():
    lvl, regles, _ = policy.niveau([st("concentration_titre", "depassee", 2, 18, 5, imp=True)])
    assert lvl == "pause" and "P1" in regles


def test_p2_several_excesses_add_up():
    lvl, regles, g = policy.niveau([st("concentration_titre", "depassee", 5, 18, 10), st("techno_max", "depassee", 40, 60, 45)])
    assert lvl == "pause" and regles == ["P2"] and g >= 1.0


def test_a1_small_excess_is_attention_not_pause():
    lvl, regles, _ = policy.niveau([st("concentration_titre", "depassee", 8, 11, 10)])
    assert lvl == "attention" and regles == ["A1"]


def test_qualitative_clause_never_pauses_alone():
    lvl, regles, _ = policy.niveau([st("esg_controverses", "depassee", imp=True)])
    assert lvl == "attention" and "A1" in regles


def test_preexisting_excess_not_caused_by_intention_is_context():
    lvl, regles, _ = policy.niveau([st("actions_max", "depassee", 55, 56, 50, imp=True, caused=False)])
    assert lvl != "pause" and "A1" not in regles


def test_a3_important_clause_unverifiable():
    lvl, regles, _ = policy.niveau([st("esg_controverses", "donnees_insuffisantes", imp=True), st("crypto_max", "respectee", 0, 0, 5)])
    assert lvl == "attention" and regles == ["A3"]


def test_ok_and_none():
    assert policy.niveau([st("crypto_max", "respectee", 0, 1, 5)])[0] == "ok"
    assert policy.niveau([])[0] == "aucun"


def test_modes_are_proportionate():
    assert policy.mode("pause", ["P1"], True, False) == "interruption"
    assert policy.mode("pause", ["P1"], False, False) == "encadre"          # never interrupt browsing
    assert policy.mode("attention", ["A1"], True, False, [], 0.1) == "discret"
    assert policy.mode("attention", ["A1"], True, False, [], 0.6) == "encadre"
    assert policy.mode("attention", ["A1"], True, True, [], 0.6) == "discret"  # already seen


# ------------------------------------------------------------------ wording

FORBIDDEN = re.compile(r"\b(ach[eè]te|vends|tu devrais|bonne affaire|occasion à ne pas manquer)\b", re.I)


def test_no_forbidden_wording_in_templates():
    root = Path(__file__).resolve().parents[1] / "ulysse"
    offenders = []
    for p in root.rglob("*.py"):
        for lit in re.findall(r'"([^"\\n]{12,})"', p.read_text()):
            if FORBIDDEN.search(lit):
                offenders.append((p.name, lit[:80]))
    assert offenders == []


# ------------------------------------------------------------------ real data: the three reference cases

pytestmark_dp = pytest.mark.datapack


def _order(dp, pid, ticker, pct, day="2026-11-14"):
    from ulysse.analytics import portfolio as pfm
    from ulysse.personas import persona
    prof, con = persona(pid)
    v = dp.asof(day)
    pf = pfm.from_allocation(dp, prof.allocation.capital_cad, prof.allocation.poids, prof.allocation.constitue_le, as_of=day)
    total = pfm.valuation(v, pf)["total_cad"]
    return policy.signal_ordre(v, con, pf, ticker, pct * total, options=False)


@pytest.mark.datapack
def test_reference_case_robert_20pct_tsla_pauses(dp):
    s = _order(dp, "robert", "TSLA", 0.20)
    assert s.niveau == "pause" and s.mode == "interruption"
    exceeded = {c.type for c in s.clauses if c.statut == "depassee" and c.cause_par_intention}
    assert {"concentration_titre", "horizon"} <= exceeded


@pytest.mark.datapack
def test_reference_case_amira_5pct_btc_no_pause(dp):
    assert _order(dp, "amira", "BTC-USD", 0.05).niveau != "pause"


@pytest.mark.datapack
def test_reference_case_mateo_xom_esg_evaluated(dp):
    s = _order(dp, "mateo", "XOM", 0.03)
    esg = next(c for c in s.clauses if c.type == "esg_controverses")
    assert esg.statut in ("donnees_insuffisantes", "depassee")
    assert esg.preuves, "the ESG status must cite its evidence (or say data is insufficient with context)"


@pytest.mark.datapack
def test_mateo_enb_controversy_cited(dp):
    s = _order(dp, "mateo", "ENB.TO", 0.03)
    esg = next(c for c in s.clauses if c.type == "esg_controverses")
    assert esg.statut == "depassee" and "2019" in esg.explication and s.niveau == "attention"


@pytest.mark.datapack
def test_esg_evidence_respects_publication_dates(dp):
    s = _order(dp, "mateo", "ENB.TO", 0.03, day="2021-12-15")   # the AP source is from 2026
    esg = next(c for c in s.clauses if c.type == "esg_controverses")
    assert esg.statut == "donnees_insuffisantes"


@pytest.mark.datapack
def test_proportionality_amira_nvda(dp):
    levels = [_order(dp, "amira", "NVDA", p).niveau for p in (0.02, 0.05, 0.20)]
    order = {"aucun": 0, "ok": 1, "attention": 2, "pause": 3}
    assert [order[x] for x in levels] == sorted(order[x] for x in levels)   # never less severe for a larger order
    assert levels[-1] == "pause"


@pytest.mark.datapack
def test_time_machine_robert_december_2021(dp):
    assert _order(dp, "robert", "TSLA", 0.20, day="2021-12-15").niveau == "pause"


@pytest.mark.datapack
def test_stability_same_input_five_times(dp):
    outs = {(_order(dp, "robert", "NVDA", 0.05).model_dump_json(exclude={"latence_ms"})) for _ in range(5)}
    assert len(outs) == 1


@pytest.mark.datapack
def test_signal_latency_under_300ms(dp):
    _order(dp, "mateo", "AAPL", 0.02)                 # warm caches (the Vigie pre-computes in production)
    t = time.perf_counter()
    _order(dp, "mateo", "AAPL", 0.03)
    assert (time.perf_counter() - t) * 1000 < 300


@pytest.mark.datapack
def test_engine_is_generic_live_profile(dp):
    from ulysse.analytics import portfolio as pfm
    prof, con = construire(_rep(nom="Profil prudent", description="achat prochain"), "live-1")
    v = dp.asof("2026-11-14")
    pf = pfm.from_allocation(dp, prof.allocation.capital_cad, prof.allocation.poids, prof.allocation.constitue_le, as_of="2026-11-14")
    total = pfm.valuation(v, pf)["total_cad"]
    s = policy.signal_ordre(v, con, pf, "NVDA", 0.10 * total, options=False)
    assert s.niveau == "pause"     # 10 % in one volatile stock for a down-payment in 18 months


@pytest.mark.datapack
def test_contradiction_high_risk_but_money_needed_soon(dp):
    from ulysse.contract import contradictions
    prof, con = construire(_rep(tolerance="eleve"), "p-k1")
    k = contradictions.detecter(dp.asof("2026-11-14"), prof, con)
    assert any(x["code"] == "K1" for x in k)


@pytest.mark.datapack
def test_governance_makes_checks_visible(dp):
    from ulysse.analytics import portfolio as pfm
    from ulysse.governance import gouverner
    from ulysse.personas import persona
    prof, con = persona("mateo")
    v = dp.asof("2026-11-14")
    pf = pfm.from_allocation(dp, prof.allocation.capital_cad, prof.allocation.poids, prof.allocation.constitue_le, as_of="2026-11-14")
    g = gouverner(v, prof, con, pf, {"type": "ordre", "ticker": "XOM", "montant_cad": 5000})
    assert len(g["statuts"]) == len(con.clauses) and g["controles"]
    assert any(m["code"] == "M1" for m in g["informations_manquantes"])   # ESGV composition not available
