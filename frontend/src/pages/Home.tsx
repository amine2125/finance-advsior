import clsx from "clsx";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, BookOpen, Check, Compass, Flame, Hourglass, Link2, LucideIcon, Plus, Search, ShieldAlert, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AmountPicker from "../components/AmountPicker";
import { openSearch } from "../components/AssetSearch";
import { ValueChart } from "../components/charts";
import HoldingsEditor from "../components/HoldingsEditor";
import { CountUp, Glass, Meter, PageIn, Segmented, spring, Stagger, StaggerItem } from "../components/motion";
import { TickerLogo, sym } from "../components/Ticker";
import HowItWorks from "../components/HowItWorks";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { ESSENTIALS } from "../lib/lessons";
import { useApi } from "../hooks/useApi";
import { useApp, useProfilePath } from "../hooks/useApp";
import { MarketRow, useMarket } from "../hooks/useMarket";
import { friendly } from "../lib/assets";
import { cad, date, pct } from "../lib/format";
import { REVIEW, useLaunch } from "../lib/launch";
import { Signal, vous } from "../lib/ulysse";
import { api, ApiError } from "../services/api";
import { journalText, statusOf } from "./Mandate";

const SUGGESTIONS = ["Je veux 2 000 $ de NVIDIA", "Est-ce que Tesla me convient ?", "Mon portefeuille respecte-t-il mes règles ?"];
const RANGES: [number, string][] = [[30, "1M"], [90, "3M"], [365, "1A"], [1825, "5A"]];

export { REVIEW };
export const signed = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${cad(Math.abs(v), d)}`);
export const signedPct = (v: number | null | undefined) => (v == null ? "" : `${v >= 0 ? "+" : "−"}${pct(Math.abs(v), 2)}`);

export type Holding = { asset_id: string; name: string; asset_class: string; accounts: string[]; value_cad: number; weight: number;
  gain_cad: number | null; gain_pct: number | null; day_change_pct: number | null; quantity: number; price_cad: number };
export type Positions = { as_of: string; total_cad: number; liquidites_cad: number; origine: string; mouvements: any[]; lignes: any[] };

/** A line of the engine's holdings, with the day's change from the market list (the engine's percents become fractions). */
export function toHoldings(pos: Positions | null, market: MarketRow[] | undefined): Holding[] {
  const m = Object.fromEntries((market || []).map((a) => [a.ticker, a]));
  return (pos?.lignes || []).map((l) => ({
    asset_id: l.ticker, name: l.nom, asset_class: l.classe, accounts: l.comptes || [], value_cad: l.valeur_cad, weight: l.poids, quantity: l.quantite, price_cad: l.prix_cad,
    gain_cad: l.gain_cad, gain_pct: l.gain_pct == null ? null : l.gain_pct / 100, day_change_pct: m[l.ticker] ? m[l.ticker].variation_1j_pct / 100 : null,
  }));
}
/** Gain since purchase over the lines whose cost is known (holdings entered, connected or bought here). */
export function gainSince(h: Holding[]): { gain: number; pct: number } | null {
  const known = h.filter((x) => x.gain_cad != null);
  if (!known.length) return null;
  const gain = known.reduce((s, x) => s + x.gain_cad!, 0);
  const cost = known.reduce((s, x) => s + (x.value_cad - x.gain_cad!), 0);
  return { gain, pct: cost > 0 ? gain / cost : 0 };
}

type Panel = "invest" | "deposit" | null;

/** Accueil, du plus utile au moins utile : combien j'ai, ce qui attend ma réponse, que faire maintenant, puis le détail. */
export default function Home() {
  const { me } = useApp();
  const path = useProfilePath();
  const p = me!.profile!;
  const [tick, setTick] = useState(0);
  const pos = useApi<Positions>(path("/positions"), [tick]);
  const [days, setDays] = useState(365);
  const hist = useApi<any>(path("/historique", { jours: days }), [tick]);
  const act = useApi<{ entrees: any[] }>(path("/journal", { as_of: null }), [tick]);
  const home = useApi<any>(path("/accueil"), [tick]);
  const market = useMarket();
  const ask = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const holdings = useMemo(() => toHoldings(pos.data, market.data?.actifs), [pos.data, market.data]);
  const has = holdings.length > 0;
  const entries = act.data?.entrees || [];
  const pending = entries.find((e) => e.type === "dossier" && e.id && statusOf(e, entries) === "proposed");
  const g = gainSince(holdings);
  const ch = hist.data?.variation_cad;
  const cash = pos.data?.liquidites_cad ?? me?.cash ?? 0;
  const refresh = () => setTick((t) => t + 1);
  const openPanel = (x: Panel) => {
    setPanel(x);
    setTimeout(() => document.querySelector('[data-tour="cash"]')?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  return (
    <PageIn className="mx-auto max-w-[920px] px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">Bonjour {p.display_name}</p>
        <HowItWorks topic="home" />
      </div>
      <StarterCard decided={entries.some((e) => e.type === "decision" || e.type === "dossier")} />
      {/* balance */}
      <div data-tour="balance"><Glass glow className="px-6 pb-4 pt-7 sm:px-9 sm:pt-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-ink-muted">Valeur totale · profil {p.risk_profile_label.toLowerCase()}</p>
            <p className="mt-2 font-display text-[44px] font-semibold leading-none tracking-tightest text-ink sm:text-[56px]" data-testid="total-value">
              {pos.data ? <CountUp value={pos.data.total_cad} format={(v) => cad(v, 2)} /> : "…"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {has && g && <Chip tone={g.gain >= 0 ? "gain" : "loss"}>{signed(g.gain, 0)} · {signedPct(g.pct)} depuis vos achats</Chip>}
              {has && ch != null && <Chip tone={ch >= 0 ? "gain" : "loss"}>{signedPct((hist.data.variation_pct ?? 0) / 100)} sur {RANGES.find((r) => r[0] === days)?.[1]}</Chip>}
              {has && hist.data?.veille_cad != null && <Chip tone="neutral">{signed(hist.data.veille_cad)} à la dernière clôture</Chip>}
            </div>
          </div>
          {has && <Segmented value={days} onChange={setDays} options={RANGES} size="sm" />}
        </div>
        {has && hist.data?.serie?.length > 1 && (
          <motion.div className="-mx-2 mt-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={days} transition={{ duration: 0.35 }}>
            <ValueChart series={hist.data.serie.map((x: any) => ({ date: x.date, value: x.valeur_cad }))} height={190} />
          </motion.div>
        )}
        {!has && pos.data && <div className="h-2" />}
        <CashRow cash={cash} panel={panel} setPanel={setPanel} onChanged={refresh} />
      </Glass></div>

      {pending && <PendingBanner item={pending} />}

      <DecisionBox inputRef={ask} hasHoldings={has} cash={cash} onInvest={() => openPanel(cash >= 50 ? "invest" : "deposit")} />

      {pos.data && !has && <Connect />}
      {has && <Health pending={pending} home={home.data} />}

      {has && (
        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="min-w-0">
            <SectionHead title="Placements" to="/placements" />
            <Stagger className="mt-2">
              {holdings.slice(0, 6).map((x) => <HoldingRow key={x.asset_id} h={x} />)}
            </Stagger>
          </section>
          <section className="min-w-0">
            <MarketPulse held={holdings.map((x) => x.asset_id)} home={home.data} />
            <SectionHead title="Activité" to="/decisions" />
            <Stagger className="mt-2">
              {entries.filter((e) => e.type !== "assistant").slice(0, 5).map((i: any, n: number) => {
                const body = (
                  <div className="border-b border-line py-3.5">
                    <div className="text-xs text-ink-muted">{date(i.a)}</div>
                    <div className="mt-0.5 line-clamp-2 text-sm leading-snug text-ink">{journalText(i)}</div>
                  </div>
                );
                return <StaggerItem key={n}>{i.type === "dossier" && i.id ? <Link to={`/mandats/${i.id}`} className="block transition-opacity hover:opacity-70">{body}</Link> : body}</StaggerItem>;
              })}
            </Stagger>
          </section>
        </div>
      )}
      <ErrorBox error={pos.error} onRetry={pos.reload} />
    </PageIn>
  );
}

/** An analysed purchase waits for an answer: the most urgent thing on the page, one tap away. */
function PendingBanner({ item }: { item: any }) {
  return (
    <Link to={`/mandats/${item.id}`} data-testid="pending-proposal"
      className="group mt-4 flex items-center gap-4 rounded-[22px] bg-primary-50 px-5 py-4 transition-colors hover:bg-primary-50/70">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-500 text-white"><Hourglass className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">Une proposition attend votre réponse</span>
        <span className="block truncate text-sm text-ink-soft">{journalText(item)}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-600">Voir <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
    </Link>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "gain" | "loss" | "neutral" }) {
  return (
    <span className={clsx("tabular-nums inline-flex items-center rounded-full px-3 py-1 text-[13px] font-medium",
      tone === "gain" ? "bg-gain-50 text-gain-700" : tone === "loss" ? "bg-accent-50 text-accent-700" : "bg-ink/[0.04] text-ink-soft")}>{children}</span>
  );
}

const CLIMATE_DOT: Record<string, string> = { calme: "bg-gain-600", agité: "bg-primary-500", tendu: "bg-accent-600" };
const CLIMATE_TEXT: Record<string, string> = {
  calme: "Les marchés bougent peu ces dernières semaines.",
  agité: "Les marchés bougent plus que d'habitude, sans tension extrême.",
  tendu: "Les marchés traversent une période de forte volatilité.",
};

/** ULYSSE engine: the market climate and the securities that draw unusual attention (holdings first). */
function MarketPulse({ held, home }: { held: string[]; home: any }) {
  const { asOf } = useApp();
  const trends = useApi<any>(asOf ? `/tendances?as_of=${asOf}` : null);
  const reg = home?.regime;
  const c = reg?.statut === "ok" ? reg.valeur : null;
  const att: any[] = (trends.data?.titres || []).filter((r: any) => r.preuve?.valeur?.engouement)
    .sort((a: any, b: any) => Number(held.includes(b.ticker)) - Number(held.includes(a.ticker))).slice(0, 3);
  if (!c && !att.length) return null;
  return (
    <div className="mb-10 rounded-[20px] bg-surface/80 p-4 hairline" data-testid="market-pulse">
      {c && (
        <div title={reg.methode}>
          <div className="text-xs text-ink-muted">Climat de marché</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className={clsx("inline-block h-2 w-2 -translate-y-0.5 rounded-full", CLIMATE_DOT[c.regime] || "bg-ink")} />
            <span className="font-display text-lg font-semibold capitalize tracking-tight text-ink">{c.regime}</span>
            <span className="text-sm text-ink-muted">depuis {c.semaines_consecutives} semaine{c.semaines_consecutives > 1 ? "s" : ""}</span>
          </div>
          <p className="mt-1 text-xs leading-snug text-ink-muted">{CLIMATE_TEXT[c.regime] || ""} Une description du présent, pas une prévision.</p>
        </div>
      )}
      {att.length > 0 && (
        <div className={clsx(c && "mt-4 border-t border-line pt-3")}>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Flame className="h-3.5 w-3.5 text-accent-600" /> Attention inhabituelle</div>
          {att.map((a) => (
            <Link key={a.ticker} to={`/placement/${encodeURIComponent(a.ticker)}`} className="mt-2.5 flex items-start gap-2.5 transition-opacity hover:opacity-70">
              <TickerLogo id={a.ticker} size={24} />
              <span className="text-xs leading-snug text-ink-soft"><b className="font-semibold text-ink">{sym(a.ticker)}</b>{held.includes(a.ticker) ? " (dans vos placements)" : ""} : pages vues {num(a.preuve.valeur.vues_vs_habituel)} × et volume {num(a.preuve.valeur.volume_vs_habituel)} × leur niveau habituel.</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
const num = (x: number | null | undefined) => (x == null ? "n/d" : x.toLocaleString("fr-CA", { maximumFractionDigits: 1 }));

function SectionHead({ title, to }: { title: string; to: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-display text-[22px] font-semibold tracking-[-0.03em] text-ink">{title}</h2>
      <Link to={to} className="group inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">Tout voir <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
    </div>
  );
}

export function HoldingRow({ h }: { h: Holding }) {
  return (
    <StaggerItem>
      <Link to={`/placement/${encodeURIComponent(h.asset_id)}`} className="group flex items-center gap-4 border-b border-line py-3.5" data-testid="holding-row">
        <motion.span whileHover={{ scale: 1.06 }} transition={spring}><TickerLogo id={h.asset_id} size={40} /></motion.span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold tracking-[-0.01em] text-ink">{sym(h.asset_id)}</div>
          <div className="truncate text-sm text-ink-muted">{friendly(h.asset_id, h.name)}{h.accounts?.length ? ` · ${h.accounts.join(", ")}` : ""}</div>
        </div>
        <div className="text-right">
          <div className="tabular-nums font-medium text-ink">{cad(h.value_cad, 2)}</div>
          {h.gain_cad != null
            ? <div className={clsx("tabular-nums text-sm", h.gain_cad >= 0 ? "text-gain-700" : "text-accent-700")}>{signed(h.gain_cad, 0)} ({signedPct(h.gain_pct)})</div>
            : h.day_change_pct != null && <div className={clsx("tabular-nums text-sm", h.day_change_pct >= 0 ? "text-gain-700" : "text-accent-700")}>{signedPct(h.day_change_pct)}</div>}
        </div>
      </Link>
    </StaggerItem>
  );
}

/** « Que voulez-vous faire ? » — the entry point of the agent workflow: the three main actions, or the request in plain words. */
export function DecisionBox({ inputRef, hasHoldings, cash = 0, onInvest }: { inputRef?: React.RefObject<HTMLTextAreaElement | null>; hasHoldings?: boolean; cash?: number; onInvest?: () => void }) {
  const launch = useLaunch();
  const [text, setText] = useState(() => new URLSearchParams(window.location.search).get("demande") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const start = async (req?: string, intention?: Parameters<typeof launch>[1]) => {
    const r = (req ?? text).trim();
    if (!r) return;
    setBusy(true); setError(null);
    try { await launch(r, intention); } catch (e) { setError(e as ApiError); setBusy(false); }
  };
  const tiles: { icon: LucideIcon; title: string; sub: string; onClick: () => void; testid: string }[] = [
    { icon: Wallet, title: "Investir mon solde", testid: "tile-invest", onClick: () => onInvest?.(),
      sub: cash >= 50 ? `${cad(cash)} disponibles. Vous choisissez le montant.` : "Ajoutez d'abord de l'argent fictif." },
    { icon: Search, title: "Analyser un titre", testid: "tile-search", onClick: openSearch, sub: "Apple, NVIDIA, un fonds… Est-ce pour moi ?" },
    hasHoldings
      ? { icon: ShieldCheck, title: "Vérifier mon portefeuille", testid: "tile-review", onClick: () => start(REVIEW, { type: "portefeuille" }), sub: "Respecte-t-il mes règles ? Sinon, qu'est-ce qui dépasse ?" }
      : { icon: Plus, title: "Ajouter mes placements", testid: "tile-connect", sub: "Ceux que vous avez déjà, ici ou ailleurs.",
          onClick: () => document.querySelector('[data-tour="connect"]')?.scrollIntoView({ behavior: "smooth", block: "center" }) },
  ];
  return (
    <section className="mt-10" data-tour="decide">
      <div className="flex items-center gap-2 text-sm font-medium text-primary-600"><Sparkles className="h-4 w-4" /> Prendre une décision</div>
      <h2 className="mt-1.5 font-display text-[30px] font-semibold leading-[1.05] tracking-tightest text-ink sm:text-[36px]">Que voulez-vous faire ?</h2>
      <Stagger as="div" className="mt-5 grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <StaggerItem as="div" key={t.testid}>
            <motion.button whileTap={{ scale: 0.98 }} whileHover={{ y: -2 }} transition={spring} onClick={t.onClick} disabled={busy} data-testid={t.testid}
              className="flex h-full w-full items-start gap-3 rounded-[22px] glass hairline p-4 text-left transition-shadow hover:shadow-card disabled:opacity-50">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-600"><t.icon className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0">
                <span className="block font-semibold tracking-[-0.01em] text-ink">{t.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{t.sub}</span>
              </span>
            </motion.button>
          </StaggerItem>
        ))}
      </Stagger>
      <p className="mt-6 text-sm font-medium text-ink">Ou dites-le avec vos mots</p>
      <form onSubmit={(e) => { e.preventDefault(); start(); }}
        className="mt-2 flex items-end gap-3 rounded-[22px] glass hairline p-2 pl-5 transition-shadow focus-within:shadow-glow">
        <textarea ref={inputRef} rows={1} value={text} onChange={(e) => setText(e.target.value)} data-testid="mandate-input"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); start(); } }}
          placeholder="Je veux 2 000 $ de NVIDIA…"
          className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent py-3 text-[17px] tracking-[-0.01em] text-ink outline-none placeholder:text-ink-muted/70" />
        <motion.button type="submit" disabled={busy || !text.trim()} data-testid="mandate-start" aria-label="Lancer l'analyse"
          whileTap={{ scale: 0.92 }} transition={spring}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-500 text-white shadow-glow transition-colors hover:bg-primary-600 disabled:bg-ink/[0.06] disabled:text-ink-muted disabled:shadow-none">
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <ArrowUpRight className="h-5 w-5" />}
        </motion.button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((e) => (
          <motion.button key={e} whileTap={{ scale: 0.96 }} onClick={() => { setText(e); start(e); }}
            className="rounded-full hairline bg-white/60 px-3.5 py-1.5 text-[13px] text-ink-soft transition-colors hover:bg-white hover:text-ink">{e}</motion.button>
        ))}
      </div>
      <p className="mt-4 max-w-2xl text-sm text-ink-muted">Nos agents analysent votre profil, vos placements et le marché, vérifient chaque chiffre, puis vous disent si votre idée respecte vos règles. Rien n'est fait sans votre accord.</p>
      {error && <div className="mt-3"><ErrorBox error={error} /></div>}
    </section>
  );
}

/** Empty account: connect an existing brokerage account (simulated) or enter holdings by hand. */
function Connect() {
  const { me, reload } = useApp();
  const nav = useNavigate();
  const launch = useLaunch();
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div data-tour="connect"><Glass className="mt-6 px-6 py-7 sm:px-9" glow>
      <div data-testid="connect">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-50 text-primary-600"><Link2 className="h-5 w-5" /></span>
        <h2 className="mt-4 font-display text-[30px] font-semibold leading-tight tracking-tightest text-ink">Connectez votre portefeuille</h2>
        <p className="mt-2 max-w-xl text-ink-soft">Reliez le compte où sont déjà vos placements. Nos agents vérifient tout de suite s'il respecte votre profil {me!.profile!.risk_profile_label.toLowerCase()}.</p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button size="lg" variant="gold" onClick={() => nav("/connecter")} data-testid="connect-account">Connecter mon compte de placement <ArrowRight className="h-4 w-4" /></Button>
          <Button size="lg" variant="ghost" onClick={() => setManual(!manual)}><Plus className="h-4 w-4" /> Entrer mes placements à la main</Button>
        </div>
        {manual && (
          <motion.div className="mt-6" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            {busy ? <Spinner label="Les agents démarrent l'analyse…" /> : (
              <HoldingsEditor submitLabel="Analyser mon portefeuille" initial={[]}
                onSaved={async () => { setBusy(true); await reload(); await launch(REVIEW, { type: "portefeuille" }); }} />
            )}
          </motion.div>
        )}
        <p className="mt-5 text-xs text-ink-muted">Simulation : aucun identifiant n'est demandé et aucun vrai compte n'est contacté.</p>
      </div>
    </Glass></div>
  );
}

/** Does my portfolio match my rules? One meter, the problems in plain words, one action. */
function Health({ pending, home }: { pending?: any; home: { statut_contrat: Signal } | null }) {
  const nav = useNavigate();
  const launch = useLaunch();
  const [busy, setBusy] = useState(false);
  const s = home?.statut_contrat;
  if (!s) return null;
  const checks = s.clauses.filter((c) => c.statut !== "non_applicable");
  const problems = checks.filter((c) => c.statut === "depassee");
  const ok = problems.length === 0;
  const n = problems.length;
  const total = Math.max(1, checks.length);
  return (
    <div data-tour="health"><Glass className="mt-6 px-6 py-6 sm:px-9">
      <div data-testid="diagnosis">
        <div className="flex items-start gap-4">
          <span className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", ok ? "bg-gain-50 text-gain-700" : "bg-accent-50 text-accent-700")}>
            {ok ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <ShieldAlert className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[22px] font-semibold leading-snug tracking-[-0.03em] text-ink">{ok ? "Vos placements respectent vos règles" : `Vos placements dépassent ${n > 1 ? `${n} de vos règles` : "une de vos règles"}`}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Meter value={(total - n) / total} tone={ok ? "gain" : n > 2 ? "loss" : "primary"} className="w-full max-w-[220px] sm:flex-1" />
              <span className="tabular-nums text-sm text-ink-muted">{ok ? "Toutes les règles respectées" : `${n} point${n > 1 ? "s" : ""} à corriger`}</span>
            </div>
          </div>
        </div>
        {!ok && (
          <Stagger className="mt-5 space-y-2.5 sm:pl-[60px]">
            {problems.slice(0, 3).map((p) => (
              <StaggerItem key={p.clause_id} className="text-[15px] leading-relaxed"><span className="font-medium text-ink">{p.libelle}</span> <span className="text-ink-muted">{vous(p.explication)}</span></StaggerItem>
            ))}
            {n > 3 && <StaggerItem className="text-sm text-ink-muted">+ {n - 3} autre(s) point(s)</StaggerItem>}
          </Stagger>
        )}
        {!ok && (
          <div className="mt-6 sm:pl-[60px]">
            <Button variant="gold" disabled={busy} data-testid="fix-portfolio"
              onClick={async () => { if (pending) { nav(`/mandats/${pending.id}`); return; } setBusy(true); try { await launch(REVIEW, { type: "portefeuille" }); } catch { setBusy(false); } }}>
              {busy ? "Les agents démarrent…" : pending ? "Voir la proposition en attente" : "Demander aux agents d'analyser"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </Glass></div>
  );
}

const DEPOSITS = [1000, 5000, 10000, 25000];
const INVEST_STEPS = [500, 1000, 2500, 5000, 10000, 25000, 50000];
const STARTERS = ["XIU.TO", "SPY", "XBB.TO", "ZST.TO", "QQQ", "GLD"];

/** Simulated cash: what can be invested now, how much (all of it or the amount the person chooses) and where, and fictional top-ups. */
function CashRow({ cash, panel, setPanel, onChanged }: { cash: number; panel: Panel; setPanel: (p: Panel) => void; onChanged: () => void }) {
  const { reload, me, asOf } = useApp();
  const launch = useLaunch();
  const market = useMarket(panel === "invest");
  const all = Math.floor(cash);
  const [invAmt, setInvAmt] = useState<number | null>(all);
  const [ticker, setTicker] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [amount, setAmount] = useState<number | null>(5000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => { if (panel === "invest") setInvAmt(all); }, [panel]); // eslint-disable-line react-hooks/exhaustive-deps
  const steps = INVEST_STEPS.filter((v) => v < all).slice(-3);
  const list = market.data?.actifs || [];
  const shown = q.trim() ? list.filter((a) => (a.ticker + " " + a.name).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : list.filter((a) => STARTERS.includes(a.ticker));
  const invest = async () => {
    if (!invAmt || !ticker) return;
    setBusy(true); setErr(null);
    const amt = Math.floor(invAmt);
    try { await launch(`Je veux ${cad(amt)} de ${sym(ticker)}`, { type: "ordre", ticker, montant_cad: amt }); }
    catch (e) { setErr(e as ApiError); setBusy(false); }
  };
  const add = async () => {
    if (!amount || !me?.pid) return;
    setBusy(true); setErr(null);
    try { await api.post(`/profils/${encodeURIComponent(me.pid)}/depot`, { montant_cad: amount, as_of: asOf }); await reload(); onChanged(); setPanel(null); }
    catch (e) { setErr(e as ApiError); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-4 border-t border-line pt-4" data-testid="cash">
      <div data-tour="cash">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-50 text-primary-600"><Wallet className="h-4 w-4" /></span>
          <div>
            <div className="text-xs text-ink-muted">Disponible à investir · argent fictif</div>
            <div className="tabular-nums font-display text-xl font-semibold tracking-tight text-ink" data-testid="cash-value">{cad(cash, 2)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {cash >= 50 && (
            <Button size="sm" variant={panel === "invest" ? "secondary" : "gold"} onClick={() => setPanel(panel === "invest" ? null : "invest")} disabled={busy} data-testid="invest-cash">
              {panel === "invest" ? <><X className="h-3.5 w-3.5" /> Fermer</> : <>Investir <ArrowRight className="h-3.5 w-3.5" /></>}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "deposit" ? null : "deposit")} data-testid="add-funds"><Plus className="h-3.5 w-3.5" /> Ajouter des fonds</Button>
        </div>
      </div>
      {panel === "invest" && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-[20px] bg-white/60 p-4 hairline sm:p-5" data-testid="invest-panel">
          <p className="font-semibold tracking-[-0.01em] text-ink">Combien voulez-vous investir ?</p>
          <p className="mb-3.5 mt-0.5 text-[13px] text-ink-muted">Les agents vérifient votre idée avec vos règles avant tout achat. Le reste demeure disponible.</p>
          <AmountPicker value={invAmt} onChange={setInvAmt} presets={[[all, `Tout · ${cad(all)}`], ...steps]} min={50} max={all} testid="invest-amount" />
          <p className="mb-2.5 mt-5 font-semibold tracking-[-0.01em] text-ink">Dans quel placement ?</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : XIU, obligations, Apple…" aria-label="Rechercher un placement"
            className="mb-2.5 h-10 w-full max-w-[320px] rounded-2xl bg-white/70 px-4 text-sm text-ink outline-none hairline placeholder:text-ink-muted/70 focus:shadow-glow" data-testid="invest-search" />
          <div className="flex flex-wrap gap-1.5" role="radiogroup">
            {shown.map((a) => (
              <motion.button key={a.ticker} type="button" role="radio" aria-checked={ticker === a.ticker} whileTap={{ scale: 0.96 }} onClick={() => setTicker(a.ticker)} data-testid={`invest-${a.ticker}`}
                className={clsx("flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium transition-colors", ticker === a.ticker ? "bg-ink text-white" : "bg-ink/[0.04] text-ink-soft hover:text-ink")}>
                <TickerLogo id={a.ticker} size={22} />{sym(a.ticker)}<span className={clsx("hidden text-xs font-normal sm:inline", ticker === a.ticker ? "text-white/70" : "text-ink-muted")}>{friendly(a.ticker, a.name)}</span>
              </motion.button>
            ))}
            {market.loading && !list.length && <span className="text-sm text-ink-muted">Chargement…</span>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="gold" onClick={invest} disabled={busy || !invAmt || !ticker} data-testid="confirm-invest">
              {busy ? "Les agents démarrent…" : <>Analyser {invAmt ? cad(Math.floor(invAmt)) : ""}{ticker ? ` de ${sym(ticker)}` : ""} <ArrowRight className="h-4 w-4" /></>}
            </Button>
            <span className="text-xs text-ink-muted">Rien n'est acheté sans votre accord.</span>
          </div>
        </motion.div>
      )}
      {panel === "deposit" && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-[20px] bg-white/60 p-4 hairline sm:p-5">
          <p className="mb-3 font-semibold tracking-[-0.01em] text-ink">Combien ajouter ?</p>
          <AmountPicker value={amount} onChange={setAmount} presets={DEPOSITS} min={1} max={100000} testid="deposit-amount" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={add} disabled={busy || !amount} data-testid="confirm-deposit">{busy ? "Ajout…" : `Ajouter ${amount ? cad(amount) : ""}`}</Button>
            <span className="text-xs text-ink-muted">Argent fictif, pour apprendre sans risque.</span>
          </div>
        </motion.div>
      )}
      </div>
      <ErrorBox error={err} />
    </div>
  );
}

const DISMISS_KEY = "ulysse.demarrer.masque";

/** « Bien démarrer » : three steps for newcomers (tour, the essential lessons, a first decision). Hides itself when done. */
function StarterCard({ decided }: { decided: boolean }) {
  const { me } = useApp();
  const nav = useNavigate();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(`${DISMISS_KEY}.${me?.pid}`) === "1"; } catch { return false; } });
  const g = me?.guide;
  if (!g || hidden) return null;
  const read = ESSENTIALS.filter((id) => g.lessons.includes(id));
  const steps = [
    { done: g.tour_done, title: "Faire le tour de l'app", sub: "2 minutes pour voir où se trouve chaque chose.", icon: Compass,
      action: () => window.dispatchEvent(new Event("ulysse:visite")), cta: "Commencer" },
    { done: read.length === ESSENTIALS.length, title: "Comprendre l'essentiel", sub: `${read.length} sur ${ESSENTIALS.length} leçons : investir, le risque, diversifier.`, icon: BookOpen,
      action: () => nav(`/apprendre/${ESSENTIALS.find((id) => !g.lessons.includes(id)) || ESSENTIALS[0]}`), cta: read.length ? "Continuer" : "Lire" },
    { done: decided, title: "Prendre une première décision", sub: "Demandez aux agents si une idée respecte vos règles.", icon: Sparkles,
      action: () => document.querySelector('[data-tour="decide"]')?.scrollIntoView({ behavior: "smooth", block: "center" }), cta: "Essayer" },
  ];
  const n = steps.filter((s) => s.done).length;
  if (n === steps.length) return null;
  const dismiss = () => { try { localStorage.setItem(`${DISMISS_KEY}.${me?.pid}`, "1"); } catch { /* private mode */ } setHidden(true); };
  return (
    <Glass className="mb-6 p-5 sm:p-6" glow>
      <div className="flex items-start justify-between gap-3" data-testid="starter">
        <div>
          <div className="text-sm font-medium text-primary-600">Bien démarrer</div>
          <h2 className="mt-0.5 font-display text-[22px] font-semibold tracking-tight text-ink">Nouveau dans l'investissement ? On vous guide.</h2>
        </div>
        <button onClick={dismiss} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-ink/[0.05]" aria-label="Masquer"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex items-center gap-3"><Meter value={n / steps.length} tone="primary" className="w-40" /><span className="tabular-nums text-xs text-ink-muted">{n} sur {steps.length}</span></div>
      <Stagger as="div" className="mt-4 space-y-2">
        {steps.map((s) => (
          <StaggerItem as="div" key={s.title} className="flex items-center gap-3 rounded-2xl bg-white/60 p-3 hairline">
            <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-full", s.done ? "bg-gain-600 text-white" : "bg-primary-50 text-primary-600")}>
              {s.done ? <Check className="h-4 w-4" strokeWidth={3} /> : <s.icon className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={clsx("block text-sm font-medium", s.done ? "text-ink-muted line-through" : "text-ink")}>{s.title}</span>
              <span className="block text-xs text-ink-muted">{s.sub}</span>
            </span>
            {!s.done && <Button size="sm" variant="secondary" onClick={s.action}>{s.cta}</Button>}
          </StaggerItem>
        ))}
      </Stagger>
    </Glass>
  );
}
