import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ExternalLink, Minus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TickerLogo, sym } from "../components/Ticker";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useApp } from "../hooks/useApp";
import { friendly } from "../lib/assets";
import { cad, date, dateTime, pct } from "../lib/format";
import { api, ApiError, Job, JobStep } from "../services/api";

// ================================================================================================ live run
export function MandateRun() {
  const { jobId = "" } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        for (;;) {
          const j = await api.get<Job>(`/jobs/${jobId}`);
          if (!alive) return;
          setJob(j);
          if (j.status === "done" && j.result_ref) { nav(`/mandats/${j.result_ref}`, { replace: true }); return; }
          if (j.status === "failed") return;
          await new Promise((r) => setTimeout(r, 700));
        }
      } catch (e) { if (alive) setError(e as ApiError); }
    })();
    return () => { alive = false; };
  }, [jobId]); // eslint-disable-line
  const q = params.get("q") || "";
  const done = (job?.steps || []).filter((s) => ["done", "skipped", "failed"].includes(s.status)).length;
  const total = job?.steps.length || 11;
  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:">
      <p className="text-sm text-ink-muted">Votre demande</p>
      <h1 className="mt-1 font-display text-[32px] font-medium leading-tight text-ink">{q}</h1>
      <div className="mt-6 flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${(done / total) * 100}%` }} /></div>
        <span className="tabular text-xs text-ink-muted">{done}/{total}</span>
      </div>
      <ErrorBox error={error} />
      {job?.status === "failed" && (
        <div className="mt-6 border-t border-line py-6">
          <p className="text-sm text-ink">{job.error}</p>
          <Link to={`/?demande=${encodeURIComponent(q)}`}><Button className="mt-4">Reformuler</Button></Link>
        </div>
      )}
      <div className="mt-6 border-t border-line py-6"><Pipeline steps={job?.steps || []} live /></div>
    </div>
  );
}

export function Pipeline({ steps, live }: { steps: JobStep[]; live?: boolean }) {
  if (!steps.length) return <Spinner label="Démarrage des agents…" />;
  return (
    <ol data-testid="pipeline">
      {steps.map((s) => {
        const [agent, task] = s.label.split(" : ");
        return (
          <li key={s.step_id} className="flex gap-3.5 rounded-xl px-4 py-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center">
              {s.status === "done" ? <span className="grid h-5 w-5 place-items-center rounded-full bg-ink"><Check className="h-3 w-3 text-white" strokeWidth={3} /></span>
                : s.status === "running" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
                  : s.status === "failed" ? <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-50"><X className="h-3 w-3 text-accent-700" strokeWidth={3} /></span>
                    : s.status === "skipped" ? <span className="grid h-5 w-5 place-items-center rounded-full bg-canvas"><Minus className="h-3 w-3 text-ink-muted" strokeWidth={3} /></span>
                      : <span className="h-2 w-2 rounded-full bg-line" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className={clsx("text-sm", s.status === "pending" ? "text-ink-muted" : "text-ink")}><span className="font-semibold">{agent}</span>{task ? <span className="text-ink-muted"> · {task}</span> : null}</span>
                {!live && s.latency_ms > 0 && <span className="tabular text-[11px] text-ink-muted">{(s.latency_ms / 1000).toFixed(1).replace(".", ",")} s{s.model_id ? ` · ${s.model_id.split(".").slice(-1)[0].split("-v")[0]}` : ""}</span>}
              </div>
              {s.detail && s.status !== "pending" && <p className="mt-0.5 text-sm leading-snug text-ink-muted">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ================================================================================================ proposal
type Tab = "why" | "checks" | "stress" | "debate" | "trace";
const TABS: [Tab, string][] = [["why", "Pourquoi"], ["checks", "Contrôles"], ["stress", "Scénarios"], ["debate", "Pour et contre"], ["trace", "Trace des agents"]];
const STABLE = ["ZST.TO", "XBB.TO", "AGG", "TLT"];

function shortTitle(m: any): string {
  const R = m.requested;
  if (m.intent?.kind === "buy_asset" && R) {
    const n = friendly(R.asset_id, R.name);
    return R.verdict === "suitable" ? `${n} : oui` : R.verdict === "partial" ? `${n} : oui, ${cad(R.max_amount_cad)} max` : `${n} : non`;
  }
  if (m.intent?.kind === "invest") return `Investir ${cad(m.intent.amount_cad)}`;
  if (m.diagnosis && !m.diagnosis.fits) return `${m.diagnosis.problems.length} problème${m.diagnosis.problems.length > 1 ? "s" : ""} dans votre portefeuille`;
  return m.orders.length ? "Rééquilibrer votre portefeuille" : "Votre portefeuille vous ressemble";
}

/** The decision first (title, split, three numbers, one warning, orders); the full agent analysis folded below. */
export function MandateResult() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { reload, setPortfolioId } = useApp();
  const { data: m, error, loading, reload: refetch, setData } = useApi<any>(`/mandates/${id}`, [id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("why");
  const decide = async (what: "approve" | "reject") => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<any>(`/mandates/${id}/${what}`);
      setData({ ...m, ...r });
      if (what === "approve") { if (r.portfolio_id) setPortfolioId(r.portfolio_id); await reload(); }
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  if (loading && !m) return <div className="mx-auto max-w-2xl px-5 py-10"><Spinner /></div>;
  if (error) return <div className="mx-auto max-w-2xl px-5 py-10"><ErrorBox error={error} onRetry={refetch} /></div>;
  if (!m) return null;
  const metrics = m.metrics || {};
  const buys = m.orders.filter((o: any) => o.side === "buy").reduce((s: number, o: any) => s + o.amount_cad, 0);
  const sells = m.orders.filter((o: any) => o.side === "sell").reduce((s: number, o: any) => s + o.amount_cad, 0);
  const breaches = m.governance.filter((g: any) => g.status === "breach");
  const attention = m.governance.find((g: any) => g.status === "blocked") || breaches[0] || m.governance.find((g: any) => g.status === "warn");
  const replay = m.stress.find((r: any) => r.key === "replay_2022");
  const stable = m.orders.filter((o: any) => o.side === "buy" && STABLE.includes(o.asset_id)).reduce((s: number, o: any) => s + o.amount_cad, 0);
  const refused = m.requested && m.requested.verdict === "not_suitable";

  return (
    <div className="mx-auto max-w-2xl px-5 pb-36 pt-8" data-testid="proposal">
      <Link to="/decisions" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Décisions</Link>

      {/* 1. the answer */}
      <p className="mt-8 text-sm text-ink-muted">Vous avez demandé « {m.request} »</p>
      <h1 className="mt-2 font-display text-[40px] font-medium leading-tight text-ink sm:text-[48px]" data-testid="headline-short">{shortTitle(m)}</h1>
      <p className="mt-3 text-lg leading-relaxed text-ink-soft" data-testid="headline">{m.headline}</p>

      {/* diagnosis of the current portfolio (what the agents found) */}
      {m.diagnosis && !m.diagnosis.fits && (m.intent?.kind === "review" || m.diagnosis.problems.length > 0) && (
        <section className="mt-8 border-y border-line py-6" data-testid="proposal-diagnosis">
          <h2 className="font-display text-xl font-medium text-ink">{m.diagnosis.headline}</h2>
          <ul className="mt-3 space-y-2.5">
            {m.diagnosis.problems.map((p: any) => (
              <li key={p.rule_id} className="flex gap-3 text-[15px]"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-600" /><span><span className="font-medium text-ink">{p.title}.</span> <span className="text-ink-muted">{p.detail}</span></span></li>
            ))}
          </ul>
        </section>
      )}

      {/* 2. the split */}
      {buys > 0 && !sells && (
        <div className="mt-8">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-canvas">
            <div className="h-full bg-[#1572c5]" style={{ width: `${(stable / buys) * 100}%` }} />
            <div className="h-full bg-gold-500" style={{ width: `${((buys - stable) / buys) * 100}%` }} />
          </div>
          <div className="tabular mt-2 flex justify-between text-sm">
            <span className="text-ink"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#1572c5]" />Stabilité {pct(stable / buys, 0)}</span>
            <span className="text-ink">Croissance {pct((buys - stable) / buys, 0)}<span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-gold-500" /></span>
          </div>
        </div>
      )}

      {/* 3. three numbers */}
      <div className="mt-8 grid grid-cols-3 divide-x divide-line border-y border-line">
        <Big label="Votre profil" value={breaches.length ? `${breaches.length} limite${breaches.length > 1 ? "s" : ""} dépassée${breaches.length > 1 ? "s" : ""}` : "Respecté"} tone={breaches.length ? "bad" : "good"} small />
        <Big label="Pire baisse passée" value={pct(m.after?.max_drawdown, 0)} />
        <Big label="Si 2022 se répétait" value={replay ? pct(replay.after, 1) : "—"} />
      </div>

      {/* 4. one thing to know */}
      {attention && !(m.intent?.kind === "review" && m.diagnosis && !m.diagnosis.fits) && (
        <div className="mt-6 flex gap-3">
          <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", attention.status === "warn" ? "bg-gold-500" : "bg-accent-600")} />
          <p className="text-[15px] text-ink"><span className="font-medium">{attention.label}.</span> <span className="text-ink-muted">{attention.detail}</span></p>
        </div>
      )}

      {/* 5. orders */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-medium text-ink">{refused ? "À la place, je propose" : m.intent?.kind === "review" && m.orders.length ? "Ce que les agents proposent pour corriger" : "Ce que vous approuvez"}</h2>
          {m.orders.length > 0 && <span className="tabular text-sm text-ink-muted">{sells ? `${cad(buys)} achats · ${cad(sells)} ventes` : cad(buys)}</span>}
        </div>
        {m.orders.length === 0 ? <p className="mt-3 text-ink-muted">Aucun ordre : rien à changer.</p> : (
          <ul className="mt-2 divide-y divide-line" data-testid="orders">
            {[...m.orders].sort((x: any, y: any) => (x.side === y.side ? 0 : x.side === "sell" ? -1 : 1)).map((o: any) => (
              <li key={o.side + o.asset_id} className="flex items-center gap-3 py-3">
                <TickerLogo id={o.asset_id} size={32} />
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{o.side === "sell" && <span className="text-accent-700">Vendre · </span>}{friendly(o.asset_id, o.label)}</span>
                <span className="tabular text-[15px] font-medium text-ink">{cad(o.amount_cad)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 6. everything else, folded */}
      <button onClick={() => setOpen(!open)} className="mt-10 flex w-full items-center justify-between border-y border-line py-4 text-left" data-testid="open-analysis">
        <span><span className="font-medium text-ink">Voir l'analyse complète des agents</span><span className="block text-sm text-ink-muted">Raisons, contrôles, scénarios, pour et contre, trace · {m.llm_usage.calls} appel(s) Amazon Bedrock</span></span>
        <ChevronDown className={clsx("h-5 w-5 text-ink-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="pt-2">
          <div className="flex gap-5 overflow-x-auto border-b border-line">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={clsx("-mb-px shrink-0 border-b-2 py-3 text-sm font-medium", tab === k ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink")}>{l}</button>
            ))}
          </div>
          <div className="mt-5">
            {tab === "why" && <Why m={m} metrics={metrics} />}
            {tab === "checks" && <Checks m={m} />}
            {tab === "stress" && <Stress m={m} />}
            {tab === "debate" && <Debate m={m} metrics={metrics} />}
            {tab === "trace" && <div><Pipeline steps={m.trace || []} /><p className="pb-3 text-xs text-ink-muted">Données au {date(m.data_as_of)}</p></div>}
          </div>
        </div>
      )}

      {/* decision bar */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-white md:bottom-0">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2 px-5 py-3">
          {err && <ErrorBox error={err} />}
          {m.status === "proposed" ? (
            <>
              <Button size="lg" onClick={() => decide("approve")} disabled={busy || !m.orders.length} data-testid="approve">{sells ? `Approuver les ${m.orders.length} ordres` : `Approuver${buys ? ` ${cad(buys)}` : ""}`}</Button>
              <Button size="lg" variant="ghost" onClick={() => nav(`/?demande=${encodeURIComponent(m.request)}`)}>Modifier</Button>
              <Button size="lg" variant="ghost" onClick={() => decide("reject")} disabled={busy}>Refuser</Button>
            </>
          ) : m.status === "approved" ? (
            <>
              <span className="flex items-center gap-2 text-sm font-medium text-ink" data-testid="approved"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-600"><Check className="h-3 w-3 text-white" strokeWidth={3} /></span> Approuvé · portefeuille simulé à jour</span>
              <Button className="ml-auto" variant="secondary" onClick={() => nav("/placements")}>Voir mes placements <ArrowRight className="h-4 w-4" /></Button>
            </>
          ) : (
            <><span className="text-sm text-ink-muted">Proposition refusée</span><Button className="ml-auto" variant="secondary" onClick={() => nav(`/?demande=${encodeURIComponent(m.request)}`)}>Reformuler</Button></>
          )}
        </div>
      </div>
    </div>
  );
}

function Big({ label, value, tone, small }: { label: string; value: string; tone?: "good" | "bad"; small?: boolean }) {
  return (
    <div className="py-5 pl-4 first:pl-0">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={clsx("tabular mt-1 font-display font-medium leading-tight", small ? "text-lg sm:text-xl" : "text-2xl sm:text-[28px]", tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-accent-700" : "text-ink")}>{value}</div>
    </div>
  );
}

function Why({ m, metrics }: { m: any; metrics: any }) {
  const e = m.explanation;
  return (
    <div className="space-y-6" data-testid="explanation">
      <List title="Les raisons" items={e.why} metrics={metrics} />
      <List title="À surveiller" items={e.watch} metrics={metrics} />
      {m.research && (
        <div>
          <h3 className="text-sm font-semibold text-ink">Ce que l'agent Recherche a trouvé</h3>
          <ul className="mt-2 divide-y divide-line border-t border-line">
            {m.research.events.map((ev: any, i: number) => (
              <li key={i} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div><div className="text-ink">{ev.title}</div><div className="text-xs text-ink-muted">{ev.provider} · {date(ev.published_at)}</div></div>
                {ev.url && <a href={ev.url} target="_blank" rel="noreferrer" className="shrink-0 text-ink-muted hover:text-ink" aria-label="Source"><ExternalLink className="h-4 w-4" /></a>}
              </li>
            ))}
            {!m.research.events.length && <li className="py-3 text-sm text-ink-muted">Aucun fait récent vérifié dans les sources officielles.</li>}
            {m.research.unverified.map((u: string, i: number) => <li key={"u" + i} className="py-3 text-sm text-ink-muted"><span className="font-medium text-gold-600">Non confirmé · </span>{u}</li>)}
          </ul>
        </div>
      )}
      <List title="Limites" items={[...e.limits, ...m.assumptions]} metrics={metrics} muted />
      <p className="text-xs text-ink-muted">Les chiffres soulignés viennent d'un calcul vérifié : touchez-les pour voir la méthode.</p>
    </div>
  );
}

function List({ title, items, metrics, muted }: { title: string; items: string[]; metrics: any; muted?: boolean }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ul className="mt-2 space-y-2">{items.map((x, i) => <li key={i} className={clsx("flex gap-3 leading-relaxed", muted ? "text-sm text-ink-muted" : "text-[15px] text-ink")}><span className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-ink-muted" /><span><Rich text={x} metrics={metrics} /></span></li>)}</ul>
    </div>
  );
}

function Checks({ m }: { m: any }) {
  const label: Record<string, [string, string]> = { ok: ["Respecté", "text-emerald-700"], adjusted: ["Ajusté", "text-gold-600"], blocked: ["Bloqué", "text-accent-700"], breach: ["Dépassé", "text-accent-700"], warn: ["Attention", "text-gold-600"] };
  return (
    <ul className="divide-y divide-line border-t border-line" data-testid="governance">
      {m.governance.map((g: any, i: number) => (
        <li key={i} className="flex gap-4 py-3.5">
          <span className={clsx("w-20 shrink-0 pt-0.5 text-xs font-semibold uppercase tracking-wide", label[g.status]?.[1])}>{label[g.status]?.[0]}</span>
          <div className="min-w-0"><div className="text-sm font-medium text-ink">{g.label}</div><div className="text-sm text-ink-muted">{g.detail}</div></div>
        </li>
      ))}
    </ul>
  );
}

function Stress({ m }: { m: any }) {
  return (
    <div className="border-t border-line">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-ink-muted"><th className="pb-2 pt-4 font-medium">Scénario</th>{m.before && <th className="px-3 pb-2 pt-4 text-right font-medium">Avant</th>}<th className="pb-2 pt-4 text-right font-medium">Après</th></tr></thead>
        <tbody>
          {m.stress.map((r: any) => (
            <tr key={r.key} className="border-t border-line">
              <td className="py-3 text-ink">{r.name}</td>
              {m.before && <td className="tabular whitespace-nowrap px-3 py-3 text-right text-ink-muted">{r.before != null ? pct(r.before) : "—"}</td>}
              <td className={clsx("tabular whitespace-nowrap py-3 text-right font-semibold", (r.after ?? 0) < 0 ? "text-accent-700" : "text-emerald-700")}>{pct(r.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pb-4 pt-2 text-xs text-ink-muted">Rejeu de 2022 et chocs hypothétiques : décrivent le passé ou une hypothèse, pas l'avenir.</p>
    </div>
  );
}

function Debate({ m, metrics }: { m: any; metrics: any }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {([["Agent Opportunités", m.debate.opportunity], ["Agent Risques", m.debate.risk]] as const).map(([t, a]) => (
        <section key={t} className="border-t border-line py-6">
          <h3 className="text-sm font-semibold text-ink">{t}</h3>
          {!a ? <p className="mt-2 text-sm text-ink-muted">Indisponible (IA générative non connectée).</p> : (
            <>
              <p className="mt-2 text-sm text-ink-soft">{a.position}</p>
              <ul className="mt-3 space-y-3">
                {a.claims.map((c: any, i: number) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    {c.accepted === false ? <X className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                    <div className={clsx(c.accepted === false ? "text-ink-muted" : "text-ink")}>
                      <Rich text={c.text} metrics={metrics} />
                      {c.accepted === false && <div className="mt-0.5 text-xs text-accent-700">Rejetée par l'audit : {c.reasons.join(" · ")}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
    </div>
  );
}

/** [metric.id] → verified value, clickable to its method. Unknown ids are dropped. */
export function Rich({ text, metrics }: { text: string; metrics: any }) {
  const parts = useMemo(() => text.split(/(\[[a-z]+\.[A-Za-z0-9_.\-]+\])/g), [text]);
  return <>{parts.map((p, i) => {
    const mm = p.match(/^\[([a-z]+\.[A-Za-z0-9_.\-]+)\]$/);
    if (!mm) return <span key={i}>{p}</span>;
    const rec = metrics[mm[1]];
    return rec ? <MetricChip key={i} m={rec} /> : null;
  })}</>;
}

function MetricChip({ m }: { m: any }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button type="button" onClick={() => setOpen(!open)} title={`${m.label} · ${m.method}`} className="tabular font-semibold text-ink underline decoration-gold-500 decoration-2 underline-offset-[3px] hover:bg-gold-50">{m.display}</button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-1.5 block w-72 rounded-xl border border-line bg-white p-3 text-left text-xs font-normal leading-relaxed text-ink-soft shadow-lift">
          <b className="block font-semibold text-ink">{m.label} : {m.display}</b>
          <span className="mt-1 block">Méthode : {m.method}</span>
          {m.window_start && <span className="block">Période : {m.window_start} → {m.window_end}</span>}
          <span className="block">{m.info_class === "HYPOTHETICAL" ? "Hypothèse / proposition" : "Résultat calculé"}</span>
          <span className="mt-1 block text-[10px] text-ink-muted">{m.metric_id}</span>
        </span>
      )}
    </span>
  );
}

// ================================================================================================ history
export function Decisions() {
  const { data, loading } = useApi<any>("/mandates");
  const list: any[] = data?.mandates || [];
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:">
      <div className="flex items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-medium text-ink">Décisions</h1>
        <Link to="/"><Button variant="gold">Nouvelle décision</Button></Link>
      </div>
      {loading && !data && <Spinner />}
      {data && !list.length && <div className="mt-8 border-t border-line py-12 text-center text-sm text-ink-muted">Aucune décision pour l'instant.</div>}
      {list.length > 0 && (
        <ul className="mt-6 divide-y divide-line border-t border-line">
          {list.map((m) => (
            <li key={m.mandate_id}>
              <Link to={`/mandats/${m.mandate_id}`} className="flex items-center gap-4 py-4 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{m.request}</div>
                  <div className="truncate text-sm text-ink-muted">{m.headline}</div>
                </div>
                <div className="text-right">
                  <div className={clsx("text-xs font-semibold", m.status === "approved" ? "text-emerald-700" : m.status === "rejected" ? "text-ink-muted" : "text-gold-600")}>{m.status === "approved" ? "Approuvée" : m.status === "rejected" ? "Refusée" : "En attente"}</div>
                  <div className="text-xs text-ink-muted">{date(m.created_at)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
