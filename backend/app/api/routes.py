"""REST API v1. Long multi-agent work returns a job id (poll GET /jobs/{id} for real agent step states)."""
from __future__ import annotations

import datetime as dt

import pandas as pd
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from .. import __version__
from ..agents import hypothesis_agent
from ..analytics.benchmarks import BENCHMARKS
from ..analytics.coverage import FAILURE_MODES, coverage_report
from ..analytics.forecast_policy import POLICY_TABLE
from ..analytics.lenses import run_asset_lenses
from ..analytics.lenses.fundamental_lens import fixture_check
from ..analytics.portfolio import portfolio_risk_metrics, value_holdings
from ..analytics.scenarios import SHOCK_PRESETS, apply_shock, historical_replay, position_size_table
from ..analytics.tiers import classify_universe
from ..config import get_settings
from ..data.registry import get_market_data
from ..guardian.engine import scan_portfolio
from ..guardian.replay import GUIDED
from ..hype_research.pipeline import resolve_asset
from ..methodology import METHODOLOGY, methodology_hash
from ..models import InvestorProfile, PortfolioCreate
from ..services import jobs
from ..services import portfolio_service as ps
from ..services.analysis_service import make_snapshot, run_xray
from ..services.impact_service import hypothetical_addition
from ..services.snapshot_service import compare, list_snapshots
from ..storage.store import get_store
from ..web_research.http import provider_status
from ..web_research.tool import WebResearchTool
from .deps import owner_id, rate_limit

router = APIRouter(prefix="/api/v1")


def _job_out(job) -> dict:
    return {"job_id": job.job_id, "status": job.status, "kind": job.kind}


# ------------------------------------------------------------------------------------------------ system
@router.get("/health")
def health():
    md = get_market_data()
    return {"status": "ok", "version": __version__, "dataset_version": md.dataset_version, "data_as_of": md.end_date.date().isoformat()}


@router.get("/system/info")
def system_info():
    s = get_settings()
    return {"app": s.app_name, "env": s.env, "region": s.aws_region, "bedrock_region": s.bedrock_region,
            "agent_model_id": s.agent_model_id, "supervisor_model_id": s.supervisor_model_id, "llm_enabled": s.llm_enabled,
            "storage_backend": s.storage_backend, "job_runner": s.job_runner, "web_research_enabled": s.web_research_enabled,
            "live_mode": s.live_mode_enabled, "notifications": "Amazon SNS" if s.alert_sns_topic_arn else "non configuré",
            "orchestration": "Orchestration multi-agents définie en code; inférence Amazon Bedrock (Converse API); "
                             + ("AWS Lambda (exécution asynchrone)" if s.job_runner == "lambda" else "exécution locale (thread)"),
            "mode": "Rejeu historique (données jusqu'au " + get_market_data().end_date.date().isoformat() + ")"}


@router.get("/data/status")
def data_status():
    md = get_market_data()
    q = {a: md.quality(a).__dict__ for a in md.universe.index}
    return {"dataset_version": md.dataset_version, "origin": md.origin, "coverage": [md.start_date.date().isoformat(), md.end_date.date().isoformat()],
            "assets": len(md.universe), "price_rows": int(len(md.prices_long)), "fx_rows": int(len(md.fx)), "macro_series": sorted(md.macro["series_id"].unique().tolist()) if not md.macro.empty else [],
            "warnings": md.warnings, "quality": q, "mode": "historical_replay",
            "live_mode": {"enabled": get_settings().live_mode_enabled, "note": "Aucun flux de cotations en direct sous licence n'est connecté; seuls des instantanés crypto CoinGecko et le taux BdC sont récupérés à la demande."}}


@router.get("/sources")
def sources():
    md = get_market_data()
    return {"datasets": md.source_references(), "providers": provider_status(), "benchmarks": BENCHMARKS}


@router.get("/methodology")
def methodology():
    return {"methodology": METHODOLOGY, "hash": methodology_hash(), "failure_modes": FAILURE_MODES, "forecast_policy": POLICY_TABLE,
            "dcf_fixture": fixture_check(), "shock_presets": SHOCK_PRESETS, "guided_replays": GUIDED}


# ------------------------------------------------------------------------------------------------ assets
@router.get("/assets")
def assets():
    md = get_market_data()
    tiers = {t["asset_id"]: t for t in classify_universe(md)}
    out = []
    for aid, r in md.universe.iterrows():
        t = tiers[aid]
        out.append({"asset_id": aid, "name": r["name"], "asset_class": r["asset_class"], "sub_class": r.get("sub_class"), "sector": r["sector"],
                    "region": r.get("region"), "currency": r["currency"], "exchange": r.get("exchange"), "tier": t["tier"],
                    "volatility": t["volatility"], "max_drawdown": t["max_drawdown"], "tier_rules": t["rules"], "n_obs": t["n_obs"],
                    "window": [t["window_start"], t["window_end"]]})
    return {"assets": out, "as_of": md.end_date.date().isoformat(), "thresholds": METHODOLOGY["risk_tiers"]}


@router.get("/assets/search")
def asset_search(q: str = Query(min_length=1, max_length=60)):
    md = get_market_data()
    res = resolve_asset(md, q)
    if res["status"] == "not_in_universe":
        cg = WebResearchTool().crypto_search(q)
        res["external_crypto_matches"] = cg or []
        res["external_note"] = "Résultats CoinGecko affichés pour identification uniquement: sans historique dans le jeu de données, aucune métrique de risque n'est calculée."
    return res


@router.get("/assets/{asset_id}/analysis")
def asset_analysis(asset_id: str, persona_id: str | None = None, owner: str = Depends(owner_id)):
    md = get_market_data()
    persona = ps.get_persona(owner, persona_id) if persona_id else None
    res, led = run_asset_lenses(md, asset_id.upper(), md.end_date, persona)
    res["coverage_matrix"] = coverage_report(res["lenses"])
    res["ledger"] = led.as_dict()
    return res


@router.get("/assets/{asset_id}/prices")
def asset_prices(asset_id: str, start: str | None = None):
    md = get_market_data()
    s = md.native_series(asset_id.upper(), "close")
    v = md.native_series(asset_id.upper(), "volume") if asset_id.upper() in md.volume.columns else None
    if start:
        s = s[s.index >= pd.Timestamp(start)]
    step = max(1, len(s) // 400)
    return {"asset_id": asset_id.upper(), "currency": md.asset(asset_id.upper())["currency"], "field": "close (ajusté des fractionnements)",
            "series": [{"date": d.date().isoformat(), "close": round(float(x), 4), "volume": (float(v.get(d)) if v is not None and d in v.index else None)}
                       for d, x in s.iloc[::step].items()]}


@router.get("/tiers")
def tiers(as_of: str | None = None):
    return {"tiers": classify_universe(get_market_data(), as_of), "methodology": METHODOLOGY["risk_tiers"]}


# ------------------------------------------------------------------------------------------------ personas
@router.get("/personas")
def personas(owner: str = Depends(owner_id)):
    from ..analytics.persona_rules import allowed_tier
    out = []
    for p in ps.list_personas(owner):
        at = allowed_tier(p)
        out.append(p.model_dump(mode="json") | {"allowed_tier": at["allowed_tier"].value, "binding_inputs": at["binding_inputs"],
                                                "tier_inputs": at["tier_inputs"], "uncertainties": at["uncertainties"]})
    return {"personas": out}


@router.get("/personas/{persona_id}")
def persona(persona_id: str, owner: str = Depends(owner_id)):
    return ps.get_persona(owner, persona_id).model_dump(mode="json")


@router.post("/personas")
def create_persona(profile: InvestorProfile, owner: str = Depends(owner_id)):
    profile.is_official = False
    return ps.save_persona(owner, profile).model_dump(mode="json")


@router.put("/personas/{persona_id}")
def update_persona(persona_id: str, profile: InvestorProfile, owner: str = Depends(owner_id)):
    if profile.persona_id != persona_id:
        raise HTTPException(400, {"code": "id_mismatch", "message": "persona_id incohérent"})
    return ps.save_persona(owner, profile).model_dump(mode="json")


# ------------------------------------------------------------------------------------------------ portfolios
@router.get("/portfolios")
def portfolios(owner: str = Depends(owner_id)):
    return {"portfolios": [p.model_dump(mode="json") for p in ps.list_portfolios(owner)]}


@router.post("/portfolios")
def create_portfolio(req: PortfolioCreate, owner: str = Depends(owner_id)):
    return ps.create_portfolio(owner, req).model_dump(mode="json")


@router.get("/portfolios/{portfolio_id}")
def get_portfolio(portfolio_id: str, owner: str = Depends(owner_id)):
    return ps.get_portfolio(owner, portfolio_id).model_dump(mode="json")


class HoldingsReq(BaseModel):
    holdings: list[dict] = Field(min_length=1, max_length=60)
    replace: bool = False


@router.post("/portfolios/{portfolio_id}/holdings")
def add_holdings(portfolio_id: str, req: HoldingsReq, owner: str = Depends(owner_id)):
    from ..models import HoldingInput
    rows = [HoldingInput(**h).model_dump() for h in req.holdings]
    fn = ps.replace_holdings if req.replace else ps.add_holdings
    return fn(owner, portfolio_id, rows).model_dump(mode="json")


@router.delete("/portfolios/{portfolio_id}")
def delete_portfolio(portfolio_id: str, owner: str = Depends(owner_id)):
    ps.delete_portfolio(owner, portfolio_id)
    return {"deleted": portfolio_id}


class ImportReq(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    persona_id: str | None = None
    csv: str = Field(min_length=10, max_length=200_000)


@router.post("/portfolios/import")
def import_portfolio(req: ImportReq, owner: str = Depends(owner_id)):
    rows = ps.parse_csv(req.csv)
    return ps.create_portfolio(owner, PortfolioCreate(name=req.name, persona_id=req.persona_id, holdings=rows)).model_dump(mode="json")


# ------------------------------------------------------------------------------------------------ analysis
class AnalysisReq(BaseModel):
    portfolio_id: str
    persona_id: str | None = None
    as_of: str | None = None
    lookback: int | None = Field(default=None, ge=60, le=1260)
    benchmark_id: str | None = None
    save_snapshot: bool = True


@router.post("/analysis/portfolio")
def analyze(req: AnalysisReq, owner: str = Depends(owner_id)):
    md = get_market_data()
    pf = ps.get_portfolio(owner, req.portfolio_id)
    persona = ps.get_persona(owner, req.persona_id or pf.persona_id or "robert")
    if req.benchmark_id and req.benchmark_id not in BENCHMARKS:
        raise HTTPException(400, {"code": "bad_benchmark", "message": "indice de référence inconnu"})
    xr = run_xray(md, pf, persona, as_of=req.as_of, lookback=req.lookback, benchmark_id=req.benchmark_id)
    store = get_store()
    store.put(owner, "ANALYSIS", xr["analysis_id"], xr)
    if req.save_snapshot:
        snap = make_snapshot(owner, pf, xr, label="Radiographie")
        store.put(owner, "SNAPSHOT", snap.snapshot_id, snap.model_dump(mode="json"))
        xr["snapshot_id"] = snap.snapshot_id
    return xr


@router.post("/analysis/diversification")
def diversification(req: AnalysisReq, owner: str = Depends(owner_id)):
    xr = analyze(req.model_copy(update={"save_snapshot": False}), owner)
    keys = ("pf.hhi", "pf.effective_n", "pf.avg_corr", "pf.div_ratio", "pf.stress.vol", "pf.stress.normal_vol", "pf.stress.avg_corr")
    return {"analysis_id": xr["analysis_id"], "metrics": {k: xr["ledger"][k] for k in keys if k in xr["ledger"]},
            "stressed": xr["risk"].get("stressed"), "findings": xr["findings"], "correlated_pairs": xr["correlated_pairs"],
            "offsetting_note": ("Deux actifs parfaitement anticorrélés à poids égal donnent un rendement proche de zéro (moins les coûts): "
                                "le risque disparaît et le rendement aussi. La diversification utile combine des actifs à rendement espéré "
                                "positif et faiblement corrélés; les corrélations montent souvent en période de stress.")}


@router.post("/analysis/benchmark")
def benchmark(req: AnalysisReq, owner: str = Depends(owner_id)):
    xr = analyze(req.model_copy(update={"save_snapshot": False}), owner)
    return {"analysis_id": xr["analysis_id"], "benchmark": xr["risk"].get("benchmark"), "series": xr["risk"].get("series"),
            "available_benchmarks": {k: v["label"] for k, v in BENCHMARKS.items()}}


@router.get("/analysis/{analysis_id}")
def get_analysis(analysis_id: str, owner: str = Depends(owner_id)):
    d = get_store().get(owner, "ANALYSIS", analysis_id) or get_store().get(owner, "DEBATE", analysis_id)
    if not d:
        raise HTTPException(404, {"code": "not_found", "message": "analyse introuvable"})
    return d


@router.get("/analysis/{analysis_id}/reconciliation")
def reconciliation(analysis_id: str, owner: str = Depends(owner_id)):
    d = get_store().get(owner, "DEBATE", analysis_id)
    if not d:
        raise HTTPException(404, {"code": "not_found", "message": "débat introuvable"})
    return {"analysis_id": analysis_id, "question": d["question"], "reconciliation": d["reconciliation"],
            "verdict": d["decision"]["final_assessment"], "corrections": d["decision"]["corrections"]}


# ------------------------------------------------------------------------------------------------ agents
class ChatReq(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    portfolio_id: str | None = None
    persona_id: str | None = None
    conversation_id: str | None = None


@router.post("/agents/chat")
def chat(req: ChatReq, owner: str = Depends(owner_id)):
    rate_limit(owner, "chat", 15)
    return _job_out(jobs.submit(owner, "chat", req.model_dump()))


@router.get("/agents/conversations/{conversation_id}")
def conversation(conversation_id: str, owner: str = Depends(owner_id)):
    d = get_store().get(owner, "CONV", conversation_id)
    if not d:
        raise HTTPException(404, {"code": "not_found", "message": "conversation introuvable"})
    return d


class DebateReq(BaseModel):
    portfolio_id: str
    persona_id: str | None = None
    question: str | None = Field(default=None, max_length=500)
    asset_id: str | None = None
    amount_cad: float | None = Field(default=None, gt=0, le=10_000_000)
    rounds: int = Field(default=2, ge=1, le=2)
    use_fixture: bool = False
    inject_unsupported_claim: bool = False


@router.post("/agents/debate")
def debate(req: DebateReq, owner: str = Depends(owner_id)):
    rate_limit(owner, "debate", 6)
    ps.get_portfolio(owner, req.portfolio_id)
    return _job_out(jobs.submit(owner, "debate", req.model_dump()))


@router.get("/agents/debates")
def debates(owner: str = Depends(owner_id)):
    out = []
    for d in get_store().list(owner, "DEBATE", 30):
        out.append({"debate_id": d["debate_id"], "question": d["question"], "persona": d["persona"]["display_name"], "created_at": d["created_at"],
                    "status": d["decision"]["final_assessment"].get("status"), "headline": d["decision"]["final_assessment"].get("headline"),
                    "asset_id": d.get("asset_id")})
    return {"debates": out}


@router.get("/agents/debate/{debate_id}")
def get_debate(debate_id: str, owner: str = Depends(owner_id)):
    d = get_store().get(owner, "DEBATE", debate_id)
    if not d:
        raise HTTPException(404, {"code": "not_found", "message": "débat introuvable"})
    return d


@router.get("/jobs/{job_id}")
def job(job_id: str, owner: str = Depends(owner_id)):
    j = jobs.get_job(owner, job_id)
    if not j:
        raise HTTPException(404, {"code": "not_found", "message": "tâche introuvable"})
    return j.model_dump(mode="json")


# ------------------------------------------------------------------------------------------------ scenarios
class ScenarioReq(BaseModel):
    portfolio_id: str
    kind: str = Field(default="shock", pattern="^(shock|historical_replay)$")
    preset: str | None = None
    shocks: dict[str, float] | None = None
    weights: dict[str, float] | None = None
    start: str | None = None
    end: str | None = None
    rebalancing: str = Field(default="none", pattern="^(none|monthly)$")


def _validate_shocks(sh: dict[str, float]) -> dict[str, float]:
    for k, v in sh.items():
        if not -1.0 <= float(v) <= 3.0:
            raise HTTPException(400, {"code": "bad_shock", "message": f"choc {k} hors bornes [−100 %, +300 %]"})
    return sh


@router.post("/scenarios/run")
def scenario_run(req: ScenarioReq, owner: str = Depends(owner_id)):
    md = get_market_data()
    pf = ps.get_portfolio(owner, req.portfolio_id)
    pos = value_holdings(md, [h.model_dump() for h in pf.holdings], md.end_date)
    if req.kind == "shock":
        shocks = _validate_shocks(req.shocks) if req.shocks else SHOCK_PRESETS.get(req.preset or "tech_crash_30", SHOCK_PRESETS["tech_crash_30"])["shocks"]
        return apply_shock(md, pos, shocks) | {"shocks": shocks, "preset": req.preset}
    weights = req.weights or {a: float(pos.loc[a, "weight"]) for a in pos.index}
    for a in weights:
        md.asset(a)
    return historical_replay(md, weights, req.start or "2022-01-03", req.end or md.end_date.date().isoformat(), float(pos["value_cad"].sum()),
                             req.rebalancing)


class CompareReq(BaseModel):
    portfolio_id: str
    persona_id: str | None = None
    allocations: dict[str, dict[str, float]] | None = None
    preset: str = "tech_crash_30"


@router.post("/scenarios/compare")
def scenario_compare(req: CompareReq, owner: str = Depends(owner_id)):
    from ..agents.quant_agent import compare_alternatives
    from ..analytics.ledger import MetricLedger
    from ..services.analysis_service import asset_meta, assess_persona
    md = get_market_data()
    pf = ps.get_portfolio(owner, req.portfolio_id)
    persona = ps.get_persona(owner, req.persona_id or pf.persona_id or "robert")
    xr = run_xray(md, pf, persona, include_series=False)
    led = MetricLedger()
    alts = compare_alternatives(md, xr, led)
    for name, w in (req.allocations or {}).items():
        tot = sum(v for v in w.values() if v > 0)
        if tot <= 0:
            raise HTTPException(400, {"code": "bad_allocation", "message": f"allocation {name} vide"})
        w = {k.upper(): v / tot for k, v in w.items() if v > 0}
        r = portfolio_risk_metrics(md, w, md.end_date, None, xr["benchmark_id"])
        alts[f"custom:{name}"] = {"label": f"Personnalisé – {name}", "weights": w, "vol": r["volatility"], "mdd": (r["drawdown"] or {}).get("max_drawdown"),
                                  "hhi": sum(x * x for x in w.values()), "total_return": r["total_return"], "avg_corr": r["avg_pairwise_corr"]}
    for k, a in alts.items():
        if "weights" not in a or "error" in a:
            continue
        meta = asset_meta(md, list(a["weights"]))
        tiers = {x: "HIGH" if meta[x]["is_single_issuer"] else "MEDIUM" for x in a["weights"]}
        risk = {"volatility": a.get("vol"), "drawdown": {"max_drawdown": a.get("mdd")}, "n_obs": 400}
        pa = assess_persona(persona, a["weights"], meta, tiers, risk)
        a["persona"] = {"compatible": pa.compatible, "breaches": [c.rule_id for c in pa.budget_checks if c.status not in ("OK", "UNKNOWN")],
                        "portfolio_tier": pa.portfolio_tier.value, "allowed_tier": pa.allowed_tier.value}
        pos = pd.DataFrame([{"asset_id": x, "value_cad": w * xr["total_value_cad"], "currency": md.asset(x)["currency"]} for x, w in a["weights"].items()]).set_index("asset_id")
        a["shock"] = apply_shock(md, pos, SHOCK_PRESETS.get(req.preset, SHOCK_PRESETS["tech_crash_30"])["shocks"])["return"]
    return {"portfolio_id": pf.portfolio_id, "persona_id": persona.persona_id, "preset": req.preset, "alternatives": alts,
            "label": "Allocations HYPOTHÉTIQUES construites par règles explicites; pas des recommandations", "data_as_of": xr["data_as_of"]}


class SizeReq(BaseModel):
    portfolio_value: float = Field(gt=0)
    max_loss_pct: float = Field(gt=0, le=0.2)
    adverse_moves: list[float] = Field(min_length=1, max_length=6)


@router.post("/scenarios/position-size")
def position_size(req: SizeReq):
    return {"rows": position_size_table(req.portfolio_value, req.max_loss_pct, req.adverse_moves), "label": "Calcul éducatif"}


# ------------------------------------------------------------------------------------------------ alerts & guardian
@router.get("/alerts")
def alerts(portfolio_id: str | None = None, include_replay: bool = True, owner: str = Depends(owner_id)):
    items = get_store().list(owner, "ALERT", 300)
    if portfolio_id:
        items = [a for a in items if a["portfolio_id"] == portfolio_id]
    if not include_replay:
        items = [a for a in items if not a["simulated_replay"]]
    return {"alerts": items}


class ScanReq(BaseModel):
    portfolio_id: str
    persona_id: str | None = None


@router.post("/alerts/scan")
def scan(req: ScanReq, owner: str = Depends(owner_id)):
    return scan_portfolio(owner, req.portfolio_id, req.persona_id)


def _set_alert_status(owner, alert_id, status):
    store = get_store()
    a = store.get(owner, "ALERT", alert_id)
    if not a:
        raise HTTPException(404, {"code": "not_found", "message": "alerte introuvable"})
    a["status"] = status
    store.put(owner, "ALERT", alert_id, a)
    return a


@router.post("/alerts/{alert_id}/dismiss")
def dismiss(alert_id: str, owner: str = Depends(owner_id)):
    return _set_alert_status(owner, alert_id, "dismissed")


@router.post("/alerts/{alert_id}/review")
def review(alert_id: str, owner: str = Depends(owner_id)):
    return _set_alert_status(owner, alert_id, "reviewed")


class ReplayReq(BaseModel):
    guided: str | None = None
    portfolio_id: str | None = None
    persona_id: str | None = None
    start: str | None = None
    end: str | None = None
    step_days: int = Field(default=7, ge=1, le=31)


@router.post("/replay")
def replay(req: ReplayReq, owner: str = Depends(owner_id)):
    md = get_market_data()
    for d in (req.start, req.end):
        if d and not (md.start_date <= pd.Timestamp(d) <= md.end_date):
            raise HTTPException(400, {"code": "out_of_range", "message": "date hors de la couverture du jeu de données"})
    return _job_out(jobs.submit(owner, "replay", req.model_dump()))


@router.get("/replay/guided")
def guided():
    return {"guided": GUIDED}


@router.get("/replay/{replay_id}")
def get_replay(replay_id: str, owner: str = Depends(owner_id)):
    d = get_store().get(owner, "REPLAY", replay_id)
    if not d:
        raise HTTPException(404, {"code": "not_found", "message": "rejeu introuvable"})
    return d


@router.get("/snapshots")
def snapshots(portfolio_id: str | None = None, owner: str = Depends(owner_id)):
    return {"snapshots": [{k: s[k] for k in ("snapshot_id", "portfolio_id", "persona_id", "as_of", "created_at", "label", "total_value_cad", "key_metrics")}
                          for s in list_snapshots(owner, portfolio_id)]}


class CompareSnapReq(BaseModel):
    before: str
    after: str


@router.post("/snapshots/compare")
def compare_snapshots(req: CompareSnapReq, owner: str = Depends(owner_id)):
    a, b = get_store().get(owner, "SNAPSHOT", req.before), get_store().get(owner, "SNAPSHOT", req.after)
    if not a or not b:
        raise HTTPException(404, {"code": "not_found", "message": "instantané introuvable"})
    return compare(a, b)


# ------------------------------------------------------------------------------------------------ reports
class ReportReq(BaseModel):
    portfolio_id: str
    persona_id: str | None = None
    end: str | None = None


@router.post("/reports/generate")
def report(req: ReportReq, owner: str = Depends(owner_id)):
    return _job_out(jobs.submit(owner, "report", req.model_dump()))


@router.get("/reports")
def reports(owner: str = Depends(owner_id)):
    return {"reports": [{k: r[k] for k in ("report_id", "title", "period", "created_at", "portfolio_id", "persona_id")} for r in get_store().list(owner, "REPORT", 30)]}


@router.get("/reports/{report_id}")
def get_report(report_id: str, owner: str = Depends(owner_id)):
    d = get_store().get(owner, "REPORT", report_id)
    if not d:
        raise HTTPException(404, {"code": "not_found", "message": "rapport introuvable"})
    return d


# ------------------------------------------------------------------------------------------------ hype intelligence & research
class HypeReq(BaseModel):
    asset_id: str = Field(min_length=1, max_length=20)
    question: str | None = Field(default=None, max_length=500)
    persona_id: str | None = None
    portfolio_id: str | None = None
    amount_cad: float | None = Field(default=None, gt=0, le=10_000_000)
    use_fixture: bool = False


@router.post("/hype/research")
def hype_research(req: HypeReq, owner: str = Depends(owner_id)):
    rate_limit(owner, "hype", 10)
    md = get_market_data()
    res = resolve_asset(md, req.asset_id)
    if res["status"] != "resolved":
        raise HTTPException(409, {"code": "asset_" + res["status"], "message": res.get("message", "actif non résolu"), "candidates": res.get("candidates", [])})
    body = req.model_dump() | {"asset_id": res["asset_id"]}
    return _job_out(jobs.submit(owner, "hype", body))


@router.post("/research/investigate")
def investigate(req: HypeReq, owner: str = Depends(owner_id)):
    return hype_research(req, owner)


@router.get("/hype/research")
def hype_list(owner: str = Depends(owner_id)):
    return {"research": [{"research_id": r["research_id"], "asset_id": r["asset_id"], "name": r["name"], "created_at": r["created_at"],
                          "is_fixture": r.get("is_fixture"), "persona_id": r.get("persona_id"), "attention": (r.get("attention") or {}).get("value")}
                         for r in get_store().list(owner, "HYPE", 30)]}


@router.get("/hype/research/{research_id}")
def hype_get(research_id: str, owner: str = Depends(owner_id)):
    d = get_store().get(owner, "HYPE", research_id)
    if not d:
        raise HTTPException(404, {"code": "not_found", "message": "recherche introuvable"})
    return d


@router.get("/research/{research_id}/evidence")
def research_evidence(research_id: str, owner: str = Depends(owner_id)):
    d = hype_get(research_id, owner)
    return {"research_id": research_id, "evidence": d["evidence"], "claims": d["claims"], "clusters": d["clusters"], "tool_calls": d["tool_calls"]}


@router.get("/hype/assets/{asset_id}/timeline")
def hype_timeline(asset_id: str, owner: str = Depends(owner_id)):
    md = get_market_data()
    aid = asset_id.upper()
    md.asset(aid)
    research = [r for r in get_store().list(owner, "HYPE", 50) if r["asset_id"] == aid]
    events = research[0]["events"] if research else []
    s = md.native_series(aid, "close")
    s = s[s.index >= md.end_date - pd.Timedelta(days=180)]
    return {"asset_id": aid, "events": events, "research_id": research[0]["research_id"] if research else None,
            "prices": [{"date": d.date().isoformat(), "close": float(x)} for d, x in s.items()],
            "note": "Événements issus de la dernière recherche exécutée; prix du jeu de données historique (pas un flux en direct)."}


class ImpactReq(BaseModel):
    portfolio_id: str
    asset_id: str
    amount_cad: float = Field(gt=0, le=10_000_000)
    persona_id: str | None = None


@router.post("/hype/portfolio-impact")
def portfolio_impact(req: ImpactReq, owner: str = Depends(owner_id)):
    md = get_market_data()
    pf = ps.get_portfolio(owner, req.portfolio_id)
    persona = ps.get_persona(owner, req.persona_id or pf.persona_id or "robert")
    aid = req.asset_id.upper()
    res, led = hypothetical_addition(md, pf, persona, aid, req.amount_cad, md.asset(aid)["asset_class"] == "crypto")
    return res


@router.get("/hype/sources/status")
def hype_sources():
    return {"providers": provider_status(), "checked_at": dt.datetime.now(dt.timezone.utc).isoformat()}


@router.get("/hype/trending")
def hype_trending():
    tool = WebResearchTool()
    t = tool.crypto_trending()
    md = get_market_data()
    ids = {r["coingecko_id"]: aid for aid, r in md.universe.iterrows() if r.get("coingecko_id")}
    if not t:
        return {"status": "UNAVAILABLE", "error": (tool.calls[-1] if tool.calls else {}).get("error")}
    for c in t["coins"]:
        c["in_universe"] = ids.get(c["id"])
    return {"status": "OK", "trending": t, "note": "Attention (recherches CoinGecko), pas une mesure de qualité ni une recommandation"}


# ------------------------------------------------------------------------------------------------ hypotheses
class HypRegReq(BaseModel):
    key: str = Field(pattern="^H[1-4]$")
    cutoff: str = "2024-06-28"
    assets: list[str] | None = None
    overrides: dict | None = None


@router.post("/hypotheses/register")
def hyp_register(req: HypRegReq, owner: str = Depends(owner_id)):
    md = get_market_data()
    if not (md.start_date + pd.Timedelta(days=365) <= pd.Timestamp(req.cutoff) <= md.end_date - pd.Timedelta(days=180)):
        raise HTTPException(400, {"code": "bad_cutoff", "message": "la coupure doit laisser au moins 1 an de développement et 6 mois de test"})
    return hypothesis_agent.register(owner, md, req.key, req.cutoff, req.assets, req.overrides)


@router.post("/hypotheses/{hypothesis_id}/evaluate")
def hyp_evaluate(hypothesis_id: str, owner: str = Depends(owner_id)):
    return hypothesis_agent.evaluate(owner, get_market_data(), hypothesis_id)


@router.get("/hypotheses/{hypothesis_id}/results")
def hyp_results(hypothesis_id: str, owner: str = Depends(owner_id)):
    d = get_store().get(owner, "HYP", hypothesis_id)
    if not d:
        raise HTTPException(404, {"code": "not_found", "message": "hypothèse introuvable"})
    return d


@router.get("/hypotheses")
def hyp_list(owner: str = Depends(owner_id)):
    md = get_market_data()
    std = hypothesis_agent.standard_results(md)
    mine = [h for h in get_store().list(owner, "HYP", 50) if "hypothesis_id" in h]
    return {"standard": std, "registered": mine}
