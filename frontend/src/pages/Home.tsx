import clsx from "clsx";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, BookOpen, Check, Compass, Flame, Hourglass, Link2, LucideIcon, Plus, Search, ShieldAlert, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { useApp } from "../hooks/useApp";
import { friendly } from "../lib/assets";
import { cad, date, pct } from "../lib/format";
import { api, ApiError } from "../services/api";

const SUGGESTIONS = ["Je veux 2 000 $ de NVIDIA", "J'ai 3 000 $ pour un projet dans 2 ans", "Rééquilibre mon portefeuille"];
const RANGES: [number, string][] = [[30, "1M"], [90, "3M"], [365, "1A"], [1825, "5A"]];

/** Starts the agents on a request and opens the live run. */
export async function launchMandate(nav: (to: string) => void, request: string, portfolioId?: string, structured?: { kind: string; amount_cad?: number; asset_id?: string }) {
  const j = await api.post<{ job_id: string }>("/mandates", { request, portfolio_id: portfolioId, structured });
  nav(`/mandats/en-cours/${j.job_id}?q=${encodeURIComponent(request)}`);
}
export const REVIEW = "Analyse mon portefeuille et dis-moi s'il respecte mon profil";

export const signed = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${cad(Math.abs(v), d)}`);
export const signedPct = (v: number | null | undefined) => (v == null ? "" : `${v >= 0 ? "+" : "−"}${pct(Math.abs(v), 2)}`);

type Panel = "invest" | "deposit" | null;

/** Accueil, du plus utile au moins utile : combien j'ai, ce qui attend ma réponse, que faire maintenant, puis le détail. */
export default function Home() {
  const { me } = useApp();
  const cash = me?.cash?.cash_cad ?? 0;
  const p = me!.profile;
  const h = useApi<any>("/holdings");
  const [days, setDays] = useState(365);
  const hist = useApi<any>(`/history?days=${days}`, [days]);
  const act = useApi<any>("/activity");
  const ask = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const has = (h.data?.holdings || []).length > 0;
  const pending = (act.data?.items || []).find((i: any) => i.kind === "proposed");
  const ch = hist.data?.change_cad;
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
      <StarterCard />
      {/* balance */}
      <div data-tour="balance"><Glass glow className="px-6 pb-4 pt-7 sm:px-9 sm:pt-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-ink-muted">Valeur totale · profil {p.risk_profile_label.toLowerCase()}</p>
            <p className="mt-2 font-display text-[44px] font-semibold leading-none tracking-tightest text-ink sm:text-[56px]" data-testid="total-value">
              {h.data ? <CountUp value={h.data.total_value_cad + cash} format={(v) => cad(v, 2)} /> : "…"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {has && h.data.gain_cad != null && <Chip tone={h.data.gain_cad >= 0 ? "gain" : "loss"}>{signed(h.data.gain_cad, 0)} · {signedPct(h.data.gain_pct)} depuis vos achats</Chip>}
              {has && ch != null && <Chip tone={ch >= 0 ? "gain" : "loss"}>{signedPct(hist.data.change_pct)} sur {RANGES.find((r) => r[0] === days)?.[1]}</Chip>}
              {has && h.data.day_change_cad != null && <Chip tone="neutral">{signed(h.data.day_change_cad)} aujourd'hui</Chip>}
            </div>
          </div>
          {has && <Segmented value={days} onChange={setDays} options={RANGES} size="sm" />}
        </div>
        {has && hist.data?.series?.length > 1 && (
          <motion.div className="-mx-2 mt-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={days} transition={{ duration: 0.35 }}>
            <ValueChart series={hist.data.series} height={190} />
          </motion.div>
        )}
        {!has && h.data && <div className="h-2" />}
        <CashRow panel={panel} setPanel={setPanel} />
      </Glass></div>

      {pending && <PendingBanner item={pending} />}

      <DecisionBox inputRef={ask} hasHoldings={has} cash={cash} onInvest={() => openPanel(cash >= 50 ? "invest" : "deposit")} />

      {h.data && !has && <Connect />}
      {has && <Health pending={pending} />}

      {has && (
        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="min-w-0">
            <SectionHead title="Placements" to="/placements" />
            <Stagger className="mt-2">
              {h.data.holdings.slice(0, 6).map((x: any) => <HoldingRow key={x.asset_id} h={x} />)}
            </Stagger>
          </section>
          <section className="min-w-0">
            <MarketPulse />
            <SectionHead title="Activité" to="/decisions" />
            <Stagger className="mt-2">
              {(act.data?.items || []).slice(0, 5).map((i: any, n: number) => {
                const body = (
                  <div className="border-b border-line py-3.5">
                    <div className="text-xs text-ink-muted">{date(i.at)}</div>
                    <div className="mt-0.5 line-clamp-2 text-sm leading-snug text-ink">{i.title}</div>
                  </div>
                );
                return <StaggerItem key={n}>{i.mandate_id ? <Link to={`/mandats/${i.mandate_id}`} className="block transition-opacity hover:opacity-70">{body}</Link> : body}</StaggerItem>;
              })}
            </Stagger>
          </section>
        </div>
      )}
      <ErrorBox error={h.error} />
    </PageIn>
  );
}

/** A proposal from the agents waits for an answer: the most urgent thing on the page, one tap away. */
function PendingBanner({ item }: { item: any }) {
  return (
    <Link to={`/mandats/${item.mandate_id}`} data-testid="pending-proposal"
      className="group mt-4 flex items-center gap-4 rounded-[22px] bg-primary-50 px-5 py-4 transition-colors hover:bg-primary-50/70">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-500 text-white"><Hourglass className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">Une proposition attend votre réponse</span>
        <span className="block truncate text-sm text-ink-soft">{item.title}</span>
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

/** ULYSSE engine: the market climate and the user's holdings that draw unusual attention. Hidden when the engine is absent. */
function MarketPulse() {
  const s = useApi<any>("/market/signals");
  const c = s.data?.climate;
  const att: any[] = s.data?.attention || [];
  if (!c && !att.length) return null;
  return (
    <div className="mb-10 rounded-[20px] bg-surface/80 p-4 hairline" data-testid="market-pulse">
      {c && (
        <div title={c.method}>
          <div className="text-xs text-ink-muted">Climat de marché</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className={clsx("inline-block h-2 w-2 -translate-y-0.5 rounded-full", CLIMATE_DOT[c.regime] || "bg-ink")} />
            <span className="font-display text-lg font-semibold tracking-tight text-ink">{c.label}</span>
            <span className="text-sm text-ink-muted">{c.since}</span>
          </div>
          <p className="mt-1 text-xs leading-snug text-ink-muted">{c.text} Une description du présent, pas une prévision.</p>
        </div>
      )}
      {att.length > 0 && (
        <div className={clsx(c && "mt-4 border-t border-line pt-3")}>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Flame className="h-3.5 w-3.5 text-accent-600" /> Attention inhabituelle</div>
          {att.map((a) => (
            <Link key={a.asset_id} to={`/placement/${encodeURIComponent(a.asset_id)}`} className="mt-2.5 flex items-start gap-2.5 transition-opacity hover:opacity-70">
              <TickerLogo id={a.asset_id} size={24} />
              <span className="text-xs leading-snug text-ink-soft">{a.text}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHead({ title, to }: { title: string; to: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-display text-[22px] font-semibold tracking-[-0.03em] text-ink">{title}</h2>
      <Link to={to} className="group inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">Tout voir <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
    </div>
  );
}

export function HoldingRow({ h }: { h: any }) {
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
            : h.day_change_pct != null && <div className={clsx("tabular-nums text-sm", (h.day_change ?? 0) >= 0 ? "text-gain-700" : "text-accent-700")}>{signedPct(h.day_change_pct)}</div>}
        </div>
      </Link>
    </StaggerItem>
  );
}

/** « Que voulez-vous faire ? » — the entry point of the agent workflow: the three main actions, or the request in plain words. */
export function DecisionBox({ inputRef, hasHoldings, cash = 0, onInvest }: { inputRef?: React.RefObject<HTMLTextAreaElement>; hasHoldings?: boolean; cash?: number; onInvest?: () => void }) {
  const { portfolio } = useApp();
  const nav = useNavigate();
  const [text, setText] = useState(() => new URLSearchParams(window.location.search).get("demande") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const start = async (req?: string) => {
    const r = (req ?? text).trim();
    if (!r) return;
    setBusy(true); setError(null);
    try { await launchMandate(nav, r, portfolio?.portfolio_id); } catch (e) { setError(e as ApiError); setBusy(false); }
  };
  const tiles: { icon: LucideIcon; title: string; sub: string; onClick: () => void; testid: string }[] = [
    { icon: Wallet, title: "Investir mon solde", testid: "tile-invest", onClick: () => onInvest?.(),
      sub: cash >= 50 ? `${cad(cash)} disponibles. Vous choisissez le montant.` : "Ajoutez d'abord de l'argent fictif." },
    { icon: Search, title: "Analyser un titre", testid: "tile-search", onClick: openSearch, sub: "Apple, NVIDIA, un fonds… Est-ce pour moi ?" },
    hasHoldings
      ? { icon: ShieldCheck, title: "Vérifier mon portefeuille", testid: "tile-review", onClick: () => start(REVIEW), sub: "Respecte-t-il mon profil ? Sinon, quoi corriger ?" }
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
          placeholder="J'ai 10 000 $ à investir…"
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
      <p className="mt-4 max-w-2xl text-sm text-ink-muted">Nos agents analysent votre profil, vos placements et le marché, vérifient chaque chiffre, puis vous proposent des ordres. Rien n'est fait sans votre accord.</p>
      {error && <div className="mt-3"><ErrorBox error={error} /></div>}
    </section>
  );
}

/** Empty account: connect an existing brokerage account (simulated) or enter holdings by hand. */
function Connect() {
  const { me, setPortfolioId, reload } = useApp();
  const nav = useNavigate();
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div data-tour="connect"><Glass className="mt-6 px-6 py-7 sm:px-9" glow>
      <div data-testid="connect">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-50 text-primary-600"><Link2 className="h-5 w-5" /></span>
        <h2 className="mt-4 font-display text-[30px] font-semibold leading-tight tracking-tightest text-ink">Connectez votre portefeuille</h2>
        <p className="mt-2 max-w-xl text-ink-soft">Reliez le compte où sont déjà vos placements. Nos agents vérifient tout de suite s'il respecte votre profil {me!.profile.risk_profile_label.toLowerCase()}.</p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button size="lg" variant="gold" onClick={() => nav("/connecter")} data-testid="connect-account">Connecter mon compte de placement <ArrowRight className="h-4 w-4" /></Button>
          <Button size="lg" variant="ghost" onClick={() => setManual(!manual)}><Plus className="h-4 w-4" /> Entrer mes placements à la main</Button>
        </div>
        {manual && (
          <motion.div className="mt-6" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            {busy ? <Spinner label="Les agents démarrent l'analyse…" /> : (
              <HoldingsEditor personaId={me!.profile.persona_id} submitLabel="Analyser mon portefeuille" initial={[]}
                onSaved={async (pf) => { setBusy(true); setPortfolioId(pf.portfolio_id); await reload(); await launchMandate(nav, REVIEW, pf.portfolio_id); }} />
            )}
          </motion.div>
        )}
        <p className="mt-5 text-xs text-ink-muted">Simulation : aucun identifiant n'est demandé et aucun vrai compte n'est contacté.</p>
      </div>
    </Glass></div>
  );
}

/** Does my portfolio match my profile? One meter, the problems in plain words, one action. */
function Health({ pending }: { pending?: any }) {
  const { portfolio } = useApp();
  const nav = useNavigate();
  const d = useApi<any>("/diagnosis");
  const [busy, setBusy] = useState(false);
  if (!d.data || d.data.fits === null) return null;
  const ok = d.data.fits;
  const n = d.data.problems.length;
  const CHECKS = 7; // rules the diagnosis can raise
  return (
    <div data-tour="health"><Glass className="mt-6 px-6 py-6 sm:px-9">
      <div data-testid="diagnosis">
        <div className="flex items-start gap-4">
          <span className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", ok ? "bg-gain-50 text-gain-700" : "bg-accent-50 text-accent-700")}>
            {ok ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <ShieldAlert className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[22px] font-semibold leading-snug tracking-[-0.03em] text-ink">{d.data.headline}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Meter value={(CHECKS - n) / CHECKS} tone={ok ? "gain" : n > 2 ? "loss" : "primary"} className="w-full max-w-[220px] sm:flex-1" />
              <span className="tabular-nums text-sm text-ink-muted">{ok ? "Toutes les limites respectées" : `${n} point${n > 1 ? "s" : ""} à corriger`}</span>
            </div>
          </div>
        </div>
        {!ok && (
          <Stagger className="mt-5 space-y-2.5 sm:pl-[60px]">
            {d.data.problems.slice(0, 3).map((p: any) => (
              <StaggerItem key={p.rule_id} className="text-[15px] leading-relaxed"><span className="font-medium text-ink">{p.title}.</span> <span className="text-ink-muted">{p.detail}</span></StaggerItem>
            ))}
            {n > 3 && <StaggerItem className="text-sm text-ink-muted">+ {n - 3} autre(s) point(s)</StaggerItem>}
          </Stagger>
        )}
        {!ok && (
          <div className="mt-6 sm:pl-[60px]">
            <Button variant="gold" disabled={busy} data-testid="fix-portfolio"
              onClick={async () => { if (pending) { nav(`/mandats/${pending.mandate_id}`); return; } setBusy(true); await launchMandate(nav, "Analyse et rééquilibre mon portefeuille", portfolio?.portfolio_id); }}>
              {busy ? "Les agents démarrent…" : pending ? "Voir la correction proposée" : "Demander aux agents de corriger"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </Glass></div>
  );
}

const DEPOSITS = [1000, 5000, 10000, 25000];
const INVEST_STEPS = [500, 1000, 2500, 5000, 10000, 25000, 50000];

/** Simulated cash: what can be invested now, how much of it to invest (all of it or the amount the person chooses), and fictional top-ups. */
function CashRow({ panel, setPanel }: { panel: Panel; setPanel: (p: Panel) => void }) {
  const { me, reload, portfolio } = useApp();
  const nav = useNavigate();
  const cash = me?.cash?.cash_cad ?? 0;
  const all = Math.floor(cash);
  const [invAmt, setInvAmt] = useState<number | null>(all);
  const [amount, setAmount] = useState<number | null>(5000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => { if (panel === "invest") setInvAmt(all); }, [panel]); // eslint-disable-line react-hooks/exhaustive-deps
  const steps = INVEST_STEPS.filter((v) => v < all).slice(-3);
  const invest = async () => {
    if (!invAmt) return;
    setBusy(true); setErr(null);
    const amt = Math.floor(invAmt);
    try { await launchMandate(nav, `J'ai ${cad(amt)} à investir`, portfolio?.portfolio_id, { kind: "invest", amount_cad: amt }); }
    catch (e) { setErr(e as ApiError); setBusy(false); }
  };
  const add = async () => {
    if (!amount) return;
    setBusy(true); setErr(null);
    try { await api.post("/wallet/deposit", { amount_cad: amount }); await reload(); setPanel(null); }
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
          <p className="mb-3.5 mt-0.5 text-[13px] text-ink-muted">Les agents proposent comment répartir ce montant selon votre profil. Le reste demeure disponible.</p>
          <AmountPicker value={invAmt} onChange={setInvAmt} presets={[[all, `Tout · ${cad(all)}`], ...steps]} min={50} max={all} testid="invest-amount" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="gold" onClick={invest} disabled={busy || !invAmt} data-testid="confirm-invest">
              {busy ? "Les agents démarrent…" : <>Analyser {invAmt ? cad(Math.floor(invAmt)) : ""} <ArrowRight className="h-4 w-4" /></>}
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

/** « Bien démarrer » : three steps for newcomers (tour, the essential lessons, a first decision). Hides itself when done. */
function StarterCard() {
  const { me, reload } = useApp();
  const nav = useNavigate();
  const decisions = useApi<any>("/mandates");
  const g = me?.guide;
  if (!g || g.dismissed) return null;
  const read = ESSENTIALS.filter((id) => g.lessons.includes(id));
  const decided = (decisions.data?.mandates || []).some((m: any) => m.status === "approved" || m.status === "reviewed");
  const steps = [
    { done: g.tour_done, title: "Faire le tour de l'app", sub: "2 minutes pour voir où se trouve chaque chose.", icon: Compass,
      action: () => window.dispatchEvent(new Event("aegis:tour")), cta: "Commencer" },
    { done: read.length === ESSENTIALS.length, title: "Comprendre l'essentiel", sub: `${read.length} sur ${ESSENTIALS.length} leçons : investir, le risque, diversifier.`, icon: BookOpen,
      action: () => nav(`/apprendre/${ESSENTIALS.find((id) => !g.lessons.includes(id)) || ESSENTIALS[0]}`), cta: read.length ? "Continuer" : "Lire" },
    { done: decided, title: "Prendre une première décision", sub: "Demandez aux agents comment investir votre solde.", icon: Sparkles,
      action: () => document.querySelector('[data-tour="decide"]')?.scrollIntoView({ behavior: "smooth", block: "center" }), cta: "Essayer" },
  ];
  const n = steps.filter((s) => s.done).length;
  if (n === steps.length) return null;
  const dismiss = async () => { await api.put("/guide", { dismissed: true }).catch(() => undefined); reload(); };
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
