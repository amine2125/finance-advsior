"""Agent 8 - Supervisor / Chief Investment Intelligence Agent: orchestrates the bounded debate and owns the final conclusion.

Workflow (section 5 + 16A.5): plan -> data -> quant -> hypothesis tests -> internet research -> independent opening arguments
(parallel, same evidence) -> deterministic audit -> permitted follow-up tests -> rebuttals -> audit -> persona check ->
synthesis -> deterministic audit of the synthesis -> at most one correction pass -> qualified/abstaining answer if still failing.
"""
from __future__ import annotations

import datetime as dt
import logging
from concurrent.futures import ThreadPoolExecutor

from ..analytics.coverage import coverage_report
from ..analytics.ledger import MetricLedger
from ..config import get_settings
from ..data.registry import get_market_data
from ..governance.validator import methodology_constants, strip_sentences
from ..ids import new_id
from ..methodology import METHODOLOGY
from ..models import (AgentArgument, AgentClaim, CorrectionEntry, SupervisorDecision, SupervisorStatus, utcnow)
from ..services import portfolio_service as ps
from ..services.analysis_service import make_snapshot, persona_numbers, run_xray
from ..storage.store import get_store
from ..web_research.tool import WebResearchTool
from . import audit_agent, data_agent, hypothesis_agent, market_intelligence_agent, opportunity_agent, persona_agent, quant_agent, risk_agent
from .base import EvidencePacket, JobTracker, compact_json
from .llm import LLMError, get_llm, json_call
from .prompts import CORRECTION_ADDENDUM, SUPERVISOR_SYSTEM

log = logging.getLogger("aegis.supervisor")
AGENT_ID = "supervisor"
ALL_STATUSES = [s.value for s in SupervisorStatus]

STEPS = [
    ("supervisor.plan", AGENT_ID, "Définition de la question"),
    ("data.collect", "data_agent", "Collecte et validation des données"),
    ("quant.metrics", "quant_agent", "Calcul des métriques"),
    ("hypothesis.test", "hypothesis_agent", "Tests d'hypothèses hors échantillon"),
    ("market_intelligence.research", "market_intelligence_agent", "Vérification des dépôts et sources d'actualités"),
    ("opportunity.r1", "opportunity_agent", "Analyse Opportunité (ouverture)"),
    ("risk.r1", "risk_agent", "Analyse Risque (ouverture)"),
    ("audit.r1", "audit_agent", "Audit des affirmations (tour 1)"),
    ("quant.followups", "quant_agent", "Tests complémentaires demandés"),
    ("opportunity.r2", "opportunity_agent", "Réfutation Opportunité"),
    ("risk.r2", "risk_agent", "Réfutation Risque"),
    ("audit.r2", "audit_agent", "Audit des affirmations (tour 2)"),
    ("persona.check", "persona_agent", "Vérification des contraintes du profil"),
    ("supervisor.synthesis", AGENT_ID, "Synthèse du Superviseur"),
    ("audit.final", "audit_agent", "Audit de la synthèse"),
    ("supervisor.correction", AGENT_ID, "Correction avant réponse"),
]

INJECTED_TEXT = ("NVIDIA a progressé de 900 % sur la période, ce qui garantit la poursuite de la hausse et justifie d'acheter maintenant.")


def default_question(asset_id: str | None, amount: float | None, persona_name: str | None) -> str:
    if asset_id:
        amt = f"{amount:,.0f} $ CA".replace(",", " ") if amount else "une position"
        return (f"L'ajout hypothétique de {amt} de {asset_id} est-il cohérent avec les contraintes déclarées de "
                f"{persona_name or 'ce profil'} et ce portefeuille, compte tenu des preuves vérifiées ?")
    return "Ce portefeuille hypothétique est-il excessivement concentré pour ce profil ?"


def _claims_flat(args: list[AgentArgument]) -> list[AgentClaim]:
    return [c for a in args for c in a.claims]


def run_debate(tracker: JobTracker, owner: str, req: dict) -> dict:
    s = get_settings()
    llm = get_llm()
    md = get_market_data()
    for sid, ag, label in STEPS:
        tracker.add(sid, ag, label)
    usages: list[dict] = []
    corrections: list[CorrectionEntry] = []
    rounds = min(int(req.get("rounds") or s.max_debate_rounds), s.max_debate_rounds, METHODOLOGY["debate"]["max_rounds"])

    # 1. plan
    tracker.start("supervisor.plan")
    pf = ps.get_portfolio(owner, req["portfolio_id"])
    persona = ps.get_persona(owner, req.get("persona_id") or pf.persona_id or "robert")
    asset_id = (req.get("asset_id") or "").upper() or None
    if asset_id and not md.has_asset(asset_id):
        raise ValueError(f"actif {asset_id} absent de l'univers")
    amount = float(req.get("amount_cad") or 0) or None
    question = (req.get("question") or "").strip()[:500] or default_question(asset_id, amount, persona.display_name)
    tracker.done("supervisor.plan", f"Question: {question[:140]}")

    # 2. data
    tracker.start("data.collect")
    assets = [h.asset_id for h in pf.holdings] + ([asset_id] if asset_id else [])
    provenance = data_agent.collect(md, sorted(set(assets)))
    tracker.done("data.collect", f"{len(provenance['assets'])} actifs validés; problèmes: {len(provenance['issues'])}")

    # 3. quant
    tracker.start("quant.metrics")
    xr = run_xray(md, pf, persona)
    led = MetricLedger.from_dict(xr["ledger"])
    alts = quant_agent.compare_alternatives(md, xr, led)
    tracker.done("quant.metrics", f"{len(led.ids())} métriques calculées; {len(xr['findings'])} constats")

    # 4. hypotheses
    tracker.start("hypothesis.test")
    hyps = hypothesis_agent.standard_results(md)
    hypothesis_agent.register_metrics(hyps, led)
    tracker.done("hypothesis.test", "; ".join(f"{k}: {'confirmée' if (v.get('result') or {}).get('supported') else 'non confirmée'}"
                                              for k, v in hyps.items()))

    # 5. internet research
    tracker.start("market_intelligence.research")
    research = None
    filings_events: list[dict] = []
    if asset_id:
        research = market_intelligence_agent.investigate(md, asset_id, question, persona, pf, amount, use_fixture=bool(req.get("use_fixture")))
        led.merge(MetricLedger.from_dict(research["ledger"]))
        detail = (f"{len(research['events'])} événements, {len(research['claims'])} affirmations; "
                  f"appels: " + ", ".join(f"{c['tool']}={c['status']}" for c in research["tool_calls"]))
    else:
        tool = WebResearchTool()
        for a in sorted({h.asset_id for h in pf.holdings}):
            cik = md.asset(a).get("cik")
            if cik:
                rows = tool.filings(cik, days=90, until=dt.date.today())
                for f in (rows or [])[:4]:
                    filings_events.append({"event_id": f["evidence_id"], "title": f"{a}: {f['title']}", "published_at": f["published_at"],
                                           "url": f["canonical_url"], "status": "VERIFIED", "primary_source": True, "asset_id": a})
        detail = (f"{len(filings_events)} dépôts SEC récents pour les titres US détenus; appels: " +
                  ", ".join(f"{c['tool']}={c['status']}" for c in tool.calls)) if tool.calls else "aucun titre américain: aucun dépôt SEC applicable"
        research = None
    tracker.done("market_intelligence.research", detail)

    # evidence packet (identical for both advocates)
    source_ids = {r["source_id"] for r in md.source_references()} | {f"persona_{persona.persona_id}"}
    for rec in led.records():
        source_ids |= set(rec.source_ids)
    event_ids: set[str] = set()
    events_text = ""
    claims_text = ""
    if research:
        event_ids |= {e["event_id"] for e in research["events"]} | {c["claim_id"] for c in research["claims"]}
        source_ids |= {e["evidence_id"] for e in research["evidence"] if e.get("evidence_id")}
        events_text = market_intelligence_agent.events_text(research)
        claims_text = market_intelligence_agent.claims_text(research)
        allowed = research["status_rule"]["allowed"]
        status_reason = research["status_rule"]["reason"]
    else:
        event_ids |= {e["event_id"] for e in filings_events}
        events_text = "\n".join(f"{e['event_id']} | {e['published_at']} | VERIFIED | source primaire | {e['title'][:140]}" for e in filings_events)
        stale = bool(xr["data_quality"]["stale_assets"])
        allowed = [SupervisorStatus.INSUFFICIENT_DATA.value] if stale else ALL_STATUSES
        status_reason = ("Données périmées: abstention obligatoire" if stale else
                         "Constat au niveau du portefeuille: peut être entièrement étayé par la lentille 3 et la radiographie")
    extra = hypothesis_agent.summary_text(hyps)
    extra += "\n\nALTERNATIVES HYPOTHÉTIQUES (métriques alt.*): " + "; ".join(f"{k} = {v['label']}" for k, v in alts.items())
    if research and research.get("portfolio_impact"):
        extra += "\n\nAJOUT HYPOTHÉTIQUE – BUDGET AVANT/APRÈS:\n" + "\n".join(
            f"{b['rule_id']}: {b['before']} ({b['before_status']}) → {b['after']} ({b['after_status']}), limite {b['limit']}"
            for b in research["portfolio_impact"]["budget"])
    if research and research.get("search_trending"):
        t = research["search_trending"]
        extra += f"\n\nTENDANCE DE RECHERCHE CoinGecko: {'rang ' + str(t['rank']) if t['in_top'] else 'absent'} du top {t['list_size']} (attention, pas qualité)."
    packet = EvidencePacket(question=question, persona_text=persona_agent.persona_text(persona), ledger=led, findings=xr["findings"],
                            source_ids=source_ids, event_ids=event_ids, events_text=events_text, claims_text=claims_text,
                            extra_text=extra, allowed_statuses=allowed, status_reason=status_reason)
    permitted = METHODOLOGY["debate"]["permitted_followup_tests"]
    extra_numbers = persona_numbers(persona) + [amount or 0]

    args_r1: dict[str, AgentArgument | None] = {"opp": None, "risk": None}
    args_r2: dict[str, AgentArgument | None] = {"opp": None, "risk": None}
    errors: dict[str, str] = {}

    def advocate(key: str, round_no: int, opponent=None, notes="", tests_text=""):
        sid = f"{'opportunity' if key == 'opp' else 'risk'}.r{round_no}"
        tracker.start(sid)
        try:
            if llm is None:
                raise LLMError("LLM désactivé (AEGIS_LLM_ENABLED=false)")
            mod = opportunity_agent if key == "opp" else risk_agent
            a = mod.argue(llm, packet, round_no, permitted, opponent, notes, tests_text)
            usages.append(a.usage)
            tracker.done(sid, a.position[:160], a.usage)
            return a
        except Exception as exc:  # noqa: BLE001
            errors[sid] = str(exc)[:300]
            tracker.fail(sid, str(exc)[:200])
            return None

    # 6. opening arguments - independent parallel model calls on the same packet
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_o, f_r = ex.submit(advocate, "opp", 1), ex.submit(advocate, "risk", 1)
        args_r1["opp"], args_r1["risk"] = f_o.result(), f_r.result()
    if req.get("inject_unsupported_claim") and args_r1["opp"] is not None:
        args_r1["opp"].claims.append(AgentClaim(claim_id="OPP-R1-INJ", text=INJECTED_TEXT, claim_type="fact",
                                                metric_ids=["pf.return.nvda_fabricated"]))
        args_r1["opp"].injected_test_fixture = True

    # 7. audit round 1
    tracker.start("audit.r1")
    r1_list = [a for a in args_r1.values() if a]
    ver1 = audit_agent.audit_arguments(r1_list, led, source_ids, event_ids)
    tracker.done("audit.r1", f"{sum(c.accepted for c in ver1.checked_claims)}/{len(ver1.checked_claims)} affirmations acceptées")

    # 8. follow-up tests (bounded)
    tracker.start("quant.followups")
    requested = [t | {"requested_by": a.agent_id} for a in r1_list for t in a.proposed_followup_tests][:3]
    test_results = [quant_agent.run_test(md, pf, xr, t, led, i + 1, impact_fn=_impact, persona=persona) | {"requested_by": t["requested_by"]}
                    for i, t in enumerate(requested)]
    tests_text = "\n".join(f"{t['test']} ({t['requested_by']}): {t['status']} – {t['summary']} – métriques {t.get('metric_ids', [])}"
                           for t in test_results)
    tracker.done("quant.followups", f"{len(test_results)} test(s) exécuté(s)" if test_results else "aucun test demandé")

    # 9. rebuttals
    if rounds >= 2 and args_r1["opp"] and args_r1["risk"]:
        notes = audit_agent.audit_notes(ver1)
        with ThreadPoolExecutor(max_workers=2) as ex:
            f_o = ex.submit(advocate, "opp", 2, args_r1["risk"], notes, tests_text)
            f_r = ex.submit(advocate, "risk", 2, args_r1["opp"], notes, tests_text)
            args_r2["opp"], args_r2["risk"] = f_o.result(), f_r.result()
    else:
        tracker.skip("opportunity.r2", "tour 2 non exécuté (limite de tours ou échec du tour 1)")
        tracker.skip("risk.r2", "tour 2 non exécuté")
    tracker.start("audit.r2")
    r2_list = [a for a in args_r2.values() if a]
    ver2 = audit_agent.audit_arguments(r2_list, led, source_ids, event_ids)
    tracker.done("audit.r2", f"{sum(c.accepted for c in ver2.checked_claims)}/{len(ver2.checked_claims)} affirmations acceptées")
    all_checks = ver1.checked_claims + ver2.checked_claims
    rejected_ids = {c.claim_id for c in all_checks if not c.accepted}
    for c in all_checks:
        if not c.accepted:
            corrections.append(CorrectionEntry(stage=f"audit {c.agent_id}", original=c.text[:300], issue="; ".join(c.reasons)[:400],
                                               action="affirmation rejetée: exclue de la synthèse"))

    # 10. persona
    tracker.start("persona.check")
    opp_last = args_r2["opp"] or args_r1["opp"]
    risk_last = args_r2["risk"] or args_r1["risk"]
    try:
        persona_out, pu = persona_agent.assess(llm, packet, xr["persona_assessment"], opp_last, risk_last)
        if pu:
            usages.append(pu)
        tracker.done("persona.check", (xr["persona_assessment"] or {}).get("summary", "")[:160], pu)
    except Exception as exc:  # noqa: BLE001
        persona_out = {"narrative": (xr["persona_assessment"] or {}).get("summary", ""), "error": str(exc)[:200]}
        tracker.fail("persona.check", str(exc)[:200])

    # 11. synthesis
    tracker.start("supervisor.synthesis")
    abstained = False
    sup = None
    sup_user = None
    if llm is None or (opp_last is None and risk_last is None):
        abstained = True
        tracker.fail("supervisor.synthesis", "arguments indisponibles: abstention")
    else:
        sup_user = (packet.render(permitted) + f"\n\nSTATUTS PERMIS (règle déterministe 8A.9): {allowed}\nRaison: {status_reason}\n\n"
                    f"ARGUMENTS OPPORTUNITÉ:\n{compact_json(_arg_view(args_r1['opp'], args_r2['opp']))}\n\n"
                    f"ARGUMENTS RISQUE:\n{compact_json(_arg_view(args_r1['risk'], args_r2['risk']))}\n\n"
                    f"AUDIT DÉTERMINISTE:\n{audit_agent.audit_notes(ver1)}\n{audit_agent.audit_notes(ver2)}\n\n"
                    f"TESTS COMPLÉMENTAIRES:\n{tests_text or '(aucun)'}\n\nAGENT PROFIL:\n{compact_json(persona_out)}\n"
                    f"ÉVALUATION DÉTERMINISTE DU PROFIL:\n{(xr['persona_assessment'] or {}).get('summary', '')}")
        try:
            sup, su = json_call(llm, system=SUPERVISOR_SYSTEM, user=sup_user, model_id=s.supervisor_model_id,
                                max_tokens=s.supervisor_max_tokens, agent_id="supervisor.synthesis", temperature=0.2)
            usages.append(su)
            tracker.done("supervisor.synthesis", sup.get("headline", "")[:160], su)
        except Exception as exc:  # noqa: BLE001
            abstained = True
            errors["supervisor.synthesis"] = str(exc)[:300]
            tracker.fail("supervisor.synthesis", str(exc)[:200])

    # 12. audit of the synthesis + bounded correction
    tracker.start("audit.final")
    issues = audit_agent.audit_supervisor(sup, led, allowed, rejected_ids, extra_numbers) if sup else ["synthèse absente"]
    tracker.done("audit.final", "aucun problème" if not issues else f"{len(issues)} problème(s) détecté(s)")
    if sup and issues:
        tracker.start("supervisor.correction", f"{len(issues)} problème(s) renvoyé(s) au Superviseur")
        for i in issues:
            corrections.append(CorrectionEntry(stage="audit de la synthèse", original="(synthèse v1)", issue=i[:400],
                                               action="renvoyé au Superviseur pour correction"))
        try:
            fixed, fu = json_call(llm, system=SUPERVISOR_SYSTEM + "\n" + CORRECTION_ADDENDUM,
                                  user=sup_user + "\n\nTA RÉPONSE PRÉCÉDENTE:\n" + compact_json(sup) + "\n\nPROBLÈMES:\n- " + "\n- ".join(issues),
                                  model_id=s.supervisor_model_id, max_tokens=s.supervisor_max_tokens, agent_id="supervisor.correction",
                                  temperature=0.0)
            usages.append(fu)
            issues2 = audit_agent.audit_supervisor(fixed, led, allowed, rejected_ids, extra_numbers)
            sup = fixed
            if issues2:
                sup = _force_compliance(sup, issues2, allowed, research is not None, corrections)
                tracker.done("supervisor.correction", f"{len(issues2)} problème(s) restant(s): phrases retirées, statut contraint", fu)
            else:
                corrections.append(CorrectionEntry(stage="correction", original="synthèse v1", issue=f"{len(issues)} problème(s)",
                                                   action="synthèse v2 validée par l'audit déterministe"))
                tracker.done("supervisor.correction", "synthèse corrigée et validée", fu)
        except Exception as exc:  # noqa: BLE001
            sup = _force_compliance(sup, issues, allowed, research is not None, corrections)
            tracker.fail("supervisor.correction", f"échec de la correction ({str(exc)[:120]}): réponse qualifiée")
    else:
        tracker.skip("supervisor.correction", "aucune correction nécessaire" if sup else "abstention")

    debate_id = new_id("deb")
    decision = _decision(debate_id, question, persona, xr, sup, args_r1, args_r2, all_checks, corrections, research, abstained, led,
                         filings_events, errors)
    reconciliation = _reconciliation(research, filings_events, led, hyps, corrections, md)
    lenses_for_cov = research["lenses"] if research else {}
    coverage = coverage_report({int(k): v for k, v in lenses_for_cov.items()}, debate_ran=True,
                               counterargument=bool(risk_last and risk_last.claims), hypothesis_tested=True,
                               persona_limit_checked=True) if research else None
    totals = {"input_tokens": sum(u.get("input_tokens", 0) for u in usages), "output_tokens": sum(u.get("output_tokens", 0) for u in usages),
              "llm_calls": len(usages), "models": sorted({u.get("model_id") for u in usages if u.get("model_id")})}
    result = {
        "debate_id": debate_id, "question": question, "persona": persona.model_dump(mode="json"), "portfolio_id": pf.portfolio_id,
        "portfolio_name": pf.name, "asset_id": asset_id, "amount_cad": amount, "created_at": utcnow(), "data_as_of": xr["data_as_of"],
        "rounds": rounds, "xray": {k: xr[k] for k in ("analysis_id", "total_value_cad", "positions", "exposures", "findings",
                                                     "persona_assessment", "diagnosis", "benchmark_label")},
        "provenance": {k: provenance[k] for k in ("dataset_version", "coverage", "issues", "fx_last_date", "dataset_origin")},
        "arguments": {"round1": {k: (v.model_dump(mode="json") if v else None) for k, v in args_r1.items()},
                      "round2": {k: (v.model_dump(mode="json") if v else None) for k, v in args_r2.items()}},
        "verification": {"round1": ver1.model_dump(mode="json"), "round2": ver2.model_dump(mode="json")},
        "followup_tests": test_results, "persona_agent": persona_out, "decision": decision.model_dump(mode="json"),
        "reconciliation": reconciliation, "alternatives": alts, "hypotheses": {k: v.get("result") for k, v in hyps.items()},
        "research": _research_view(research) if research else None, "filings_events": filings_events, "coverage_matrix": coverage,
        "allowed_statuses": allowed, "status_reason": status_reason, "llm_usage": totals, "errors": errors,
        "injected_test_fixture": bool(req.get("inject_unsupported_claim")), "ledger": led.as_dict(),
        "trace": [st.model_dump(mode="json") for st in tracker.job.steps],
    }
    store = get_store()
    store.put(owner, "DEBATE", debate_id, result)
    snap = make_snapshot(owner, pf, xr, label=f"Débat {debate_id}")
    store.put(owner, "SNAPSHOT", snap.snapshot_id, snap.model_dump(mode="json"))
    return result


def _impact(md, pf, persona, asset, amount, speculative):
    from ..services.impact_service import hypothetical_addition
    return hypothetical_addition(md, pf, persona, asset, amount, speculative)


def _arg_view(r1: AgentArgument | None, r2: AgentArgument | None) -> dict:
    def v(a):
        if not a:
            return None
        return {"position": a.position, "claims": [{"id": c.claim_id, "type": c.claim_type, "text": c.text, "metric_ids": c.metric_ids}
                                                  for c in a.claims], "counterarguments": a.counterarguments, "uncertainties": a.uncertainties}
    return {"round1": v(r1), "round2": v(r2)}


def _force_compliance(sup: dict, issues: list[str], allowed: list[str], single_asset: bool, corrections: list[CorrectionEntry]) -> dict:
    bad = []
    for i in issues:
        if "« " in i:
            frag = i.split("« ", 1)[1].split(" »", 1)[0]
            bad.append(frag)
    for k in ("headline", "conclusion", "opportunity_summary", "risk_summary", "persona_summary", "next_step", "status_reason",
              "hype_attention_assessment", "persona_hype_fit"):
        if sup.get(k):
            new = strip_sentences(sup[k], bad)
            if new != sup[k]:
                corrections.append(CorrectionEntry(stage="conformité forcée", original=sup[k][:300], issue="phrase non traçable ou interdite",
                                                   action="phrase retirée"))
                sup[k] = new or "(retiré par l'audit)"
    sup["verified_findings"] = [f for f in sup.get("verified_findings", []) if f.get("metric_ids") and not any(b in f.get("text", "") for b in bad)]
    if sup.get("status") not in allowed:
        forced = SupervisorStatus.RESEARCH_INCONCLUSIVE.value if SupervisorStatus.RESEARCH_INCONCLUSIVE.value in allowed else allowed[0]
        corrections.append(CorrectionEntry(stage="règle 8A.9", original=str(sup.get("status")), issue="statut non permis",
                                           action=f"statut contraint à « {forced} »"))
        sup["status"] = forced
    sup["qualified"] = True
    return sup


def _decision(debate_id, question, persona, xr, sup, r1, r2, checks, corrections, research, abstained, led, filings_events, errors):
    accepted = [{"claim_id": c.claim_id, "agent_id": c.agent_id, "text": c.text, "info_class": c.info_class.value} for c in checks if c.accepted]
    rejected = [{"claim_id": c.claim_id, "agent_id": c.agent_id, "text": c.text, "reasons": c.reasons} for c in checks if not c.accepted]
    if sup is None:
        return SupervisorDecision(
            analysis_id=debate_id, user_question=question, persona_id=persona.persona_id,
            findings=[{"text": f["title"], "metric_ids": f["metric_ids"]} for f in xr["findings"] if f["severity"] != "informational"],
            opportunity_argument="(indisponible)", risk_argument="(indisponible)", persona_summary=(xr["persona_assessment"] or {}).get("summary", ""),
            accepted_claims=accepted, rejected_or_unverified_claims=rejected, conflicts=[],
            final_assessment={"status": SupervisorStatus.INSUFFICIENT_DATA.value, "headline": "Abstention: synthèse multi-agents indisponible",
                              "conclusion": "Les arguments indépendants n'ont pas pu être produits (" + "; ".join(errors.values())[:300] +
                              "). Les constats déterministes de la radiographie restent valides et affichés.", "status_reason": "abstention"},
            scenario_options=[], limitations=["Synthèse LLM indisponible"], source_references=sorted({s for r in led.records() for s in r.source_ids}),
            calculation_references=led.ids()[:200], corrections=corrections, abstained=True, data_as_of=xr["data_as_of"])
    vf = [f for f in sup.get("verified_findings", []) if isinstance(f, dict)]
    return SupervisorDecision(
        analysis_id=debate_id, user_question=question, persona_id=persona.persona_id, findings=vf,
        opportunity_argument=sup.get("opportunity_summary", ""), risk_argument=sup.get("risk_summary", ""),
        persona_summary=sup.get("persona_summary", ""), accepted_claims=accepted, rejected_or_unverified_claims=rejected,
        conflicts=[c for c in sup.get("conflicts", []) if isinstance(c, dict)],
        final_assessment={"status": sup.get("status"), "headline": sup.get("headline", ""), "conclusion": sup.get("conclusion", ""),
                          "status_reason": sup.get("status_reason", ""), "qualified": bool(sup.get("qualified"))},
        scenario_options=[s for s in sup.get("scenario_options", []) if isinstance(s, dict)][:4],
        limitations=[str(x) for x in sup.get("limitations", [])][:8] + [METHODOLOGY["returns"]["costs"]],
        source_references=sorted({s for r in led.records() for s in r.source_ids}),
        calculation_references=sorted({m for f in vf for m in f.get("metric_ids", []) if m in led}),
        verified_event_references=[e["event_id"] for e in (research or {}).get("events", []) if e.get("primary_source")] +
        [e["event_id"] for e in filings_events],
        hype_attention_assessment={"text": sup.get("hype_attention_assessment"), "index": (research or {}).get("attention")} if research else None,
        persona_hype_fit_assessment={"text": sup.get("persona_hype_fit"), "budget": ((research or {}).get("portfolio_impact") or {}).get("budget")}
        if research else None,
        corrections=corrections, next_step=sup.get("next_step", ""), abstained=abstained or sup.get("status") == "insufficient-data",
        data_as_of=xr["data_as_of"])


VERDICT = {"VERIFIED": "Supported", "CORROBORATED": "Inconclusive", "DISPUTED": "Inconclusive", "UNVERIFIED": "Inconclusive",
           "FALSE_AS_SUPPORTED_BY_EVIDENCE": "Contradicted", "UNKNOWN": "Not testable"}


def _reconciliation(research, filings_events, led: MetricLedger, hyps, corrections, md) -> dict:
    internet, verdicts = [], []
    if research:
        ev = {e["evidence_id"]: e for e in research["evidence"] if e.get("evidence_id")}
        for c in research["claims"]:
            srcs = [ev[i] for i in c["source_evidence_ids"] if i in ev][:3]
            internet.append({"claim_id": c["claim_id"], "proposition": c["proposition"], "status": c["status"], "claim_type": c["claim_type"],
                             "independent_reports": c["independent_reports"], "is_fixture": research.get("is_fixture"),
                             "sources": [{"publisher": s.get("publisher"), "url": s.get("canonical_url"), "published_at": s.get("published_at"),
                                          "title": s.get("title")} for s in srcs]})
            v = "Not testable" if c["claim_type"] in ("personal_allegation", "analyst_opinion_forecast") else VERDICT.get(c["status"], "Inconclusive")
            verdicts.append({"claim_id": c["claim_id"], "verdict": v, "basis": c["rationale"],
                             "quant_ids": c.get("supporting_ids", []) + c.get("contradicting_ids", [])})
        for e in research["events"]:
            if e.get("primary_source"):
                internet.append({"claim_id": e["event_id"], "proposition": e["title"], "status": "VERIFIED", "claim_type": "official_filing",
                                 "independent_reports": 1, "sources": [{"publisher": "SEC EDGAR", "url": e.get("url"),
                                                                        "published_at": e.get("published_at"), "title": e["title"]}]})
    for e in filings_events:
        internet.append({"claim_id": e["event_id"], "proposition": e["title"], "status": "VERIFIED", "claim_type": "official_filing",
                         "independent_reports": 1, "sources": [{"publisher": "SEC EDGAR", "url": e["url"], "published_at": e["published_at"],
                                                                "title": e["title"]}]})
    quant_ids = [m for m in ("pf.vol", "pf.mdd", "pf.top2_single", "pf.div_ratio", "pf.stress.vol", "pf.avg_corr", "hyp.H1.mae_ewma",
                             "hyp.H1.mae_longrun", "hyp.H2.share", "hyp.H3.spearman") if m in led]
    if research:
        quant_ids = [m for m in led.ids() if m.startswith(f"asset.{research['asset_id']}.") and not m.startswith(f"asset.{research['asset_id']}.fund")][:10] + quant_ids
    quant = [{"metric_id": m, "label": led.get(m).label, "display": led.get(m).display, "window": [led.get(m).window_start, led.get(m).window_end],
              "method": led.get(m).method, "sources": led.get(m).source_ids} for m in quant_ids]
    hyp_rows = []
    for k, rec in hyps.items():
        r = rec.get("result") or {}
        hyp_rows.append({"hypothesis": k, "statement": rec["spec"]["statement"], "supported": r.get("supported"), "status": r.get("status"),
                         "split": r.get("split"), "spec_hash": rec["spec"]["spec_hash"], "registered_at": rec.get("registered_at"),
                         "evaluated_at": rec.get("evaluated_at")})
    n_contra = sum(1 for v in verdicts if v["verdict"] == "Contradicted")
    n_sup = sum(1 for v in verdicts if v["verdict"] == "Supported")
    agreement = ("disagree" if n_contra else ("agree" if n_sup else "cannot_compare")) if verdicts else "cannot_compare"
    return {"internet_evidence": internet, "quantitative_evidence": quant, "hypotheses": hyp_rows, "claim_verdicts": verdicts,
            "agreement": agreement,
            "agreement_text": {"agree": "Les sources Internet et les données calculées concordent sur les affirmations testables.",
                               "disagree": f"{n_contra} affirmation(s) Internet contredite(s) par les données calculées.",
                               "cannot_compare": "Aucune affirmation Internet testable par les données disponibles."}[agreement],
            "dataset_limit": (f"Le jeu de données historique s'arrête le {md.end_date.date()}: les événements postérieurs ne peuvent pas être "
                              "vérifiés directement par les tables; seules des observations plus récentes (ex. instantané CoinGecko) le peuvent."),
            "correction_log": [c.model_dump(mode="json") for c in corrections]}


def _research_view(r: dict) -> dict:
    keep = ("research_id", "asset_id", "name", "is_fixture", "fixture_label", "claims", "events", "attention", "search_trending", "divergence",
            "independence", "clusters", "coverage_meter", "coverage_ratio", "status_rule", "stop_flags", "portfolio_impact", "biases",
            "forecast_policy", "tool_calls", "lenses", "tier", "coverage_matrix", "market_live", "identity", "extraction")
    return {k: r.get(k) for k in keep}
