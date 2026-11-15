"""REST API v1. Long multi-agent work returns a job id (poll GET /jobs/{id} for real agent step states)."""
from __future__ import annotations

import datetime as dt
from functools import lru_cache

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import __version__
from ..analytics.benchmarks import BENCHMARKS
from ..analytics.coverage import coverage_report
from ..analytics.lenses import run_asset_lenses
from ..analytics.portfolio import value_holdings
from ..analytics.profile_builder import OnboardingAnswers, build_profile
from ..analytics.tiers import classify_universe
from ..config import get_settings
from ..data.registry import get_market_data
from ..hype_research.pipeline import resolve_asset
from ..methodology import METHODOLOGY
from ..models import InvestorProfile, PortfolioCreate
from ..services import jobs
from ..services import portfolio_service as ps
from ..services.analysis_service import make_snapshot, run_xray
from ..storage.store import get_store
from ..web_research.http import provider_status
from .deps import Account, current_account, owner_id, rate_limit

router = APIRouter(prefix="/api/v1")


def _job_out(job) -> dict:
    return {"job_id": job.job_id, "status": job.status, "kind": job.kind}


# ------------------------------------------------------------------------------------------------ system
@router.get("/health")
def health():
    md = get_market_data()
    return {"status": "ok", "version": __version__, "dataset_version": md.dataset_version, "data_as_of": md.end_date.date().isoformat()}


@lru_cache(maxsize=1)
def _aws_credentials_present() -> bool:
    try:
        import boto3
        return boto3.Session().get_credentials() is not None
    except Exception:  # noqa: BLE001
        return False


@router.get("/system/info")
def system_info():
    s = get_settings()
    llm_ready = s.llm_enabled and _aws_credentials_present()
    return {"llm_ready": llm_ready,
            "llm_status": "Amazon Bedrock prêt" if llm_ready else ("IA désactivée (AEGIS_LLM_ENABLED=false)" if not s.llm_enabled
                                                                   else "Identifiants AWS absents : Amazon Bedrock non configuré"),
            "app": s.app_name, "env": s.env, "region": s.aws_region, "bedrock_region": s.bedrock_region,
            "agent_model_id": s.agent_model_id, "supervisor_model_id": s.supervisor_model_id, "llm_enabled": s.llm_enabled,
            "storage_backend": s.storage_backend, "job_runner": s.job_runner, "web_research_enabled": s.web_research_enabled,
            "live_mode": s.live_mode_enabled,
            "orchestration": "Orchestration multi-agents définie en code; inférence Amazon Bedrock (Converse API); "
                             + ("AWS Lambda (exécution asynchrone)" if s.job_runner == "lambda" else "exécution locale (thread)"),
            "mode": "Rejeu historique (données jusqu'au " + get_market_data().end_date.date().isoformat() + ")"}


@router.get("/sources")
def sources():
    md = get_market_data()
    return {"datasets": md.source_references(), "providers": provider_status(), "benchmarks": BENCHMARKS}


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


# ------------------------------------------------------------------------------------------------ onboarding
def _profile_out(p: InvestorProfile, derivation: list[str] | None = None) -> dict:
    from ..analytics.persona_rules import allowed_tier
    at = allowed_tier(p)
    out = p.model_dump(mode="json") | {"allowed_tier": at["allowed_tier"].value, "binding_inputs": at["binding_inputs"],
                                       "tier_inputs": at["tier_inputs"], "uncertainties": at["uncertainties"],
                                       "benchmark_label": BENCHMARKS.get(p.benchmark_id, {}).get("label")}
    if derivation is not None:
        out["derivation"] = derivation
    return out


@router.post("/onboarding/preview")
def onboarding_preview(answers: OnboardingAnswers):
    """Computes the profile from the answers without saving it, so the user can review every rule first."""
    profile, derivation = build_profile(answers)
    return _profile_out(profile, derivation)


@router.post("/onboarding")
def onboarding(answers: OnboardingAnswers, owner: str = Depends(owner_id)):
    existing = ps.list_personas(owner)
    profile, derivation = build_profile(answers, persona_id=existing[0].persona_id if existing else None)
    saved = ps.save_persona(owner, profile)
    store = get_store()
    store.put(owner, "META", "onboarding", {"answers": answers.model_dump(mode="json"), "derivation": derivation, "at": dt.datetime.utcnow().isoformat()})
    return _profile_out(saved, derivation)


@router.get("/auth/config")
def auth_config():
    """Public sign-in settings (no secret: a Cognito app client id and pool id are meant to be public) and the demo accounts."""
    from ..services import demo_accounts
    s = get_settings()
    return {"mode": s.auth_mode, "region": s.cognito_region, "user_pool_id": s.cognito_user_pool_id, "client_id": s.cognito_client_id,
            "demo_accounts": demo_accounts.public_list() if s.demo_accounts_enabled and s.auth_mode == "cognito" else []}


@router.delete("/me")
def delete_me(owner: str = Depends(owner_id)):
    """« Tout effacer » : removes every record of this account. A demo account is re-created at its next sign-in."""
    from ..storage.store import delete_owner
    return {"deleted": delete_owner(owner)}


@router.get("/me")
def me(owner: str = Depends(owner_id), acct: Account | None = Depends(current_account)):
    """Everything the home screen needs: the user's profile (if onboarded) and portfolios. Empty until onboarding."""
    if acct is not None and get_settings().demo_accounts_enabled:
        from ..services import demo_accounts
        demo_accounts.seed_if_empty(owner, acct.email)
    from ..services import wallet
    profiles = ps.list_personas(owner)
    meta = get_store().get(owner, "META", "onboarding") or {}
    md = get_market_data()
    return {"onboarded": bool(profiles), "profile": _profile_out(profiles[0], meta.get("derivation")) if profiles else None,
            "profiles": [{"persona_id": p.persona_id, "display_name": p.display_name, "is_official": p.is_official} for p in profiles],
            "answers": meta.get("answers"),
            "portfolios": [p.model_dump(mode="json") for p in ps.list_portfolios(owner)],
            "data_as_of": md.end_date.date().isoformat(), "data_start": md.start_date.date().isoformat(),
            "dataset_origin": md.origin, "email": acct.email if acct else None,
            "cash": _wallet_out(wallet.get(owner)) if profiles else None,
            "guide": get_store().get(owner, "META", "guide") or {"tour_done": False, "lessons": [], "dismissed": False}}


# ------------------------------------------------------------------------------------------------ holdings / history / activity
def _user_holdings(owner: str, portfolio_id: str | None) -> list[dict]:
    pfs = [ps.get_portfolio(owner, portfolio_id)] if portfolio_id else ps.list_portfolios(owner)
    return [h.model_dump() for pf in pfs for h in pf.holdings]


@router.get("/holdings")
def holdings(portfolio_id: str | None = None, owner: str = Depends(owner_id)):
    """What the user holds, like a brokerage list: price, day change (native currency), value in CAD, weight, 1-year change."""
    md = get_market_data()
    hs = _user_holdings(owner, portfolio_id)
    if not hs:
        return {"total_value_cad": 0.0, "day_change_cad": 0.0, "holdings": [], "as_of": md.end_date.date().isoformat()}
    pos = value_holdings(md, hs, md.end_date)
    cost: dict[str, float] = {}
    accounts: dict[str, set] = {}
    for x in hs:
        if x.get("acquisition_price") and x.get("acquisition_date"):
            fx_a, _ = md.fx_factor(md.asset(x["asset_id"])["currency"], x["acquisition_date"])
            cost[x["asset_id"]] = cost.get(x["asset_id"], 0.0) + float(x["quantity"]) * float(x["acquisition_price"]) * fx_a
        if (x.get("note") or "").startswith("Compte "):
            accounts.setdefault(x["asset_id"], set()).add(x["note"][len("Compte "):].split(" ••••")[0])
    rows, day_cad = [], 0.0
    for aid, r in pos.iterrows():
        close = md.native_series(aid, "close").dropna()
        adj = md.native_series(aid, "adj_close").dropna()
        prev = float(close.iloc[-2]) if len(close) > 1 else None
        last = float(close.iloc[-1])
        dchg = last - prev if prev else None
        yr = adj[adj.index <= adj.index[-1] - pd.Timedelta(days=365)]
        chg_1y = float(adj.iloc[-1] / yr.iloc[-1] - 1) if len(yr) else None
        fx = r["fx_usdcad"] if r["fx_usdcad"] == r["fx_usdcad"] and r["fx_usdcad"] else 1.0  # NaN-safe: CAD rows have no FX
        if dchg is not None:
            day_cad += dchg * r["quantity"] * fx
        meta = md.asset(aid)
        rows.append({"asset_id": aid, "name": r["name"], "asset_class": r["asset_class"], "sub_class": r["sub_class"], "sector": r["sector"],
                     "currency": r["currency"], "quantity": r["quantity"], "price": last, "price_date": r["price_date"],
                     "day_change": dchg, "day_change_pct": (dchg / prev) if prev else None, "value_cad": r["value_cad"], "weight": r["weight"],
                     "change_1y_pct": chg_1y, "is_single_issuer": bool(int(meta.get("is_single_issuer", 1))),
                     "cost_cad": cost.get(aid), "gain_cad": (r["value_cad"] - cost[aid]) if aid in cost else None,
                     "gain_pct": (r["value_cad"] / cost[aid] - 1) if cost.get(aid) else None, "accounts": sorted(accounts.get(aid, []))})
    total = float(pos["value_cad"].sum())
    tot_cost = sum(cost.values()) if len(cost) == len(pos) else None
    return {"total_value_cad": total, "cost_cad": tot_cost, "gain_cad": (total - tot_cost) if tot_cost else None,
            "gain_pct": (total / tot_cost - 1) if tot_cost else None, "day_change_cad": day_cad, "day_change_pct": day_cad / (total - day_cad) if total - day_cad else None,
            "holdings": sorted(rows, key=lambda x: -x["value_cad"]), "as_of": md.end_date.date().isoformat()}


@router.get("/history")
def history(portfolio_id: str | None = None, days: int = Query(default=365, ge=30, le=2000), owner: str = Depends(owner_id)):
    """Value of the CURRENT holdings over time (quantities held constant), in CAD: « si vous les aviez détenus »."""
    md = get_market_data()
    hs = _user_holdings(owner, portfolio_id)
    if not hs:
        return {"series": []}
    qty: dict[str, float] = {}
    for h in hs:
        qty[h["asset_id"]] = qty.get(h["asset_id"], 0.0) + float(h["quantity"])
    panel, _ = md.cad_panel(list(qty), field="adj_close")
    panel = panel[panel.index >= md.end_date - pd.Timedelta(days=days)].ffill().dropna(how="any")
    val = (panel * pd.Series(qty)).sum(axis=1)
    # scale so that the last point equals today's value at the last close (adj_close vs close differ by past dividends)
    today = float(value_holdings(md, hs, md.end_date)["value_cad"].sum())
    if len(val):
        val = val * (today / float(val.iloc[-1]))
    step = max(1, len(val) // 260)
    pts = [{"date": d.date().isoformat(), "value": round(float(v), 2)} for d, v in val.iloc[::step].items()]
    if len(val) and pts[-1]["date"] != val.index[-1].date().isoformat():
        pts.append({"date": val.index[-1].date().isoformat(), "value": round(float(val.iloc[-1]), 2)})
    return {"series": pts, "change_cad": (pts[-1]["value"] - pts[0]["value"]) if pts else None,
            "change_pct": (pts[-1]["value"] / pts[0]["value"] - 1) if pts and pts[0]["value"] else None,
            "label": "Valeur de vos placements actuels s'ils avaient été détenus sur la période (quantités constantes, dividendes réinvestis, en $ CA)."}


@router.get("/diagnosis")
def diagnosis(portfolio_id: str | None = None, owner: str = Depends(owner_id)):
    """Does the portfolio match the investor's profile? Plain-language problems, most serious first."""
    from ..services.diagnosis import diagnose
    md = get_market_data()
    pfs = [ps.get_portfolio(owner, portfolio_id)] if portfolio_id else ps.list_portfolios(owner)
    pf = next((p for p in pfs if p.holdings), None)
    if pf is None:
        return {"fits": None, "problems": [], "headline": None}
    persona = ps.resolve_persona(owner, None, pf)
    return diagnose(run_xray(md, pf, persona, include_series=False), persona) | {"portfolio_id": pf.portfolio_id}


@router.get("/activity")
def activity(owner: str = Depends(owner_id)):
    """Feed of what happened: agent proposals and decisions, account creation."""
    store = get_store()
    items = []
    for m in store.list(owner, "MANDATE", 50):
        buys = sum(o["amount_cad"] for o in m.get("orders", []) if o["side"] == "buy")
        if m["status"] == "approved":
            items.append({"at": m.get("approved_at") or m["created_at"], "kind": "approved", "title": f"Proposition approuvée : {m['label']}",
                          "detail": f"{len(m['orders'])} ordre(s) · achats {buys:,.0f} $".replace(",", " "), "mandate_id": m["mandate_id"]})
        items.append({"at": m["created_at"], "kind": "proposed" if m["status"] == "proposed" else "rejected" if m["status"] == "rejected" else "analysed",
                      "title": ("En attente de votre décision : " if m["status"] == "proposed" else "Les agents ont analysé : ") + f"« {m['request']} »",
                      "detail": m["headline"], "mandate_id": m["mandate_id"]})
    for pf in ps.list_portfolios(owner):
        items.append({"at": pf.created_at, "kind": "account", "title": f"Compte ouvert : {pf.name}", "detail": "Portefeuille simulé"})
    meta = store.get(owner, "META", "onboarding")
    if meta:
        items.append({"at": meta.get("at"), "kind": "profile", "title": "Profil d'investisseur établi", "detail": "Questionnaire « Connaître son client »"})
    items = [i for i in items if i.get("at")]
    return {"items": sorted(items, key=lambda x: x["at"], reverse=True)[:30]}


# ------------------------------------------------------------------------------------------------ connections (simulated)
@router.get("/connections/institutions")
def institutions():
    from ..services.connection_service import INSTITUTIONS
    return {"institutions": INSTITUTIONS, "mode": "simulation"}


@router.get("/connections/{institution_id}/preview")
def connection_preview(institution_id: str, owner: str = Depends(owner_id)):
    from ..services.connection_service import preview
    return preview(get_market_data(), owner, institution_id)


class ConnectReq(BaseModel):
    institution_id: str = Field(min_length=1, max_length=40)
    accounts: list[str] = Field(min_length=1, max_length=6)


@router.post("/connections")
def connect_accounts(req: ConnectReq, owner: str = Depends(owner_id)):
    """Imports the (simulated) existing accounts as the user's portfolio. No credential is ever requested."""
    from ..services.connection_service import connect
    persona = ps.resolve_persona(owner)
    pf = connect(get_market_data(), owner, persona.persona_id, req.institution_id, req.accounts)
    get_store().put(owner, "PORTFOLIO", pf.portfolio_id, pf.model_dump(mode="json"))
    return pf.model_dump(mode="json")


# ------------------------------------------------------------------------------------------------ mandates (agentic workflow)
class MandateReq(BaseModel):
    request: str = Field(default="", max_length=500)
    portfolio_id: str | None = None
    structured: dict | None = None  # optional explicit {kind, amount_cad, asset_id} from the UI


@router.post("/mandates")
def create_mandate(req: MandateReq, owner: str = Depends(owner_id)):
    """Starts the agentic workflow on the user's own request, profile and portfolio. Poll /jobs/{id} for live agent steps."""
    if not req.request.strip() and not req.structured:
        raise HTTPException(400, {"code": "empty", "message": "Dites-moi ce que vous voulez faire."})
    rate_limit(owner, "mandate", 10)
    return _job_out(jobs.submit(owner, "mandate", req.model_dump()))


@router.get("/mandates")
def list_mandates(owner: str = Depends(owner_id)):
    items = get_store().list(owner, "MANDATE", 30)
    return {"mandates": [{k: m.get(k) for k in ("mandate_id", "status", "created_at", "request", "headline", "label")} for m in
                         sorted(items, key=lambda x: x["created_at"], reverse=True)]}


@router.get("/mandates/{mandate_id}")
def get_mandate(mandate_id: str, owner: str = Depends(owner_id)):
    m = get_store().get(owner, "MANDATE", mandate_id)
    if not m:
        raise HTTPException(404, {"code": "not_found", "message": "mandat introuvable"})
    job = get_store().get(owner, "JOB", m.get("job_id") or "-") if m.get("job_id") else None
    return m | {"trace": (job or {}).get("steps", [])}


@router.post("/mandates/{mandate_id}/approve")
def approve_mandate(mandate_id: str, owner: str = Depends(owner_id)):
    from ..agents.mandate import approve
    from ..services.wallet import InsufficientCash
    try:
        return approve(owner, mandate_id)
    except InsufficientCash as exc:
        raise HTTPException(status_code=409, detail={"code": "insufficient_cash", "message": str(exc)}) from exc


@router.post("/mandates/{mandate_id}/reject")
def reject_mandate(mandate_id: str, owner: str = Depends(owner_id)):
    from ..agents.mandate import reject
    return reject(owner, mandate_id)


# ------------------------------------------------------------------------------------------------ market signals (ULYSSE engine)
@router.get("/market/signals")
def market_signals(owner: str = Depends(owner_id)):
    """Market climate and unusual attention on the user's own holdings (omitted when the ULYSSE engine is not available)."""
    from ..services import market_signals as sig
    md = get_market_data()
    held = sorted({h.asset_id for p in ps.list_portfolios(owner) for h in p.holdings})
    return {"climate": sig.climate(), "attention": sig.attention(held, md)}


@router.get("/assets/{asset_id}/signals")
def asset_signals(asset_id: str):
    from ..services import market_signals as sig
    md = get_market_data()
    if not md.has_asset(asset_id):
        raise HTTPException(status_code=404, detail={"code": "unknown_asset", "message": "Actif hors de l'univers couvert."})
    return {"facts": sig.asset_facts(asset_id, md.asset(asset_id)["name"])}


# ------------------------------------------------------------------------------------------------ cash and guidance
class DepositReq(BaseModel):
    amount_cad: float = Field(gt=0, le=100_000)


@router.post("/wallet/deposit")
def wallet_deposit(req: DepositReq, owner: str = Depends(owner_id)):
    """Adds simulated money to invest (no real money)."""
    from ..services import wallet
    if not ps.list_personas(owner):
        raise HTTPException(status_code=409, detail={"code": "not_onboarded", "message": "Répondez d'abord au questionnaire."})
    return _wallet_out(wallet.deposit(owner, req.amount_cad))


class GuideReq(BaseModel):
    tour_done: bool | None = None
    lesson_done: str | None = Field(default=None, max_length=40)
    dismissed: bool | None = None


@router.put("/guide")
def guide(req: GuideReq, owner: str = Depends(owner_id)):
    """Newcomer guidance progress (guided tour, lessons read), kept with the account so it follows the person everywhere."""
    st = get_store()
    g = st.get(owner, "META", "guide") or {"tour_done": False, "lessons": [], "dismissed": False}
    if req.tour_done is not None:
        g["tour_done"] = req.tour_done
    if req.dismissed is not None:
        g["dismissed"] = req.dismissed
    if req.lesson_done and req.lesson_done not in g["lessons"]:
        g["lessons"].append(req.lesson_done)
    st.put(owner, "META", "guide", g)
    return g


def _wallet_out(w: dict | None) -> dict | None:
    if not w:
        return None
    return {"cash_cad": w["cash_cad"], "start_cad": w.get("start_cad"), "moves": w.get("moves", [])[:8]}


# ------------------------------------------------------------------------------------------------ about
@router.get("/about")
def about():
    """References behind the projections and the profile, for the « À propos » page (kept out of the client screens)."""
    return {"references": [
        {"label": "Normes d'hypothèses de projection 2026 (FP Canada et Institut de planification financière)", "url": "https://institutpf.org/en/projection-assumption-guidelines"},
        {"label": "Connaître son client : Règle 3200 de l'OCRI (convenance des recommandations)", "url": "https://www.ciro.ca/"},
    ]}


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
    persona = ps.resolve_persona(owner, req.persona_id, pf)
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


@router.get("/jobs/{job_id}")
def job(job_id: str, owner: str = Depends(owner_id)):
    j = jobs.get_job(owner, job_id)
    if not j:
        raise HTTPException(404, {"code": "not_found", "message": "tâche introuvable"})
    return j.model_dump(mode="json")


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
