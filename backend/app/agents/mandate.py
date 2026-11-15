"""Mandat d'investissement : the agentic workflow that turns « ce que je veux faire » into a verified, explained proposal.

The person writes a request in plain French (« J'ai 10 000 $ à investir », « Je veux 2 000 $ de NVIDIA », « Rééquilibre mon
portefeuille ») about THEIR OWN profile and portfolio. Agents coordinate, each with a role, data, tools and a checkpoint:

  1. Agent Profil          reads the investor's limits (KYC: tolerance, capacity, knowledge)            deterministic
  2. Superviseur           understands the request (amount, asset, intent)                              deterministic
  3. Agent Données         validates prices, currencies, staleness                                      deterministic
  4. Agent Recherche       official filings + news for a requested security (SEC EDGAR, GDELT)          live tools
  5. Agent Analyste        builds concrete orders (plan, verdict, rebalancing)                         deterministic
  6. Agent Gouvernance     checks every order against the profile; adjusts or blocks                    deterministic
  7. Agent Scénarios       stress tests: 2022 replay + explicit shocks, before vs after                 deterministic
  8-9. Agents Pour/Contre  argue on the same evidence packet (independent LLM calls)                     Amazon Bedrock
  10. Agent Gouvernance    audits every number/claim the advocates cite against the metric ledger       deterministic
  11. Agent Explicabilité  writes the decision; audited again; deterministic fallback                    Amazon Bedrock
Nothing is executed until the person approves (simulation only). Numbers come from tested Python, never from the models.
"""
from __future__ import annotations

import re
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout

from ..analytics.ledger import MetricLedger
from ..analytics.portfolio import value_holdings
from ..analytics.scenarios import SHOCK_PRESETS, apply_shock, historical_replay
from ..config import get_settings
from ..data.registry import get_market_data
from ..errors import NotFound
from ..governance.validator import check_free_text, strip_sentences
from ..guardian.replay import GUIDED
from ..i18n import sector_fr
from ..ids import new_id
from ..models import InvestorProfile, Portfolio, utcnow
from ..services import portfolio_service as ps
from ..services.analysis_service import persona_numbers, run_xray
from ..services.invest_service import check_investment
from ..services.plan_service import ROLES, _fits, recommended_plan
from ..services.portfolio_service import _build_holdings
from ..storage.store import get_store
from . import audit_agent, data_agent, market_intelligence_agent, opportunity_agent, persona_agent, risk_agent
from .base import EvidencePacket, JobTracker, compact_json
from .copilot import mentioned_assets
from .llm import LLMError, get_llm, json_call

STEPS = [
    ("profile.read", "persona_agent", "Agent Profil : lit vos limites"),
    ("supervisor.understand", "supervisor", "Superviseur : comprend votre demande"),
    ("data.collect", "data_agent", "Agent Données : valide prix, devises et taux"),
    ("market_intelligence.research", "market_intelligence_agent", "Agent Recherche : sources officielles et nouvelles"),
    ("quant.proposal", "quant_agent", "Agent Analyste : construit la proposition"),
    ("governance.orders", "audit_agent", "Agent Gouvernance : vérifie chaque ordre"),
    ("scenario.stress", "hypothesis_agent", "Agent Scénarios : met la proposition à l'épreuve"),
    ("opportunity.r1", "opportunity_agent", "Agent Opportunités : arguments pour"),
    ("risk.r1", "risk_agent", "Agent Risques : arguments contre"),
    ("audit.claims", "audit_agent", "Agent Gouvernance : vérifie chaque chiffre cité"),
    ("supervisor.explain", "supervisor", "Agent Explicabilité : rédige la décision"),
]
REVIEW_WORDS = r"r[ée][ée]quilibr|r[ée]organis|analys|revoi[sr]|corrige|diversifi|mon portefeuille|mes placements|v[ée]rifie"
STRESS_KEYS = ["broad_bear", "rates_up_100bp", "tech_crash_30"]
DEBATE_MAX_TOKENS = 1200     # the mandate only shows a position and 3 claims per side
DEBATE_BUDGET_S = 75         # past this, the proposal is shown without the pros/cons rather than making the client wait
RESEARCH_BUDGET_S = 30       # live news sources (SEC, GDELT) can be slow: the analysis continues without them
COMPACT = ("\n\nFORMAT POUR CETTE DÉCISION: position de 40 mots maximum; exactement 3 claims de 30 mots maximum; "
           "assumptions, counterarguments et uncertainties: 1 élément maximum chacun; aucun test proposé.")
EXPLAINER_SYSTEM = """Tu es l'Agent Explicabilité d'AEGIS. Tu reçois une proposition d'investissement DÉJÀ calculée et vérifiée
(ordres, contrôles de gouvernance, scénarios, arguments vérifiés). Tu l'expliques à une personne qui n'y connaît rien, en français simple.
Règles: n'écris AUCUN chiffre toi-même : à la place de chaque valeur, écris son identifiant entre crochets et l'interface affichera
la valeur vérifiée (ex. « la variation typique passerait à [mnd.vol.after] »). N'utilise que des identifiants présents dans MÉTRIQUES,
et seulement si leur LIBELLÉ correspond exactement à ce que dit ta phrase (ex. le coussin de sécurité = [mnd.kyc.emergency_months],
jamais un seuil de baisse). Dans le doute, n'écris pas de chiffre.
pas de prévision de prix, pas de promesse de rendement, pas de « garanti »; distingue fait, hypothèse et limite.
Style: phrases courtes et simples, 18 mots maximum par point, aucun emoji, aucun symbole décoratif, pas de jargon.
Réponds UNIQUEMENT en JSON: {"why": ["3 raisons courtes"], "watch": ["au plus 2 points d'attention"], "limits": ["2 limites de l'analyse"]}"""


def _cad(x: float) -> str:
    return f"{x:,.0f}\u00a0$".replace(",", "\u202f")


def _pct(x: float | None) -> str:
    return "n/d" if x is None else f"{x * 100:.1f} %".replace(".", ",")


# ------------------------------------------------------------------------------------------------ 2. understand
def parse_request(md, text: str, override: dict | None = None) -> dict:
    """Amount, asset and intent from plain French. Explicit fields from the UI win over the text."""
    override = override or {}
    t = text.lower().replace(" ", " ").replace("\xa0", " ")
    amount = None
    for m in re.finditer(r"(\d{1,3}(?:[ ,.]\d{3})+|\d+(?:[.,]\d+)?)\s*(k\b|mille\b|000\b)?\s*(\$|dollars?|cad)?", t):
        raw, mult, cur = m.group(1), m.group(2), m.group(3)
        val = float(re.sub(r"[ ,.](?=\d{3}\b)", "", raw).replace(",", "."))
        if mult in ("k", "mille"):
            val *= 1000
        if cur or mult or val >= 50:
            amount = max(amount or 0, val)
    assets = mentioned_assets(md, text)
    asset = override.get("asset_id") or (assets[0] if assets else None)
    amount = float(override.get("amount_cad") or 0) or amount
    if override.get("kind"):
        kind = override["kind"]
    elif asset:
        kind = "buy_asset"
    elif re.search(REVIEW_WORDS, t) and not amount:
        kind = "review"
    elif amount:
        kind = "invest"
    else:
        kind = "review"
    assumptions = []
    if kind == "buy_asset" and not amount:
        amount = 1000.0
        assumptions.append("Aucun montant précisé : j'ai supposé 1 000 $.")
    return {"kind": kind, "amount_cad": amount, "asset_id": asset.upper() if asset else None, "assets_mentioned": assets, "assumptions": assumptions}


GENERIC = set("""argent montant somme portefeuille placement placements fonds fnb etf action actions obligation obligations bourse marché
marches marchés compte celi reer celiapp reee épargne epargne croissance stabilité stabilite cash dollars dollar mois an ans année
quelque chose truc trucs ça ca cela ce ces cette un une le la les l du des de mon ma mes son sa ses leur nos vos tout tous""".split())
RESOLVER_SYSTEM = """Tu associes le placement nommé par un client à un identifiant d'une LISTE fermée. Le client peut faire des fautes,
utiliser un surnom, un ticker en minuscules ou le nom en français (ex. « btc » → BTC-USD, « la banque royale » → RY.TO).
Si rien dans la liste ne correspond vraiment, réponds null : n'invente jamais et ne choisis pas « le plus proche » par défaut.
Réponds UNIQUEMENT en JSON: {"asset_id": "ID" ou null, "named": "le nom tel que compris"}"""


def candidate_name(text: str) -> str | None:
    """The word(s) after « dans / acheter / de … » that look like a specific security, when the regex matcher found none."""
    t = text.lower().replace("\xa0", " ")
    m = re.search(r"(?:dans|acheter|achète|achete|investir en|placer en|mettre en|du|de l'|des actions de|des parts de)\s+((?:[a-z0-9&'.\-]+\s*){1,3})", t)
    if not m:
        return None
    words = [w for w in re.split(r"[\s']+", m.group(1)) if w and w not in GENERIC and not re.fullmatch(r"[\d.,k$]+", w)]
    return " ".join(words[:3]) or None


def resolve_with_llm(md, llm, text: str, name: str, model_id: str) -> tuple[str | None, dict | None]:
    """Last resort for a name the matcher missed: the model picks within the closed universe, or says it is not covered."""
    universe = "\n".join(f"{aid} | {r['name']} | {r.get('aliases') or ''}" for aid, r in md.universe.iterrows())
    data, usage = json_call(llm, system=RESOLVER_SYSTEM, user=f"LISTE:\n{universe}\n\nDEMANDE DU CLIENT: {text}\nNOM À ASSOCIER: {name}",
                            model_id=model_id, max_tokens=120, agent_id="supervisor")
    aid = data.get("asset_id")
    return (aid if aid in md.universe.index else None), usage


# ------------------------------------------------------------------------------------------------ helpers
def _amounts(md, pf: Portfolio | None) -> dict[str, float]:
    if pf is None or not pf.holdings:
        return {}
    pos = value_holdings(md, [h.model_dump() for h in pf.holdings], md.end_date)
    return {a: float(pos.loc[a, "value_cad"]) for a in pos.index}


def _portfolio(persona: InvestorProfile, amounts: dict[str, float]) -> Portfolio | None:
    rows = [{"asset_id": a, "amount_cad": round(v, 2)} for a, v in amounts.items() if v >= 1]
    if not rows:
        return None
    holdings, _ = _build_holdings(rows, None)
    return Portfolio(portfolio_id="mandate-after", owner_id="-", name="Après la proposition", persona_id=persona.persona_id, holdings=holdings)


def _new_money_orders(md, persona: InvestorProfile, current: dict[str, float], amount: float, why_prefix: str) -> tuple[list[dict], dict]:
    """New money goes first to what is MISSING versus the profile's target mix for the whole portfolio (no sale needed),
    so a deposit also corrects an existing imbalance. Without current holdings this is simply the target mix."""
    total = sum(current.values()) + amount
    plan = recommended_plan(md, persona, total)
    w = plan["weights"]
    stable_ids = {h["asset_id"] for sl in plan["sleeves"] if sl["key"] == "stable" for h in sl["holdings"]}

    def is_stable(a: str) -> bool:
        m = md.asset(a)
        return a in stable_ids or m.get("sub_class") == "bond_etf" or m.get("sector") == "Fixed Income"

    # 1. which sleeve is missing money (stability vs growth), measured on the whole portfolio
    have = {"stable": sum(v for a, v in current.items() if is_stable(a)), "growth": sum(v for a, v in current.items() if not is_stable(a))}
    share = {"stable": plan["stable_share"], "growth": plan["growth_share"]}
    need = {k_: max(0.0, total * share[k_] - have[k_]) for k_ in share}
    gap = sum(need.values())
    sleeve_amt = ({k_: amount * need[k_] / gap for k_ in need} if gap >= amount and gap > 0
                  else {k_: need[k_] + (amount - gap) * share[k_] for k_ in need})
    # 2. inside each sleeve, the funds that are furthest below their target first
    alloc: dict[str, float] = {}
    for key in ("stable", "growth"):
        members = [a for a in w if (a in stable_ids) == (key == "stable")]
        if not members or sleeve_amt[key] < 1:
            continue
        d = {a: max(0.0, total * w[a] - current.get(a, 0.0)) for a in members}
        tot_d = sum(d.values())
        base = d if tot_d > 0 else {a: w[a] for a in members}
        tb = sum(base.values())
        for a in members:
            alloc[a] = alloc.get(a, 0) + sleeve_amt[key] * base[a] / tb
    deficit = {a: max(0.0, total * w[a] - current.get(a, 0.0)) for a in w}
    meta = {h["asset_id"]: (h["role"], h["explanation"], sl["label"]) for sl in plan["sleeves"] for h in sl["holdings"]}
    out = []
    for a, v in sorted(alloc.items(), key=lambda x: -x[1]):
        if v >= 1:
            role, expl, sleeve = meta[a]
            fill = current and deficit[a] > 0
            out.append({"side": "buy", "asset_id": a, "name": md.asset(a)["name"], "label": role, "amount_cad": round(v, 2), "sleeve": sleeve,
                        "why": why_prefix + (f"{expl} (complète ce qui manque dans votre portefeuille)" if fill else expl)})
    return out, plan


def _minimal_correction(md, persona: InvestorProfile, current: dict[str, float]):
    """Fewest changes that bring the portfolio back within the profile, like an advisor would:
    1. trim what breaks a size limit (one company, crypto, a sector-dominated fund such as QQQ);
    2. if there is still too much growth, trim single stocks first, then thematic funds, then broad equity funds;
    3. reinvest the proceeds where the profile's target mix is short (usually bonds) — compliant holdings are kept.
    Returns (orders, plan), or None when the result still breaks a limit (the caller then rebalances fully)."""
    from ..methodology import METHODOLOGY
    b = persona.budget
    amounts = dict(current)
    V = sum(amounts.values())
    sold: dict[str, float] = {}
    why: dict[str, str] = {}
    meta = {a: md.asset(a) for a in amounts}

    def sell(a: str, x: float, reason: str) -> None:
        x = min(x, amounts.get(a, 0.0))
        if x < 1:
            return
        amounts[a] -= x
        sold[a] = sold.get(a, 0.0) + x
        why[a] = reason  # the last reason is the one that decided the final amount

    crypto = [a for a in amounts if meta[a]["asset_class"] == "crypto"]
    thematic = METHODOLOGY.get("thematic_etfs", {})
    for a in amounts:
        if a not in crypto and int(meta[a].get("is_single_issuer", 1)) and amounts[a] > b.max_single_issuer * V:
            sell(a, amounts[a] - b.max_single_issuer * V, f"Ramené à {b.max_single_issuer:.0%} : une seule entreprise ne doit pas peser trop lourd.")
    c = sum(amounts[a] for a in crypto)
    if c > b.max_speculative * V + 1:
        for a in crypto:
            sell(a, (c - b.max_speculative * V) * amounts[a] / c, "Les cryptoactifs dépassent la part que votre profil permet.")
    for a, sector in thematic.items():
        if amounts.get(a, 0) > 1:
            expo = amounts[a] + sum(v for x, v in amounts.items() if x != a and meta[x]["sector"] == sector)
            if expo > b.max_single_sector * V:
                sell(a, expo - b.max_single_sector * V, "Trop concentré sur un seul thème (fonds dominé par la technologie).")

    def is_growth(a: str) -> bool:
        m = meta[a]
        return m["asset_class"] in ("equity", "crypto") or m.get("sub_class") in ("equity_etf", "esg_equity_etf")

    mid = min(b.growth_max, max(b.growth_min, round((b.growth_min + b.growth_max) / 2 / 0.05) * 0.05))
    g = sum(v for a, v in amounts.items() if is_growth(a))
    if g > b.growth_max * V:
        excess = g - mid * V
        tiers = [[a for a in amounts if is_growth(a) and int(meta[a].get("is_single_issuer", 1)) and a not in crypto],
                 [a for a in amounts if a in thematic], [a for a in amounts if is_growth(a) and meta[a]["asset_class"] == "etf" and a not in thematic]]
        tier_why = [f"Une action seule est le placement le plus risqué : vendue en premier pour ramener vos actions vers {mid * 100:.0f} %.",
                    "Fonds concentré sur la technologie : vendu avant les fonds diversifiés.",
                    f"Fonds diversifié : on en garde une partie pour la croissance, le reste ramène vos actions vers {mid * 100:.0f} %."]
        for tier, reason in zip(tiers, tier_why):
            pool = sum(amounts[a] for a in tier)
            if excess <= 1 or pool <= 1:
                continue
            take = min(excess, pool)
            for a in tier:
                sell(a, take * amounts[a] / pool, reason)
            excess -= take
    cash = sum(sold.values())
    if cash < 1:
        return None
    buys, plan = _new_money_orders(md, persona, {a: v for a, v in amounts.items() if v > 1}, cash, "Avec le produit des ventes : ")
    net: dict[str, float] = {a: -v for a, v in sold.items()}
    for o in buys:
        net[o["asset_id"]] = net.get(o["asset_id"], 0.0) + o["amount_cad"]
    bmeta = {o["asset_id"]: o for o in buys}
    orders = []
    for a, d in sorted(net.items(), key=lambda kv: kv[1]):
        if abs(d) < max(25.0, 0.005 * V):
            continue
        name = md.asset(a)["name"]
        orders.append({"side": "buy" if d > 0 else "sell", "asset_id": a, "name": name,
                       "label": bmeta[a]["label"] if a in bmeta else ROLES.get(a, (name,))[0], "amount_cad": round(abs(d), 2),
                       "sleeve": "Correction", "why": bmeta[a]["why"] if d > 0 and a in bmeta else why.get(a, "Réduit.")})
    after = dict(current)
    for o in orders:
        after[o["asset_id"]] = after.get(o["asset_id"], 0.0) + (o["amount_cad"] if o["side"] == "buy" else -o["amount_cad"])
    xr = run_xray(md, _portfolio(persona, after), persona, include_series=False)
    return (orders, plan) if _fits(xr) else None


def _plan_orders(plan: dict, amount: float, why_prefix: str) -> list[dict]:
    out = []
    for s in plan["sleeves"]:
        for h in s["holdings"]:
            amt = round(amount * h["share"], 2)
            if amt >= 1:
                out.append({"side": "buy", "asset_id": h["asset_id"], "name": h["name"], "label": h["role"], "amount_cad": amt,
                            "sleeve": s["label"], "why": f"{why_prefix}{h['explanation']}"})
    return out


def _snap(xr: dict | None) -> dict | None:
    if not xr:
        return None
    L = xr["ledger"]
    pa = xr.get("persona_assessment") or {}
    return {"total_value_cad": xr["total_value_cad"], "volatility": L.get("pf.vol", {}).get("value"), "max_drawdown": L.get("pf.mdd", {}).get("value"),
            "growth_share": L.get("pf.growth_share", {}).get("value"), "portfolio_tier": pa.get("portfolio_tier"), "allowed_tier": pa.get("allowed_tier"),
            "positions": [{"asset_id": p["asset_id"], "name": p["name"], "value_cad": p["value_cad"], "weight": p["weight"], "tier": p["tier"]} for p in xr["positions"]],
            "checks": [{"rule_id": c["rule_id"], "label": c["label"], "status": c["status"], "measured": c["measured"], "limit": c["limit"]}
                       for c in pa.get("budget_checks", [])]}


# ------------------------------------------------------------------------------------------------ orchestration
def run_mandate(tracker: JobTracker, owner: str, req: dict) -> dict:
    s = get_settings()
    md = get_market_data()
    llm = get_llm()
    for sid, ag, label in STEPS:
        tracker.add(sid, ag, label)
    led = MetricLedger()
    usages: list[dict] = []
    request = (req.get("request") or "").strip()[:500]

    # 1. profile
    tracker.start("profile.read")
    try:
        pf = ps.resolve_portfolio(owner, req.get("portfolio_id"))
    except NotFound:
        pf = None
    persona = ps.resolve_persona(owner, req.get("persona_id"), pf)
    b = persona.budget
    k = persona.kyc or {}
    constraints = [f"actions entre {_pct(b.growth_min)} et {_pct(b.growth_max)}", f"max {_pct(b.max_single_issuer)} par entreprise",
                   f"max {_pct(b.max_single_sector)} par secteur", "pas de crypto" if b.max_speculative <= 0 else f"crypto ≤ {_pct(b.max_speculative)}"]
    if persona.excluded_sectors:
        constraints.append("secteurs exclus : " + ", ".join(sector_fr(x) for x in persona.excluded_sectors))
    if persona.esg_preference:
        constraints.append("préférence ESG")
    snap = k.get("snapshot") or {}
    kyc_metrics = [("mnd.kyc.emergency_months", "Coussin de sécurité (mois de dépenses)", snap.get("emergency_months"), "count"),
                   ("mnd.kyc.monthly_margin", "Marge mensuelle déclarée", snap.get("monthly_margin"), "cad"),
                   ("mnd.kyc.debts", "Dettes déclarées (hors hypothèque)", snap.get("debts_cad"), "cad")]
    kyc_metrics += [(f"mnd.kyc.step.{st['kind']}", f"Avant d'investir : {st['title']}", st.get("amount_cad"), "cad") for st in k.get("before_investing", [])]
    for mid_, lab, val, unit in kyc_metrics:
        if val is not None:
            led.add(mid_, lab, float(val), unit, "réponses du questionnaire « Connaître son client »", source_ids=[f"persona_{persona.persona_id}"])
    tracker.done("profile.read", f"Profil {persona.risk_profile_label} · " + " · ".join(constraints))

    # 2. understand
    tracker.start("supervisor.understand")
    intent = parse_request(md, request, req.get("structured"))
    unknown_name = None
    if not intent["asset_id"] and intent["kind"] != "review" and not req.get("structured"):
        name = candidate_name(request)
        if name:
            found = None
            if llm is not None:
                try:
                    found, usage = resolve_with_llm(md, llm, request, name, s.supervisor_model_id)
                    usages.append(usage)
                except Exception:  # noqa: BLE001 — the deterministic path below still answers
                    found = None
            if found:
                intent = parse_request(md, request, {"kind": "buy_asset", "asset_id": found, "amount_cad": intent["amount_cad"]})
                intent["assumptions"].append(f"J'ai compris « {name} » comme {md.asset(found)['name']}.")
            else:
                unknown_name = name
                intent["assumptions"].append(f"Je ne suis pas « {name} » : je propose plutôt un portefeuille diversifié.")
    if intent["kind"] == "review" and (pf is None or not pf.holdings):
        tracker.fail("supervisor.understand", "Aucun placement à analyser et aucun montant à investir")
        raise ValueError("Je n'ai trouvé ni montant à investir ni placements à analyser. Ex. « J'ai 5 000 $ à investir » ou ajoutez vos placements.")
    label = (f"Investir {_cad(intent['amount_cad'])}" if intent["kind"] == "invest" else
             f"Acheter {_cad(intent['amount_cad'])} de {intent['asset_id']}" if intent["kind"] == "buy_asset" else
             "Analyser et, si besoin, rééquilibrer mon portefeuille")
    tracker.done("supervisor.understand", label + ("" if not intent["assumptions"] else " · " + " ".join(intent["assumptions"])))

    # 3. data
    tracker.start("data.collect")
    before_amounts = _amounts(md, pf)
    assets = sorted(set(before_amounts) | ({intent["asset_id"]} if intent["asset_id"] else set()) | set(ROLES))
    prov = data_agent.collect(md, assets)
    tracker.done("data.collect", f"{len(prov['assets'])} actifs validés du {prov['coverage'][0]} au {prov['coverage'][1]} · "
                                 f"{len(prov['issues'])} signalement(s) de qualité · devises converties en $ CA (Banque du Canada)")

    # 4. research (only when a specific security is requested)
    tracker.start("market_intelligence.research")
    research = None
    if intent["kind"] == "buy_asset":
        try:
            rex = ThreadPoolExecutor(max_workers=1)
            fut = rex.submit(market_intelligence_agent.investigate, md, intent["asset_id"], request or label, persona,
                             pf if pf and pf.holdings else None, intent["amount_cad"])
            rex.shutdown(wait=False)
            try:
                research = fut.result(timeout=RESEARCH_BUDGET_S)
            except FuturesTimeout:
                raise RuntimeError(f"sources trop lentes (> {RESEARCH_BUDGET_S} s)") from None
            led.merge(MetricLedger.from_dict(research["ledger"]))
            n_ver = sum(1 for e in research["events"] if e.get("primary_source"))
            tracker.done("market_intelligence.research", f"{n_ver} fait(s) vérifié(s) de sources officielles · {len(research['claims'])} affirmation(s) examinée(s) · "
                         + ", ".join(f"{c['tool']}={c['status']}" for c in research.get("tool_calls", [])[:4]))
        except Exception as exc:  # noqa: BLE001 - research is optional: say so, continue
            research = None
            tracker.fail("market_intelligence.research", f"Recherche indisponible ({str(exc)[:80]}) : l'analyse continue sans elle")
    else:
        tracker.skip("market_intelligence.research", "Pas de titre précis demandé : uniquement des fonds diversifiés, aucune recherche de nouvelles nécessaire")

    # 5. analyst: concrete orders
    tracker.start("quant.proposal")
    before_xr = run_xray(md, pf, persona, include_series=False) if pf and pf.holdings else None
    from ..services.diagnosis import diagnose
    diagnosis = diagnose(before_xr, persona) if before_xr else None
    orders: list[dict] = []
    requested = None
    verdict = None
    plan = None
    amt = float(intent["amount_cad"] or 0)
    if intent["kind"] == "invest":
        orders, plan = _new_money_orders(md, persona, before_amounts, amt, "")
    elif intent["kind"] == "buy_asset":
        A = intent["asset_id"]
        verdict = check_investment(md, persona, pf if pf and pf.holdings else None, A, amt)
        requested = {"asset_id": A, "name": verdict["name"], "amount_cad": amt, "verdict": verdict["verdict"], "max_amount_cad": verdict["max_amount_cad"],
                     "reasons": [r["text"] for r in verdict["reasons"]], "tier": verdict["asset_tier"]["tier"],
                     "allowed_tier": verdict["allowed_tier"], "volatility": verdict["asset_tier"].get("volatility"),
                     "max_drawdown": verdict["asset_tier"].get("max_drawdown"), "points": [dict(r) for r in verdict["reasons"]]}
        ok_amt = amt if verdict["verdict"] == "suitable" else verdict["max_amount_cad"]
        # The verdict tests the request ALONE. If only a size limit is at stake (not a preference, the horizon or the risk level),
        # the request can be combined with diversified funds for the rest: the cap then applies to the combined portfolio.
        hard = any(r["tone"] == "bad" and not r.get("budget") for r in verdict["reasons"])
        meta_a = md.asset(A)
        cap = b.max_speculative if meta_a["asset_class"] == "crypto" else b.max_single_issuer if int(meta_a.get("is_single_issuer", 1)) else None
        # ...but never when the portfolio ALREADY holds too much growth: a single risky security would add to the problem,
        # even if the bonds bought alongside lower the overall share (the advisor fixes the imbalance first).
        too_much_growth = bool(before_xr) and any(c["rule_id"] == "budget.growth_band" and c["status"] == "ABOVE_BAND"
                                                  for c in (before_xr.get("persona_assessment") or {}).get("budget_checks", []))
        if verdict["verdict"] != "suitable" and not hard and cap and not (too_much_growth and meta_a.get("sub_class") != "bond_etf"):
            from ..services.invest_service import _problems
            x = float(int(min(amt, cap * (sum(before_amounts.values()) + amt)) // 50 * 50))
            for _ in range(5):
                if x <= ok_amt or x < 50:
                    break
                trial = dict(before_amounts)
                trial[A] = trial.get(A, 0) + x
                more, _p = _new_money_orders(md, persona, trial, amt - x, "")
                for o in more:
                    trial[o["asset_id"]] = trial.get(o["asset_id"], 0) + o["amount_cad"]
                tx = run_xray(md, _portfolio(persona, trial), persona, include_series=False,
                              speculative_extra={A} if meta_a["asset_class"] == "crypto" else None)
                if not _problems(before_xr, tx):
                    ok_amt = x
                    requested["verdict"] = "partial"
                    requested["max_amount_cad"] = x
                    requested["reasons"].append(f"En plaçant le reste dans des fonds diversifiés, jusqu'à {_cad(x)} restent dans vos limites.")
                    requested["points"].append({"tone": "good", "text": requested["reasons"][-1]})
                    break
                x = float(int(x * 0.75 // 50 * 50))
        if ok_amt >= 1:
            orders.append({"side": "buy", "asset_id": A, "name": verdict["name"], "label": verdict["name"], "amount_cad": ok_amt, "sleeve": "Votre demande",
                           "why": "Votre demande, " + ("acceptée telle quelle." if verdict["verdict"] == "suitable" else "réduite au montant compatible avec vos limites.")})
        rest = amt - ok_amt
        if rest >= 50:
            cur = dict(before_amounts)
            for o in orders:
                cur[o["asset_id"]] = cur.get(o["asset_id"], 0) + o["amount_cad"]
            more, plan = _new_money_orders(md, persona, cur, rest, "À la place du montant refusé : ")
            orders += more
    else:  # review
        total = sum(before_amounts.values())
        minimal = None
        if before_xr and not _fits(before_xr):
            minimal = _minimal_correction(md, persona, before_amounts)
        if before_xr and _fits(before_xr):
            orders = []
        elif minimal is not None:
            orders, plan = minimal
        else:
            plan = recommended_plan(md, persona, total)
            target = {h["asset_id"]: total * h["share"] for sl in plan["sleeves"] for h in sl["holdings"]}
            for a in sorted(set(target) | set(before_amounts)):
                d = target.get(a, 0) - before_amounts.get(a, 0)
                exit_all = a not in target and before_amounts.get(a, 0) >= 1  # a holding with no place in the target is always sold
                if abs(d) < max(25.0, 0.01 * total) and not exit_all:
                    continue
                name = md.asset(a)["name"]
                orders.append({"side": "buy" if d > 0 else "sell", "asset_id": a, "name": name, "label": ROLES.get(a, (name,))[0],
                               "amount_cad": round(abs(d), 2), "sleeve": "Rééquilibrage",
                               "why": ROLES[a][1] if d > 0 and a in ROLES else "Réduit pour ramener le portefeuille dans vos limites."})
    after_amounts = dict(before_amounts)
    for o in orders:
        after_amounts[o["asset_id"]] = after_amounts.get(o["asset_id"], 0) + (o["amount_cad"] if o["side"] == "buy" else -o["amount_cad"])
    for o in orders:  # what the client holds before and keeps after, so « vendre tout » vs « alléger » is visible
        o["held_cad"] = round(before_amounts.get(o["asset_id"], 0.0), 2)
        o["keep_cad"] = round(max(0.0, after_amounts.get(o["asset_id"], 0.0)), 2)
    after_pf = _portfolio(persona, after_amounts)
    after_xr = run_xray(md, after_pf, persona, include_series=False) if after_pf else before_xr
    if after_xr is None:
        tracker.fail("quant.proposal", "Montant trop faible pour construire une proposition")
        raise ValueError("Montant trop faible pour construire une proposition (minimum 50 $).")
    led.merge(MetricLedger.from_dict(after_xr["ledger"]))
    B, Af = _snap(before_xr), _snap(after_xr)
    buys = sum(o["amount_cad"] for o in orders if o["side"] == "buy")
    sells = sum(o["amount_cad"] for o in orders if o["side"] == "sell")
    led.add("mnd.amount", "Montant de la demande", amt or None, "cad", "saisie de l'utilisateur", info_class="HYPOTHETICAL")
    led.add("mnd.buys", "Total des achats proposés", buys, "cad", "somme des ordres", info_class="HYPOTHETICAL")
    led.add("mnd.sells", "Total des ventes proposées", sells, "cad", "somme des ordres", info_class="HYPOTHETICAL")
    for tag, snp in (("before", B), ("after", Af)):
        if snp:
            led.add(f"mnd.vol.{tag}", f"Variation annuelle typique ({'avant' if tag == 'before' else 'après'})", snp["volatility"], "pct", "volatilité historique annualisée")
            led.add(f"mnd.mdd.{tag}", f"Pire baisse historique ({'avant' if tag == 'before' else 'après'})", snp["max_drawdown"], "pct", "perte maximale sur la fenêtre")
            led.add(f"mnd.growth.{tag}", f"Part en actions et cryptos ({'avant' if tag == 'before' else 'après'})", snp["growth_share"], "pct", "somme des poids de croissance")
    for o in orders:
        led.add(f"mnd.order.{o['asset_id']}", f"Ordre {o['side']} {o['asset_id']}", o["amount_cad"], "cad", "proposition de l'agent analyste", info_class="HYPOTHETICAL")
    if requested:
        led.add("mnd.request.max", f"Montant maximal compatible pour {requested['asset_id']}", requested["max_amount_cad"], "cad", "recherche dichotomique sur les limites", info_class="HYPOTHETICAL")
        t = verdict["asset_tier"]
        led.add("mnd.asset.vol", f"Variation annuelle typique de {requested['asset_id']}", t.get("volatility"), "pct", "volatilité historique 5 ans")
        led.add("mnd.asset.mdd", f"Pire baisse de {requested['asset_id']} sur 5 ans", t.get("max_drawdown"), "pct", "perte maximale 5 ans")
    tracker.done("quant.proposal", f"{len(orders)} ordre(s) : achats {_cad(buys)}" + (f", ventes {_cad(sells)}" if sells else "")
                 + (f" · variation typique {_pct(B['volatility'])} → {_pct(Af['volatility'])}" if B and Af else f" · variation typique {_pct(Af['volatility'])}" if Af else ""))

    # 6. governance on orders
    tracker.start("governance.orders")
    gov = []
    for o in orders:
        meta = md.asset(o["asset_id"])
        if o["side"] == "buy" and meta["sector"] in persona.excluded_sectors:
            gov.append({"status": "blocked", "label": f"{o['asset_id']} : secteur exclu", "detail": f"Vous avez exclu « {sector_fr(meta['sector'])} »."})
        if o["side"] == "buy" and meta["asset_class"] == "crypto" and b.max_speculative <= 0:
            gov.append({"status": "blocked", "label": f"{o['asset_id']} : crypto non permise", "detail": "Votre profil ne prévoit aucune part spéculative."})
    if requested and requested["verdict"] != "suitable":
        gov.append({"status": "adjusted" if requested["verdict"] == "partial" else "blocked",
                    "label": f"Demande « {requested['name']} » {'réduite à ' + _cad(requested['max_amount_cad']) if requested['verdict'] == 'partial' else 'refusée'}",
                    "detail": " ".join(r for r in requested["reasons"][1:])[:400]})
    for c in (Af or {}).get("checks", []):
        if c["status"] == "UNKNOWN":
            continue
        gov.append({"status": "ok" if c["status"] == "OK" else "breach", "label": c["label"], "detail": f"{c['measured']} · limite {c['limit']}"})
    if Af and Af["portfolio_tier"] and Af["allowed_tier"]:
        order_t = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
        okt = order_t.get(Af["portfolio_tier"], 3) <= order_t.get(Af["allowed_tier"], 0)
        gov.append({"status": "ok" if okt else "breach", "label": "Niveau de risque du portefeuille",
                    "detail": f"{Af['portfolio_tier']} · permis {Af['allowed_tier']}"})
    if intent["kind"] != "review" and any(g["status"] == "breach" for g in gov):
        gov.append({"status": "warn", "label": "Un dépassement ne se corrige qu'en vendant",
                    "detail": "Cette proposition n'achète que ce qui manque, sans rien vendre. Demandez « Rééquilibre mon portefeuille » pour une correction complète."})
    for st in k.get("before_investing", []):
        gov.append({"status": "warn", "label": st["title"], "detail": st["text"]})
    if prov["issues"]:
        gov.append({"status": "warn", "label": "Qualité des données", "detail": "; ".join(prov["issues"][:3])})
    blocked = [g for g in gov if g["status"] == "blocked" and g["label"].startswith(tuple(o["asset_id"] for o in orders))]
    if blocked:  # never propose an order the governance agent blocked
        bad = {g["label"].split(" :")[0] for g in blocked}
        orders = [o for o in orders if o["asset_id"] not in bad]
    n_ok = sum(1 for g in gov if g["status"] == "ok")
    tracker.done("governance.orders", f"{n_ok} contrôle(s) respecté(s) · {sum(1 for g in gov if g['status'] in ('adjusted', 'blocked'))} ajustement(s) · "
                 f"{sum(1 for g in gov if g['status'] == 'breach')} dépassement(s) · {sum(1 for g in gov if g['status'] == 'warn')} avertissement(s)")

    # 7. scenarios
    tracker.start("scenario.stress")
    stress = []
    keys = STRESS_KEYS + (["crypto_winter"] if any(md.asset(a)["asset_class"] == "crypto" for a in after_amounts if after_amounts[a] > 1) else [])
    win = GUIDED["bear_2022"]
    for key in ["replay_2022"] + keys:
        row = {"key": key}
        for tag, amts in (("before", before_amounts), ("after", {a: v for a, v in after_amounts.items() if v > 1})):
            if not amts:
                continue
            try:
                if key == "replay_2022":
                    tot = sum(amts.values())
                    rep = historical_replay(md, {a: v / tot for a, v in amts.items()}, win["start"], win["end"], 10000.0)
                    row["name"] = "Si 2022 se répétait (actions et obligations en baisse ensemble)"
                    row[tag] = rep["total_return"]
                    row[f"{tag}_mdd"] = rep["max_drawdown"]
                else:
                    pos = value_holdings(md, [h.model_dump() for h in _portfolio(persona, amts).holdings], md.end_date)
                    row["name"] = SHOCK_PRESETS[key]["name"]
                    row[tag] = apply_shock(md, pos, SHOCK_PRESETS[key]["shocks"])["return"]
                led.add(f"mnd.stress.{key}.{tag}", f"{row['name']} ({'avant' if tag == 'before' else 'après'})", row[tag], "pct",
                        "rejeu historique" if key == "replay_2022" else "choc hypothétique explicite", info_class="HYPOTHETICAL" if key != "replay_2022" else "COMPUTED_RESULT")
            except Exception as exc:  # noqa: BLE001
                row[f"{tag}_error"] = str(exc)[:120]
        if "after" in row:
            stress.append(row)
    rp = next((r for r in stress if r["key"] == "replay_2022"), None)
    tracker.done("scenario.stress", f"{len(stress)} scénario(s)" + (f" · 2022 rejoué : {_pct(rp.get('before'))} → {_pct(rp['after'])}" if rp and "before" in rp
                                                                     else f" · 2022 rejoué : {_pct(rp['after'])}" if rp else ""))

    # 8-9. advocates
    source_ids = {r["source_id"] for r in md.source_references()} | {f"persona_{persona.persona_id}"}
    for rec in led.records():
        source_ids |= set(rec.source_ids)
    event_ids: set[str] = set()
    events_text = claims_text = ""
    if research:
        event_ids |= {e["event_id"] for e in research["events"]} | {c["claim_id"] for c in research["claims"]}
        source_ids |= {e["evidence_id"] for e in research["evidence"] if e.get("evidence_id")}
        events_text = market_intelligence_agent.events_text(research)
        claims_text = market_intelligence_agent.claims_text(research)
    order_lines = "\n".join(f"{o['side']} {o['asset_id']} ({o['label']}) : [mnd.order.{o['asset_id']}]" for o in orders)
    extra = "PROPOSITION À ÉVALUER (ordres calculés par l'agent analyste):\n" + (order_lines or "aucun ordre (aucun changement proposé)")
    extra += "\n\nCONTRÔLES DE GOUVERNANCE:\n" + "\n".join(f"{g['status']} | {g['label']} | {g['detail'][:160]}" for g in gov)
    extra += "\n\nSCÉNARIOS (métriques mnd.stress.*): " + "; ".join(r["name"] for r in stress)
    if requested:
        extra += f"\n\nDEMANDE INITIALE: {requested['name']} pour [mnd.amount]; verdict {requested['verdict']}; max compatible [mnd.request.max]."
    packet = EvidencePacket(question=f"Cette proposition répond-elle bien à « {request or label} » pour ce profil ?",
                            persona_text=persona_agent.persona_text(persona), ledger=led, findings=after_xr["findings"] if after_xr else [],
                            source_ids=source_ids, event_ids=event_ids, events_text=events_text, claims_text=claims_text, extra_text=extra + COMPACT,
                            priority_metric_prefixes=("mnd.", "pf.", "persona.", "asset.", "hype."))
    args: dict = {"opp": None, "risk": None}

    def advocate(key: str):
        sid = "opportunity.r1" if key == "opp" else "risk.r1"
        tracker.start(sid)
        try:
            if llm is None:
                raise LLMError("IA générative non connectée")
            a = (opportunity_agent if key == "opp" else risk_agent).argue(llm, packet, 1, [], max_tokens=DEBATE_MAX_TOKENS)
            usages.append(a.usage)
            tracker.done(sid, a.position[:180], a.usage)
            return a
        except Exception as exc:  # noqa: BLE001
            tracker.fail(sid, f"Indisponible : {str(exc)[:120]}")
            return None

    ex = ThreadPoolExecutor(max_workers=2)
    futs = {"opp": ex.submit(advocate, "opp"), "risk": ex.submit(advocate, "risk")}
    ex.shutdown(wait=False)  # never block the client on a slow model: a late answer is simply ignored
    deadline = time.time() + DEBATE_BUDGET_S
    for key, fut in futs.items():
        try:
            args[key] = fut.result(timeout=max(0.1, deadline - time.time()))
        except FuturesTimeout:
            args[key] = None
            tracker.fail("opportunity.r1" if key == "opp" else "risk.r1", f"Délai dépassé ({DEBATE_BUDGET_S} s) : proposition présentée sans cet avis")

    # 10. audit claims
    tracker.start("audit.claims")
    present = [a for a in args.values() if a]
    checks = {}
    if present:
        ver = audit_agent.audit_arguments(present, led, source_ids, event_ids)
        checks = {c.claim_id: c for c in ver.checked_claims}
        n_rej = sum(1 for c in ver.checked_claims if not c.accepted)
        tracker.done("audit.claims", f"{len(ver.checked_claims)} affirmation(s) vérifiée(s) contre les calculs · {n_rej} rejetée(s)")
    else:
        tracker.skip("audit.claims", "Aucun argument à vérifier (IA générative indisponible)")

    def view(a):
        if not a:
            return None
        return {"position": a.position, "claims": [{"text": c.text, "accepted": checks[c.claim_id].accepted if c.claim_id in checks else None,
                                                    "reasons": checks[c.claim_id].reasons if c.claim_id in checks else [], "metric_ids": c.metric_ids,
                                                    "type": c.claim_type} for c in a.claims], "model_id": a.model_id}

    # 11. explain
    tracker.start("supervisor.explain")
    headline = _headline(intent, requested, orders, plan, persona, B)
    explanation = {"why": [], "watch": [], "limits": []}
    extra_nums = persona_numbers(persona) + [amt]
    if llm is not None:
        try:
            ctx = {"demande": request or label, "décision": headline, "ordres": [{k_: o[k_] for k_ in ("side", "asset_id", "label")} | {"montant": f"[mnd.order.{o['asset_id']}]"} for o in orders],
                   "gouvernance": gov, "scénarios": [r["name"] for r in stress],
                   "arguments_acceptés": [c["text"] for v in (view(args["opp"]), view(args["risk"])) if v for c in v["claims"] if c["accepted"]]}
            data, usage = json_call(llm, system=EXPLAINER_SYSTEM, user="MÉTRIQUES:\n" + packet.metrics_text(120) + "\n\nDOSSIER:\n" + compact_json(ctx),
                                    model_id=s.supervisor_model_id, max_tokens=900, agent_id="explainer")
            usages.append(usage)
            stripped = 0
            for key in ("why", "watch", "limits"):
                for line in [str(x)[:300] for x in (data.get(key) or [])][:3]:
                    chk = check_free_text(line, led, extra_nums)
                    if not chk["passed"]:
                        line = strip_sentences(line, chk["numeric_mismatches"] + [f["phrase"] for f in chk["forbidden"]] + chk["unknown_ids"])
                        stripped += 1
                    if line.strip():
                        explanation[key].append(line)
            tracker.done("supervisor.explain", f"Décision rédigée et auditée · {stripped} phrase(s) corrigée(s)", usage)
        except Exception as exc:  # noqa: BLE001
            tracker.fail("supervisor.explain", f"Rédaction IA indisponible ({str(exc)[:80]}) : explication déterministe")
    else:
        tracker.skip("supervisor.explain", "IA générative non connectée : explication déterministe")
    if not explanation["why"]:
        explanation = _fallback_explanation(intent, requested, B, Af, rp)
    explanation["limits"] = (explanation["limits"] or []) + ["Simulation éducative : aucune transaction réelle, pas un conseil financier personnalisé.",
                                                             "Les scénarios décrivent le passé ou des chocs hypothétiques ; ce ne sont pas des prévisions."]

    mid = new_id("mnd")
    out = {
        "mandate_id": mid, "status": "proposed" if orders else "reviewed", "created_at": utcnow(), "request": request or label, "intent": intent, "label": label,
        "headline": headline, "portfolio_id": pf.portfolio_id if pf else None, "profile_level": persona.risk_profile_label, "constraints": constraints,
        "orders": orders, "requested": requested, "governance": gov,
        "unknown_name": unknown_name,
        "ideas": _ideas(persona, B) if intent["kind"] == "review" and not orders else [], "diagnosis": diagnosis, "before": B, "after": Af, "stress": stress,
        "debate": {"opportunity": view(args["opp"]), "risk": view(args["risk"])}, "explanation": explanation,
        "research": ({"events": [{"title": e["title"], "url": e.get("url"), "published_at": e.get("published_at"), "provider": e.get("provider")}
                                 for e in research["events"] if e.get("primary_source")][:5],
                      "unverified": [c["proposition"][:200] for c in research["claims"] if c["status"] in ("UNVERIFIED", "DISPUTED")][:4],
                      "attention": research.get("attention", {}).get("band")} if research else None),
        "assumptions": intent["assumptions"] + ["Montants convertis au dernier cours connu, en $ CA.", "Frais et impôts non inclus."],
        "sources": [{"label": r.get("file") or r.get("source_id"), "detail": r.get("source") or r.get("provider")} for r in md.source_references()][:6],
        "data_as_of": md.end_date.date().isoformat(), "metrics": led.as_dict(),
        "llm_usage": {"calls": len(usages), "models": sorted({u.get("model_id") for u in usages if u.get("model_id")})},
        "job_id": tracker.job.job_id,
    }
    get_store().put(owner, "MANDATE", mid, out)
    return out


def _ideas(persona, B: dict | None) -> list[dict]:
    """When nothing needs fixing: optional ideas (never orders), each with its reason and, when concrete, a request the agents can run."""
    if not B:
        return []
    b = persona.budget
    k = persona.kyc or {}
    snap = k.get("snapshot") or {}
    gs = B.get("growth_share") or 0.0
    pos = sorted(B.get("positions") or [], key=lambda p: -p["weight"])
    out: list[dict] = []
    margin = snap.get("monthly_margin")
    if margin and margin > 0 and not k.get("before_investing"):
        amt = max(50, min(2000, int(margin * 0.3 // 50 * 50)))
        out.append({"kind": "monthly", "title": f"Investir {_cad(amt)} chaque mois",
                    "text": f"Il vous reste environ {_cad(margin)} par mois. En placer une partie régulièrement fait grandir votre portefeuille "
                            f"sans avoir à deviner le bon moment pour investir.", "request": f"J'ai {amt} $ à investir"})
    if gs < b.growth_max - 0.05:
        out.append({"kind": "growth_room", "title": "De la place pour plus de croissance",
                    "text": f"Vos actions font {_pct(gs)} du portefeuille et votre profil va jusqu'à {_pct(b.growth_max)}. C'est un bon équilibre ; "
                            f"si vous visez plus de rendement à long terme, votre prochain dépôt peut aller davantage vers les fonds d'actions.", "request": None})
    elif gs > b.growth_max - 0.03:
        out.append({"kind": "near_limit", "title": "Vous êtes près de votre limite",
                    "text": f"Vos actions font {_pct(gs)} et la limite est {_pct(b.growth_max)}. Si les marchés montent, vous pourriez la dépasser : "
                            f"les agents vous le signaleront.", "request": None})
    if pos and pos[0]["weight"] > 0.4:
        p = pos[0]
        out.append({"kind": "concentration", "title": f"Un seul fonds pèse {_pct(p['weight'])}",
                    "text": f"« {ROLES.get(p['asset_id'], (p['name'],))[0]} » porte une grande partie de votre argent. Le répartir entre deux ou trois "
                            f"fonds semblables réduit la dépendance à un seul marché.", "request": None})
    elif len(pos) <= 2:
        out.append({"kind": "few", "title": "Peu de placements différents",
                    "text": "Avec seulement un ou deux fonds, une mauvaise année sur un marché pèse sur tout. Un fonds canadien et un fonds américain "
                            "se complètent bien.", "request": None})
    return out[:3]


def _headline(intent, requested, orders, plan, persona, B) -> str:
    lvl = persona.risk_profile_label.lower()
    if intent["kind"] == "invest":
        if B:
            return (f"Je vous propose d'investir {_cad(intent['amount_cad'])} en complétant ce qui manque à votre portefeuille, "
                    f"pour le rapprocher d'un portefeuille {lvl} ({_pct(plan['stable_share'])} stabilité, {_pct(plan['growth_share'])} croissance).")
        return (f"Je vous propose d'investir {_cad(intent['amount_cad'])} dans un portefeuille {lvl} : "
                f"{_pct(plan['stable_share'])} pour la stabilité, {_pct(plan['growth_share'])} pour la croissance.")
    if intent["kind"] == "buy_asset":
        v, n = requested["verdict"], requested["name"]
        if v == "suitable" and requested.get("tier") == "HIGH":
            return (f"C'est possible : {_cad(requested['amount_cad'])} dans {n} reste dans vos limites. Mais c'est un placement très risqué : "
                    f"n'y mettez que de l'argent dont vous pouvez accepter une forte baisse.")
        if v == "suitable":
            return f"Je vous le conseille : {_cad(requested['amount_cad'])} dans {n} respecte vos limites."
        if v == "partial":
            return f"Oui, mais pas plus de {_cad(requested['max_amount_cad'])} dans {n}. Je place le reste dans des fonds diversifiés."
        return f"Je ne vous le conseille pas. À la place, je vous propose de placer {_cad(requested['amount_cad'])} dans un portefeuille {lvl}."
    if not orders:
        return f"Votre portefeuille respecte votre profil {lvl}. Rien à corriger : voici seulement quelques idées, si vous le souhaitez."
    sold = sum(o["amount_cad"] for o in orders if o["side"] == "sell")
    return (f"Pour revenir à un portefeuille {lvl}, je propose de déplacer {_cad(sold)} des placements les plus risqués vers des placements stables, "
            f"sans changer le montant investi.")


def _fallback_explanation(intent, requested, B, Af, rp) -> dict:
    why = []
    if requested and requested["verdict"] != "suitable":
        why += [r for r in requested["reasons"] if r][:2]
    if B and Af and B["volatility"] is not None and Af["volatility"] is not None:
        why.append(f"La variation annuelle typique passerait de {_pct(B['volatility'])} à {_pct(Af['volatility'])}.")
    elif Af and Af["volatility"] is not None:
        why.append(f"Variation annuelle typique du portefeuille proposé : {_pct(Af['volatility'])}.")
    if rp and "after" in rp:
        why.append(f"Si 2022 se répétait, il aurait varié de {_pct(rp['after'])}.")
    return {"why": why[:3], "watch": [], "limits": []}


def approve(owner: str, mandate_id: str) -> dict:
    """Human checkpoint passed: apply the orders to the simulated portfolio (never a real transaction)."""
    store = get_store()
    m = store.get(owner, "MANDATE", mandate_id)
    if not m:
        raise NotFound("mandat introuvable")
    if m["status"] != "proposed":
        raise ValueError("ce mandat a déjà été traité")
    md = get_market_data()
    pf = ps.get_portfolio(owner, m["portfolio_id"]) if m.get("portfolio_id") else None
    amounts = _amounts(md, pf)
    for o in m["orders"]:
        amounts[o["asset_id"]] = amounts.get(o["asset_id"], 0) + (o["amount_cad"] if o["side"] == "buy" else -o["amount_cad"])
    rows = [{"asset_id": a, "amount_cad": round(v, 2)} for a, v in amounts.items() if v >= 1]
    if pf is None:
        from ..models import PortfolioCreate
        persona = ps.resolve_persona(owner)
        pf = ps.create_portfolio(owner, PortfolioCreate(name="Mon portefeuille", persona_id=persona.persona_id, holdings=rows))
    elif rows:
        pf = ps.replace_holdings(owner, pf.portfolio_id, rows)
    m |= {"status": "approved", "approved_at": utcnow(), "portfolio_id": pf.portfolio_id}
    store.put(owner, "MANDATE", mandate_id, m)
    return m


def reject(owner: str, mandate_id: str) -> dict:
    store = get_store()
    m = store.get(owner, "MANDATE", mandate_id)
    if not m:
        raise NotFound("mandat introuvable")
    m |= {"status": "rejected", "rejected_at": utcnow()}
    store.put(owner, "MANDATE", mandate_id, m)
    return m

