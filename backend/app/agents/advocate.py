"""Shared implementation of the two adversarial advocates. Each call is an independent Bedrock invocation."""
from __future__ import annotations

from ..config import get_settings
from ..models import AgentArgument, AgentClaim
from .base import EvidencePacket, compact_json
from .llm import LLMClient, json_call
from .prompts import REBUTTAL_ADDENDUM


def run_advocate(llm: LLMClient, agent_id: str, prefix: str, system: str, packet: EvidencePacket, round_no: int,
                 permitted_tests: list[str], opponent: AgentArgument | None = None, audit_notes: str = "",
                 test_results_text: str = "", max_tokens: int | None = None) -> AgentArgument:
    s = get_settings()
    user = packet.render(permitted_tests)
    sys = system
    if round_no == 2 and opponent is not None:
        sys = system + "\n" + REBUTTAL_ADDENDUM
        opp = {"agent": opponent.agent_id, "position": opponent.position,
               "claims": [{"claim_id": c.claim_id, "text": c.text, "metric_ids": c.metric_ids} for c in opponent.claims]}
        user += "\n\nARGUMENT D'OUVERTURE ADVERSE:\n" + compact_json(opp)
        if audit_notes:
            user += "\n\nRÉSULTAT DE L'AUDIT DÉTERMINISTE (tour 1):\n" + audit_notes
        if test_results_text:
            user += "\n\nRÉSULTATS DES TESTS COMPLÉMENTAIRES EXÉCUTÉS PAR L'AGENT QUANTITATIF:\n" + test_results_text
    data, usage = json_call(llm, system=sys, user=user, model_id=s.agent_model_id, max_tokens=max_tokens or s.agent_max_tokens,
                            agent_id=f"{agent_id}.r{round_no}", temperature=0.3)
    claims = []
    for i, c in enumerate(data.get("claims", [])[:8]):
        if not isinstance(c, dict) or not c.get("text"):
            continue
        ctype = c.get("claim_type") if c.get("claim_type") in ("fact", "interpretation", "hypothetical") else "interpretation"
        claims.append(AgentClaim(claim_id=f"{prefix}-R{round_no}-C{i + 1}", text=str(c["text"])[:600], claim_type=ctype,
                                 metric_ids=[str(x) for x in c.get("metric_ids", []) or []][:8],
                                 source_ids=[str(x) for x in c.get("source_ids", []) or []][:6],
                                 event_ids=[str(x) for x in c.get("event_ids", []) or []][:6]))
    tests = [t for t in (data.get("proposed_followup_tests") or []) if isinstance(t, dict) and t.get("test") in permitted_tests][:2]
    return AgentArgument(agent_id=agent_id, round=round_no, question=packet.question, position=str(data.get("position", ""))[:900],
                         claims=claims, supporting_metric_ids=sorted({m for c in claims for m in c.metric_ids}),
                         supporting_source_ids=sorted({m for c in claims for m in c.source_ids}),
                         supporting_event_ids=sorted({m for c in claims for m in c.event_ids}),
                         assumptions=[str(x)[:300] for x in data.get("assumptions", [])][:6],
                         counterarguments=[str(x)[:400] for x in data.get("counterarguments", [])][:6],
                         uncertainties=[str(x)[:300] for x in data.get("uncertainties", [])][:6],
                         proposed_followup_tests=tests, model_id=usage.get("model_id"), usage=usage)
