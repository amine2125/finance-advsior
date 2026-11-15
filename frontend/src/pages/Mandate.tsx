import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Calculator, Check, ChevronDown, CloudLightning, Database, ExternalLink, Gauge, Info, LucideIcon, Minus,
  Newspaper, PenLine, PieChart, Plus, Repeat, ScanSearch, ShieldCheck, TrendingDown, TrendingUp, TriangleAlert, UserRound, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Glass, PageIn, softSpring, spring, Stagger, StaggerItem, Tabs } from "../components/motion";
import { sym, TickerLogo } from "../components/Ticker";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useApp } from "../hooks/useApp";
import { friendly } from "../lib/assets";
import { cad, date, pct } from "../lib/format";
import { api, ApiError, Job, JobStep } from "../services/api";
import { launchMandate } from "./Home";

// ================================================================================================ live run
/** One short sentence per agent step, in the client's words. */
const STEP_UI: Record<string, [string, LucideIcon]> = {
  "profile.read": ["Lecture de votre profil", UserRound],
  "supervisor.understand": ["Compréhension de votre demande", ScanSearch],
  "data.collect": ["Lecture des prix du marché", Database],
  "market_intelligence.research": ["Lecture des nouvelles", Newspaper],
  "quant.proposal": ["Construction de la proposition", Calculator],
  "governance.orders": ["Vérification de vos limites", ShieldCheck],
  "scenario.stress": ["Test face à la crise de 2022", CloudLightning],
  "opportunity.r1": ["Recherche des avantages", TrendingUp],
  "risk.r1": ["Recherche des risques", TrendingDown],
  "audit.claims": ["Vérification de chaque chiffre", BadgeCheck],
  "supervisor.explain": ["Rédaction de la réponse", PenLine],
};
const STEP_MIN_MS = 650; // each sentence stays long enough to be read, even when a step is instant
const STALL_MS = 150_000;

/** The agents at work: one animated mark and one sentence at a time, then straight to the answer. */
export function MandateRun() {
  const { jobId = "" } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const { portfolio } = useApp();
  const [shown, setShown] = useState(0);
  const [stalled, setStalled] = useState(false);
  const sig = (job?.steps || []).map((s) => s.status).join(",");
  useEffect(() => {  // a worker that dies (restart, timeout) never reports: no step change for 2,5 min = interrupted
    if (!job || job.status === "done" || job.status === "failed") return;
    setStalled(false);
    const t = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(t);
  }, [sig, job?.status]); // eslint-disable-line
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        for (;;) {
          const j = await api.get<Job>(`/jobs/${jobId}`);
          if (!alive) return;
          setJob(j);
          if (j.status === "done" || j.status === "failed") return;
          await new Promise((r) => setTimeout(r, 600));
        }
      } catch (e) { if (alive) setError(e as ApiError); }
    })();
    return () => { alive = false; };
  }, [jobId]);

  const steps = (job?.steps || []).filter((s) => s.status !== "skipped");
  const firstOpen = steps.findIndex((s) => s.status === "pending" || s.status === "running");
  const reached = job?.status === "done" ? steps.length : firstOpen < 0 ? steps.length : firstOpen;
  useEffect(() => {
    if (shown >= reached) return;
    const t = setTimeout(() => setShown((v) => v + 1), STEP_MIN_MS);
    return () => clearTimeout(t);
  }, [shown, reached]);
  const failed = job?.status === "failed" || !!error || stalled;
  const [relaunching, setRelaunching] = useState(false);
  const ready = job?.status === "done" && !!job.result_ref && steps.length > 0 && shown >= steps.length;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => nav(`/mandats/${job!.result_ref}`, { replace: true }), 750);
    return () => clearTimeout(t);
  }, [ready]); // eslint-disable-line

  const q = params.get("q") || "";
  const cur = steps[Math.min(shown, Math.max(0, steps.length - 1))];
  const [phrase, Icon] = ready ? ["C'est prêt", Check] as [string, LucideIcon] : failed ? ["Analyse interrompue", X] as [string, LucideIcon]
    : cur ? STEP_UI[cur.step_id] || [cur.label.split(" : ")[0], Calculator] : ["Les agents se préparent", ScanSearch] as [string, LucideIcon];
  const progress = steps.length ? Math.min(1, shown / steps.length) : 0.04;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-160px)] max-w-md flex-col items-center justify-center px-5 py-10 text-center" data-testid="pipeline">
      {q && <p className="max-w-full truncate rounded-full glass hairline px-4 py-1.5 text-sm text-ink-soft">« {q} »</p>}
      <Orb Icon={Icon} iconKey={phrase} state={ready ? "done" : failed ? "fail" : "run"} />
      <div className="mt-9 grid min-h-[72px] w-full place-items-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={phrase} className="text-balance font-display text-[22px] font-semibold leading-tight tracking-tight text-ink sm:text-2xl"
            initial={{ opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
            {phrase}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="mt-6 h-1 w-44 overflow-hidden rounded-full bg-ink/[0.06]">
        <motion.div className={clsx("h-full rounded-full", ready ? "bg-gain-600" : "bg-primary-500")} initial={{ width: "4%" }} animate={{ width: `${progress * 100}%` }} transition={softSpring} />
      </div>
      {failed && (
        <div className="mt-8">
          <p className="text-sm text-ink-soft">{stalled ? "Les agents ne répondent plus. Relancez l'analyse : elle reprend depuis le début." : job?.error || error?.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button disabled={relaunching} onClick={async () => { setRelaunching(true); try { await launchMandate(nav, q, portfolio?.portfolio_id); } catch { setRelaunching(false); } }}>{relaunching ? "Relance…" : "Relancer"}</Button>
            <Link to={`/?demande=${encodeURIComponent(q)}`}><Button variant="ghost">Reformuler</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** A thin cobalt comet circling the current step's icon; turns into a green check when the answer is ready. */
function Orb({ Icon, iconKey, state }: { Icon: LucideIcon; iconKey: string; state: "run" | "done" | "fail" }) {
  return (
    <div className="relative mt-10 h-32 w-32">
      <motion.div aria-hidden className={clsx("absolute -inset-10 rounded-full blur-3xl", state === "done" ? "bg-gain-600/20" : state === "fail" ? "bg-accent-600/15" : "bg-primary-500/20")}
        animate={{ scale: [1, 1.12, 1], opacity: [0.55, 1, 0.55] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }} />
      <div className="absolute inset-0 rounded-full bg-ink/[0.05]" />
      {state === "run" && (
        <motion.div aria-hidden className="absolute inset-0 rounded-full"
          style={{ background: "conic-gradient(from 0deg, rgba(51,80,255,0) 0deg, rgba(51,80,255,0.15) 120deg, #3350ff 330deg, rgba(51,80,255,0) 360deg)" }}
          animate={{ rotate: 360 }} transition={{ duration: 1.3, repeat: Infinity, ease: "linear" }} />
      )}
      {state !== "run" && <motion.div aria-hidden className={clsx("absolute inset-0 rounded-full", state === "done" ? "bg-gain-600" : "bg-accent-600")} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring} />}
      <div className={clsx("absolute inset-[3px] grid place-items-center rounded-full", state === "run" ? "bg-surface" : "bg-transparent")}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={iconKey} initial={{ scale: 0.4, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}>
            <Icon className={clsx("h-10 w-10", state === "run" ? "text-ink" : "text-white")} strokeWidth={state === "run" ? 1.5 : 2.5} />
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Full step list with durations: shown only in the « Trace » tab of the detailed analysis. */
export function Pipeline({ steps }: { steps: JobStep[] }) {
  if (!steps.length) return <Spinner label="Démarrage des agents…" />;
  return (
    <ol>
      {steps.map((s) => {
        const [agent, task] = s.label.split(" : ");
        return (
          <li key={s.step_id} className="flex gap-3.5 py-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center">
              {s.status === "done" ? <span className="grid h-5 w-5 place-items-center rounded-full bg-ink"><Check className="h-3 w-3 text-white" strokeWidth={3} /></span>
                : s.status === "failed" ? <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-50"><X className="h-3 w-3 text-accent-700" strokeWidth={3} /></span>
                  : <span className="grid h-5 w-5 place-items-center rounded-full bg-ink/[0.05]"><Minus className="h-3 w-3 text-ink-muted" strokeWidth={3} /></span>}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm text-ink"><span className="font-semibold">{agent}</span>{task ? <span className="text-ink-muted"> · {task}</span> : null}</span>
                {s.latency_ms > 0 && <span className="tabular-nums text-[11px] text-ink-muted">{(s.latency_ms / 1000).toFixed(1).replace(".", ",")} s{s.model_id ? ` · ${s.model_id.split(".").slice(-1)[0].split("-v")[0]}` : ""}</span>}
              </div>
              {s.detail && <p className="mt-0.5 text-sm leading-snug text-ink-muted">{s.detail}</p>}
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
const TIER: Record<string, string> = { LOW: "Faible", MEDIUM: "Moyen", HIGH: "Élevé" };
const TIER_I: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
type Tone = "good" | "mid" | "bad";

/** The answer in a few words, and how it looks (green yes, cobalt « yes, but », red no). */
function verdict(m: any): { title: string; tone: Tone } {
  const R = m.requested;
  const kind = m.intent?.kind;
  if (kind === "buy_asset" && R) {
    const n = sym(R.asset_id);
    return R.verdict === "suitable" ? { title: `${n} : bonne idée pour vous`, tone: "good" }
      : R.verdict === "partial" ? { title: `${n} : oui, jusqu'à ${cad(R.max_amount_cad)}`, tone: "mid" }
        : { title: `${n} : pas pour vous`, tone: "bad" };
  }
  if (kind === "invest") return { title: `Investir ${cad(m.intent.amount_cad)}`, tone: "good" };
  const P = m.diagnosis?.problems || [];
  if (m.diagnosis && !m.diagnosis.fits) {
    const risky = P.some((p: any) => p.rule_id === "tier" || p.rule_id === "budget.drawdown_review" || (p.rule_id === "budget.growth_band" && p.value > p.limit_value));
    return { title: risky ? `Trop risqué pour un profil ${m.profile_level.toLowerCase()}` : `${P.length} point${P.length > 1 ? "s" : ""} à corriger`, tone: "bad" };
  }
  return { title: m.orders.length ? "Quelques ajustements" : "Rien à changer", tone: "good" };
}

/** The decision first, as pictures: verdict → what the agents found → the plan → before/after. Full analysis folded below. */
export function MandateResult() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { me, reload, setPortfolioId } = useApp();
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

  const kind = m.intent?.kind;
  const v = verdict(m);
  const R = m.requested;
  const B = m.before, A = m.after;
  const buys = m.orders.filter((o: any) => o.side === "buy").reduce((s: number, o: any) => s + o.amount_cad, 0);
  const sells = m.orders.filter((o: any) => o.side === "sell").reduce((s: number, o: any) => s + o.amount_cad, 0);
  const replay = m.stress.find((r: any) => r.key === "replay_2022");
  const problems: any[] = m.diagnosis?.problems || [];
  const notes = m.governance.filter((g: any) => g.status === "warn" && !/qualité des données/i.test(g.label)).slice(0, 2);
  const kyc = me?.profile?.kyc;
  const profileWhy = kyc?.gap_note || kyc?.capacity?.reasons?.[0];
  const showProfile = !!profileWhy && ((kind === "review" && problems.length > 0) || (kind === "buy_asset" && R?.verdict !== "suitable"));
  const band = me?.profile?.budget;

  return (
    <PageIn className="mx-auto max-w-2xl px-5 pb-44 pt-8" testid="proposal">
      <Link to="/decisions" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Décisions</Link>

      {/* 1. verdict */}
      <Glass className="mt-6 p-6 sm:p-8" glow>
        <p className="truncate text-sm text-ink-muted">« {m.request} »</p>
        <div className="mt-5 flex items-start gap-4">
          <VerdictMark tone={v.tone} />
          <h1 className="min-w-0 font-display text-[30px] font-semibold leading-[1.05] tracking-tightest text-ink sm:text-[40px]" data-testid="headline-short">{v.title}</h1>
        </div>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-soft" data-testid="headline">{m.headline}</p>

        {kind === "review" && B && A && band && (
          <div className="mt-7"><ZoneBar label="Part en actions et cryptos" min={band.growth_min} max={band.growth_max} before={B.growth_share} after={A.growth_share} /></div>
        )}
        {kind === "buy_asset" && R && <div className="mt-7"><RiskScale asset={sym(R.asset_id)} assetTier={R.tier} allowed={R.allowed_tier} vol={R.volatility} mdd={R.max_drawdown} /></div>}
        {kind === "invest" && buys > 0 && !sells && <div className="mt-7"><Split orders={m.orders} total={buys} /></div>}
      </Glass>

      {/* 2. what the agents found */}
      {kind === "review" && problems.length > 0 && (
        <Section title="Ce que les agents ont trouvé" testid="proposal-diagnosis">
          <Stagger as="div" className="grid gap-3 sm:grid-cols-2">
            {problems.map((p) => <ProblemTile key={p.rule_id} p={p} />)}
          </Stagger>
        </Section>
      )}
      {kind === "buy_asset" && R?.points?.length > 0 && (
        <Section title="Pourquoi">
          <Stagger className="space-y-2.5">
            {R.points.slice(1).concat(R.points.slice(0, 1)).slice(0, 4).map((p: any, i: number) => (
              <StaggerItem key={i} className="flex gap-3 text-[15px] leading-snug"><PointIcon tone={p.tone} /><span className="text-ink-soft">{p.text}</span></StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}

      {kind === "review" && problems.length === 0 && B?.checks?.length > 0 && (
        <Section title="Ce que les agents ont vérifié" testid="proposal-diagnosis">
          <Stagger as="div" className="grid gap-2.5 sm:grid-cols-2">
            {B.checks.filter((c: any) => c.status === "OK").map((c: any) => (
              <StaggerItem as="div" key={c.rule_id} className="flex items-center gap-3 rounded-[18px] bg-surface/80 p-3.5 hairline">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gain-50 text-gain-700"><Check className="h-4 w-4" strokeWidth={3} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{CHECK_FR[c.rule_id] || c.label}</span>
                  <span className="tabular-nums block truncate text-xs text-ink-muted">{c.measured} · limite {c.limit}</span></span>
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}
      {m.ideas?.length > 0 && (
        <Section title="Ce que vous pourriez essayer">
          <Stagger as="div" className="space-y-2.5">{m.ideas.map((x: any) => <IdeaCard key={x.kind} x={x} portfolioId={m.portfolio_id} />)}</Stagger>
        </Section>
      )}

      {/* 3. the plan */}
      {(m.orders.length > 0 || kind !== "review") && <Section title={kind === "buy_asset" && R?.verdict === "not_suitable" ? "À la place, je propose" : kind === "review" ? "Le plan pour corriger" : "Le plan"}
        aside={m.orders.length > 0 ? <span className="tabular-nums" data-testid="orders">{sells ? `${cad(sells)} déplacés` : cad(buys)}</span> : undefined}>
        {m.orders.length === 0 ? <p className="text-ink-muted">Rien à changer.</p> : (
          <>
            {sells > 0 && <p className="-mt-1 mb-4 text-sm text-ink-muted">Vous vendez {cad(sells)} et rachetez {cad(buys)} : le montant investi ne change pas.</p>}
            <Stagger as="div" className="space-y-2.5">{groups(m.orders).map((g) => <OrderGroup key={g.key} g={g} />)}</Stagger>
          </>
        )}
      </Section>}

      {/* 4. before / after */}
      {m.orders.length > 0 && A && (
        <Section title={B ? "Avant et après" : "Votre portefeuille après"}>
          <div className="space-y-5">
            {B && <Compare label="Part en actions" before={B.growth_share} after={A.growth_share} digits={0} />}
            <Compare label="Pire baisse passée" before={B?.max_drawdown} after={A.max_drawdown} digits={1} />
            {replay && <Compare label="Si 2022 se répétait" before={replay.before} after={replay.after} digits={1} />}
          </div>
          <p className="mt-4 text-xs text-ink-muted">Calculé sur les vrais prix des 5 dernières années. Le passé ne garantit pas l'avenir.</p>
        </Section>
      )}

      {/* 5. good to know + the profile behind the verdict */}
      {notes.length > 0 && (
        <Section title="À savoir">
          <ul className="space-y-2.5">{notes.map((g: any, i: number) => <li key={i} className="flex gap-3 text-[15px] leading-snug"><PointIcon tone="warn" /><span><span className="font-medium text-ink">{g.label}.</span> <span className="text-ink-muted">{g.detail}</span></span></li>)}</ul>
        </Section>
      )}
      {showProfile && (
        <div className="mt-8 rounded-[24px] bg-ink/[0.035] p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><UserRound className="h-4 w-4" /> Pourquoi « {m.profile_level.toLowerCase()} » ?</div>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{profileWhy}</p>
          <p className="mt-2 text-sm text-ink-muted">Si votre situation a changé, mettez votre profil à jour : les agents referont l'analyse.</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => nav("/profil")}>Revoir mon profil</Button>
        </div>
      )}

      {/* 6. everything else, folded */}
      <button onClick={() => setOpen(!open)} className="mt-10 flex w-full items-center justify-between border-y border-line py-4 text-left" data-testid="open-analysis">
        <span><span className="font-medium text-ink">Analyse complète des agents</span><span className="block text-sm text-ink-muted">Raisons, contrôles, scénarios, pour et contre, trace</span></span>
        <ChevronDown className={clsx("h-5 w-5 text-ink-muted transition", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={softSpring} className="overflow-hidden">
            <div className="pt-4">
              <Tabs value={tab} onChange={setTab} options={TABS} />
              <div className="mt-5">
                {tab === "why" && <Why m={m} metrics={m.metrics || {}} />}
                {tab === "checks" && <Checks m={m} />}
                {tab === "stress" && <Stress m={m} />}
                {tab === "debate" && <Debate m={m} metrics={m.metrics || {}} />}
                {tab === "trace" && <div><Pipeline steps={m.trace || []} /><p className="pb-3 text-xs text-ink-muted">Données au {date(m.data_as_of)} · {m.llm_usage.calls} appel(s) Amazon Bedrock</p></div>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* decision bar */}
      <div className="fixed inset-x-0 bottom-[84px] z-20 pl-4 pr-[84px] md:bottom-6 md:pr-4">
        {err && <div className="mx-auto mb-2 max-w-2xl"><ErrorBox error={err} /></div>}
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...softSpring, delay: 0.25 }}
          className="mx-auto flex max-w-2xl flex-nowrap items-center gap-0.5 rounded-[22px] glass hairline p-1.5 shadow-lift sm:gap-2 sm:p-2">
          
          {m.status === "proposed" ? (
            <>
              <Button size="lg" className="min-w-0 flex-1 sm:flex-none" onClick={() => decide("approve")} disabled={busy || !m.orders.length} data-testid="approve">
                Approuver<span className="hidden sm:inline">{sells ? " le plan" : buys ? ` ${cad(buys)}` : ""}</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => nav(`/?demande=${encodeURIComponent(m.request)}`)}>Modifier</Button>
              <Button variant="ghost" size="sm" onClick={() => decide("reject")} disabled={busy}>Refuser</Button>
            </>
          ) : m.status === "reviewed" ? (
            <>
              <span className="flex items-center gap-2 px-3 text-sm font-medium text-ink">
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gain-600"><Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /></motion.span>
                Tout est en ordre
              </span>
              <Button className="ml-auto" variant="secondary" onClick={() => nav("/")}>Accueil</Button>
            </>
          ) : m.status === "approved" ? (
            <>
              <span className="flex items-center gap-2 px-3 text-sm font-medium text-ink" data-testid="approved">
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="grid h-6 w-6 place-items-center rounded-full bg-gain-600"><Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /></motion.span>
                Approuvé · portefeuille simulé à jour
              </span>
              <Button className="ml-auto" variant="secondary" onClick={() => nav("/placements")}>Mes placements <ArrowRight className="h-4 w-4" /></Button>
            </>
          ) : (
            <><span className="px-3 text-sm text-ink-muted">Proposition refusée</span><Button className="ml-auto" variant="secondary" onClick={() => nav(`/?demande=${encodeURIComponent(m.request)}`)}>Reformuler</Button></>
          )}
        </motion.div>
      </div>
    </PageIn>
  );
}

const CHECK_FR: Record<string, string> = {
  "budget.growth_band": "Part en actions", "budget.single_issuer": "Une seule entreprise", "budget.single_sector": "Un seul secteur",
  "budget.theme_exposure": "Un seul thème", "budget.speculative": "Cryptoactifs", "budget.drawdown_review": "Pire baisse passée",
};
const IDEA_ICON: Record<string, LucideIcon> = { monthly: Repeat, growth_room: TrendingUp, near_limit: Gauge, concentration: PieChart, few: PieChart };

/** An optional idea when nothing needs fixing: what, why, and — when concrete — one tap to let the agents prepare it. */
function IdeaCard({ x, portfolioId }: { x: any; portfolioId?: string }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const I = IDEA_ICON[x.kind] || Info;
  return (
    <StaggerItem as="div" className="flex gap-4 rounded-[20px] bg-surface/80 p-4 hairline sm:p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-600"><I className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{x.title}</div>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{x.text}</p>
        {x.request && (
          <Button size="sm" variant="secondary" className="mt-3" disabled={busy}
            onClick={async () => { setBusy(true); try { await launchMandate(nav, x.request, portfolioId); } catch { setBusy(false); } }}>
            {busy ? "Les agents démarrent…" : "Essayer"} <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </StaggerItem>
  );
}

function Section({ title, aside, children, testid }: { title: string; aside?: React.ReactNode; children: React.ReactNode; testid?: string }) {
  return (
    <section className="mt-10" data-testid={testid}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">{title}</h2>
        {aside && <span className="text-sm text-ink-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function VerdictMark({ tone }: { tone: Tone }) {
  const [bg, I] = tone === "good" ? ["bg-gain-600", Check] : tone === "mid" ? ["bg-primary-500", Check] : ["bg-accent-600", X];
  return (
    <motion.span initial={{ scale: 0.3, rotate: -30, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ ...spring, delay: 0.1 }}
      className={clsx("mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full sm:h-12 sm:w-12", bg)}>
      <I className="h-6 w-6 text-white" strokeWidth={3} />
    </motion.span>
  );
}

function PointIcon({ tone }: { tone: string }) {
  const [c, I] = tone === "good" ? ["bg-gain-50 text-gain-700", Check] : tone === "bad" ? ["bg-accent-50 text-accent-700", X]
    : tone === "warn" ? ["bg-primary-50 text-primary-600", TriangleAlert] : ["bg-ink/[0.05] text-ink-soft", Info];
  return <span className={clsx("mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full", c)}><I className="h-3 w-3" strokeWidth={3} /></span>;
}

/** The profile's zone on a 0–100 % line; the marker slides from today to after the plan. */
function ZoneBar({ label, min, max, before, after }: { label: string; min: number; max: number; before: number; after: number }) {
  const at = (x: number) => `${Math.min(100, Math.max(0, x * 100))}%`;
  const inside = (x: number) => x >= min - 1e-6 && x <= max + 1e-6;
  const same = Math.abs(before - after) < 0.005;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-ink">{label}</span>
        {same ? <span className="tabular-nums font-semibold text-gain-700">{pct(after, 0)} · dans votre zone</span> : (
          <span className="tabular-nums text-ink-muted">
            <span className={inside(before) ? "text-ink" : "text-accent-700"}>{pct(before, 0)}</span>
            <ArrowRight className="mx-1.5 inline h-3.5 w-3.5" />
            <span className="font-semibold text-primary-600">{pct(after, 0)}</span>
          </span>
        )}
      </div>
      <div className="relative mt-3 h-10">
        <div className="absolute inset-x-0 top-4 h-2 rounded-full bg-ink/[0.06]" />
        <div className="absolute top-4 h-2 rounded-full bg-gain-600/25 ring-1 ring-gain-600/40" style={{ left: at(min), width: `${(max - min) * 100}%` }} />
        {!same && <div className="absolute top-0 h-10 w-px bg-accent-600/50" style={{ left: at(before) }}>
          <span className={clsx("tabular-nums absolute -top-0.5 whitespace-nowrap text-[11px] text-accent-700", before > 0.75 ? "right-1.5" : "left-1.5")}>aujourd'hui</span>
        </div>}
        <motion.div className={clsx("absolute top-2.5 h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-white shadow-glow", same ? "bg-gain-600" : "bg-primary-500")}
          initial={{ left: at(before) }} animate={{ left: at(after) }} transition={{ type: "spring", stiffness: 60, damping: 16, delay: 0.5 }} />
      </div>
      <div className="relative h-4 text-[11px] text-ink-muted">
        <span className="absolute left-0 hidden sm:inline">0 %</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap font-medium text-gain-700" style={{ left: at((min + max) / 2) }}>votre zone {pct(min, 0)}–{pct(max, 0)}</span>
        <span className="absolute right-0 hidden sm:inline">100 %</span>
      </div>
    </div>
  );
}

/** Three-step risk ladder: where the security sits, and how far the profile goes. */
function RiskScale({ asset, assetTier, allowed, vol, mdd }: { asset: string; assetTier: string; allowed: string; vol?: number; mdd?: number }) {
  const ai = TIER_I[assetTier] ?? 1, pi = TIER_I[allowed] ?? 1;
  const over = ai > pi;
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5">
        {["LOW", "MEDIUM", "HIGH"].map((t, i) => (
          <div key={t}>
            <div className="h-6 text-center">
              {i === ai && <motion.span initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring, delay: 0.35 }}
                className={clsx("inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-semibold text-white", over ? "bg-accent-600" : "bg-gain-600")}>{asset}</motion.span>}
            </div>
            <motion.div className={clsx("mt-1.5 h-2.5 rounded-full", i <= pi ? "bg-gain-600/70" : "bg-ink/[0.08]")}
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }} transition={{ ...softSpring, delay: 0.1 + i * 0.08 }} />
            <div className={clsx("mt-1.5 text-center text-xs", i === pi ? "font-semibold text-gain-700" : "text-ink-muted")}>{TIER[t]}{i === pi ? " · votre limite" : ""}</div>
          </div>
        ))}
      </div>
      {(vol != null || mdd != null) && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {vol != null && <Stat label="Variation typique par année" value={`± ${pct(vol, 0)}`} />}
          {mdd != null && <Stat label="Pire baisse en 5 ans" value={pct(mdd, 0)} bad={mdd < -0.25} />}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return <div className="rounded-2xl bg-ink/[0.035] px-4 py-3"><div className="text-xs text-ink-muted">{label}</div><div className={clsx("tabular-nums mt-0.5 font-display text-2xl font-semibold tracking-tight", bad ? "text-accent-700" : "text-ink")}>{value}</div></div>;
}

/** Stability vs growth of the money being invested. */
function Split({ orders, total }: { orders: any[]; total: number }) {
  const stable = orders.filter((o) => o.side === "buy" && o.sleeve === "Stabilité").reduce((s, o) => s + o.amount_cad, 0);
  const g = total - stable;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        <motion.div className="h-full rounded-l-full bg-primary-500" initial={{ width: 0 }} animate={{ width: `${(stable / total) * 100}%` }} transition={softSpring} />
        <motion.div className="h-full rounded-r-full bg-ink" initial={{ width: 0 }} animate={{ width: `${(g / total) * 100}%` }} transition={{ ...softSpring, delay: 0.08 }} />
      </div>
      <div className="tabular-nums mt-2.5 flex justify-between text-sm">
        <span className="text-ink"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary-500" />Stabilité · {cad(stable)}</span>
        <span className="text-ink">Croissance · {cad(g)}<span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-ink" /></span>
      </div>
    </div>
  );
}

/** One broken limit: the measure, its limit, and a bar with the limit marked. Tap for the plain-language detail. */
function ProblemTile({ p }: { p: any }) {
  const [open, setOpen] = useState(false);
  const tier = p.rule_id === "tier";
  const val = tier ? null : Math.abs(p.value ?? 0), lim = tier ? null : Math.abs(p.limit_value ?? 0);
  const scale = val != null && lim != null ? Math.max(val, lim) * 1.15 || 1 : 1;
  const shown = tier ? TIER[p.tiers?.[0]] : p.value != null ? pct(p.value, 1) : "—";
  const limitText = tier ? `permis : ${TIER[p.tiers?.[1]]?.toLowerCase()}` : p.limit_min != null ? `zone ${pct(p.limit_min, 0)}–${pct(p.limit_value, 0)}` : `max ${pct(p.limit_value, 0)}`;
  return (
    <StaggerItem as="div">
      <motion.button layout type="button" onClick={() => setOpen(!open)} whileTap={{ scale: 0.98 }}
        className="w-full rounded-[20px] bg-surface/80 p-4 text-left hairline transition-colors hover:bg-white">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate font-medium text-ink-soft">{p.short}{p.subject ? ` · ${p.subject}` : ""}</span>
          <ChevronDown className={clsx("h-4 w-4 shrink-0 text-ink-muted transition", open && "rotate-180")} />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="tabular-nums font-display text-[28px] font-semibold tracking-tight text-accent-700">{shown}</span>
          <span className="tabular-nums text-sm text-ink-muted">{limitText}</span>
        </div>
        {val != null && lim != null && (
          <div className="relative mt-2 h-1.5 rounded-full bg-ink/[0.06]">
            <motion.div className="absolute inset-y-0 left-0 rounded-full bg-accent-600" initial={{ width: 0 }} animate={{ width: `${(val / scale) * 100}%` }} transition={{ ...softSpring, delay: 0.2 }} />
            <div className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-ink" style={{ left: `${(lim / scale) * 100}%` }} title="Limite" />
          </div>
        )}
        <AnimatePresence initial={false}>
          {open && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden text-sm leading-relaxed text-ink-muted"><span className="block pt-3"><span className="font-medium text-ink">{p.title}.</span> {p.detail}</span></motion.p>}
        </AnimatePresence>
      </motion.button>
    </StaggerItem>
  );
}

type Group = { key: string; title: string; sub: string; side: "buy" | "sell"; orders: any[] };
/** Orders as three moves a person understands: sell entirely, trim, buy — or, for new money, by purpose. */
function groups(orders: any[]): Group[] {
  const sells = orders.filter((o) => o.side === "sell");
  const buys = orders.filter((o) => o.side === "buy");
  const n = (k: number, w: string) => `${k} ${w}${k > 1 ? "s" : ""}`;
  if (sells.length) {
    const all = sells.filter((o) => o.keep_cad != null && o.keep_cad < 1);
    const trim = sells.filter((o) => !(o.keep_cad != null && o.keep_cad < 1));
    return [
      { key: "all", title: "Vendre entièrement", sub: n(all.length, "placement"), side: "sell" as const, orders: all },
      { key: "trim", title: "Alléger", sub: `${n(trim.length, "placement")} · vous en gardez une partie`, side: "sell" as const, orders: trim },
      { key: "buy", title: "Acheter", sub: `${n(buys.length, "placement")} plus stable${buys.length > 1 ? "s" : ""}`, side: "buy" as const, orders: buys },
    ].filter((g) => g.orders.length);
  }
  const by: Record<string, any[]> = {};
  buys.forEach((o) => { (by[o.sleeve || "Achats"] ||= []).push(o); });
  const order = ["Votre demande", "Stabilité", "Croissance"];
  return Object.keys(by).sort((a, b) => (order.indexOf(a) + 9) % 12 - (order.indexOf(b) + 9) % 12).map((k) => ({
    key: k, side: "buy" as const, orders: by[k],
    title: k === "Stabilité" ? "Pour la stabilité" : k === "Croissance" ? "Pour la croissance" : k,
    sub: k === "Stabilité" ? "Obligations : bougent peu" : k === "Croissance" ? "Fonds indiciels diversifiés" : n(by[k].length, "placement"),
  }));
}

function OrderGroup({ g }: { g: Group }) {
  const [open, setOpen] = useState(false);
  const total = g.orders.reduce((s, o) => s + o.amount_cad, 0);
  const sorted = useMemo(() => [...g.orders].sort((a, b) => b.amount_cad - a.amount_cad), [g.orders]);
  const common = useMemo(() => {  // the reason most rows share is said once, not repeated on every line
    const c: Record<string, number> = {};
    g.orders.forEach((o) => { const w = cleanWhy(o.why); c[w] = (c[w] || 0) + 1; });
    const [w, n] = Object.entries(c).sort((x, y) => y[1] - x[1])[0] || ["", 0];
    return n >= 2 ? w : "";
  }, [g.orders]);
  return (
    <StaggerItem as="div" className="overflow-hidden rounded-[20px] bg-surface/80 hairline">
      <motion.button type="button" whileTap={{ scale: 0.99 }} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-4 text-left sm:gap-4">
        <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-full", g.side === "sell" ? "bg-ink/[0.06] text-ink" : "bg-primary-50 text-primary-600")}>
          {g.side === "sell" ? <Minus className="h-4 w-4" strokeWidth={2.5} /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{g.title}</span>
          <span className="block truncate text-sm text-ink-muted">{g.sub}</span>
        </span>
        <span className="hidden -space-x-2 sm:flex">
          {sorted.slice(0, 4).map((o) => <span key={o.asset_id} className="rounded-full ring-2 ring-surface"><TickerLogo id={o.asset_id} size={26} /></span>)}
          {sorted.length > 4 && <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-ink/[0.06] text-[10px] font-semibold text-ink-soft ring-2 ring-surface">+{sorted.length - 4}</span>}
        </span>
        <span className="tabular-nums shrink-0 text-[15px] font-semibold text-ink">{g.side === "sell" ? "−" : "+"}{cad(total)}</span>
        <ChevronDown className={clsx("h-4 w-4 shrink-0 text-ink-muted transition", open && "rotate-180")} />
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={softSpring} className="overflow-hidden border-t border-line">
            {common && <li className="px-4 pt-3 text-sm text-ink-soft">{common}</li>}
            {sorted.map((o) => (
              <li key={o.side + o.asset_id} className="flex items-start gap-3 px-4 py-3">
                <TickerLogo id={o.asset_id} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[15px] text-ink">{friendly(o.asset_id, o.label)}</span>
                    <span className="tabular-nums shrink-0 text-[15px] font-medium text-ink">{o.side === "sell" ? "−" : "+"}{cad(o.amount_cad)}</span>
                  </div>
                  {o.side === "sell" && o.held_cad != null && <div className="tabular-nums text-xs text-ink-muted">{cad(o.held_cad)} <ArrowRight className="inline h-3 w-3" /> {cad(o.keep_cad)}</div>}
                  {cleanWhy(o.why) !== common && <p className="mt-0.5 text-xs leading-snug text-ink-muted">{cleanWhy(o.why)}</p>}
                </div>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </StaggerItem>
  );
}

const cleanWhy = (w: string) => (w || "").replace(/^(Avec le produit des ventes|À la place du montant refusé)\s*:\s*/, "").replace(/\s*\(complète ce qui manque dans votre portefeuille\)/, "");

/** Before (grey) vs after (cobalt), same scale; for losses, a shorter bar is better. */
function Compare({ label, before, after, digits }: { label: string; before?: number | null; after?: number | null; digits: number }) {
  if (after == null) return null;
  const max = Math.max(Math.abs(before ?? 0), Math.abs(after), 1e-6);
  const Row = ({ v, now, tone }: { v: number; now: string; tone: string }) => (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs text-ink-muted">{now}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.04]">
        <motion.div className={clsx("h-full rounded-full", tone)} initial={{ width: 0 }} animate={{ width: `${(Math.abs(v) / max) * 100}%` }} transition={{ ...softSpring, delay: 0.3 }} />
      </div>
      <span className={clsx("tabular-nums w-16 shrink-0 text-right text-sm", now === "Après" ? "font-semibold text-ink" : "text-ink-muted")}>{pct(v, digits)}</span>
    </div>
  );
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-ink">{label}</div>
      <div className="space-y-1.5">
        {before != null && <Row v={before} now="Avant" tone="bg-ink/25" />}
        <Row v={after} now="Après" tone="bg-primary-500" />
      </div>
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
  const label: Record<string, [string, string]> = { ok: ["Respecté", "text-gain-700"], adjusted: ["Ajusté", "text-gold-600"], blocked: ["Bloqué", "text-accent-700"], breach: ["Dépassé", "text-accent-700"], warn: ["Attention", "text-gold-600"] };
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
              <td className={clsx("tabular whitespace-nowrap py-3 text-right font-semibold", (r.after ?? 0) < 0 ? "text-accent-700" : "text-gain-700")}>{pct(r.after)}</td>
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
                    {c.accepted === false ? <X className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-gain-600" />}
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
    <PageIn className="mx-auto max-w-3xl px-5 pb-16 pt-10">
      <div className="flex items-end justify-between gap-4">
        <h1 className="font-display text-[40px] font-semibold leading-none tracking-tightest text-ink">Décisions</h1>
        <Link to="/"><Button variant="gold">Nouvelle décision</Button></Link>
      </div>
      {loading && !data && <Spinner />}
      {data && !list.length && <div className="mt-8 border-t border-line py-12 text-center text-sm text-ink-muted">Aucune décision pour l'instant.</div>}
      {list.length > 0 && (
        <Stagger className="mt-8 divide-y divide-line border-t border-line">
          {list.map((m) => (
            <StaggerItem key={m.mandate_id}>
              <Link to={`/mandats/${m.mandate_id}`} className="flex items-center gap-4 py-4 transition-opacity hover:opacity-70">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{m.request}</div>
                  <div className="truncate text-sm text-ink-muted">{m.headline}</div>
                </div>
                <div className="text-right">
                  <div className={clsx("text-xs font-semibold", m.status === "approved" || m.status === "reviewed" ? "text-gain-700" : m.status === "rejected" ? "text-ink-muted" : "text-primary-600")}>{m.status === "approved" ? "Approuvée" : m.status === "rejected" ? "Refusée" : m.status === "reviewed" ? "Analysée" : "En attente"}</div>
                  <div className="text-xs text-ink-muted">{date(m.created_at)}</div>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </PageIn>
  );
}
