import clsx from "clsx";
import { ArrowRight, ArrowUpRight, Check, Plus, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ValueChart } from "../components/charts";
import HoldingsEditor from "../components/HoldingsEditor";
import { TickerLogo, sym } from "../components/Ticker";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useApp } from "../hooks/useApp";
import { friendly } from "../lib/assets";
import { cad, date, pct } from "../lib/format";
import { api, ApiError } from "../services/api";

const SUGGESTIONS = ["J'ai 5 000 $ à investir", "Je veux 2 000 $ de NVIDIA", "Rééquilibre mon portefeuille"];
const RANGES: [string, number, string][] = [["1M", 30, "sur 1 mois"], ["3M", 90, "sur 3 mois"], ["1A", 365, "sur 1 an"], ["5A", 1825, "sur 5 ans"]];

/** Starts the agents on a request and opens the live run. */
export async function launchMandate(nav: (to: string) => void, request: string, portfolioId?: string) {
  const j = await api.post<{ job_id: string }>("/mandates", { request, portfolio_id: portfolioId });
  nav(`/mandats/en-cours/${j.job_id}?q=${encodeURIComponent(request)}`);
}
export const REVIEW = "Analyse mon portefeuille et dis-moi s'il respecte mon profil";

export const signed = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${cad(Math.abs(v), d)}`);
export const signedPct = (v: number | null | undefined) => (v == null ? "" : `${v >= 0 ? "+" : "−"}${pct(Math.abs(v), 2)}`);

/** Accueil : la valeur en grand, son évolution, « que voulez-vous faire ? », vos placements, l'activité. Pas de boîtes. */
export default function Home() {
  const { me } = useApp();
  const p = me!.profile;
  const h = useApi<any>("/holdings");
  const [days, setDays] = useState(365);
  const hist = useApi<any>(`/history?days=${days}`, [days]);
  const act = useApi<any>("/activity");
  const ask = useRef<HTMLTextAreaElement>(null);
  const has = (h.data?.holdings || []).length > 0;
  const pending = (act.data?.items || []).find((i: any) => i.kind === "proposed");
  const ch = hist.data?.change_cad;
  const range = RANGES.find((r) => r[1] === days)!;

  return (
    <div className="mx-auto max-w-[880px] px-5 pb-16 sm:px-8">
      {/* value */}
      <section className="pt-10 sm:pt-14">
        <p className="text-sm text-ink-muted">Mon portefeuille · profil {p.risk_profile_label.toLowerCase()}</p>
        <p className="tabular mt-2 font-display text-[52px] font-medium leading-none tracking-tight text-ink sm:text-[68px]" data-testid="total-value">
          {h.data ? cad(h.data.total_value_cad, 2) : "…"}
        </p>
        {has && h.data.gain_cad != null && (
          <p className={clsx("tabular mt-3 text-[17px]", h.data.gain_cad >= 0 ? "text-emerald-700" : "text-accent-700")}>
            {signed(h.data.gain_cad)} ({signedPct(h.data.gain_pct)}) <span className="text-ink-muted">depuis vos achats</span>
          </p>
        )}
        {has && ch != null && h.data.gain_cad == null && (
          <p className={clsx("tabular mt-3 text-[17px]", ch >= 0 ? "text-emerald-700" : "text-accent-700")}>
            {signed(ch)} ({signedPct(hist.data.change_pct)}) <span className="text-ink-muted">{range[2]}</span>
          </p>
        )}
        {has && h.data.day_change_cad != null && (
          <p className="tabular mt-1 text-sm text-ink-muted">Aujourd'hui <span className={h.data.day_change_cad >= 0 ? "text-emerald-700" : "text-accent-700"}>{signed(h.data.day_change_cad)}</span></p>
        )}
      </section>

      {/* chart, full width, no frame */}
      <section className="-mx-1 mt-8">
        {hist.loading && !hist.data ? <div className="h-[280px]" /> : hist.data?.series?.length > 1 ? <ValueChart series={hist.data.series} height={280} />
          : null}
        {hist.data?.series?.length > 1 && (
          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="flex gap-1">
              {RANGES.map(([l, d]) => (
                <button key={l} onClick={() => setDays(d)} className={clsx("rounded-full px-3.5 py-1.5 text-sm font-medium transition", days === d ? "bg-ink text-white" : "text-ink-muted hover:text-ink")}>{l}</button>
              ))}
            </div>
            <p className="hidden text-xs text-ink-muted sm:block">Vos placements actuels, s'ils avaient été détenus depuis le {date(hist.data.series[0].date)}</p>
          </div>
        )}
      </section>

      {h.data && !has && <Connect />}
      {has && <Health pending={pending} />}

      {pending && !has && (
        <Link to={`/mandats/${pending.mandate_id}`} className="group mt-12 flex items-center gap-4 border-y border-line py-5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold-500" />
          <div className="min-w-0 flex-1"><div className="font-medium text-ink">Une proposition attend votre décision</div><div className="truncate text-sm text-ink-muted">{pending.detail}</div></div>
          <ArrowRight className="h-5 w-5 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
        </Link>
      )}

      {/* decision */}
      <DecisionBox inputRef={ask} />

      {/* holdings + activity */}
      {has && <div className="mt-16 grid gap-14 lg:grid-cols-[1fr_280px]">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-medium text-ink">Placements</h2>
            {has && <Link to="/placements" className="text-sm text-ink-muted hover:text-ink">Tout voir</Link>}
          </div>
          {h.loading && !h.data ? <Spinner /> : has ? (
            <ul className="mt-3 divide-y divide-line">{h.data.holdings.slice(0, 6).map((x: any) => <HoldingRow key={x.asset_id} h={x} />)}</ul>
          ) : (
            <div className="mt-4">
              <p className="text-ink-muted">Ajoutez ce que vous détenez déjà, ici ou ailleurs, pour que les agents en tiennent compte.</p>
              <Link to="/placements?ajouter=1"><Button variant="secondary" className="mt-4"><Plus className="h-4 w-4" /> Ajouter mes placements</Button></Link>
            </div>
          )}
        </section>
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-medium text-ink">Activité</h2>
            <Link to="/decisions" className="text-sm text-ink-muted hover:text-ink">Tout voir</Link>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {(act.data?.items || []).slice(0, 5).map((i: any, n: number) => {
              const body = (
                <div className="py-3.5">
                  <div className="text-xs text-ink-muted">{date(i.at)}</div>
                  <div className="mt-0.5 line-clamp-2 text-sm leading-snug text-ink">{i.title}</div>
                </div>
              );
              return <li key={n}>{i.mandate_id ? <Link to={`/mandats/${i.mandate_id}`} className="block hover:opacity-70">{body}</Link> : body}</li>;
            })}
          </ul>
        </section>
      </div>}
      <ErrorBox error={h.error} />
    </div>
  );
}

export function HoldingRow({ h }: { h: any }) {
  const up = (h.day_change ?? 0) >= 0;
  return (
    <li>
      <Link to={`/placement/${encodeURIComponent(h.asset_id)}`} className="group flex items-center gap-4 py-4" data-testid="holding-row">
        <TickerLogo id={h.asset_id} size={42} />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink group-hover:underline">{sym(h.asset_id)}</div>
          <div className="truncate text-sm text-ink-muted">{friendly(h.asset_id, h.name)}{h.accounts?.length ? ` · ${h.accounts.join(", ")}` : ""}</div>
        </div>
        <div className="text-right">
          <div className="tabular font-medium text-ink">{cad(h.value_cad, 2)}</div>
          {h.gain_cad != null
            ? <div className={clsx("tabular text-sm", h.gain_cad >= 0 ? "text-emerald-700" : "text-accent-700")}>{signed(h.gain_cad, 0)} ({signedPct(h.gain_pct)})</div>
            : h.day_change_pct != null && <div className={clsx("tabular text-sm", up ? "text-emerald-700" : "text-accent-700")}>{signedPct(h.day_change_pct)}</div>}
        </div>
      </Link>
    </li>
  );
}

/** « Que voulez-vous faire ? » — the entry point of the agent workflow: one large line, no box. */
export function DecisionBox({ inputRef }: { inputRef?: React.RefObject<HTMLTextAreaElement> }) {
  const { portfolio } = useApp();
  const nav = useNavigate();
  const [text, setText] = useState(() => new URLSearchParams(window.location.search).get("demande") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const start = async (req?: string) => {
    const r = (req ?? text).trim();
    if (!r) return;
    setBusy(true); setError(null);
    try {
      const j = await api.post<{ job_id: string }>("/mandates", { request: r, portfolio_id: portfolio?.portfolio_id });
      nav(`/mandats/en-cours/${j.job_id}?q=${encodeURIComponent(r)}`);
    } catch (e) { setError(e as ApiError); setBusy(false); }
  };
  return (
    <section className="mt-16">
      <h2 className="font-display text-[32px] font-medium leading-tight text-ink sm:text-[40px]">Que voulez-vous faire<br className="hidden sm:block" /> avec votre argent ?</h2>
      <form onSubmit={(e) => { e.preventDefault(); start(); }} className="mt-6 flex items-end gap-3 border-b-2 border-ink pb-2">
        <textarea ref={inputRef} rows={1} value={text} onChange={(e) => setText(e.target.value)} data-testid="mandate-input"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); start(); } }}
          placeholder="J'ai 10 000 $ à investir…"
          className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent py-2 text-[22px] text-ink outline-none placeholder:text-ink-muted/60 sm:text-[26px]" />
        <button type="submit" disabled={busy || !text.trim()} data-testid="mandate-start" aria-label="Lancer l'analyse"
          className="mb-1 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold-500 text-ink transition hover:bg-gold-400 disabled:bg-canvas disabled:text-ink-muted">
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" /> : <ArrowUpRight className="h-5 w-5" />}
        </button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((e) => <button key={e} onClick={() => { setText(e); start(e); }} className="rounded-full bg-canvas px-4 py-2 text-sm text-ink transition hover:bg-line">{e}</button>)}
      </div>
      <p className="mt-4 text-sm text-ink-muted">Nos agents analysent votre profil, vos placements et le marché, vérifient chaque chiffre, puis vous proposent des ordres. Rien n'est fait sans votre accord.</p>
      {error && <div className="mt-3"><ErrorBox error={error} /></div>}
    </section>
  );
}

/** Empty account: connect an existing brokerage account (simulated) or enter holdings by hand; the agents analyse right away. */
function Connect() {
  const { me, setPortfolioId, reload } = useApp();
  const nav = useNavigate();
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <section className="mt-12 border-y border-line py-8" data-testid="connect">
      <h2 className="font-display text-[32px] font-medium leading-tight text-ink">Connectez votre portefeuille</h2>
      <p className="mt-2 max-w-xl text-ink-soft">Reliez le compte où sont déjà vos placements. Nos agents vérifient tout de suite s'il respecte votre profil {me!.profile.risk_profile_label.toLowerCase()}.</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => nav("/connecter")} data-testid="connect-account">Connecter mon compte de placement <ArrowRight className="h-4 w-4" /></Button>
        <Button size="lg" variant="ghost" onClick={() => setManual(!manual)}>Entrer mes placements à la main</Button>
      </div>
      {manual && (
        <div className="mt-6">
          {busy ? <Spinner label="Les agents démarrent l'analyse…" /> : (
            <HoldingsEditor personaId={me!.profile.persona_id} submitLabel="Analyser mon portefeuille" initial={[]}
              onSaved={async (pf) => { setBusy(true); setPortfolioId(pf.portfolio_id); await reload(); await launchMandate(nav, REVIEW, pf.portfolio_id); }} />
          )}
        </div>
      )}
      <p className="mt-5 flex items-center gap-2 text-xs text-ink-muted"><Upload className="h-3.5 w-3.5" /> Simulation : aucun identifiant n'est demandé et aucun vrai compte n'est contacté.</p>
    </section>
  );
}

/** Does my portfolio match my profile? The answer in one line, the problems in plain words, and a button to fix it. */
function Health({ pending }: { pending?: any }) {
  const { portfolio } = useApp();
  const nav = useNavigate();
  const d = useApi<any>("/diagnosis");
  const [busy, setBusy] = useState(false);
  if (!d.data || d.data.fits === null) return null;
  const ok = d.data.fits;
  return (
    <section className="mt-12 border-y border-line py-7" data-testid="diagnosis">
      <div className="flex items-start gap-3">
        <span className={clsx("mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full", ok ? "bg-emerald-600" : "bg-accent-600")}>
          {ok ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : <span className="text-xs font-bold text-white">{d.data.problems.length}</span>}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-medium leading-snug text-ink">{d.data.headline}</h2>
          {!ok && (
            <ul className="mt-3 space-y-2">
              {d.data.problems.slice(0, 3).map((p: any) => (
                <li key={p.rule_id} className="text-[15px]"><span className="font-medium text-ink">{p.title}.</span> <span className="text-ink-muted">{p.detail}</span></li>
              ))}
              {d.data.problems.length > 3 && <li className="text-sm text-ink-muted">+ {d.data.problems.length - 3} autre(s) point(s)</li>}
            </ul>
          )}
          {!ok && (
            <Button className="mt-5" disabled={busy} data-testid="fix-portfolio"
              onClick={async () => { if (pending) { nav(`/mandats/${pending.mandate_id}`); return; } setBusy(true); await launchMandate(nav, "Analyse et rééquilibre mon portefeuille", portfolio?.portfolio_id); }}>
              {busy ? "Les agents démarrent…" : pending ? "Voir la correction proposée" : "Demander aux agents de corriger"} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
