import clsx from "clsx";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ValueChart } from "../components/charts";
import { TickerLogo, sym } from "../components/Ticker";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { useApi, useJob } from "../hooks/useApi";
import { useApp } from "../hooks/useApp";
import { friendly, kind } from "../lib/assets";
import { cad, date, pct } from "../lib/format";
import { api, ApiError } from "../services/api";
import { Glass, Segmented } from "../components/motion";
import { launchMandate } from "./Home";

const RANGES: [string, number][] = [["1M", 30], ["3M", 90], ["1A", 365], ["5A", 1830]];
const RISK: Record<string, string> = { LOW: "Faible", MEDIUM: "Moyen", HIGH: "Élevé" };

/** One investment, brokerage-app style: price, chart, risk in plain words, and « demander aux agents ». */
export default function AssetPage() {
  const { id = "" } = useParams();
  const assetId = decodeURIComponent(id);
  const { me } = useApp();
  const nav = useNavigate();
  const a = useApi<any>(`/assets/${encodeURIComponent(assetId)}/analysis?persona_id=${encodeURIComponent(me!.profile.persona_id)}`, [assetId]);
  const prices = useApi<any>(`/assets/${encodeURIComponent(assetId)}/prices`, [assetId]);
  const held = useApi<any>("/holdings");
  const [days, setDays] = useState(365);
  const series = useMemo(() => {
    const s = prices.data?.series || [];
    if (!s.length) return [];
    const end = new Date(s[s.length - 1].date);
    end.setDate(end.getDate() - days);
    return s.filter((p: any) => new Date(p.date) >= end).map((p: any) => ({ date: p.date, value: p.close }));
  }, [prices.data, days]);
  const t = a.data?.tier;
  const last = series.at(-1)?.value;
  const first = series[0]?.value;
  const chg = last && first ? last / first - 1 : null;
  const mine = (held.data?.holdings || []).find((x: any) => x.asset_id === assetId);
  const cur = prices.data?.currency || "";

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:">
      <button onClick={() => nav(-1)} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Retour</button>
      {a.loading && !a.data && <Spinner />}
      <ErrorBox error={a.error} onRetry={a.reload} />
      {a.data && (
        <>
          <div className="mt-6 flex items-center gap-4">
            <TickerLogo id={assetId} size={52} />
            <div>
              <h1 className="font-display text-4xl font-medium leading-tight text-ink">{sym(assetId)}</h1>
              <p className="text-sm text-ink-muted">{friendly(assetId, a.data.name)} · {kind(t)}</p>
            </div>
          </div>

          <section className="mt-6 border-t border-line py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="tabular font-display text-[52px] font-medium leading-none text-ink">{last != null ? `${last.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} ${cur}` : "…"}</div>
                {chg != null && <div className={clsx("tabular text-sm", chg >= 0 ? "text-gain-700" : "text-accent-700")}>{chg >= 0 ? "+" : "−"}{pct(Math.abs(chg), 2)} sur la période</div>}
              </div>
              <Segmented value={days} onChange={setDays} options={RANGES.map(([l, d]) => [d, l] as [number, string])} size="sm" />
            </div>
            <div className="mt-5">{series.length > 1 ? <ValueChart series={series} height={240} /> : <Spinner />}</div>
            <p className="mt-2 text-xs text-ink-muted">Cours de clôture en {cur}, au {date(series.at(-1)?.date)}.</p>
          </section>

          <div className="mt-4 grid grid-cols-2 border-y border-line sm:grid-cols-4">
            <Fig label="Niveau de risque" value={RISK[t.tier] || "Inconnu"} />
            <Fig label="Variation typique / an" value={`± ${pct(t.volatility, 0)}`} />
            <Fig label="Pire baisse (5 ans)" value={pct(t.max_drawdown, 0)} />
            <Fig label="Dans votre portefeuille" value={mine ? cad(mine.value_cad) : "—"} />
          </div>

          <Ask assetId={assetId} name={friendly(assetId, a.data.name)} />

          <News assetId={assetId} />
        </>
      )}
    </div>
  );
}

const AMOUNTS: [number, string][] = [[500, "500 $"], [1000, "1 000 $"], [2500, "2 500 $"], [5000, "5 000 $"]];

/** « Est-ce une bonne idée pour moi ? » — launches the agents directly on this exact security (no re-typing, no ambiguity). */
function Ask({ assetId, name }: { assetId: string; name: string }) {
  const nav = useNavigate();
  const { portfolio } = useApp();
  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      await launchMandate(nav, `Je veux mettre ${cad(amount)} dans ${sym(assetId)}`, portfolio?.portfolio_id, { kind: "buy_asset", amount_cad: amount, asset_id: assetId });
    } catch (e) { setErr(e as ApiError); setBusy(false); }
  };
  return (
    <Glass className="mt-6 p-6" glow>
      <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">Est-ce une bonne idée pour vous ?</h2>
      <p className="mt-1 text-sm text-ink-muted">Les agents vérifient {name} avec votre profil et vos placements actuels.</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={amount} onChange={setAmount} options={AMOUNTS} size="sm" />
        <Button variant="gold" onClick={go} disabled={busy} data-testid="ask-agents">{busy ? "Lancement…" : "Analyser"}<ArrowRight className="h-4 w-4" /></Button>
      </div>
      <ErrorBox error={err} />
    </Glass>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return <div className="py-4 pr-4"><div className="text-xs text-ink-muted">{label}</div><div className="tabular mt-1 font-semibold text-ink">{value}</div></div>;
}

function News({ assetId }: { assetId: string }) {
  const { me, portfolio } = useApp();
  const hype = useJob();
  const [r, setR] = useState<any>(null);
  const run = async () => {
    setR(null);
    const j = await hype.start("/hype/research", { asset_id: assetId, portfolio_id: portfolio?.portfolio_id, persona_id: me!.profile.persona_id });
    if (j?.status === "done" && j.result_ref) setR(await api.get(`/hype/research/${j.result_ref}`));
  };
  const events = (r?.events || []).filter((e: any) => e.primary_source).slice(0, 5);
  return (
    <section className="mt-6 border-t border-line">
      <div className="flex items-center justify-between gap-4 py-5">
        <div><h2 className="font-display text-xl font-medium text-ink">Nouvelles</h2><p className="text-sm text-ink-muted">Sources officielles d'abord (dépôts SEC).</p></div>
        {!r && <Button size="sm" variant="secondary" onClick={run} disabled={hype.running}>{hype.running ? "Recherche…" : "Vérifier"}</Button>}
      </div>
      <ErrorBox error={hype.error} />
      {r && (
        <ul className="divide-y divide-line border-t border-line">
          {events.map((e: any) => (
            <li key={e.event_id} className="flex items-start justify-between gap-3 py-3 text-sm">
              <div><div className="text-ink">{e.title}</div><div className="text-xs text-ink-muted">{e.provider} · {date(e.published_at)}</div></div>
              {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="shrink-0 text-ink-muted hover:text-ink" aria-label="Source"><ExternalLink className="h-4 w-4" /></a>}
            </li>
          ))}
          {!events.length && <li className="py-4 text-sm text-ink-muted">Aucun fait récent vérifié.</li>}
        </ul>
      )}
    </section>
  );
}
