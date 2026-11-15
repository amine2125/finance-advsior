"""Structured data contracts exchanged between agents, services, storage and the API."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ---------------------------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------------------------
class RiskTier(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    UNKNOWN = "UNKNOWN"


TIER_ORDER = {RiskTier.LOW: 0, RiskTier.MEDIUM: 1, RiskTier.HIGH: 2}


class LensStatus(str, Enum):
    COMPUTED = "COMPUTED"
    PARTIAL = "PARTIAL"
    UNAVAILABLE = "UNAVAILABLE"        # data could exist but is not connected / not retrievable
    NOT_APPLICABLE = "NOT_APPLICABLE"  # the concept does not apply to this instrument


class CoverageStatus(str, Enum):
    COVERED = "COVERED"
    NOT_COVERED_DATA_UNAVAILABLE = "NOT_COVERED_DATA_UNAVAILABLE"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    NOT_COVERABLE = "NOT_COVERABLE"


class ClaimStatus(str, Enum):
    VERIFIED = "VERIFIED"
    CORROBORATED = "CORROBORATED"
    DISPUTED = "DISPUTED"
    UNVERIFIED = "UNVERIFIED"
    FALSE_AS_SUPPORTED_BY_EVIDENCE = "FALSE_AS_SUPPORTED_BY_EVIDENCE"
    UNKNOWN = "UNKNOWN"


class SupervisorStatus(str, Enum):
    RESEARCH_SUPPORTED = "research-supported"
    RESEARCH_INCONCLUSIVE = "research-inconclusive"
    CONFLICTS_WITH_PERSONA = "conflicts-with-persona-constraints"
    SCENARIO_WORTH_TESTING = "additional-scenario-worth-testing"
    INSUFFICIENT_DATA = "insufficient-data"


class InfoClass(str, Enum):
    VERIFIED_FACT = "VERIFIED_FACT"
    COMPUTED_RESULT = "COMPUTED_RESULT"
    INTERPRETATION = "INTERPRETATION"
    HYPOTHETICAL = "HYPOTHETICAL"
    UNKNOWN = "UNKNOWN"


class Severity(str, Enum):
    INFO = "informational"
    WARNING = "warning"
    CRITICAL = "critical"


# ---------------------------------------------------------------------------------------------
# Personas and portfolios
# ---------------------------------------------------------------------------------------------
class RiskBudget(BaseModel):
    growth_min: float = Field(ge=0, le=1)
    growth_max: float = Field(ge=0, le=1)
    max_single_issuer: float = Field(gt=0, le=1)
    max_single_sector: float = Field(gt=0, le=1)
    max_speculative: float = Field(ge=0, le=1)
    drawdown_review: float = Field(lt=0, ge=-1)
    binding_constraint_note: str = ""
    version: int = 1


class InvestorProfile(BaseModel):
    persona_id: str
    display_name: str
    age: int | None = Field(default=None, ge=16, le=110)
    risk_profile_label: str
    horizon_years_min: float = Field(gt=0, le=60)
    horizon_years_max: float | None = Field(default=None, gt=0, le=60)
    objective: str
    preferences: list[str] = []
    stated_max_decline: float | None = Field(default=None, gt=0, le=1,
                                             description="Decline the investor says they can hold through")
    stated_max_decline_provenance: str = "user_input"
    stable_income: bool | None = None
    emergency_reserve: bool | None = None
    liquidity_needs: Literal["low", "moderate", "high"] | None = None
    dependants: bool | None = None
    experience: Literal["none", "beginner", "intermediate", "advanced"] | None = None
    fictional_capital_cad: float | None = Field(default=None, ge=0)
    esg_preference: bool = False
    excluded_sectors: list[str] = []
    benchmark_id: str = "BLEND_BALANCED"
    budget: RiskBudget
    kyc: dict | None = None  # « Connaître son client » : tolérance, capacité, connaissances, bilan financier, étapes avant d'investir
    watchlist: list[str] = []
    notifications_opt_in: bool = False
    quiet_hours: str | None = None
    explanation_depth: Literal["concise", "standard", "detailed"] = "standard"
    language: Literal["fr", "en"] = "fr"
    is_official: bool = False
    created_at: str = Field(default_factory=utcnow)


class PortfolioHolding(BaseModel):
    asset_id: str
    quantity: float = Field(gt=0)
    acquisition_date: str | None = None
    acquisition_price: float | None = None
    note: str | None = None


class Portfolio(BaseModel):
    portfolio_id: str
    owner_id: str
    name: str
    persona_id: str | None = None
    reporting_currency: Literal["CAD"] = "CAD"
    holdings: list[PortfolioHolding]
    target_weights: dict[str, float] | None = None
    valuation_note: str | None = None
    monitored: bool = True
    is_demo: bool = False
    created_at: str = Field(default_factory=utcnow)
    updated_at: str = Field(default_factory=utcnow)


class HoldingInput(BaseModel):
    asset_id: str
    quantity: float | None = Field(default=None, gt=0)
    amount_cad: float | None = Field(default=None, gt=0)

    @field_validator("asset_id")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()


class PortfolioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    persona_id: str | None = None
    holdings: list[HoldingInput] = Field(min_length=1, max_length=60)
    as_of: str | None = None
    target_weights: dict[str, float] | None = None


# ---------------------------------------------------------------------------------------------
# Evidence ledger
# ---------------------------------------------------------------------------------------------
class DataSourceReference(BaseModel):
    source_id: str
    provider: str
    dataset: str
    url: str | None = None
    license_note: str | None = None
    extracted_at: str | None = None
    coverage_start: str | None = None
    coverage_end: str | None = None
    origin: str | None = None


class MetricRecord(BaseModel):
    metric_id: str
    label: str
    value: float | None
    unit: Literal["pct", "ratio", "cad", "usd", "count", "days", "index", "x", "years"]
    display: str
    method: str
    info_class: InfoClass = InfoClass.COMPUTED_RESULT
    window_start: str | None = None
    window_end: str | None = None
    assets: list[str] = []
    params: dict[str, Any] = {}
    source_ids: list[str] = []
    quality_flags: list[str] = []
    calculation_version: str = ""


class EvidenceRecord(BaseModel):
    evidence_id: str
    kind: Literal["filing", "news_article", "market_snapshot", "attention_series", "fixture"]
    provider: str
    publisher: str | None = None
    title: str | None = None
    canonical_url: str | None = None
    published_at: str | None = None
    event_at: str | None = None
    retrieved_at: str
    claim_extracted_at: str | None = None
    is_original: bool | None = None
    corrected_or_retracted: bool | None = None
    duplicate_cluster_id: str | None = None
    access_rights: str = "metadata only; follow provider terms"
    content_hash: str | None = None
    language: str | None = None
    is_fixture: bool = False
    injection_flags: list[str] = []
    extra: dict[str, Any] = {}


class NewsEvent(BaseModel):
    event_id: str
    asset_id: str
    title: str
    event_type: str
    occurred_at: str | None = None
    published_at: str | None = None
    evidence_ids: list[str]
    primary_source: bool
    status: ClaimStatus
    url: str | None = None


class ClaimVerification(BaseModel):
    claim_id: str
    proposition: str
    claim_type: str
    asset_id: str | None
    source_evidence_ids: list[str]
    cluster_ids: list[str] = []
    independent_reports: int = 0
    status: ClaimStatus
    info_class: InfoClass
    rationale: str
    supporting_ids: list[str] = []
    contradicting_ids: list[str] = []
    testable_hypothesis_id: str | None = None


# ---------------------------------------------------------------------------------------------
# Analysis artefacts
# ---------------------------------------------------------------------------------------------
class ConcentrationFinding(BaseModel):
    finding_id: str
    kind: Literal["direct_issuer", "sector", "etf_overlap_suspected", "etf_overlap_verified",
                  "correlation", "duplicate_line", "asset_class", "currency", "hhi"]
    severity: Severity
    title: str
    detail: str
    assets: list[str]
    metric_ids: list[str]
    info_class: InfoClass = InfoClass.COMPUTED_RESULT


class BudgetCheck(BaseModel):
    rule_id: str
    label: str
    limit: str
    measured: str
    measured_value: float | None
    status: Literal["OK", "BREACH", "BELOW_BAND", "ABOVE_BAND", "UNKNOWN"]
    message: str


class PersonaAssessment(BaseModel):
    persona_id: str
    allowed_tier: RiskTier
    binding_inputs: list[str]
    tier_inputs: dict[str, str]
    uncertainties: list[str]
    portfolio_tier: RiskTier
    budget_checks: list[BudgetCheck]
    checks: list[dict[str, Any]]
    compatible: bool
    summary: str
    narrative: str | None = None


class AgentClaim(BaseModel):
    claim_id: str = ""
    text: str
    claim_type: Literal["fact", "interpretation", "hypothetical"] = "interpretation"
    metric_ids: list[str] = []
    source_ids: list[str] = []
    event_ids: list[str] = []


class AgentArgument(BaseModel):
    agent_id: str
    round: int
    question: str
    position: str
    claims: list[AgentClaim]
    supporting_metric_ids: list[str] = []
    supporting_source_ids: list[str] = []
    supporting_event_ids: list[str] = []
    assumptions: list[str] = []
    counterarguments: list[str] = []
    uncertainties: list[str] = []
    proposed_followup_tests: list[dict[str, Any]] = []
    model_id: str | None = None
    usage: dict[str, Any] = {}
    injected_test_fixture: bool = False


class ClaimCheck(BaseModel):
    claim_id: str
    agent_id: str
    text: str
    accepted: bool
    reasons: list[str]
    info_class: InfoClass


class VerificationResult(BaseModel):
    verification_id: str
    checked_claims: list[ClaimCheck]
    blocked_phrases: list[dict[str, str]] = []
    unknown_ids: list[str] = []
    numeric_mismatches: list[dict[str, Any]] = []
    passed: bool


class CorrectionEntry(BaseModel):
    at: str = Field(default_factory=utcnow)
    stage: str
    original: str
    issue: str
    action: str


class SupervisorDecision(BaseModel):
    analysis_id: str
    user_question: str
    persona_id: str | None
    findings: list[dict[str, Any]]
    opportunity_argument: str
    risk_argument: str
    persona_summary: str
    accepted_claims: list[dict[str, Any]]
    rejected_or_unverified_claims: list[dict[str, Any]]
    conflicts: list[dict[str, Any]]
    final_assessment: dict[str, Any]
    scenario_options: list[dict[str, Any]]
    limitations: list[str]
    source_references: list[str]
    calculation_references: list[str]
    verified_event_references: list[str] = []
    hype_attention_assessment: dict[str, Any] | None = None
    persona_hype_fit_assessment: dict[str, Any] | None = None
    corrections: list[CorrectionEntry] = []
    next_step: str = ""
    abstained: bool = False
    created_at: str = Field(default_factory=utcnow)
    data_as_of: str


class ScenarioDefinition(BaseModel):
    kind: Literal["shock", "historical_replay"]
    name: str = "Scénario personnalisé"
    shocks: dict[str, float] = {}   # keys: sector:<name>, asset_class:<name>, asset:<id>, fx:USDCAD, default
    start_date: str | None = None
    end_date: str | None = None
    rebalancing: Literal["none", "monthly"] = "none"


class AgentTraceStep(BaseModel):
    step_id: str
    agent_id: str
    label: str
    status: Literal["pending", "running", "done", "failed", "skipped"] = "pending"
    started_at: str | None = None
    ended_at: str | None = None
    model_id: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    detail: str | None = None


class Job(BaseModel):
    job_id: str
    owner_id: str
    kind: Literal["debate", "chat", "hype", "replay", "report", "investigate", "mandate"]
    status: Literal["queued", "running", "done", "failed"] = "queued"
    steps: list[AgentTraceStep] = []
    request: dict[str, Any] = {}
    result_ref: str | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: str = Field(default_factory=utcnow)
    updated_at: str = Field(default_factory=utcnow)


class RiskAlert(BaseModel):
    alert_id: str
    owner_id: str
    portfolio_id: str
    persona_id: str | None
    rule_id: str
    severity: Severity
    title: str
    trigger: str
    affected_assets: list[str]
    data_date: str
    metrics: dict[str, Any]
    persona_constraint: str | None = None
    explanation: str
    status: Literal["new", "reviewed", "dismissed"] = "new"
    simulated_replay: bool = False
    replay_id: str | None = None
    dedup_key: str
    delivery: str = "in-app only (notification delivery not configured)"
    created_at: str = Field(default_factory=utcnow)


class AnalysisSnapshot(BaseModel):
    snapshot_id: str
    owner_id: str
    portfolio_id: str
    persona_id: str | None
    as_of: str
    created_at: str = Field(default_factory=utcnow)
    quantities: dict[str, float]
    prices_native: dict[str, float]
    fx_usdcad: float | None
    values_cad: dict[str, float]
    total_value_cad: float
    weights: dict[str, float]
    sector_weights: dict[str, float]
    asset_class_weights: dict[str, float]
    key_metrics: dict[str, float | None]
    alerts: list[str] = []
    hype_fit: dict[str, Any] | None = None
    dataset_version: str
    methodology_version: str
    calculation_version: str
    label: str | None = None
