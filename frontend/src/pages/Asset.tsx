import clsx from "clsx";
import { ArrowLeft, ArrowRight, Bell, BellOff, ExternalLink, Flame } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AmountPicker from "../components/AmountPicker";
import { ValueChart } from "../components/charts";
import { TickerLogo, sym } from "../components/Ticker";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useApp, useProfilePath } from "../hooks/useApp";
import { friendly, kind, sector } from "../lib/assets";
import { cad, date, money, pct } from "../lib/format";
import { useLaunch } from "../lib/launch";
import { NIVEAU, Niveau, Preuve, Signal, vous } from "../lib/ulysse";
import { api, ApiError, qs } from "../services/api";
import { Glass, Segmented } from "../components/motion";

const RANGES: [string, number][] = [["1M", 30], ["3M", 90], ["1A", 365], ["5A", 1830]];
const LEVEL_TONE: Record<string, string> = { ok: "text-gain-700", attention: "text-primary-600", pause: "text-accent-700" };

/** One investment, brokerage-app style: price, chart, risk in plain words, and « demander aux agents ». */
export default function AssetPage() {
  const { id = "" } = useParams();
  const assetId = decodeURIComponent(id);
  const { me, asOf } = useApp();
  const nav = useNavigate();
  const path = useProfilePath();
  const a = useApi<any>(`/marche/${encodeURIComponent(assetId)}${qs({ as_of: asOf, profil: me?.pid })}`, [assetId]);
  const [tick, setTick] = useState(0);
  const pos = useApi<any>(path("/positions"), [tick]);
  const [days, setDays] = useState(365);
  const by = useMemo(() => {
    const out: Record<string, Preuve> = {};
    for (const p of (a.data?.preuves || []) as Preuve[]) out[p.mesure === "rendement_total_passe" ? `${p.mesure}_${(p.parametres as any).fenetre_annees}` : p.mesure] = p;
    return out;
  }, [a.data]);
  const series = useMemo(() => {
    const s = a.data?.serie;
    if (!s?.dates?.length) return [];
    const end = new Date(s.dates[s.dates.length - 1]);
    end.setDate(end.getDate() - days);
    return s.dates.map((d: string, i: number) => ({ date: d, value: s.local[i] })).filter((p: any) => new Date(p.date) >= end);
  }, [a.data, days]);
  const last = series.at(-1)?.value;
  const first = series[0]?.value;
  const chg = last && first ? last / first - 1 : null;
  const mine = (pos.data?.lignes || []).find((x: any) => x.ticker === assetId);
  const cur = a.data?.serie?.devise || a.data?.actif?.currency || "CAD";
  const ref = a.data?.pour_toi?.signal_reference;
  const vol = by["volatilite_annualisee"];
  const mdd = by["pire_baisse"];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:">
      <button onClick={() => nav(-1)} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Retour</button>
      {a.loading && !a.data && <Spinner />}
      <ErrorBox error={a.error} onRetry={a.reload} />
      {a.data && (
        <>
          <div className="mt-6 flex items-center gap-4">
            <TickerLogo id={assetId} size={52} />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-4xl font-medium leading-tight text-ink">{sym(assetId)}</h1>
              <p className="text-sm text-ink-muted">{friendly(assetId, a.data.actif.name)} · {kind(a.data.actif)} · {sector(a.data.actif.sector)}</p>
            </div>
            <Follow ticker={assetId} />
          </div>

          <section className="mt-6 border-t border-line py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="tabular font-display text-[52px] font-medium leading-none text-ink">{last != null ? money(last, cur) : "…"}</div>
                {chg != null && <div className={clsx("tabular text-sm", chg >= 0 ? "text-gain-700" : "text-accent-700")}>{chg >= 0 ? "+" : "−"}{pct(Math.abs(chg), 2)} sur la période</div>}
              </div>
              <Segmented value={days} onChange={setDays} options={RANGES.map(([l, d]) => [d, l] as [number, string])} size="sm" />
            </div>
            <div className="mt-5">{series.length > 1 ? <ValueChart series={series} height={240} /> : <Spinner />}</div>
            <p className="mt-2 text-xs text-ink-muted">Cours de clôture en {cur === "CAD" ? "$ CA" : cur === "USD" ? "$ US" : cur}, au {date(series.at(-1)?.date)}{cur !== "CAD" && by["prix_cloture"]?.valeur?.cad ? ` (≈ ${cad(by["prix_cloture"].valeur.cad, 2)} au taux de la Banque du Canada)` : ""}.</p>
          </section>

          <div className="mt-4 grid grid-cols-2 border-y border-line sm:grid-cols-4">
            <Fig label="Selon vos règles" value={ref ? NIVEAU[ref.niveau as Niveau].short : "n/d"} tone={ref ? LEVEL_TONE[ref.niveau] : undefined} />
            <Fig label="Variation typique / an" value={vol?.statut === "ok" ? `± ${pct(vol.valeur / 100, 0)}` : "n/d"} />
            <Fig label="Pire baisse passée" value={mdd?.statut === "ok" ? pct(mdd.valeur.baisse_pct / 100, 0) : "n/d"} />
            <Fig label="Dans votre portefeuille" value={mine ? cad(mine.valeur_cad) : a.data.pour_toi?.deja_detenu_pct > 0 ? `${pct(a.data.pour_toi.deja_detenu_pct / 100, 1)} via FNB` : "—"} />
          </div>
          {ref && <p className="mt-2 text-xs text-ink-muted">« Selon vos règles » : pour une position de référence de {pct(ref.taille_reference_pct / 100, 0)} de votre portefeuille. Choisissez un montant plus bas pour une vérification précise.</p>}

          <AdvancedFacts by={by} viaFnb={a.data.pour_toi?.via_fnb || []} esg={a.data.pour_toi?.esg} />

          <Ask assetId={assetId} name={friendly(assetId, a.data.actif.name)} />

          {mine && <Sell assetId={assetId} held={mine.valeur_cad} onDone={() => setTick((t) => t + 1)} />}

          <News assetId={assetId} />
        </>
      )}
    </div>
  );
}

/** Watch list: the Vigie reads the watched securities between visits and speaks only when something is relevant. */
function Follow({ ticker }: { ticker: string }) {
  const path = useProfilePath();
  const list = useApi<{ titres: { ticker: string }[] }>(path("/surveillance"));
  const [busy, setBusy] = useState(false);
  const on = (list.data?.titres || []).some((t) => t.ticker === ticker);
  const toggle = async () => {
    const p = path("/surveillance", { as_of: null });
    if (!p) return;
    setBusy(true);
    try { await api.post(p, { ticker, retirer: on }); await list.reload(); } finally { setBusy(false); }
  };
  if (!list.data) return null;
  return (
    <Button size="sm" variant="secondary" onClick={toggle} disabled={busy} data-testid="follow" title="La Vigie vous prévient quand il se passe quelque chose d'inhabituel sur ce titre">
      {on ? <><BellOff className="h-4 w-4" /> Ne plus suivre</> : <><Bell className="h-4 w-4" /> Suivre</>}
    </Button>
  );
}

const AMOUNTS = [500, 1000, 2500, 5000];

/** « Est-ce une bonne idée pour vous ? » — checked live against the rules (code, no LLM), then the agents on this exact security. */
function Ask({ assetId, name }: { assetId: string; name: string }) {
  const launch = useLaunch();
  const { me, asOf } = useApp();
  const cash = me?.cash ?? 0;
  const [amount, setAmount] = useState<number | null>(1000);
  const [live, setLive] = useState<Signal | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(timer.current);
    setLive(null);
    if (!amount || !me?.pid) return;
    timer.current = window.setTimeout(() => {
      api.post<Signal>("/ordres/verifier", { profil: me.pid, ticker: assetId, montant_cad: amount, as_of: asOf, options: false }).then(setLive).catch(() => setLive(null));
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [amount, assetId, asOf, me?.pid]);
  const go = async () => {
    if (!amount) return;
    setBusy(true); setErr(null);
    try {
      await launch(`Je veux mettre ${cad(amount)} dans ${sym(assetId)}`, { type: "ordre", ticker: assetId, montant_cad: amount });
    } catch (e) { setErr(e as ApiError); setBusy(false); }
  };
  const over = (live?.clauses || []).filter((c) => c.statut === "depassee" && c.cause_par_intention);
  return (
    <Glass className="mt-6 p-6" glow>
      <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">Est-ce une bonne idée pour vous ?</h2>
      <p className="mt-1 text-sm text-ink-muted">Choisissez un montant : les agents vérifient {name} avec vos règles et vos placements actuels.</p>
      <div className="mt-5"><AmountPicker value={amount} onChange={setAmount} presets={AMOUNTS} min={50} max={1_000_000} testid="ask-amount" /></div>
      {amount != null && amount > cash && (
        <p className="mt-2 text-xs text-ink-muted">Votre solde disponible est de {cad(cash)} : un achat plus gros sera refusé tant que vous n'ajoutez pas de fonds (depuis l'accueil).</p>
      )}
      <div className="mt-4 min-h-[24px]" aria-live="polite" data-testid="live-check">
        {live && amount && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              live.niveau === "ok" ? "bg-gain-50 text-gain-700" : live.niveau === "pause" ? "bg-accent-50 text-accent-700" : "bg-primary-50 text-primary-600")}>{NIVEAU[live.niveau].short}</span>
            <span className="text-ink-soft">{over.length ? vous(over[0].explication) : live.niveau === "ok" ? `${cad(amount)} respecteraient toutes vos règles évaluées.` : "Une de vos règles est déjà en jeu, avant même cet achat."}</span>
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="gold" onClick={go} disabled={busy || !amount} data-testid="ask-agents">{busy ? "Lancement…" : <>Analyser {amount ? cad(amount) : ""}</>}<ArrowRight className="h-4 w-4" /></Button>
        <span className="text-xs text-ink-muted">Simulation : rien n'est acheté sans votre accord.</span>
      </div>
      <ErrorBox error={err} />
    </Glass>
  );
}

/** A simulated sale: the proceeds go to the available cash. */
function Sell({ assetId, held, onDone }: { assetId: string; held: number; onDone: () => void }) {
  const { me, asOf, reload } = useApp();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const sell = async (all: boolean) => {
    if (!me?.pid || (!all && !amount)) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.post<any>(`/profils/${encodeURIComponent(me.pid)}/vente`, { ticker: assetId, tout: all, montant_cad: all ? undefined : amount, as_of: asOf, ordre_id: crypto.randomUUID() });
      setMsg(`Vente simulée de ${cad(r.montant_cad, 2)} : le produit est ajouté à votre solde disponible.`);
      setOpen(false); await reload(); onDone();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  const presets = [500, 1000, 2500, 5000].filter((v) => v < held);
  return (
    <section className="mt-6 border-t border-line">
      <div className="flex items-center justify-between gap-4 py-5">
        <div><h2 className="font-display text-xl font-medium text-ink">Vendre</h2><p className="text-sm text-ink-muted">Vous en détenez {cad(held)}. Simulation : aucune transaction réelle.</p></div>
        {!open && <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid="sell-open">Vendre…</Button>}
      </div>
      {open && (
        <div className="pb-5">
          <AmountPicker value={amount} onChange={setAmount} presets={presets.length ? presets : [Math.floor(held)]} min={1} max={Math.floor(held)} testid="sell-amount" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => sell(false)} disabled={busy || !amount} data-testid="sell-confirm">{busy ? "Vente…" : `Vendre ${amount ? cad(amount) : ""}`}</Button>
            <Button size="sm" variant="secondary" onClick={() => sell(true)} disabled={busy}>Tout vendre</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          </div>
        </div>
      )}
      {msg && <p className="pb-4 text-sm text-gain-700" role="status">{msg}</p>}
      <ErrorBox error={err} />
    </section>
  );
}

/** ULYSSE engine: risk facts the main figures do not show (bad month, longest time below a peak, recent risk, attention, funds). */
function AdvancedFacts({ by, viaFnb, esg }: { by: Record<string, Preuve>; viaFnb: { fonds: string; poids_dans_fonds_pct: number; composition_au: string }[]; esg?: { statut: string; explication: string } | null }) {
  const cvar = by["cvar_historique"], uw = by["duree_max_sous_l_eau"], ratio = by["ratio_risque_recent"], hype = by["engouement"];
  const r = ratio?.statut === "ok" ? Number(ratio.valeur) : null;
  if (!cvar && !uw && r == null) return null;
  const yr = (d?: string) => (d ? d.slice(0, 4) : "");
  return (
    <section className="mt-6" data-testid="advanced-facts">
      <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">Ce que les prix passés montrent aussi</h2>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {cvar?.statut === "ok" && (
          <FactTile label="Un très mauvais mois" value={pct(cvar.valeur.cvar_pct / 100, 0)}
            note="Perte moyenne des 5 % pires périodes de 20 jours de bourse (5 dernières années)." bad={cvar.valeur.cvar_pct < -15} />
        )}
        {uw?.statut === "ok" && (
          <FactTile label="Plus long passage sous un sommet" value={`${Number(uw.valeur.annees).toFixed(1).replace(".", ",")} an${uw.valeur.annees >= 2 ? "s" : ""}`}
            note={`De ${yr(uw.valeur.debut)} à ${yr(uw.valeur.fin)}${uw.valeur.termine ? "" : ", toujours en cours"} : le temps qu'il a fallu pour revenir au sommet précédent.`}
            bad={uw.valeur.annees > 2} />
        )}
        {r != null && (
          <FactTile label="Risque des dernières semaines" value={`×${r.toFixed(2).replace(".", ",")}`}
            note={r > 1.25 ? "Plus agité que d'habitude en ce moment." : r < 0.8 ? "Plus calme que d'habitude en ce moment." : "Proche de son habitude."}
            bad={r > 1.25} />
        )}
      </div>
      {hype?.statut === "ok" && hype.valeur?.engouement && (
        <p className="mt-3 flex gap-2.5 rounded-2xl bg-accent-50 px-4 py-3 text-sm leading-snug text-accent-700" data-testid="asset-attention">
          <Flame className="mt-0.5 h-4 w-4 shrink-0" />Attention inhabituelle : pages vues {num(hype.valeur.vues_vs_habituel)} × et volume {num(hype.valeur.volume_vs_habituel)} × leur niveau habituel (plus inhabituelle que {num(hype.valeur.plus_inhabituel_que_pct_des_jours)} % des jours passés). Une description du présent, pas une raison d'acheter.
        </p>
      )}
      {viaFnb.length > 0 && <p className="mt-3 text-sm text-ink-muted">Vous en détenez déjà indirectement via {viaFnb.map((v) => `${sym(v.fonds)} (${num(v.poids_dans_fonds_pct)} % du fonds au ${date(v.composition_au)})`).join(" et ")}.</p>}
      {esg && esg.statut !== "respectee" && esg.statut !== "non_applicable" && <p className="mt-3 rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm text-ink-soft">Votre critère ESG : {vous(esg.explication)}</p>}
      <p className="mt-2 text-xs text-ink-muted">Calculé sur les cours publics jusqu'à la date simulée (Yahoo Finance, jeu de données du datathon), en dollars canadiens.</p>
    </section>
  );
}
const num = (x: number | null | undefined) => (x == null ? "n/d" : Number(x).toLocaleString("fr-CA", { maximumFractionDigits: 1 }));

function FactTile({ label, value, note, bad }: { label: string; value: string; note: string; bad?: boolean }) {
  return (
    <div className="rounded-[20px] bg-surface/80 p-4 hairline">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={clsx("tabular-nums mt-1 font-display text-2xl font-semibold tracking-tight", bad ? "text-accent-700" : "text-ink")}>{value}</div>
      <p className="mt-1 text-xs leading-snug text-ink-muted">{note}</p>
    </div>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="py-4 pr-4"><div className="text-xs text-ink-muted">{label}</div><div className={clsx("tabular mt-1 font-semibold", tone || "text-ink")}>{value}</div></div>;
}

/** Official filings (SEC EDGAR) and press coverage (GDELT), up to the simulated date only. */
function News({ assetId }: { assetId: string }) {
  const { asOf } = useApp();
  const [on, setOn] = useState(false);
  const r = useApi<{ depots: Preuve; articles: Preuve }>(on ? `/marche/${encodeURIComponent(assetId)}/nouvelles${qs({ as_of: asOf })}` : null, [assetId]);
  const filings: any[] = r.data?.depots?.statut === "ok" ? r.data.depots.valeur?.depots || [] : [];
  const articles: any[] = r.data?.articles?.statut === "ok" ? r.data.articles.valeur?.articles || [] : [];
  return (
    <section className="mt-6 border-t border-line">
      <div className="flex items-center justify-between gap-4 py-5">
        <div><h2 className="font-display text-xl font-medium text-ink">Nouvelles</h2><p className="text-sm text-ink-muted">Sources officielles d'abord (dépôts SEC), puis la presse. Seulement ce qui était publié au {date(asOf)}.</p></div>
        {!r.data && <Button size="sm" variant="secondary" onClick={() => setOn(true)} disabled={r.loading}>{r.loading ? "Recherche…" : "Vérifier"}</Button>}
      </div>
      <ErrorBox error={r.error} />
      {r.data && (
        <ul className="divide-y divide-line border-t border-line">
          {filings.slice(0, 5).map((e: any) => (
            <li key={e.url} className="flex items-start justify-between gap-3 py-3 text-sm">
              <div><div className="text-ink">{e.forme}{e.objet ? ` · ${e.objet}` : ""}</div><div className="text-xs text-ink-muted">SEC EDGAR · {date(e.date)}</div></div>
              <a href={e.url} target="_blank" rel="noreferrer" className="shrink-0 text-ink-muted hover:text-ink" aria-label="Source"><ExternalLink className="h-4 w-4" /></a>
            </li>
          ))}
          {articles.slice(0, 5).map((e: any) => (
            <li key={e.url} className="flex items-start justify-between gap-3 py-3 text-sm">
              <div><div className="text-ink">{e.titre}</div><div className="text-xs text-ink-muted">{e.source} · {date(e.date)}{e.reprises > 1 ? ` · repris ${e.reprises} fois` : ""} · presse, non confirmé</div></div>
              <a href={e.url} target="_blank" rel="noreferrer" className="shrink-0 text-ink-muted hover:text-ink" aria-label="Source"><ExternalLink className="h-4 w-4" /></a>
            </li>
          ))}
          {!filings.length && !articles.length && <li className="py-4 text-sm text-ink-muted">{r.data.depots?.note || r.data.articles?.note || "Aucun fait récent vérifié."}</li>}
        </ul>
      )}
    </section>
  );
}
