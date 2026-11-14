"""Agent 6 - Evidence & Governance: deterministic audit of claims, numbers, IDs, forecasts, causality and data dates."""
from __future__ import annotations

from ..analytics.ledger import MetricLedger
from ..governance.validator import check_free_text, verify_arguments
from ..models import AgentArgument, VerificationResult

AGENT_ID = "audit_agent"


def audit_arguments(args: list[AgentArgument], led: MetricLedger, source_ids: set[str], event_ids: set[str]) -> VerificationResult:
    return verify_arguments(args, led, source_ids, event_ids)


def audit_notes(v: VerificationResult) -> str:
    lines = []
    for c in v.checked_claims:
        lines.append(f"{c.claim_id}: {'ACCEPTÉE' if c.accepted else 'REJETÉE – ' + '; '.join(c.reasons)}")
    return "\n".join(lines)


def audit_supervisor(dec: dict, led: MetricLedger, allowed_statuses: list[str], rejected_claim_ids: set[str],
                     extra_numbers: list[float]) -> list[str]:
    issues = []
    texts = [dec.get("headline", ""), dec.get("conclusion", ""), dec.get("opportunity_summary", ""), dec.get("risk_summary", ""),
             dec.get("persona_summary", ""), dec.get("next_step", ""), dec.get("status_reason", ""),
             dec.get("hype_attention_assessment") or "", dec.get("persona_hype_fit") or ""]
    texts += [c.get("resolution", "") + " " + c.get("opportunity_view", "") + " " + c.get("risk_view", "") for c in dec.get("conflicts", [])]
    texts += [s.get("description", "") for s in dec.get("scenario_options", [])]
    for t in texts:
        r = check_free_text(t, led, extra_numbers)
        for b in r["numeric_mismatches"]:
            issues.append(f"nombre non traçable « {b} » dans: « {t[:120]} »")
        for f in r["forbidden"]:
            issues.append(f"formulation interdite ({f['kind']}) « {f['phrase']} »")
    for f in dec.get("verified_findings", []):
        unknown = [m for m in f.get("metric_ids", []) if m not in led]
        if unknown:
            issues.append(f"constat citant des métriques inexistantes {unknown}: « {f.get('text', '')[:100]} »")
        r = check_free_text(f.get("text", ""), led, extra_numbers)
        for b in r["numeric_mismatches"]:
            issues.append(f"constat avec nombre non traçable « {b} »")
        if not f.get("metric_ids"):
            issues.append(f"constat vérifié sans métrique: « {f.get('text', '')[:100]} »")
    bad_acc = [c for c in dec.get("accepted_claim_ids", []) if c in rejected_claim_ids]
    if bad_acc:
        issues.append(f"affirmations rejetées par l'audit présentées comme acceptées: {bad_acc}")
    if dec.get("status") not in allowed_statuses:
        issues.append(f"statut « {dec.get('status')} » non permis; statuts permis: {allowed_statuses}")
    return issues
