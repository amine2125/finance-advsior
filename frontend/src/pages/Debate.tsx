import clsx from "clsx";
import { Gavel, Play, ShieldAlert, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CoverageMatrix, ImpactPanel, LensTable, PersonaPanel, Reconciliation } from "../components/analysis";
import { ActivityTimeline, Button, Card, Disclaimer, ErrorBox, Input, Loading, MetricRef, Notice, PageHeader, Select, SupervisorStatus, Table } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useApi, useJob } from "../hooks/useApi";
import { date } from "../lib/format";
import { api } from "../services/api";

function ArgumentCard({ side, r1, r2, checks, ledger }: { side: "opp" | "risk"; r1: any; r2: any; checks: Record<string, any>; ledger: any }) {
  const [round, setRound] = useState<1 | 2>(r2 ? 2 : 1);
  const a = round === 2 && r2 ? r2 : r1;
  const opp = side === "opp";
  return (
    <Card accent={opp ? "teal" : "rose"} title={<span className="flex items-center gap-2">{opp ? <TrendingUp className="h-4 w-4 text-aegis-400" /> : <ShieldAlert className="h-4 w-4 text-rose-400" />}{opp ? "Agent Opportunité" : "Agent Risque"}</span>}
      subtitle={a ? `${a.model_id || ""} · ${(a.usage?.input_tokens || 0) + (a.usage?.output_tokens || 0)} jetons` : "échec de l'appel"}
      actions={<div className="flex gap-1 text-[11px]">{[1, 2].map((n) => <button key={n} disabled={n === 2 && !r2} onClick={() => setRound(n as 1 | 2)} className={clsx("rounded-lg px-2 py-1", round === n ? "bg-ink-700 text-white" : "text-slate-400 disabled:opacity-30")}>{n === 1 ? "Ouverture" : "Réfutation"}</button>)}</div>}>
      {!a ? <p className="text-sm text-rose-300">Argument indisponible (appel au modèle en échec).</p> : (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-200">{a.position}</p>
          {a.injected_test_fixture && <Notice tone="fixture">Une affirmation fabriquée a été injectée volontairement (fixture de test) pour démontrer l'audit.</Notice>}
          <ul className="space-y-2">
            {a.claims.map((c: any) => {
              const ck = checks[c.claim_id];
              return (
                <li key={c.claim_id} className={clsx("rounded-xl border p-2.5 text-xs", ck?.accepted === false ? "border-rose-500/40 bg-rose-500/5" : "border-ink-700 bg-ink-850/60")}>
                  <div className="flex flex-wrap items-center gap-2 text-[10px]"><span className="font-mono text-slate-500">{c.claim_id}</span>
                    <span className={clsx("rounded px-1.5 py-0.5", c.claim_type === "fact" ? "bg-sky-500/10 text-sky-300" : c.claim_type === "hypothetical" ? "bg-fuchsia-500/10 text-fuchsia-300" : "bg-violet-500/10 text-violet-300")}>{c.claim_type === "fact" ? "fait" : c.claim_type === "hypothetical" ? "hypothèse" : "interprétation"}</span>
                    {ck && <span className={ck.accepted ? "text-emerald-300" : "font-semibold text-rose-300"}>{ck.accepted ? "✓ vérifiée par l'audit" : "✗ rejetée par l'audit"}</span>}</div>
                  <div className={clsx("mt-1 text-slate-200", ck?.accepted === false && "line-through decoration-rose-400/60")}>{c.text}</div>
                  {ck?.accepted === false && <div className="mt-1 text-[11px] text-rose-300">{ck.reasons.join(" · ")}</div>}
                  <div className="mt-1 flex flex-wrap gap-1">{c.metric_ids.map((m: string) => <MetricRef key={m} id={m} ledger={ledger} />)}</div>
                </li>
              );
            })}
          </ul>
          {a.counterarguments?.length > 0 && <div className="text-xs text-slate-400"><b className="text-slate-300">Contre-arguments :</b><ul className="ml-4 list-disc">{a.counterarguments.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
          {a.uncertainties?.length > 0 && <div className="text-xs text-slate-500"><b>Incertitudes :</b> {a.uncertainties.join(" · ")}</div>}
          {a.proposed_followup_tests?.length > 0 && <div className="text-[11px] text-slate-500">Tests demandés : {a.proposed_followup_tests.map((t: any) => t.test).join(", ")}</div>}
        </div>
      )}
    </Card>
  );
}

export default function Debate() {
  const { portfolioId, personaId } = useApp();
  const [params] = useSearchParams();
  const assets = useApi<any>("/assets");
  const history = useApi<any>("/agents/debates");
  const [question, setQuestion] = useState("");
  const [asset, setAsset] = useState(params.get("asset") || "");
  const [amount, setAmount] = useState("5000");
  const [fixture, setFixture] = useState(false);
  const [inject, setInject] = useState(false);
  const [debate, setDebate] = useState<any>(null);
  const [loadingD, setLoadingD] = useState(false);
  const { job, running, error, start } = useJob();
  const load = async (id: string) => { setLoadingD(true); try { setDebate(await api.get(`/agents/debate/${id}`)); } finally { setLoadingD(false); } };
  useEffect(() => { const id = params.get("id"); if (id) load(id); }, []); // eslint-disable-line
  const run = async () => {
    setDebate(null);
    const j = await start("/agents/debate", { portfolio_id: portfolioId, persona_id: personaId, question: question || null, asset_id: asset || null,
      amount_cad: asset ? +amount : null, use_fixture: fixture, inject_unsupported_claim: inject, rounds: 2 });
    if (j?.status === "done" && j.result_ref) { await load(j.result_ref); history.reload(); }
  };
  const checks: Record<string, any> = {};
  if (debate) for (const r of ["round1", "round2"]) for (const c of debate.verification[r].checked_claims) checks[c.claim_id] = c;
  const dec = debate?.decision;
  const L = debate?.ledger || {};
  return (
    <div>
      <PageHeader title="Chambre de débat IA" subtitle="Deux agents indépendants reçoivent le même dossier de preuves, argumentent puis se réfutent (2 tours max). L'agent Preuves & Gouvernance audite chaque affirmation; le Superviseur tranche selon la qualité des preuves." />
      <Card title="Question à évaluer" accent="violet">
        <div className="grid gap-3 lg:grid-cols-[1fr_200px_140px]">
          <Input label="Question (facultatif – sinon question par défaut du Superviseur)" value={question} onChange={setQuestion} placeholder="Ce portefeuille hypothétique est-il excessivement concentré ?" />
          <Select label="Actif tendance (facultatif)" value={asset} onChange={setAsset} options={[{ value: "", label: "— portefeuille seulement —" }, ...(assets.data?.assets || []).map((a: any) => ({ value: a.asset_id, label: `${a.asset_id} – ${a.name}` }))]} />
          <Input label="Montant hypothétique (CAD)" type="number" value={amount} onChange={setAmount} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-300">
          <label className="flex items-center gap-2"><input type="checkbox" checked={inject} onChange={(e) => setInject(e.target.checked)} /> Injecter une affirmation fabriquée (démonstration de l'audit)</label>
          {asset && <label className="flex items-center gap-2"><input type="checkbox" checked={fixture} onChange={(e) => setFixture(e.target.checked)} /> Utiliser la fixture d'actualités hors ligne (fictive, étiquetée)</label>}
          <Button onClick={run} disabled={running} className="ml-auto"><Play className="h-4 w-4" /> {running ? "Débat en cours…" : "Lancer le débat"}</Button>
        </div>
        {(running || job) && !debate && <div className="mt-4 rounded-xl bg-ink-850/70 p-3"><ActivityTimeline steps={job?.steps || []} /></div>}
        <ErrorBox error={error} />
      </Card>
      {loadingD && <Loading />}
      {debate && (
        <div className="mt-5 space-y-5" data-testid="debate-result">
          <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-4 text-sm"><span className="text-slate-400">Question évaluée :</span> <b className="text-white">{debate.question}</b>
            <div className="mt-1 text-xs text-slate-500">{debate.persona.display_name} · {debate.portfolio_name} · données au {debate.data_as_of} · {debate.llm_usage.llm_calls} appels Bedrock ({debate.llm_usage.models.join(", ")}) · {debate.llm_usage.input_tokens + debate.llm_usage.output_tokens} jetons</div></div>
          <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr_1fr]">
            <ArgumentCard side="opp" r1={debate.arguments.round1.opp} r2={debate.arguments.round2.opp} checks={checks} ledger={L} />
            <Card accent="amber" title={<span className="flex items-center gap-2"><Gavel className="h-4 w-4 text-amber-300" /> Superviseur – conclusion analytique</span>} subtitle="Décision sur la conclusion, jamais sur une transaction">
              <div className="space-y-3">
                <SupervisorStatus status={dec.final_assessment.status} />
                {dec.final_assessment.qualified && <Notice tone="warn">Réponse qualifiée : des phrases non traçables ont été retirées par l'audit.</Notice>}
                <h3 className="text-base font-semibold leading-snug text-white">{dec.final_assessment.headline}</h3>
                <p className="text-sm leading-relaxed text-slate-300">{dec.final_assessment.conclusion}</p>
                {dec.final_assessment.status_reason && <p className="text-[11px] text-slate-500">Statut : {dec.final_assessment.status_reason} — permis : {debate.allowed_statuses.join(", ")}</p>}
                <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Constats vérifiés</div>
                  <ul className="space-y-1.5">{dec.findings.map((f: any, i: number) => <li key={i} className="text-xs text-slate-200">• {f.text} <span className="ml-1 inline-flex flex-wrap gap-1">{(f.metric_ids || []).map((m: string) => <MetricRef key={m} id={m} ledger={L} />)}</span></li>)}</ul></div>
                <div className="grid gap-2 text-xs md:grid-cols-2">
                  <div className="rounded-xl bg-aegis-500/5 p-2.5 ring-1 ring-aegis-500/20"><b className="text-aegis-300">Perspective Opportunité</b><p className="mt-1 text-slate-300">{dec.opportunity_argument}</p></div>
                  <div className="rounded-xl bg-rose-500/5 p-2.5 ring-1 ring-rose-500/20"><b className="text-rose-300">Perspective Risque</b><p className="mt-1 text-slate-300">{dec.risk_argument}</p></div>
                </div>
                <div className="rounded-xl bg-violet-500/5 p-2.5 text-xs ring-1 ring-violet-500/20"><b className="text-violet-300">Évaluation du profil</b><p className="mt-1 text-slate-300">{dec.persona_summary}</p></div>
                {dec.conflicts?.length > 0 && <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Désaccords</div>
                  {dec.conflicts.map((c: any, i: number) => <div key={i} className="mb-1.5 rounded-lg bg-ink-850 p-2 text-[11px] text-slate-300"><b className="text-white">{c.topic}</b> — Opp. : {c.opportunity_view} · Risque : {c.risk_view} → <span className="text-amber-200">{c.resolution}</span></div>)}</div>}
                {dec.scenario_options?.length > 0 && <div className="text-xs"><b className="text-slate-300">Scénarios à explorer :</b> {dec.scenario_options.map((s: any) => s.title).join(" · ")}</div>}
                {dec.next_step && <div className="text-xs text-aegis-300">Prochaine étape : {dec.next_step}</div>}
                <div className="text-[11px] text-slate-500"><b>Limites :</b> {dec.limitations.join(" · ")}</div>
              </div>
            </Card>
            <ArgumentCard side="risk" r1={debate.arguments.round1.risk} r2={debate.arguments.round2.risk} checks={checks} ledger={L} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Affirmations rejetées ou non vérifiées" accent="rose">
              {dec.rejected_or_unverified_claims.length ? <Table head={["Id", "Agent", "Affirmation", "Raisons"]} rows={dec.rejected_or_unverified_claims.map((r: any) => [<span className="font-mono">{r.claim_id}</span>, r.agent_id, r.text, <span className="text-rose-300">{r.reasons.join(" · ")}</span>])} />
                : <p className="text-sm text-slate-400">Aucune affirmation rejetée.</p>}
            </Card>
            <Card title="Tests complémentaires exécutés par l'Agent Quantitatif">
              {debate.followup_tests.length ? <Table head={["Test", "Demandé par", "Statut", "Résultat"]} rows={debate.followup_tests.map((t: any) => [t.test, t.requested_by, t.status, t.summary])} /> : <p className="text-sm text-slate-400">Aucun test demandé.</p>}
            </Card>
          </div>
          <Card title={`Contraintes du profil – ${debate.persona.display_name}`} accent="violet"><PersonaPanel pa={debate.xray.persona_assessment} />
            {debate.persona_agent?.narrative && <p className="mt-3 text-sm text-slate-300"><b className="text-violet-300">Agent Profil :</b> {debate.persona_agent.narrative}</p>}</Card>
          {debate.research && (
            <>
              {debate.research.portfolio_impact && <Card title="Impact de l'ajout hypothétique"><ImpactPanel impact={debate.research.portfolio_impact} /></Card>}
              <div className="grid gap-5 xl:grid-cols-2">
                <Card title="Lentilles d'analyse"><LensTable lenses={debate.research.lenses} /></Card>
                <Card title="Matrice de couverture des modes d'échec"><CoverageMatrix rows={debate.coverage_matrix} /></Card>
              </div>
            </>
          )}
          <Reconciliation rec={debate.reconciliation} verdict={dec.final_assessment} />
          <Card title="Trace d'exécution des agents"><ActivityTimeline steps={debate.trace} /></Card>
        </div>
      )}
      <Card title="Historique des débats" className="mt-5">
        {(history.data?.debates || []).length ? <Table head={["Date", "Profil", "Question", "Statut", ""]} rows={history.data.debates.map((d: any) => [date(d.created_at), d.persona, d.question, <SupervisorStatus status={d.status} />,
          <button className="text-aegis-300 hover:underline" onClick={() => load(d.debate_id)}>Ouvrir</button>])} /> : <p className="text-sm text-slate-400">Aucun débat enregistré.</p>}
      </Card>
      <div className="mt-4"><Disclaimer /></div>
    </div>
  );
}
