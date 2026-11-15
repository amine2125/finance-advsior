"""Module A - AI Financial Copilot: Bedrock tool-use loop over the deterministic analysis engine, with governance."""
from __future__ import annotations

import json
import re

from ..analytics.bias import detect_biases
from ..analytics.forecast_policy import four_part_answer, is_prediction_request
from ..analytics.lenses import coverage_report, run_asset_lenses
from ..analytics.ledger import MetricLedger
from ..analytics.portfolio import value_holdings
from ..analytics.scenarios import SHOCK_PRESETS, apply_shock
from ..config import get_settings
from ..errors import NotFound
from ..data.registry import get_market_data
from ..governance.validator import check_free_text, strip_sentences
from ..ids import new_id
from ..methodology import METHODOLOGY
from ..models import utcnow
from ..services import jobs
from ..services import portfolio_service as ps
from ..services.analysis_service import persona_numbers, run_xray
from ..services.impact_service import hypothetical_addition
from ..services.snapshot_service import compare_latest
from ..storage.store import get_store
from .base import JobTracker
from .llm import LLMError, get_llm
from .persona_agent import persona_text
from .prompts import COPILOT_SYSTEM
from .quant_agent import compare_alternatives

TOOLS = [
    {"name": "recommended_plan", "description": "Portefeuille modèle recommandé pour le profil de l'utilisateur, pour un montant donné (part Stabilité / Croissance, fonds indiciels qui les composent, ce qu'il aurait fait sur les dernières années). À utiliser pour « que dois-je acheter ? », « comment investir X $ ? », ou pour proposer une alternative.",
     "schema": {"type": "object", "properties": {"amount_cad": {"type": "number"}}, "required": ["amount_cad"]}},
    {"name": "check_investment", "description": "À utiliser EN PREMIER pour toute question « puis-je / devrais-je investir X $ dans Y ? ». Verdict déterministe de compatibilité avec le profil de l'utilisateur et son portefeuille (compatible / compatible jusqu'à un montant maximal / non adapté) avec les raisons chiffrées (préférences, horizon, limites du profil).",
     "schema": {"type": "object", "properties": {"asset_id": {"type": "string"}, "amount_cad": {"type": "number"}}, "required": ["asset_id", "amount_cad"]}},
    {"name": "portfolio_xray", "description": "Radiographie du portefeuille simulé actif: valeur, poids, secteurs, concentration, volatilité, perte max, VaR, corrélations, budget de risque du profil.",
     "schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "asset_analysis", "description": "Analyse d'un actif de l'univers (asset_id = symbole, ex. NVDA, BTC-USD, XIU.TO): niveau de risque calculé, lentilles 1 à 6 (statuts honnêtes), matrice de couverture des modes d'échec.",
     "schema": {"type": "object", "properties": {"asset_id": {"type": "string"}}, "required": ["asset_id"]}},
    {"name": "run_scenario", "description": "Applique un choc hypothétique explicite au portefeuille. presets: " + ", ".join(SHOCK_PRESETS),
     "schema": {"type": "object", "properties": {"preset": {"type": "string"}}, "required": ["preset"]}},
    {"name": "hypothetical_addition", "description": "Recalcule concentration, risque et budget du profil après l'ajout hypothétique d'un montant en CAD d'un actif.",
     "schema": {"type": "object", "properties": {"asset_id": {"type": "string"}, "amount_cad": {"type": "number"}}, "required": ["asset_id", "amount_cad"]}},
    {"name": "hype_research", "description": "Recherche Hype Intelligence sur un actif tendance: dépôts officiels, actualités dédupliquées, affirmations vérifiées/non vérifiées, indice d'attention, adéquation au profil.",
     "schema": {"type": "object", "properties": {"asset_id": {"type": "string"}, "amount_cad": {"type": "number"}}, "required": ["asset_id"]}},
    {"name": "compare_alternatives", "description": "Compare le portefeuille actuel à deux alternatives hypothétiques (diversifiée, défensive): volatilité, perte max, HHI, choc tech.",
     "schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "what_changed", "description": "Compare les deux derniers instantanés d'analyse du portefeuille (effet marché vs composition vs données/méthode).",
     "schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "start_debate", "description": "Lance un débat adversarial Opportunité vs Risque avec synthèse du Superviseur (asynchrone).",
     "schema": {"type": "object", "properties": {"question": {"type": "string"}, "asset_id": {"type": "string"}, "amount_cad": {"type": "number"}},
                "required": []}},
]


def mentioned_assets(md, text: str) -> list[str]:
    found = []
    up = text.upper()
    for aid, row in md.universe.iterrows():
        base = re.split(r"[.\-]", aid)[0]  # RY.TO → RY, BTC-USD → BTC
        if re.search(rf"(?<![A-Z0-9]){re.escape(aid)}(?![A-Z0-9])", up) or (len(base) >= 3 and re.search(rf"(?<![A-Z0-9]){re.escape(base)}(?![A-Z0-9])", up)):
            found.append(aid)
            continue
        names = [str(row["name"]).lower().split(" ")[0]] + [a.strip() for a in str(row.get("aliases") or "").split(";") if a.strip()]
        first = names[0]  # the first word of the official name must be specific (« canadian », « spdr » are too vague below 4 letters)
        if (len(first) >= 4 and re.search(rf"\b{re.escape(first)}\b", text.lower())) or \
                any(len(n) >= 3 and re.search(rf"(?<!\w){re.escape(n)}(?!\w)", text.lower()) for n in names[1:]):
            found.append(aid)
    return found


class ToolBox:
    def __init__(self, owner, pf, persona, tracker: JobTracker):
        self.owner, self.pf, self.persona, self.tracker = owner, pf, persona, tracker
        self.md = get_market_data()
        self.led = MetricLedger()
        self.cards: list[dict] = []
        self._xr = None

    def xr(self):
        if self.pf is None or not self.pf.holdings:
            raise ValueError("la personne n'a encore aucun placement")
        if self._xr is None:
            self._xr = run_xray(self.md, self.pf, self.persona, include_series=False)
            self.led.merge(MetricLedger.from_dict(self._xr["ledger"]))
        return self._xr

    def call(self, name: str, args: dict) -> dict:
        sid = f"tool.{name}.{len(self.cards) + 1}"
        self.tracker.add(sid, "quant_agent" if name not in ("hype_research",) else "market_intelligence_agent", f"Outil: {name}")
        self.tracker.start(sid)
        try:
            out = getattr(self, "t_" + name)(**args)
            self.tracker.done(sid, out.get("_summary", "ok")[:150] if isinstance(out, dict) else "ok")
            return out
        except Exception as exc:  # noqa: BLE001
            self.tracker.fail(sid, str(exc)[:150])
            return {"error": str(exc)[:300]}

    def _resolve(self, asset_id: str) -> str:
        from ..hype_research.pipeline import resolve_asset
        r = resolve_asset(self.md, asset_id or "")
        if r["status"] != "resolved":
            raise ValueError(r.get("message") or f"actif « {asset_id} » non résolu; candidats: {[c['asset_id'] for c in r.get('candidates', [])]}")
        return r["asset_id"]

    def _m(self, ids):
        return {i: self.led.get(i).display for i in ids if i in self.led and self.led.get(i).value is not None}

    def t_portfolio_xray(self):
        x = self.xr()
        pa = x["persona_assessment"] or {}
        self.cards.append({"type": "xray", "portfolio_id": self.pf.portfolio_id, "analysis_id": x["analysis_id"]})
        ids = ["pf.total_value", "pf.top2_single", "pf.single_issuers", "pf.hhi", "pf.effective_n", "pf.vol", "pf.mdd", "pf.var95", "pf.cvar95",
               "pf.avg_corr", "pf.div_ratio", "pf.stress.vol", "pf.growth_share", "bench.total_return", "pf.total_return"]
        ids += [f"pf.weight.{p['asset_id']}" for p in x["positions"]] + [k for k in self.led.ids() if k.startswith("pf.sector.")]
        return {"metrics": self._m(ids), "findings": [f["title"] for f in x["findings"]],
                "budget": [{"rule": c["rule_id"], "status": c["status"], "measured": c["measured"], "limit": c["limit"]} for c in pa.get("budget_checks", [])],
                "allowed_tier": pa.get("allowed_tier"), "binding_inputs": pa.get("binding_inputs"), "window": [x["risk"]["window_start"], x["risk"]["window_end"]],
                "etf_lookthrough": x["etf_lookthrough"]["reason"], "_summary": f"{len(x['findings'])} constats"}

    def t_asset_analysis(self, asset_id: str):
        asset_id = self._resolve(asset_id)
        res, led = run_asset_lenses(self.md, asset_id, self.md.end_date, self.persona)
        self.led.merge(led)
        cov = coverage_report(res["lenses"])
        self.cards.append({"type": "asset", "asset_id": asset_id})
        return {"tier": res["tier"]["tier"], "tier_rules": res["tier"]["rules"], "metrics": self._m(led.ids()[:40]),
                "lens_status": {k: v["status"] for k, v in res["lenses"].items()},
                "lens_reasons": {k: v.get("reason") for k, v in res["lenses"].items() if v.get("reason")},
                "uncovered_failure_modes": [c["name"] for c in cov if c["status"] != "COVERED"], "_summary": f"niveau {res['tier']['tier']}"}

    def t_run_scenario(self, preset: str):
        preset = preset if preset in SHOCK_PRESETS else "tech_crash_30"
        pos = value_holdings(self.md, [h.model_dump() for h in self.pf.holdings], self.md.end_date)
        r = apply_shock(self.md, pos, SHOCK_PRESETS[preset]["shocks"])
        n = len(self.cards) + 1
        self.led.add(f"scn.{n}.return", f"Scénario « {SHOCK_PRESETS[preset]['name']} » – variation", r["return"], "pct", "choc explicite", info_class="HYPOTHETICAL")
        self.led.add(f"scn.{n}.pnl", "Scénario – variation en CAD", r["pnl"], "cad", "choc explicite", info_class="HYPOTHETICAL")
        self.cards.append({"type": "scenario", "preset": preset})
        return {"scenario": SHOCK_PRESETS[preset]["name"], "metrics": self._m([f"scn.{n}.return", f"scn.{n}.pnl"]), "label": r["label"],
                "_summary": f"{r['return'] * 100:.1f} %"}

    def t_recommended_plan(self, amount_cad: float):
        from ..services.plan_service import recommended_plan
        p = recommended_plan(self.md, self.persona, float(amount_cad), None)
        self.led.add("plan.amount", "Montant du plan", float(amount_cad), "cad", "saisie de l'utilisateur", info_class="HYPOTHETICAL")
        self.led.add("plan.growth_share", "Part Croissance du plan", p["growth_share"], "pct", "milieu de la bande du profil", info_class="HYPOTHETICAL")
        self.led.add("plan.stable_share", "Part Stabilité du plan", p["stable_share"], "pct", "1 - part croissance", info_class="HYPOTHETICAL")
        for s_ in p["sleeves"]:
            for h in s_["holdings"]:
                self.led.add(f"plan.weight.{h['asset_id']}", f"Part de {h['asset_id']} dans le plan", h["share"], "pct", "plan modèle", info_class="HYPOTHETICAL")
                self.led.add(f"plan.amount.{h['asset_id']}", f"Montant {h['asset_id']} dans le plan", h["amount_cad"], "cad", "plan modèle", info_class="HYPOTHETICAL")
        hist = p["history"]
        for k, unit in (("total_return", "pct"), ("annualized_return", "pct"), ("max_drawdown", "pct"), ("value_end", "cad")):
            if hist.get(k) is not None:
                self.led.add(f"plan.hist.{k}", f"Plan – historique {k}", hist[k], unit, f"fenêtre {hist['window_start']} → {hist['window_end']}", info_class="COMPUTED_RESULT")
        self.cards.append({"type": "plan", "amount_cad": amount_cad})
        return {"profile": p["profile_level"], "growth_share": p["growth_share"], "stable_share": p["stable_share"],
                "sleeves": [{"label": s_["label"], "share": s_["share"], "funds": [{"asset_id": h["asset_id"], "role": h["role"], "share": h["share"],
                             "amount_cad": h["amount_cad"]} for h in s_["holdings"]]} for s_ in p["sleeves"]],
                "history": {k: v for k, v in hist.items() if k != "series"}, "fits_profile": p["fits_profile"], "_summary": f"croissance {p['growth_share']:.0%}"}

    def t_check_investment(self, asset_id: str, amount_cad: float):
        from ..services.invest_service import check_investment
        asset_id = self._resolve(asset_id).upper()
        r = check_investment(self.md, self.persona, self.pf, asset_id, float(amount_cad))
        self.led.add("inv.amount", "Montant envisagé", float(amount_cad), "cad", "saisie de l'utilisateur", info_class="HYPOTHETICAL")
        self.led.add("inv.max_amount", f"Montant maximal compatible avec le profil – {asset_id}", r["max_amount_cad"], "cad",
                     "recherche dichotomique: plus grand montant sans nouvelle limite dépassée", info_class="HYPOTHETICAL")
        if r.get("after") and r["after"].get("weight") is not None:
            self.led.add(f"inv.weight_after.{asset_id}", f"Poids de {asset_id} après l'ajout envisagé", r["after"]["weight"], "pct", "valeur_i / total", info_class="HYPOTHETICAL")
        self.cards.append({"type": "invest_check", "asset_id": asset_id, "amount_cad": amount_cad, "verdict": r["verdict"]})
        return {"verdict": r["verdict"], "headline": r["headline"], "reasons": [x["text"] for x in r["reasons"]],
                "metrics": self._m(["inv.amount", "inv.max_amount", f"inv.weight_after.{asset_id}"]), "allowed_tier": r["allowed_tier"],
                "asset_tier": r["asset_tier"]["tier"], "existing_breaches": r["existing_breaches"], "_summary": r["verdict"]}

    def t_hypothetical_addition(self, asset_id: str, amount_cad: float):
        asset_id = self._resolve(asset_id)
        imp, led = hypothetical_addition(self.md, self.pf, self.persona, asset_id.upper(), float(amount_cad),
                                         self.md.asset(asset_id.upper())["asset_class"] == "crypto")
        self.led.merge(led)
        self.cards.append({"type": "impact", "asset_id": asset_id.upper(), "amount_cad": amount_cad})
        return {"before_after": [{"metric": r["label"], "before": self.led.get("hyp.before." + r["metric"]).display if "hyp.before." + r["metric"] in self.led else None,
                                  "after": self.led.get("hyp.after." + r["metric"]).display if "hyp.after." + r["metric"] in self.led else None,
                                  "ids": ["hyp.before." + r["metric"], "hyp.after." + r["metric"]]} for r in imp["rows"]],
                "budget": [{"rule": b["rule_id"], "before": b["before"], "after": b["after"], "after_status": b["after_status"], "limit": b["limit"]}
                           for b in imp["budget"]], "new_breaches": [b["rule_id"] for b in imp["new_breaches"]],
                "weight_after": self._m([f"hyp.after.weight.{asset_id.upper()}"]), "label": imp["label"], "_summary": f"{len(imp['new_breaches'])} nouvelle(s) violation(s)"}

    def t_hype_research(self, asset_id: str, amount_cad: float | None = None):
        from .market_intelligence_agent import investigate

        asset_id = self._resolve(asset_id)
        res = investigate(self.md, asset_id, self.question, self.persona, self.pf, amount_cad)
        res["portfolio_id"] = self.pf.portfolio_id if self.pf else None
        get_store().put(self.owner, "HYPE", res["research_id"], res)
        self.led.merge(MetricLedger.from_dict(res["ledger"]))
        self.cards.append({"type": "hype", "research_id": res["research_id"], "asset_id": asset_id.upper()})
        att = res["attention"]
        return {"research_id": res["research_id"], "attention_index": att.get("value"), "attention_status": att["status"],
                "attention_label": att["label"], "claims": [{"id": c["claim_id"], "status": c["status"], "text": c["proposition"][:140]} for c in res["claims"][:8]],
                "verified_events": [e["title"] for e in res["events"] if e["primary_source"]][:5], "independence": res["independence"],
                "coverage": [(c["family"], c["status"]) for c in res["coverage_meter"]], "tier": res["tier"]["tier"],
                "status_rule": res["status_rule"], "new_breaches": [b["rule_id"] for b in (res.get("portfolio_impact") or {}).get("new_breaches", [])],
                "_summary": f"{len(res['claims'])} affirmations"}

    def t_compare_alternatives(self):
        alts = compare_alternatives(self.md, self.xr(), self.led)
        self.cards.append({"type": "alternatives"})
        return {k: {"label": v["label"], "metrics": self._m([f"alt.{k}.{m}" for m in ("vol", "mdd", "hhi", "tech_shock_return")])} for k, v in alts.items()} | {"_summary": "3 portefeuilles"}

    def t_what_changed(self):
        diff = compare_latest(self.owner, self.pf.portfolio_id)
        self.cards.append({"type": "what_changed"})
        return (diff or {"message": "Moins de deux instantanés enregistrés pour ce portefeuille"}) | {"_summary": "comparaison"}

    def t_start_debate(self, question: str | None = None, asset_id: str | None = None, amount_cad: float | None = None):
        job = jobs.submit(self.owner, "debate", {"portfolio_id": self.pf.portfolio_id, "persona_id": self.persona.persona_id,
                                                 "question": question, "asset_id": asset_id, "amount_cad": amount_cad})
        self.cards.append({"type": "debate_job", "job_id": job.job_id})
        return {"job_id": job.job_id, "message": "Débat lancé; résultat dans la Chambre de débat.", "_summary": job.job_id}


def _goals(owner: str) -> list[dict]:
    return get_store().list(owner, "GOAL", 20)


def _goals_text(owner: str) -> str:
    out = []
    for g in _goals(owner):
        tgt = f"{g['target_cad']:.0f} $" if g.get("target_cad") else "sans montant visé"
        out.append(f"- {g['name']} ({g['type']}): {tgt} dans {g['years']:g} ans, {g.get('monthly_cad') or 0:.0f} $ par mois")
    return "\n".join(out)


def _goal_numbers(owner: str) -> list[float]:
    vals: list[float] = []
    for g in _goals(owner):
        vals += [float(g.get(k) or 0) for k in ("target_cad", "years", "monthly_cad", "initial_cad")]
    return vals


def run_chat(tracker: JobTracker, owner: str, req: dict) -> dict:
    s = get_settings()
    md = get_market_data()
    message = (req.get("message") or "").strip()[:2000]
    try:
        pf = ps.resolve_portfolio(owner, req.get("portfolio_id"))
    except NotFound:
        pf = None  # a new client can ask questions before investing
    persona = ps.resolve_persona(owner, req.get("persona_id"), pf)
    conv_id = req.get("conversation_id") or new_id("conv")
    conv = get_store().get(owner, "CONV", conv_id) or {"conversation_id": conv_id, "messages": [], "created_at": utcnow()}
    tracker.add("copilot.understand", "copilot", "Compréhension de la question")
    tracker.start("copilot.understand")
    biases = detect_biases(message)
    assets = mentioned_assets(md, message)
    tracker.done("copilot.understand", f"actifs mentionnés: {assets or 'aucun'}; schémas: {[b['bias'] for b in biases] or 'aucun'}")
    box = ToolBox(owner, pf, persona, tracker)
    box.question = message
    answer, policy, corrections, usage_tot = "", None, [], {"input_tokens": 0, "output_tokens": 0, "calls": 0}
    if is_prediction_request(message):
        tracker.add("copilot.forecast_policy", "audit_agent", "Politique de prévision (réponse en quatre parties)")
        tracker.start("copilot.forecast_policy")
        target = assets[0] if assets else (pf.holdings[0].asset_id if pf and pf.holdings else "SPY")
        policy = four_part_answer(md, target, md.end_date, box.led)
        answer = "\n\n".join(f"**{p['title']}.** {p['text']}" for p in policy["parts"])
        tracker.done("copilot.forecast_policy", f"réponse déterministe pour {target}")
    else:
        llm = get_llm()
        if llm is None:
            raise LLMError("LLM désactivé: le Copilote nécessite Amazon Bedrock")
        tool_cfg = {"tools": [{"toolSpec": {"name": t["name"], "description": t["description"], "inputSchema": {"json": t["schema"]}}} for t in TOOLS]}
        system = COPILOT_SYSTEM + f"\n\nPROFIL ACTIF:\n{persona_text(persona)}\nPORTEFEUILLE ACTIF: {(pf.name + ' (' + pf.portfolio_id + ')') if pf else 'aucun placement pour le moment'}; " \
                                  f"données au {md.end_date.date()} (mode rejeu historique; aucun flux de marché en direct)."
        last = sorted(get_store().list(owner, "MANDATE", 10), key=lambda x: x.get("created_at", ""), reverse=True)[:1]
        if last:
            lm = last[0]
            system += ("\nDERNIÈRE PROPOSITION DES AGENTS (statut " + lm["status"] + ") pour « " + lm["request"] + " » : " + lm["headline"]
                       + " Ordres: " + "; ".join(f"{o['side']} {o['asset_id']}" for o in lm["orders"])
                       + ". Contrôles non respectés: " + ("; ".join(g["label"] for g in lm["governance"] if g["status"] in ("breach", "blocked", "adjusted")) or "aucun") + ".")
        goal_lines = _goals_text(owner)
        if goal_lines:
            system += "\nOBJECTIFS DU CLIENT (montant visé, échéance, cotisation mensuelle, compte conseillé, statut):\n" + goal_lines
        if biases:
            system += "\nSCHÉMAS DÉTECTÉS DANS LA FORMULATION (à traiter pédagogiquement, sans juger la personne): " + \
                      "; ".join(f"{b['label']}: {b['educational_response']}" for b in biases)
        history = []
        for m in conv["messages"][-6:]:
            history.append({"role": m["role"], "content": [{"text": m["text"][:1500]}]})
        msgs = history + [{"role": "user", "content": [{"text": message}]}]
        tracker.add("copilot.reasoning", "copilot", "Choix des outils et rédaction")
        tracker.start("copilot.reasoning")
        for _ in range(5):
            r = llm.converse(system=system, messages=msgs, model_id=s.agent_model_id, max_tokens=1800, temperature=0.2, tool_config=tool_cfg,
                             agent_id="copilot")
            usage_tot["input_tokens"] += r["usage"]["input_tokens"]
            usage_tot["output_tokens"] += r["usage"]["output_tokens"]
            usage_tot["calls"] += 1
            msgs.append(r["message"])
            uses = [c["toolUse"] for c in r["content"] if "toolUse" in c]
            if not uses:
                answer = r["text"]
                break
            results = []
            for u in uses[:3]:
                out = box.call(u["name"], u.get("input") or {})
                out.pop("_summary", None)
                results.append({"toolResult": {"toolUseId": u["toolUseId"], "content": [{"text": json.dumps(out, ensure_ascii=False, default=str)[:12000]}]}})
            msgs.append({"role": "user", "content": results})
        tracker.done("copilot.reasoning", f"{usage_tot['calls']} appel(s) Bedrock", {"model_id": s.agent_model_id, **usage_tot})
        # governance on the final answer
        tracker.add("audit.answer", "audit_agent", "Audit de la réponse")
        tracker.start("audit.answer")
        if not box.led.ids() and pf is not None and pf.holdings:
            box.xr()
        from ..governance.validator import extract_numbers
        extra = persona_numbers(persona) + [v for v, _, _ in extract_numbers(message)] + _goal_numbers(owner)
        chk = check_free_text(answer, box.led, extra)
        if not chk["passed"]:
            issues = [f"nombre non traçable {b}" for b in chk["numeric_mismatches"]] + [f"formulation interdite {f['phrase']}" for f in chk["forbidden"]] + \
                     [f"identifiant inexistant {i}" for i in chk["unknown_ids"]]
            corrections.append({"stage": "audit de la réponse", "issues": issues})
            msgs.append({"role": "user", "content": [{"text": "AUDIT: ta réponse contient des éléments non traçables ou interdits: " + "; ".join(issues) +
                                                      ". Réécris la réponse en retirant ou corrigeant ces éléments, sans appeler d'outil."}]})
            r2 = llm.converse(system=system, messages=msgs, model_id=s.agent_model_id, max_tokens=1500, temperature=0.0, agent_id="copilot.correction",
                              tool_config=tool_cfg)
            usage_tot["calls"] += 1
            fixed = r2["text"] or answer
            chk2 = check_free_text(fixed, box.led, extra)
            if not chk2["passed"]:
                fixed = strip_sentences(fixed, chk2["numeric_mismatches"] + [f["phrase"] for f in chk2["forbidden"]] + chk2["unknown_ids"])
                corrections.append({"stage": "conformité forcée", "issues": ["phrases retirées"]})
            answer = fixed
        tracker.done("audit.answer", "conforme" if not corrections else f"{len(corrections)} correction(s)")
    msg_id = new_id("msg")
    conv["messages"] += [{"role": "user", "text": message, "at": utcnow()},
                         {"role": "assistant", "text": answer, "at": utcnow(), "message_id": msg_id, "cards": box.cards,
                          "biases": biases, "forecast_policy": policy, "corrections": corrections}]
    conv["persona_id"], conv["portfolio_id"] = persona.persona_id, (pf.portfolio_id if pf else None)
    get_store().put(owner, "CONV", conv_id, conv)
    return {"message_id": msg_id, "conversation_id": conv_id, "answer": answer, "cards": box.cards, "biases": biases,
            "forecast_policy": policy, "corrections": corrections, "usage": usage_tot,
            "metrics": {k: {"label": v["label"], "display": v["display"], "window": [v["window_start"], v["window_end"]]}
                        for k, v in box.led.as_dict().items() if f"[{k}]" in answer or k in answer},
            "data_as_of": md.end_date.date().isoformat(), "methodology_version": METHODOLOGY["version"]}
