import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Calculator, Check, ChevronDown, ExternalLink, Gauge, Info, LucideIcon, Minus, PenLine, Plus,
  ScanSearch, Scale, Send, ShieldCheck, SlidersHorizontal, TriangleAlert, UserRound, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Glass, PageIn, softSpring, spring, Stagger, StaggerItem, Tabs } from "../components/motion";
import { sym, TickerLogo } from "../components/Ticker";
import HowItWorks from "../components/HowItWorks";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useApp, useProfilePath } from "../hooks/useApp";
import { friendly } from "../lib/assets";
import { cad, date, pct } from "../lib/format";
import { describe, REVIEW, requestOf, useLaunch } from "../lib/launch";
import { clauseShort, levelLabel, NIVEAU, Niveau, Preuve, Signal, StatutClause, vous } from "../lib/ulysse";
import { api, ApiError } from "../services/api";

// ================================================================================================ live run
/** One short sentence per agent step, in the client's words (steps of the ULYSSE orchestrator). */
const STEP_UI: Record<string, [string, LucideIcon]> = {
  contexte: ["Lecture de votre profil", UserRound],
  planification: ["Choix des analyses utiles", ScanSearch],
  outils: ["Calcul des chiffres et lecture des sources", Calculator],
  gouvernance: ["Vérification de vos règles", ShieldCheck],
  signal: ["Décision du niveau du signal", Gauge],
  debat: ["Le pour et le contre", Scale],
  redaction: ["Rédaction de la réponse", PenLine],
  verification: ["Vérification de chaque chiffre", BadgeCheck],
  publication: ["Publication du dossier", Send],
};
const STEP_MIN_MS = 650; // each sentence stays long enough to be read, even when a step is instant
const STALL_MS = 150_000;

type Etape = { etape: string; statut: string; details?: any; preuves?: string[]; duree_ms?: number };

/** The agents at work: one animated mark and one sentence at a time, then straight to the answer. */
export function MandateRun() {
  const { jobId = "" } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const launch = useLaunch();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [shown, setShown] = useState(0);
  const [stalled, setStalled] = useState(false);
  const sig = (d?.etapes || []).map((s: Etape) => s.statut).join(",");
  useEffect(() => {  // a worker that dies (restart, timeout) never reports: no step change for 2,5 min = interrupted
    if (!d || d.etat !== "en_cours") return;
    setStalled(false);
    const t = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(t);
  }, [sig, d?.etat]); // eslint-disable-line
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        for (;;) {
          const x = await api.get<any>(`/dossiers/${encodeURIComponent(jobId)}`);
          if (!alive) return;
          setD(x);
          if (x.etat !== "en_cours") return;
          await new Promise((r) => setTimeout(r, 600));
        }
      } catch (e) { if (alive) setError(e as ApiError); }
    })();
    return () => { alive = false; };
  }, [jobId]);

  const steps: Etape[] = d?.etapes || [];
  const firstOpen = steps.findIndex((s) => s.statut === "a_faire" || s.statut === "en_cours");
  const reached = d?.etat === "termine" ? steps.length : firstOpen < 0 ? steps.length : firstOpen;
  useEffect(() => {
    if (shown >= reached) return;
    // Once the answer is ready, the remaining sentences go by quickly: the person is not kept waiting for the animation.
    const t = setTimeout(() => setShown((v) => v + 1), d?.etat === "termine" ? 220 : STEP_MIN_MS);
    return () => clearTimeout(t);
  }, [shown, reached, d?.etat]);
  const failed = d?.etat === "echec" || !!error || stalled;
  const [relaunching, setRelaunching] = useState(false);
  const ready = d?.etat === "termine" && steps.length > 0 && shown >= steps.length;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => nav(`/mandats/${jobId}`, { replace: true }), 750);
    return () => clearTimeout(t);
  }, [ready]); // eslint-disable-line

  const q = params.get("q") || "";
  const cur = steps[Math.min(shown, Math.max(0, steps.length - 1))];
  const [phrase, Icon] = ready ? ["C'est prêt", Check] as [string, LucideIcon] : failed ? ["Analyse interrompue", X] as [string, LucideIcon]
    : cur ? STEP_UI[cur.etape] || [cur.etape, Calculator] : ["Les agents se préparent", ScanSearch] as [string, LucideIcon];
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
          <p className="text-sm text-ink-soft">{stalled ? "Les agents ne répondent plus. Relancez l'analyse : elle reprend depuis le début." : d?.erreur || error?.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button disabled={relaunching} onClick={async () => { setRelaunching(true); try { await launch(q || describe(d?.intention), d?.intention); } catch { setRelaunching(false); } }}>{relaunching ? "Relance…" : "Relancer"}</Button>
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

/** What did the work in each step: deterministic Python, a language model, or both (agents are not decoration). */
const ENGINE: Record<string, "calcul" | "ia" | "mixte"> = {
  contexte: "calcul", planification: "mixte", outils: "calcul", gouvernance: "calcul", signal: "calcul", debat: "mixte", redaction: "ia", verification: "calcul", publication: "calcul",
};
const ENGINE_FR: Record<string, string> = { calcul: "Calcul Python", ia: "IA (Bedrock)", mixte: "Calcul + IA" };
const ENGINE_TIP: Record<string, string> = {
  calcul: "Règles et formules testées, sans modèle de langage",
  ia: "Un modèle de langage rédige ; chaque chiffre cité est vérifié contre les calculs, sinon un gabarit écrit en code prend le relais",
  mixte: "Un modèle de langage propose ; le code valide chaque choix et chaque phrase",
};
const AGENT: Record<string, [string, string]> = {
  contexte: ["Agent Contexte", "profil, règles et données à la date simulée"], planification: ["Agent Planificateur", "choisit les analyses utiles"],
  outils: ["Outils d'analyse", "calculs et sources officielles"], gouvernance: ["Agent Gouvernance", "chaque règle et ses contradictions"],
  signal: ["Politique de signal", "niveau décidé par des règles écrites"], debat: ["Agents Opportunités et Risques", "le pour et le contre"],
  redaction: ["Agent Explication", "rédige à partir des seules preuves"], verification: ["Vérificateur", "chaque chiffre de chaque phrase"],
  publication: ["Publication", "dossier vérifié, inscrit au journal"],
};

function stepDetail(e: Etape): string | null {
  const det = e.details ?? {};
  if (e.etape === "contexte" && det.contrat_version) return `Règles version ${det.contrat_version}, données jusqu'au ${date(det.donnees_jusqu_au)}`;
  if (e.etape === "planification" && det.modules_de_base) return `${det.modules_de_base.length + (det.modules_ajoutes?.length ?? 0)} analyses retenues (planifié par ${det.planifie_par === "repli_code" ? "le code" : det.planifie_par})`;
  if (e.etape === "outils" && det.appels) return det.appels.map((a: any) => `${a.libelle}${a.statut === "echec" ? " ✕" : ""}`).join(" · ");
  if (e.etape === "gouvernance" && det.statuts) return `${det.statuts.length} règles évaluées${det.conflits?.length ? `, ${det.conflits.length} contradiction(s)` : ""}`;
  if (e.etape === "signal" && det.niveau) return `${NIVEAU[det.niveau as Niveau]?.label ?? det.niveau} (règles ${(det.regles || []).join(", ")})`;
  if (e.etape === "debat" && det.pour) return `${det.pour.phrases} phrase(s) pour, ${det.contre?.phrases ?? 0} contre`;
  if (e.etape === "redaction" && det.redige_par) return det.redige_par === "gabarit" ? "Gabarit écrit en code" : `Rédigé par ${det.redige_par}`;
  if (e.etape === "verification" && det.essais?.length) return `${det.essais.length} essai(s)${det.repli ? ", repli sur le gabarit" : ""}`;
  if (e.etape === "publication" && det.preuves != null) return `${det.preuves} preuves liées`;
  return null;
}

/** Full step list with durations: shown in the « Trace des agents » tab. */
export function Pipeline({ steps }: { steps: Etape[] }) {
  if (!steps.length) return <Spinner label="Démarrage des agents…" />;
  return (
    <ol>
      {steps.map((s) => {
        const [agent, task] = AGENT[s.etape] || [s.etape, ""];
        const engine = ENGINE[s.etape];
        const ok = s.statut === "termine";
        const bad = s.statut === "echec" || s.statut === "rejet";
        const detail = stepDetail(s);
        return (
          <li key={s.etape} className="flex gap-3.5 py-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center">
              {ok ? <span className="grid h-5 w-5 place-items-center rounded-full bg-ink"><Check className="h-3 w-3 text-white" strokeWidth={3} /></span>
                : bad ? <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-50"><X className="h-3 w-3 text-accent-700" strokeWidth={3} /></span>
                  : <span className="grid h-5 w-5 place-items-center rounded-full bg-ink/[0.05]"><Minus className="h-3 w-3 text-ink-muted" strokeWidth={3} /></span>}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm text-ink"><span className="font-semibold">{agent}</span>{task ? <span className="text-ink-muted"> · {task}</span> : null}
                  {engine && <span className="ml-2 rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11px] font-medium text-ink-muted" title={ENGINE_TIP[engine]}>{ENGINE_FR[engine]}</span>}</span>
                {(s.duree_ms ?? 0) > 0 && <span className="tabular-nums text-[11px] text-ink-muted">{s.duree_ms! >= 1000 ? `${(s.duree_ms! / 1000).toFixed(1).replace(".", ",")} s` : `${Math.round(s.duree_ms!)} ms`}</span>}
              </div>
              {detail && <p className="mt-0.5 text-sm leading-snug text-ink-muted">{detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ================================================================================================ the answer
type Tab = "why" | "checks" | "stress" | "debate" | "trace";
const TABS: [Tab, string][] = [["why", "Pourquoi"], ["checks", "Contrôles"], ["stress", "Scénarios"], ["debate", "Pour et contre"], ["trace", "Trace des agents"]];
type Tone = "good" | "mid" | "bad";
const TONE: Record<Niveau, Tone> = { ok: "good", attention: "mid", pause: "bad", aucun: "good" };

/** The answer in a few words, and how it looks (green yes, cobalt « yes, but », red no). */
function verdict(d: any): { title: string; tone: Tone } {
  const it = d.intention || {};
  const s: Signal = d.signal;
  const tone = TONE[s.niveau] || "mid";
  if (it.type === "ordre" || it.type === "titre") {
    const n = sym(it.ticker);
    return { title: s.niveau === "ok" ? `${n} : compatible avec vos règles` : s.niveau === "attention" ? `${n} : possible, mais à regarder` : `${n} : hors de vos règles`, tone };
  }
  const over = s.clauses.filter((c) => c.statut === "depassee").length;
  if (s.niveau === "ok" || !over) return { title: s.niveau === "ok" ? "Votre portefeuille respecte vos règles" : "Une règle à surveiller", tone: s.niveau === "ok" ? "good" : "mid" };
  return { title: `${over} règle${over > 1 ? "s" : ""} dépassée${over > 1 ? "s" : ""}`, tone: "bad" };
}

/** One plain sentence under the verdict, built from the engine's measured statuses (no number is invented). */
function headline(d: any, total: number | null): string {
  const it = d.intention || {};
  const s: Signal = d.signal;
  const caused = s.clauses.filter((c) => c.statut === "depassee" && c.cause_par_intention);
  const before = s.clauses.filter((c) => c.statut === "depassee" && !c.cause_par_intention);
  const share = total && it.montant_cad ? ` (${pct(it.montant_cad / total, 1)} de votre portefeuille)` : "";
  if (it.type === "ordre") {
    const head = `Un achat simulé de ${cad(it.montant_cad)} de ${sym(it.ticker)}${share}`;
    if (!caused.length && !before.length) return `${head} respecterait toutes vos règles évaluées.`;
    if (!caused.length) return `${head} ne dépasserait aucune nouvelle règle, mais ${before.length} de vos règles ${before.length > 1 ? "sont" : "est"} déjà dépassée${before.length > 1 ? "s" : ""} par votre portefeuille.`;
    return `${head} dépasserait ${caused.length > 1 ? `${caused.length} de vos règles` : "une de vos règles"} : ${caused.slice(0, 2).map((c) => clauseShort(c).toLowerCase()).join(", ")}.`;
  }
  if (it.type === "titre") {
    return `Pour une position de référence (5 % de votre portefeuille), ${s.niveau === "ok" ? "toutes vos règles évaluées seraient respectées" : `${caused.length || before.length} de vos règles ser${(caused.length || before.length) > 1 ? "aient" : "ait"} en jeu`}. Choisissez un montant pour une vérification précise.`;
  }
  const over = s.clauses.filter((c) => c.statut === "depassee");
  if (!over.length) return "Les agents ont vérifié chacune de vos règles sur vos placements actuels : aucune n'est dépassée.";
  return `Vos placements actuels dépassent ${over.length > 1 ? `${over.length} de vos règles` : "une de vos règles"}. Le détail ci-dessous dit de combien, et pourquoi.`;
}

type Decision = { choix: string; execute: boolean; a: string } | null;

/** The decision first, as pictures: verdict → what the agents found → the plan → what it changes. Full analysis folded below. */
export function MandateResult() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const launch = useLaunch();
  const { me, reload, asOf } = useApp();
  const path = useProfilePath();
  const { data: d, error, loading, reload: refetch } = useApi<any>(`/dossiers/${encodeURIComponent(id)}`, [id]);
  const journal = useApi<{ entrees: any[] }>(path("/journal", { as_of: null }), [id]);
  const pos = useApi<any>(path("/positions"));
  const [local, setLocal] = useState<Decision>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("why");
  useEffect(() => { if (d?.etat === "en_cours") nav(`/mandats/en-cours/${id}`, { replace: true }); }, [d?.etat]); // eslint-disable-line
  const decision: Decision = local || (journal.data?.entrees || []).find((e) => e.type === "decision" && e.dossier === id) || null;
  const preuves: Record<string, Preuve> = useMemo(() => d?.preuves || {}, [d]);
  const byMesure = useMemo(() => {
    const out: Record<string, Preuve> = {};
    for (const p of Object.values(preuves)) if (!out[p.mesure] || p.sujet === d?.intention?.ticker) out[p.mesure] = p;
    return out;
  }, [preuves, d]);

  const decide = async (choix: "confirmer" | "continuer" | "renoncer") => {
    const it = d.intention;
    setBusy(true); setErr(null);
    try {
      const r = await api.post<any>("/ordres/decision", { profil: d.profil_id, ticker: it.ticker, montant_cad: it.montant_cad, as_of: d.as_of, choix,
        niveau: d.signal.niveau, ordre_id: `${id}-achat`, dossier: id });
      setLocal({ choix, execute: !!r.execute, a: new Date().toISOString() });
      if (r.execute) await reload();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  if (loading && !d) return <div className="mx-auto max-w-2xl px-5 py-10"><Spinner /></div>;
  if (error) return <div className="mx-auto max-w-2xl px-5 py-10"><ErrorBox error={error} onRetry={refetch} /></div>;
  if (!d || d.etat === "en_cours") return null;
  if (d.etat === "echec") return <div className="mx-auto max-w-2xl px-5 py-10"><ErrorBox error={new Error(`Le dossier n'a pas pu être produit : ${d.erreur}`)} /></div>;

  const it = d.intention || {};
  const kind: "ordre" | "titre" | "portefeuille" = it.type === "ordre" ? "ordre" : it.type === "titre" ? "titre" : "portefeuille";
  const s: Signal = d.signal;
  const v = verdict(d);
  const total = pos.data?.total_cad ?? null;
  const request = requestOf(id, it);
  const problems = s.clauses.filter((c) => c.statut === "depassee" || c.statut === "approchee");
  const smaller = s.options.find((o) => o.code === "position_plus_petite" && (o.details?.montant_max_cad ?? 0) > 0);
  const viaFund = s.options.filter((o) => o.code === "meme_exposition_via_fnb");
  const notes = [...(d.gouvernance?.conflits || []).map((c: any) => vous(c.message)), ...(d.gouvernance?.informations_manquantes || []).map((m: any) => vous(m.message))].slice(0, 3);
  const hype = byMesure["engouement"];
  const kyc = me?.profile?.kyc;
  const profileWhy = kyc?.ecart || kyc?.capacite?.raisons?.[0];
  const showProfile = !!profileWhy && v.tone === "bad";
  const actions = s.clauses.find((c) => c.type === "actions_max");
  const decided = decision?.choix;

  return (
    <PageIn className="mx-auto max-w-2xl px-5 pb-44 pt-8" testid="proposal">
      <div className="flex items-center justify-between gap-3">
        <Link to="/decisions" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Décisions</Link>
        <HowItWorks topic="proposal" />
      </div>

      {/* 1. verdict */}
      <Glass className="mt-6 p-6 sm:p-8" glow>
        <p className="truncate text-sm text-ink-muted">« {request} »</p>
        <div className="mt-5 flex items-start gap-4">
          <VerdictMark tone={v.tone} />
          <h1 className="min-w-0 font-display text-[30px] font-semibold leading-[1.05] tracking-tightest text-ink sm:text-[40px]" data-testid="headline-short">{v.title}</h1>
        </div>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-soft" data-testid="headline">{headline(d, total)}</p>
        {d.as_of !== asOf && <p className="mt-3 flex gap-2.5 rounded-2xl bg-ink/[0.04] px-3.5 py-2.5 text-sm text-ink-soft"><Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />Analyse faite à la date simulée du {date(d.as_of)}.</p>}

        {kind === "portefeuille" && actions?.valeur_apres != null && actions.limite != null && (
          <div className="mt-7"><ZoneBar label="Part en actions (FNB compris)" max={actions.limite / 100} before={(actions.valeur_avant ?? actions.valeur_apres) / 100} after={actions.valeur_apres / 100} /></div>
        )}
        {kind !== "portefeuille" && (
          <div className="mt-7"><SignalScale asset={sym(it.ticker)} niveau={s.niveau}
            vol={byMesure["volatilite_annualisee"]?.statut === "ok" ? Number(byMesure["volatilite_annualisee"].valeur) / 100 : undefined}
            mdd={byMesure["pire_baisse"]?.statut === "ok" ? Number(byMesure["pire_baisse"].valeur?.baisse_pct) / 100 : undefined} /></div>
        )}
      </Glass>

      {/* 2. what the agents found */}
      {kind === "portefeuille" && problems.length > 0 && (
        <Section title="Ce que les agents ont trouvé" testid="proposal-diagnosis">
          <Stagger as="div" className="grid gap-3 sm:grid-cols-2">
            {problems.map((c) => <ProblemTile key={c.clause_id} c={c} />)}
          </Stagger>
        </Section>
      )}
      {kind !== "portefeuille" && (
        <Section title="Pourquoi">
          <Stagger className="space-y-2.5">
            {orderPoints(s, hype).map((p, i) => (
              <StaggerItem key={i} className="flex gap-3 text-[15px] leading-snug"><PointIcon tone={p.tone} /><span className="text-ink-soft">{p.text}</span></StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}
      {kind === "portefeuille" && problems.length === 0 && (
        <Section title="Ce que les agents ont vérifié" testid="proposal-diagnosis">
          <Stagger as="div" className="grid gap-2.5 sm:grid-cols-2">
            {s.clauses.filter((c) => c.statut === "respectee").map((c) => (
              <StaggerItem as="div" key={c.clause_id} className="flex items-center gap-3 rounded-[18px] bg-surface/80 p-3.5 hairline">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gain-50 text-gain-700"><Check className="h-4 w-4" strokeWidth={3} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{clauseShort(c)}</span>
                  <span className="tabular-nums block truncate text-xs text-ink-muted">{measured(c)}</span></span>
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}

      {/* 3. the plan */}
      {kind === "ordre" && (
        <Section title="Le plan" aside={<span className="tabular-nums" data-testid="orders">{cad(it.montant_cad)}</span>}>
          <div className="overflow-hidden rounded-[20px] bg-surface/80 hairline">
            <div className="flex w-full items-center gap-3 p-4 sm:gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-600"><Plus className="h-4 w-4" strokeWidth={2.5} /></span>
              <span className="min-w-0 flex-1"><span className="block font-medium text-ink">Acheter</span><span className="block truncate text-sm text-ink-muted">{friendly(it.ticker)} · au cours de clôture du {date(byMesure["prix_cloture"]?.date_de_calcul || d.as_of)}</span></span>
              <span className="rounded-full ring-2 ring-surface"><TickerLogo id={it.ticker} size={26} /></span>
              <span className="tabular-nums shrink-0 text-[15px] font-semibold text-ink">+{cad(it.montant_cad)}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-muted">Payé avec votre solde fictif ({cad(me?.cash)} disponibles). Rien n'est acheté sans votre accord.</p>
        </Section>
      )}
      {(smaller || viaFund.length > 0 || (kind === "portefeuille" && problems.length > 0)) && (
        <Section title="Ce que vous pourriez essayer">
          <Stagger as="div" className="space-y-2.5">
            {smaller && kind === "ordre" && (
              <IdeaCard icon={SlidersHorizontal} title={`Un montant plus petit : jusqu'à ${cad(smaller.details.montant_max_cad)}`}
                text={`Selon vos règles, une position d'au plus ${cad(smaller.details.montant_max_cad)} (${pct((smaller.details.pct_du_portefeuille ?? 0) / 100, 1)} du portefeuille) ne créerait aucun dépassement chiffré.`}
                cta={`Analyser ${cad(smaller.details.montant_max_cad)}`} onClick={() => launch(`Je veux ${cad(smaller.details.montant_max_cad)} de ${sym(it.ticker)}`, { type: "ordre", ticker: it.ticker, montant_cad: smaller.details.montant_max_cad })} />
            )}
            {viaFund.map((o) => (
              <IdeaCard key={o.details.fonds} icon={Scale} title={`La même exposition via ${sym(o.details.fonds)}`} text={o.libelle}
                cta={`Voir ${sym(o.details.fonds)}`} onClick={async () => nav(`/placement/${encodeURIComponent(o.details.fonds)}`)} />
            ))}
            {kind === "portefeuille" && problems.length > 0 && (
              <>
                <IdeaCard icon={SlidersHorizontal} title="Ajuster vos placements" text="Vendez une partie d'un placement trop lourd, ou entrez vos placements réels : les agents revérifieront tout de suite."
                  cta="Mes placements" onClick={async () => nav("/placements")} />
                <IdeaCard icon={ShieldCheck} title="Revoir une règle" text="Une règle ne vous ressemble plus ? Changez-la : l'effet est montré avant d'enregistrer, et le changement est daté."
                  cta="Mes règles" onClick={async () => nav("/profil")} />
              </>
            )}
          </Stagger>
        </Section>
      )}

      {/* 4. what the decision changes */}
      {kind === "ordre" && <Impact clauses={s.clauses} />}

      {/* 5. good to know + the profile behind the verdict */}
      {(notes.length > 0 || hype?.valeur?.engouement) && (
        <Section title="À savoir">
          <ul className="space-y-2.5">
            {kind === "portefeuille" && hype?.valeur?.engouement && <li className="flex gap-3 text-[15px] leading-snug"><PointIcon tone="warn" /><span className="text-ink-muted">Attention inhabituelle sur un titre : une description du présent, pas une raison d'agir.</span></li>}
            {notes.map((g: string, i: number) => <li key={i} className="flex gap-3 text-[15px] leading-snug"><PointIcon tone="warn" /><span className="text-ink-muted">{g}</span></li>)}
          </ul>
        </Section>
      )}
      {showProfile && (
        <div className="mt-8 rounded-[24px] bg-ink/[0.035] p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><UserRound className="h-4 w-4" /> Pourquoi « {levelLabel(me?.profile?.tolerance).toLowerCase()} » ?</div>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{profileWhy?.replace(/\s*→\s*(au plus )?« [^»]+ »/, "").replace("Tu es prêt", "Vous êtes prêt").replace("ta situation", "votre situation")}</p>
          <p className="mt-2 text-sm text-ink-muted">Si votre situation a changé, mettez votre profil à jour : vos règles seront recalculées.</p>
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
                {tab === "why" && <Why d={d} preuves={preuves} />}
                {tab === "checks" && <Checks d={d} />}
                {tab === "stress" && <Stress preuves={preuves} />}
                {tab === "debate" && <Debate d={d} preuves={preuves} />}
                {tab === "trace" && <div><Pipeline steps={d.etapes || []} /><p className="pb-3 text-xs text-ink-muted">Données au {date(d.etapes?.[0]?.details?.donnees_jusqu_au || d.as_of)} · durée totale {((d.duree_totale_ms || 0) / 1000).toFixed(1).replace(".", ",")} s · {(d.usage_llm || []).length} appel(s) au modèle de langage{d.cout_estime_usd > 0 ? ` · ≈ ${d.cout_estime_usd.toFixed(4).replace(".", ",")} $ US` : ""}</p></div>}
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
          {kind === "ordre" && !decided ? (
            <>
              <Button size="lg" className="min-w-0 flex-1 sm:flex-none" onClick={() => decide(s.niveau === "pause" ? "continuer" : "confirmer")} disabled={busy} data-testid="approve">
                {s.niveau === "pause" ? <>Continuer quand même<span className="hidden sm:inline"> · {cad(it.montant_cad)}</span></> : <>Approuver<span className="hidden sm:inline"> {cad(it.montant_cad)}</span></>}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => nav(`/placement/${encodeURIComponent(it.ticker)}`)}>Modifier</Button>
              <Button variant="ghost" size="sm" onClick={() => decide("renoncer")} disabled={busy} data-testid="reject">Refuser</Button>
            </>
          ) : kind === "ordre" && decision?.execute ? (
            <>
              <span className="flex items-center gap-2 px-3 text-sm font-medium text-ink" data-testid="approved">
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gain-600"><Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /></motion.span>
                Approuvé · portefeuille simulé à jour
              </span>
              <Button className="ml-auto" variant="secondary" onClick={() => nav("/placements")}>Mes placements <ArrowRight className="h-4 w-4" /></Button>
            </>
          ) : kind === "ordre" ? (
            <><span className="px-3 text-sm text-ink-muted">Proposition refusée · rien n'a changé</span><Button className="ml-auto" variant="secondary" onClick={() => nav(`/?demande=${encodeURIComponent(request)}`)}>Reformuler</Button></>
          ) : (
            <>
              <span className="flex items-center gap-2 px-3 text-sm font-medium text-ink">
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className={clsx("grid h-6 w-6 shrink-0 place-items-center rounded-full", v.tone === "good" ? "bg-gain-600" : "bg-primary-500")}>{v.tone === "good" ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : <Info className="h-3.5 w-3.5 text-white" strokeWidth={3} />}</motion.span>
                {kind === "titre" ? "Analyse terminée" : v.tone === "good" ? "Tout est en ordre" : "Analyse terminée"}
              </span>
              {kind === "titre"
                ? <Button className="ml-auto" variant="secondary" onClick={() => nav(`/placement/${encodeURIComponent(it.ticker)}`)}>Choisir un montant <ArrowRight className="h-4 w-4" /></Button>
                : <Button className="ml-auto" variant="secondary" onClick={() => nav("/")}>Accueil</Button>}
            </>
          )}
        </motion.div>
      </div>
    </PageIn>
  );
}

/** « 54,8 % · limite 50 % », from a clause status (the engine's values are in percent). */
function measured(c: StatutClause): string {
  const val = c.valeur_apres ?? c.valeur_avant;
  if (val == null || c.limite == null) return c.statut === "donnees_insuffisantes" ? "données insuffisantes" : "";
  const unit = c.unite === "%" ? " %" : ` ${c.unite}`;
  const f = (x: number) => `${x.toLocaleString("fr-CA", { maximumFractionDigits: 1 })}${unit}`;
  return `${f(val)} · ${c.type === "liquidites_min" ? "minimum" : "limite"} ${f(c.limite)}`;
}

/** At most 3 broken rules caused by this idea, then what was already exceeded, the unusual attention, and what is respected: 5 lines. */
function orderPoints(s: Signal, hype?: Preuve): { tone: string; text: string }[] {
  const caused = s.clauses.filter((c) => c.statut === "depassee" && c.cause_par_intention);
  const before = s.clauses.filter((c) => c.statut === "depassee" && !c.cause_par_intention);
  const near = s.clauses.filter((c) => c.statut === "approchee" || c.statut === "donnees_insuffisantes");
  const ok = s.clauses.filter((c) => c.statut === "respectee");
  const pts = [
    ...caused.slice(0, 3).map((c) => ({ tone: "bad", text: vous(c.explication) })),
    ...(hype?.statut === "ok" && hype.valeur?.engouement ? [{ tone: "warn", text: `Attention inhabituelle sur ce titre (pages vues et volume bien au-dessus de leur niveau habituel) : décidez à froid.` }] : []),
    ...before.slice(0, 2).map((c) => ({ tone: "warn", text: `Déjà le cas avant cette idée : ${vous(c.explication)}` })),
    ...near.slice(0, 1).map((c) => ({ tone: "warn", text: vous(c.explication) })),
    ...ok.slice(0, 2).map((c) => ({ tone: "good", text: vous(c.explication) })),
  ];
  return pts.slice(0, 5);
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
  const [bg, I] = tone === "good" ? ["bg-gain-600", Check] : tone === "mid" ? ["bg-primary-500", TriangleAlert] : ["bg-accent-600", X];
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

/** The profile's room on a 0–100 % line (up to its limit); the marker slides from today to after. */
function ZoneBar({ label, max, before, after }: { label: string; max: number; before: number; after: number }) {
  const at = (x: number) => `${Math.min(100, Math.max(0, x * 100))}%`;
  const inside = (x: number) => x <= max + 1e-6;
  const same = Math.abs(before - after) < 0.005;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-ink">{label}</span>
        {same ? <span className={clsx("tabular-nums font-semibold", inside(after) ? "text-gain-700" : "text-accent-700")}>{pct(after, 0)} · {inside(after) ? "dans votre limite" : "au-delà de votre limite"}</span> : (
          <span className="tabular-nums text-ink-muted">
            <span className={inside(before) ? "text-ink" : "text-accent-700"}>{pct(before, 0)}</span>
            <ArrowRight className="mx-1.5 inline h-3.5 w-3.5" />
            <span className="font-semibold text-primary-600">{pct(after, 0)}</span>
          </span>
        )}
      </div>
      <div className="relative mt-3 h-10">
        <div className="absolute inset-x-0 top-4 h-2 rounded-full bg-ink/[0.06]" />
        <div className="absolute top-4 h-2 rounded-full bg-gain-600/25 ring-1 ring-gain-600/40" style={{ left: 0, width: at(max) }} />
        {!same && <div className="absolute top-0 h-10 w-px bg-accent-600/50" style={{ left: at(before) }}>
          <span className={clsx("tabular-nums absolute -top-0.5 whitespace-nowrap text-[11px] text-accent-700", before > 0.75 ? "right-1.5" : "left-1.5")}>aujourd'hui</span>
        </div>}
        <motion.div className={clsx("absolute top-2.5 h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-white shadow-glow", inside(after) ? "bg-gain-600" : "bg-accent-600")}
          initial={{ left: at(before) }} animate={{ left: at(after) }} transition={{ type: "spring", stiffness: 60, damping: 16, delay: 0.5 }} />
      </div>
      <div className="relative h-4 text-[11px] text-ink-muted">
        <span className="absolute left-0 hidden sm:inline">0 %</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap font-medium text-gain-700" style={{ left: at(max / 2) }}>votre limite : {pct(max, 0)}</span>
        <span className="absolute right-0 hidden sm:inline">100 %</span>
      </div>
    </div>
  );
}

/** Three-step ladder of the signal: where this idea sits for the profile's rules. */
function SignalScale({ asset, niveau, vol, mdd }: { asset: string; niveau: Niveau; vol?: number; mdd?: number }) {
  const steps: Niveau[] = ["ok", "attention", "pause"];
  const ai = Math.max(0, steps.indexOf(niveau));
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5">
        {steps.map((t, i) => (
          <div key={t}>
            <div className="h-6 text-center">
              {i === ai && <motion.span initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring, delay: 0.35 }}
                className={clsx("inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-semibold text-white", i === 0 ? "bg-gain-600" : i === 1 ? "bg-primary-500" : "bg-accent-600")}>{asset}</motion.span>}
            </div>
            <motion.div className={clsx("mt-1.5 h-2.5 rounded-full", i === 0 ? "bg-gain-600/70" : i === 1 ? "bg-primary-500/60" : "bg-accent-600/60")}
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }} transition={{ ...softSpring, delay: 0.1 + i * 0.08 }} />
            <div className={clsx("mt-1.5 text-center text-xs", i === ai ? "font-semibold text-ink" : "text-ink-muted")}>{NIVEAU[t].short}</div>
          </div>
        ))}
      </div>
      {(vol != null || mdd != null) && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {vol != null && <Stat label="Variation typique par année" value={`± ${pct(vol, 0)}`} />}
          {mdd != null && <Stat label="Pire baisse passée" value={pct(mdd, 0)} bad={mdd < -0.25} />}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return <div className="rounded-2xl bg-ink/[0.035] px-4 py-3"><div className="text-xs text-ink-muted">{label}</div><div className={clsx("tabular-nums mt-0.5 font-display text-2xl font-semibold tracking-tight", bad ? "text-accent-700" : "text-ink")}>{value}</div></div>;
}

/** One broken (or approached) rule: the measure, its limit, and a bar with the limit marked. Tap for the plain-language detail. */
function ProblemTile({ c }: { c: StatutClause }) {
  const [open, setOpen] = useState(false);
  const val = c.valeur_apres ?? c.valeur_avant;
  const has = val != null && c.limite != null && c.unite === "%";
  const scale = has ? Math.max(Math.abs(val!), Math.abs(c.limite!)) * 1.15 || 1 : 1;
  const shown = c.type === "esg_controverses" || c.type === "esg_exclusion_secteurs" ? "Exclu" : val != null ? `${val.toLocaleString("fr-CA", { maximumFractionDigits: 1 })}${c.unite === "%" ? " %" : ` ${c.unite}`}` : "—";
  const limitText = c.limite == null ? (c.origine === "dit" ? "votre règle" : "règle par défaut") : `${c.type === "liquidites_min" ? "min" : "max"} ${c.limite.toLocaleString("fr-CA", { maximumFractionDigits: 1 })}${c.unite === "%" ? " %" : ` ${c.unite}`}`;
  return (
    <StaggerItem as="div">
      <motion.button layout type="button" onClick={() => setOpen(!open)} whileTap={{ scale: 0.98 }}
        className="w-full rounded-[20px] bg-surface/80 p-4 text-left hairline transition-colors hover:bg-white">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate font-medium text-ink-soft">{clauseShort(c)}{c.statut === "approchee" ? " · approchée" : ""}</span>
          <ChevronDown className={clsx("h-4 w-4 shrink-0 text-ink-muted transition", open && "rotate-180")} />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={clsx("tabular-nums font-display text-[28px] font-semibold tracking-tight", c.statut === "depassee" ? "text-accent-700" : "text-primary-600")}>{shown}</span>
          <span className="tabular-nums text-sm text-ink-muted">{limitText}</span>
        </div>
        {has && (
          <div className="relative mt-2 h-1.5 rounded-full bg-ink/[0.06]">
            <motion.div className={clsx("absolute inset-y-0 left-0 rounded-full", c.statut === "depassee" ? "bg-accent-600" : "bg-primary-500")} initial={{ width: 0 }} animate={{ width: `${(Math.abs(val!) / scale) * 100}%` }} transition={{ ...softSpring, delay: 0.2 }} />
            <div className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-ink" style={{ left: `${(Math.abs(c.limite!) / scale) * 100}%` }} title="Limite" />
          </div>
        )}
        <AnimatePresence initial={false}>
          {open && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden text-sm leading-relaxed text-ink-muted"><span className="block pt-3"><span className="font-medium text-ink">{c.libelle}</span> {vous(c.explication)}</span></motion.p>}
        </AnimatePresence>
      </motion.button>
    </StaggerItem>
  );
}

/** An idea to try next: what, why, and one tap. */
function IdeaCard({ icon: I, title, text, cta, onClick }: { icon: LucideIcon; title: string; text: string; cta: string; onClick: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  return (
    <StaggerItem as="div" className="flex gap-4 rounded-[20px] bg-surface/80 p-4 hairline sm:p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-600"><I className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{title}</div>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{text}</p>
        <Button size="sm" variant="secondary" className="mt-3" disabled={busy} onClick={async () => { setBusy(true); try { await onClick(); } catch { setBusy(false); } }}>
          {busy ? "Les agents démarrent…" : cta} <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </StaggerItem>
  );
}

/** What the decision changes: one line per measured rule, before → after, on a fixed scale with the limit marked. */
function Impact({ clauses }: { clauses: StatutClause[] }) {
  const rows = clauses.filter((c) => c.unite === "%" && c.valeur_apres != null && c.limite != null && ["perte_max", "actions_max", "concentration_titre", "liquidites_min", "speculatif_max", "crypto_max", "techno_max"].includes(c.type));
  const moved = (c: StatutClause) => c.valeur_avant != null && Math.abs(c.valeur_apres! - c.valeur_avant) >= 0.5;
  if (!rows.length) return null;
  if (!rows.some(moved)) {
    return (
      <Section title="Effet sur votre risque">
        <div className="flex gap-4 rounded-[20px] bg-ink/[0.03] p-4 sm:p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-ink"><Minus className="h-5 w-5" strokeWidth={2.5} /></span>
          <p className="text-[15px] leading-relaxed text-ink-soft"><span className="font-medium text-ink">Presque aucun changement.</span> Ce montant est petit par rapport à votre portefeuille : chacune de vos mesures bouge de moins d'un demi-point.</p>
        </div>
      </Section>
    );
  }
  return (
    <Section title="Ce que ça change">
      <div className="space-y-6">{rows.map((c) => <ImpactRow key={c.clause_id} c={c} />)}</div>
      <p className="mt-5 text-xs text-ink-muted">Calculé sur les vrais prix passés et la composition publiée des FNB. Le passé ne garantit pas l'avenir.</p>
    </Section>
  );
}

function ImpactRow({ c }: { c: StatutClause }) {
  const before = c.valeur_avant, after = c.valeur_apres!, lim = c.limite!;
  const scale = Math.max(Math.abs(after), Math.abs(before ?? 0), Math.abs(lim)) * 1.2 || 1;
  const w = (v: number) => `${Math.min(100, (Math.abs(v) / scale) * 100)}%`;
  const has = before != null && Math.abs(after - before) >= 0.5;
  const min = c.type === "liquidites_min";
  const outside = (x: number) => (min ? x < lim - 1e-6 : x > lim + 1e-6);
  const worse = has && (min ? after < before! : after > before!);
  const f = (x: number) => `${x.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} %`;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[15px] font-medium text-ink">{clauseShort(c)}</span>
        <span className="tabular-nums flex items-center gap-2 text-[15px]">
          {has && <><span className="text-ink-muted">{f(before!)}</span><ArrowRight className="h-3.5 w-3.5 text-ink-muted" /></>}
          <span className={clsx("font-semibold", outside(after) ? "text-accent-700" : "text-ink")}>{f(after)}</span>
          {has && <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", worse ? "bg-accent-50 text-accent-700" : "bg-gain-50 text-gain-700")}>{worse ? "plus de risque" : "moins de risque"}</span>}
        </span>
      </div>
      <div className="relative mt-3 h-2.5 rounded-full bg-ink/[0.05]">
        {has && <div className="absolute inset-y-0 left-0 rounded-full bg-ink/20" style={{ width: w(before!) }} />}
        <motion.div className={clsx("absolute inset-y-0 left-0 rounded-full", outside(after) ? "bg-accent-600" : "bg-primary-500")}
          initial={{ width: has ? w(before!) : 0 }} animate={{ width: w(after) }} transition={{ type: "spring", stiffness: 70, damping: 18, delay: 0.3 }} />
        <div className="absolute -top-1 h-[18px] w-0.5 rounded-full bg-gain-700" style={{ left: w(lim) }} title="Votre limite" />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-muted">
        <span>0 %</span><span className="text-gain-700">{min ? "minimum" : "limite"} {f(lim)}</span>
      </div>
    </div>
  );
}

const SECTION_FR: Record<string, string> = { donnees: "Les données", constats: "Les constats", analyse: "Vos règles", options: "Les options", explication: "En bref" };
const LABEL_FR: Record<string, string> = { MESURE: "Mesuré", DOCUMENTE: "Documenté", HYPOTHESE: "Hypothèse", INCERTAIN: "Incertain" };

function Why({ d, preuves }: { d: any; preuves: Record<string, Preuve> }) {
  return (
    <div className="space-y-6" data-testid="explanation">
      {(d.redaction?.sections || []).map((sct: any) => (
        <div key={sct.etape}>
          <h3 className="text-sm font-semibold text-ink">{SECTION_FR[sct.etape] || sct.etape}</h3>
          <ul className="mt-2 space-y-2">{sct.phrases.map((ph: any, i: number) => <Phrase key={i} ph={ph} preuves={preuves} />)}</ul>
        </div>
      ))}
      <News preuves={preuves} />
      <p className="text-xs text-ink-muted">Rédigé par : {d.redaction?.redige_par === "gabarit" ? "gabarit écrit en code (sans modèle de langage)" : d.redaction?.redige_par}. Chaque phrase a été vérifiée contre ses preuves ; touchez « preuve » pour voir la méthode.</p>
    </div>
  );
}

function Phrase({ ph, preuves, muted }: { ph: any; preuves: Record<string, Preuve>; muted?: boolean }) {
  return (
    <li className={clsx("flex gap-3 leading-relaxed", muted || ph.etiquette === "INCERTAIN" || ph.etiquette === "HYPOTHESE" ? "text-sm text-ink-muted" : "text-[15px] text-ink")}>
      <span className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-ink-muted" />
      <span>{vous(ph.texte)} {ph.etiquette && <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-ink-muted">· {LABEL_FR[ph.etiquette] || ph.etiquette}</span>}
        {(ph.preuves || []).slice(0, 2).map((id: string) => preuves[id] && <ProofChip key={id} p={preuves[id]} />)}</span>
    </li>
  );
}

/** The evidence behind a sentence: what was measured, how, on which period and from which sources. */
function ProofChip({ p }: { p: Preuve }) {
  const [open, setOpen] = useState(false);
  const per = Array.isArray(p.periode) ? p.periode : p.periode ? [p.periode.debut, p.periode.fin] : null;
  return (
    <span className="relative ml-1 inline-block">
      <button type="button" onClick={() => setOpen(!open)} title={p.libelle} className="rounded-full bg-primary-50 px-1.5 py-px text-[11px] font-semibold text-primary-600 hover:bg-primary-100">preuve</button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-1.5 block w-72 rounded-xl border border-line bg-white p-3 text-left text-xs font-normal leading-relaxed text-ink-soft shadow-lift">
          <b className="block font-semibold text-ink">{p.libelle}</b>
          <span className="mt-1 block">Méthode : {p.methode.replaceAll("_", " ")}</span>
          {per && <span className="block">Période : {per[0]} → {per[1]}</span>}
          <span className="block">Calculé au {p.date_de_calcul}</span>
          {p.donnees_source?.length > 0 && <span className="block">Sources : {p.donnees_source.join(", ")}</span>}
          {p.reference && <span className="mt-1 block text-ink-muted">{p.reference}</span>}
          <span className="mt-1 block text-[10px] text-ink-muted">{p.id}</span>
        </span>
      )}
    </span>
  );
}

/** Official filings and press read by the research tools (only what was published by the simulated date). */
function News({ preuves }: { preuves: Record<string, Preuve> }) {
  const dep = Object.values(preuves).find((p) => p.mesure === "depots_officiels");
  const art = Object.values(preuves).find((p) => p.mesure === "couverture_mediatique");
  const filings: any[] = dep?.statut === "ok" ? dep.valeur?.depots || [] : [];
  const articles: any[] = art?.statut === "ok" ? art.valeur?.articles || [] : [];
  if (!dep && !art) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">Ce que l'agent Recherche a trouvé</h3>
      {(dep?.valeur?.lu_le || art?.valeur?.lu_le) && <p className="mt-1 text-xs text-ink-muted" data-testid="research-dates">Lu à la source le {date(dep?.valeur?.lu_le || art?.valeur?.lu_le)} · seulement ce qui était publié au {date(dep?.as_of || art?.as_of)}</p>}
      <ul className="mt-2 divide-y divide-line border-t border-line">
        {filings.slice(0, 3).map((x: any) => (
          <li key={x.url} className="flex items-start justify-between gap-3 py-3 text-sm">
            <div><div className="text-ink">{x.forme}{x.objet ? ` · ${x.objet}` : ""}</div><div className="text-xs text-ink-muted">SEC EDGAR · {date(x.date)}</div></div>
            <a href={x.url} target="_blank" rel="noreferrer" className="shrink-0 text-ink-muted hover:text-ink" aria-label="Source"><ExternalLink className="h-4 w-4" /></a>
          </li>
        ))}
        {articles.slice(0, 3).map((x: any) => (
          <li key={x.url} className="flex items-start justify-between gap-3 py-3 text-sm">
            <div><div className="text-ink">{x.titre}</div><div className="text-xs text-ink-muted">{x.source} · {date(x.date)} · presse (GDELT), non confirmé</div></div>
            <a href={x.url} target="_blank" rel="noreferrer" className="shrink-0 text-ink-muted hover:text-ink" aria-label="Source"><ExternalLink className="h-4 w-4" /></a>
          </li>
        ))}
        {!filings.length && !articles.length && <li className="py-3 text-sm text-ink-muted">{dep?.note || art?.note || "Aucun fait récent dans les sources officielles."}</li>}
      </ul>
    </div>
  );
}

function Checks({ d }: { d: any }) {
  const label: Record<string, [string, string]> = {
    respectee: ["Respecté", "text-gain-700"], approchee: ["Approché", "text-primary-600"], depassee: ["Dépassé", "text-accent-700"],
    donnees_insuffisantes: ["Incertain", "text-primary-600"], non_applicable: ["N/A", "text-ink-muted"],
  };
  const s: Signal = d.signal;
  return (
    <div data-testid="governance">
      <ul className="divide-y divide-line border-t border-line">
        {s.clauses.map((c) => (
          <li key={c.clause_id} className="flex gap-4 py-3.5">
            <span className={clsx("w-20 shrink-0 pt-0.5 text-xs font-semibold uppercase tracking-wide", label[c.statut]?.[1])}>{label[c.statut]?.[0]}</span>
            <div className="min-w-0"><div className="text-sm font-medium text-ink">{c.libelle}</div><div className="text-sm text-ink-muted">{vous(c.explication)}</div></div>
          </li>
        ))}
        {(d.gouvernance?.controles || []).map((g: any) => (
          <li key={g.code} className="flex gap-4 py-3.5">
            <span className="w-20 shrink-0 pt-0.5 text-xs font-semibold uppercase tracking-wide text-gain-700">Contrôle</span>
            <div className="text-sm text-ink-muted">{g.libelle}</div>
          </li>
        ))}
      </ul>
      <p className="pt-3 text-xs text-ink-muted">Niveau décidé par la politique écrite (règles {s.regles_declenchees.join(", ") || "—"}), jamais par le modèle de langage.</p>
    </div>
  );
}

function Stress({ preuves }: { preuves: Record<string, Preuve> }) {
  const { config } = useApp();
  const rows = Object.values(preuves).filter((p) => (p.mesure === "rejeu_historique" || p.mesure === "choc_hypothetique") && p.statut === "ok");
  /** Replay of a past crisis: the worst fall of the portfolio during it; hypothetical shock: the portfolio's change. */
  const val = (p: Preuve): number | null => {
    const x = p.mesure === "rejeu_historique" ? p.valeur?.pire_baisse_pct : p.valeur?.variation_pct;
    return typeof x === "number" ? x / 100 : null;
  };
  const name = (p: Preuve) => {
    const k = String((p.parametres as any)?.episode ?? (p.parametres as any)?.scenario ?? "");
    return p.mesure === "rejeu_historique" ? `Si « ${config?.episodes?.[k]?.libelle ?? k} » se répétait (pire baisse)` : `Choc hypothétique : ${config?.chocs?.[k]?.libelle ?? k}`;
  };
  if (!rows.length) return <p className="border-t border-line py-4 text-sm text-ink-muted">Les agents n'ont pas eu besoin de scénarios pour cette demande.</p>;
  return (
    <div className="border-t border-line">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-ink-muted"><th className="pb-2 pt-4 font-medium">Scénario</th><th className="pb-2 pt-4 text-right font-medium">Votre portefeuille</th></tr></thead>
        <tbody>
          {rows.map((p) => {
            const x = val(p);
            return (
              <tr key={p.id} className="border-t border-line">
                <td className="py-3 text-ink">{name(p)}</td>
                <td className={clsx("tabular whitespace-nowrap py-3 text-right font-semibold", (x ?? 0) < 0 ? "text-accent-700" : "text-gain-700")}>{x == null ? "n/d" : pct(x)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pb-4 pt-2 text-xs text-ink-muted">Rejeu de crises passées et chocs hypothétiques : décrivent le passé ou une hypothèse, pas l'avenir.</p>
    </div>
  );
}

function Debate({ d, preuves }: { d: any; preuves: Record<string, Preuve> }) {
  const sides: [string, any][] = [["pour", d.debat?.pour], ["contre", d.debat?.contre]];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sides.map(([k, a]) => (
        <section key={k} className="border-t border-line py-6">
          <h3 className="text-sm font-semibold text-ink">{a?.agent || (k === "pour" ? "Agent Opportunités" : "Agent Risques")}</h3>
          <p className="mt-1 text-xs text-ink-muted">{k === "pour" ? "Ce qui joue en faveur" : "Ce qui appelle à la prudence"} · rédigé par {a?.redige_par === "gabarit" ? "un gabarit écrit en code" : a?.redige_par}</p>
          {!a?.phrases?.length ? <p className="mt-2 text-sm text-ink-muted">Rien à signaler.</p> : (
            <ul className="mt-3 space-y-3">
              {a.phrases.map((ph: any, i: number) => (
                <li key={i} className="flex gap-2.5 text-sm">
                  {k === "pour" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-gain-600" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />}
                  <div className="text-ink">{vous(ph.texte)}{(ph.preuves || []).slice(0, 1).map((id: string) => preuves[id] && <ProofChip key={id} p={preuves[id]} />)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p className="text-xs text-ink-muted md:col-span-2">Deux agents, les mêmes preuves : chacun défend un point de vue, aucun ne décide. Chaque phrase est vérifiée comme le reste du dossier.</p>
    </div>
  );
}

// ================================================================================================ history
type Entry = { type: string; a: string; as_of?: string; id?: string; intention?: any; niveau?: string; dossier?: string; execute?: boolean; choix?: string; [k: string]: any };

export function statusOf(e: Entry, entries: Entry[]): "approved" | "rejected" | "proposed" | "reviewed" {
  if (e.intention?.type !== "ordre") return "reviewed";
  const dec = entries.find((x) => x.type === "decision" && x.dossier === e.id);
  return dec ? (dec.execute ? "approved" : "rejected") : "proposed";
}

const JOURNAL_FR: Record<string, string> = { dossier: "Analyse des agents", signal: "Signal affiché", decision: "Votre décision", regle_modifiee: "Règle modifiée",
  notification: "Notification de la Vigie", contrat: "Profil et règles", surveillance: "Liste de suivi", assistant: "Question posée", positions: "Placements modifiés",
  depot: "Ajout de fonds (simulation)", vente: "Vente simulée" };

export function journalText(e: Entry): string {
  return vous(journalRaw(e));
}
function journalRaw(e: Entry): string {
  if (e.type === "dossier") return describe(e.intention);
  if (e.type === "decision") return `${e.execute ? (e.choix === "continuer" ? "Continuer quand même" : "Approuvé") : "Refusé"} · ${e.ticker ? sym(e.ticker) : ""} ${e.montant_cad ? cad(e.montant_cad) : ""}`.trim();
  if (e.type === "regle_modifiee") return `${e.clause} → version ${e.version}${e.contexte ? ` · « ${e.contexte} »` : ""}`;
  if (e.type === "signal") return `${e.ticker ? sym(e.ticker) : ""} ${e.montant_cad ? cad(e.montant_cad) : ""} · ${NIVEAU[e.niveau as Niveau]?.short ?? ""}`;
  if (e.type === "assistant") return `« ${e.question} »`;
  if (e.type === "depot") return cad(e.montant_cad);
  if (e.type === "vente") return `${sym(e.ticker)} · ${cad(e.montant_cad)}`;
  if (e.type === "positions") return e.origine === "allocation_initiale" ? "Retour au portefeuille de départ" : e.origine === "import_csv" ? "Importés d'un fichier" : String(e.origine || "").startsWith("connexion") ? "Compte connecté (simulation)" : "Saisis à la main";
  if (e.type === "surveillance") return `${e.ticker ? sym(e.ticker) : ""} ajouté à la liste de suivi`;
  return e.titre || e.message || "";
}

/** Every request made to the agents (with its status), and the full journal of what happened. */
export function Decisions() {
  const path = useProfilePath();
  const { data, loading } = useApi<{ entrees: Entry[] }>(path("/journal", { as_of: null }));
  const [tab, setTab] = useState<"decisions" | "journal">("decisions");
  const entries = data?.entrees || [];
  const list = entries.filter((e) => e.type === "dossier" && e.id);
  return (
    <PageIn className="mx-auto max-w-3xl px-5 pb-16 pt-10">
      <div className="flex items-end justify-between gap-4">
        <div><div className="mb-3"><HowItWorks topic="decisions" /></div>
        <h1 className="font-display text-[40px] font-semibold leading-none tracking-tightest text-ink">Décisions</h1></div>
        <Link to="/"><Button variant="gold">Nouvelle décision</Button></Link>
      </div>
      <div className="mt-8"><Tabs value={tab} onChange={setTab} options={[["decisions", "Décisions"], ["journal", "Journal complet"]]} /></div>
      {loading && !data && <Spinner />}
      {tab === "decisions" && data && !list.length && <div className="mt-6 py-12 text-center text-sm text-ink-muted">Aucune décision pour l'instant.</div>}
      {tab === "decisions" && list.length > 0 && (
        <Stagger className="mt-2 divide-y divide-line">
          {list.map((m) => {
            const st = statusOf(m, entries);
            return (
              <StaggerItem key={m.id}>
                <Link to={`/mandats/${m.id}`} className="flex items-center gap-4 py-4 transition-opacity hover:opacity-70">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{requestOf(m.id!, m.intention)}</div>
                    <div className="truncate text-sm text-ink-muted">{NIVEAU[m.niveau as Niveau]?.label ?? ""}</div>
                  </div>
                  <div className="text-right">
                    <div className={clsx("text-xs font-semibold", st === "approved" || st === "reviewed" ? "text-gain-700" : st === "rejected" ? "text-ink-muted" : "text-primary-600")}>{st === "approved" ? "Approuvée" : st === "rejected" ? "Refusée" : st === "reviewed" ? "Analysée" : "En attente"}</div>
                    <div className="text-xs text-ink-muted">{date(m.a)}</div>
                  </div>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
      {tab === "journal" && data && (
        entries.length === 0 ? <div className="mt-6 py-12 text-center text-sm text-ink-muted">Aucune entrée pour l'instant.</div> : (
          <Stagger className="mt-2 divide-y divide-line" key="journal">
            {entries.map((e, i) => (
              <StaggerItem key={i} className="grid gap-1 py-3.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
                <div className="tabular-nums text-xs text-ink-muted">{date(e.a)}{e.as_of && e.as_of !== String(e.a).slice(0, 10) ? <div>date simulée : {date(e.as_of)}</div> : null}</div>
                <div className="min-w-0 text-sm">
                  <div className="font-medium text-ink">{JOURNAL_FR[e.type] ?? e.type}</div>
                  <div className="mt-0.5 text-ink-soft">{e.type === "dossier" && e.id ? <Link to={`/mandats/${e.id}`} className="hover:underline">{journalText(e)}</Link> : journalText(e)}</div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        )
      )}
    </PageIn>
  );
}

export { REVIEW };
