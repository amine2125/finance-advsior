"""Agent 3 - Opportunity Advocate."""
from __future__ import annotations

from .advocate import run_advocate
from .prompts import OPPORTUNITY_SYSTEM

AGENT_ID = "opportunity_agent"


def argue(llm, packet, round_no, permitted_tests, opponent=None, audit_notes="", test_results_text=""):
    return run_advocate(llm, AGENT_ID, "OPP", OPPORTUNITY_SYSTEM, packet, round_no, permitted_tests, opponent, audit_notes, test_results_text)
