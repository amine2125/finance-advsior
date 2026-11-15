"""Shared agent plumbing: job progress tracking (real task states) and the evidence packet."""
from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass, field

from ..analytics.ledger import MetricLedger
from ..models import AgentTraceStep, Job, utcnow
from ..storage.store import get_store


class JobTracker:
    """Persists step status after every transition so the UI shows actual agent task states."""

    def __init__(self, job: Job) -> None:
        self.job = job
        self._lock = threading.Lock()
        self._steps = {s.step_id: s for s in job.steps}
        self._t0: dict[str, float] = {}

    def _save(self) -> None:
        self.job.updated_at = utcnow()
        get_store().put(self.job.owner_id, "JOB", self.job.job_id, self.job.model_dump(mode="json"), ttl_s=7 * 24 * 3600)

    def add(self, step_id: str, agent_id: str, label: str) -> None:
        with self._lock:
            if step_id not in self._steps:
                s = AgentTraceStep(step_id=step_id, agent_id=agent_id, label=label)
                self.job.steps.append(s)
                self._steps[step_id] = s
            self._save()

    def start(self, step_id: str, detail: str | None = None) -> None:
        with self._lock:
            s = self._steps[step_id]
            s.status, s.started_at, s.detail = "running", utcnow(), detail or s.detail
            self._t0[step_id] = time.time()
            self.job.status = "running"
            self._save()

    def done(self, step_id: str, detail: str | None = None, usage: dict | None = None, status: str = "done") -> None:
        with self._lock:
            s = self._steps[step_id]
            s.status, s.ended_at = status, utcnow()
            if detail:
                s.detail = detail
            if usage:
                s.model_id = usage.get("model_id")
                s.input_tokens += int(usage.get("input_tokens", 0) or 0)
                s.output_tokens += int(usage.get("output_tokens", 0) or 0)
            s.latency_ms = int((time.time() - self._t0.get(step_id, time.time())) * 1000)
            self._save()

    def skip(self, step_id: str, detail: str) -> None:
        self.done(step_id, detail, status="skipped")

    def fail(self, step_id: str, detail: str) -> None:
        self.done(step_id, detail, status="failed")

    def finish(self, result: dict | None = None, result_ref: str | None = None, error: str | None = None) -> None:
        with self._lock:
            self.job.status = "failed" if error else "done"
            self.job.error = error
            self.job.result_ref = result_ref
            self.job.result = result
            self._save()

    def progress_cb(self, prefix_agent: str):
        def cb(name: str, status: str, detail: str | None):
            if name not in self._steps:
                self.add(name, prefix_agent, detail or name)
            if status == "running":
                self.start(name, detail)
            else:
                self.done(name, detail)
        return cb


@dataclass
class EvidencePacket:
    question: str
    persona_text: str
    ledger: MetricLedger
    findings: list[dict]
    source_ids: set[str]
    event_ids: set[str] = field(default_factory=set)
    events_text: str = ""
    claims_text: str = ""
    extra_text: str = ""
    allowed_statuses: list[str] = field(default_factory=list)
    status_reason: str = ""
    priority_metric_prefixes: tuple[str, ...] = ("pf.", "bench.", "persona.", "asset.", "hyp.", "test.", "alt.", "hype.")

    def metrics_text(self, limit: int = 160) -> str:
        recs = [r for r in self.ledger.records() if r.value is not None and not r.metric_id.startswith("pf.value.")]
        recs = [r for r in recs if r.metric_id.startswith(self.priority_metric_prefixes)]
        # Order by prefix priority (stable within a prefix) so that the cut at `limit` drops the least important metrics,
        # never the proposal's own numbers (mnd.*), which are registered last in the ledger.
        rank = {p: i for i, p in enumerate(self.priority_metric_prefixes)}
        recs.sort(key=lambda r: next(rank[p] for p in self.priority_metric_prefixes if r.metric_id.startswith(p)))
        lines = []
        for r in recs[:limit]:
            win = f" [{r.window_start}→{r.window_end}]" if r.window_start else ""
            lines.append(f"{r.metric_id} | {r.label} | {r.display}{win}")
        return "\n".join(lines)

    def render(self, permitted_tests: list[str]) -> str:
        f_lines = "\n".join(f"{f['finding_id']} | {f['severity']} | {f['title']} | métriques: {', '.join(f['metric_ids'])}" for f in self.findings)
        parts = [f"QUESTION ÉVALUÉE: {self.question}", f"PROFIL:\n{self.persona_text}", f"CONSTATS DÉTERMINISTES:\n{f_lines or '(aucun)'}",
                 f"MÉTRIQUES (identifiant | libellé | valeur | fenêtre):\n{self.metrics_text()}",
                 f"SOURCES (identifiants citables): {', '.join(sorted(self.source_ids))}"]
        if self.events_text:
            parts.append(f"ÉVÉNEMENTS (identifiants citables dans event_ids):\n{self.events_text}")
        if self.claims_text:
            parts.append(f"REGISTRE DES AFFIRMATIONS (vérification déterministe):\n{self.claims_text}")
        if self.extra_text:
            parts.append(self.extra_text)
        parts.append("TESTS COMPLÉMENTAIRES PERMIS: " + ", ".join(permitted_tests) +
                     " (params: stress_shock{preset}, rolling_correlation{a,b}, base_rates{asset}, hypothetical_addition{asset,amount_cad})")
        return "\n\n".join(parts)


def compact_json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), default=str)
