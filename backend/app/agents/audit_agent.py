"""Agent 6 - Evidence & Governance: deterministic audit of claims, numbers, IDs, forecasts, causality and data dates."""
from __future__ import annotations

from ..analytics.ledger import MetricLedger
from ..governance.validator import verify_arguments
from ..models import AgentArgument, VerificationResult

AGENT_ID = "audit_agent"


def audit_arguments(args: list[AgentArgument], led: MetricLedger, source_ids: set[str], event_ids: set[str]) -> VerificationResult:
    return verify_arguments(args, led, source_ids, event_ids)


def audit_notes(v: VerificationResult) -> str:
    lines = []
    for c in v.checked_claims:
        lines.append(f"{c.claim_id}: {'ACCEPTÉE' if c.accepted else 'REJETÉE – ' + '; '.join(c.reasons)}")
    return "\n".join(lines)


