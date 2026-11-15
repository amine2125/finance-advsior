"""Agent 4 - Risk Advocate."""
from __future__ import annotations

from .advocate import run_advocate
from .prompts import RISK_SYSTEM

AGENT_ID = "risk_agent"


def argue(llm, packet, round_no, permitted_tests, opponent=None, audit_notes="", test_results_text="", max_tokens=None):
    return run_advocate(llm, AGENT_ID, "RISK", RISK_SYSTEM, packet, round_no, permitted_tests, opponent, audit_notes, test_results_text, max_tokens)
