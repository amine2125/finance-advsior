"""Request parsing (amount) and the order in which metrics reach the models."""
import pytest

from app.agents.base import EvidencePacket
from app.agents.mandate import parse_request
from app.analytics.ledger import MetricLedger


@pytest.mark.parametrize("text, expected", [
    ("J'ai 10 000 $ à investir", 10000.0),
    ("Je veux 2 000 $ depuis 2023", 2000.0),          # a year is never an amount
    ("Je veux investir 5k sur 15 ans", 5000.0),
    ("Investir 3 000 dollars dans 60 mois", 3000.0),  # a duration is never an amount
    ("J'ai 2500 à placer", 2500.0),                   # bare number without unit: still accepted
])
def test_amount(md, text, expected):
    assert parse_request(md, text)["amount_cad"] == expected


@pytest.mark.parametrize("text", ["Je veux 100 actions", "Investir pendant 60 mois", "Que faire en 2024 ?"])
def test_not_an_amount(md, text):
    assert parse_request(md, text)["amount_cad"] is None


def test_proposal_metrics_survive_the_cut():
    led = MetricLedger()
    for i in range(200):  # many portfolio metrics registered first, as in run_mandate
        led.add(f"pf.weight.A{i}", f"Poids A{i}", 0.01, "pct", "test")
    led.add("mnd.vol.after", "Variation annuelle typique (après)", 0.12, "pct", "test")
    p = EvidencePacket(question="q", persona_text="", ledger=led, findings=[], source_ids=set(),
                       priority_metric_prefixes=("mnd.", "pf."))
    assert "mnd.vol.after" in p.metrics_text(120)
