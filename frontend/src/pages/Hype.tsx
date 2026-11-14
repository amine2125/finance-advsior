import { Brain, FlaskConical, Radar, Scale, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ClaimsLedger, CoverageMatrix, EventsTimeline, ImpactPanel, LensTable } from "../components/analysis";
import { ActivityTimeline, Button, Card, ErrorBox, Input, Loading, Metric, Notice, PageHeader, StatusPill, SupervisorStatus, Table, TierBadge } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useApi, useJob } from "../hooks/useApi";
import { date, dateTime, num, pct } from "../lib/format";
import { api } from "../services/api";

const COMP_FR: Record<string, string> = { news_volume: "Volume d'actualités vs ligne de base", trading_volume: "Volume d'échanges inhabituel", price_momentum: "Amplitude du mouvement de prix (20 obs.)", source_diversity: "Diversité des sources indépendantes" };

export default function Hype() {
  const { portfolioId, personaId } = useApp();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const trending = useApi<any>("/hype/trending");
  const [q, setQ] = useState(params.get("asset") || "Bitcoin");
  const [resolved, setResolved] = useState<any>(null);
  const [question, setQuestion] = useState("Tout le monde en parle et c'est viral. Est-ce cohérent avec mon profil prudent ?");
  const [amount, setAmount] = useState("5000");
  const [fixture, setFixture] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const { job, running, error, start } = useJob();
  useEffect(() => { const id = params.get("research"); if (id) api.get(`/hype/research/${id}`).then(setRes).catch(setErr); }, []); // eslint-disable-line
  const resolve = async () => { setErr(null); try { setResolved(await api.get(`/assets/search?q=${encodeURIComponent(q)}`)); } catch (e) { setErr(e); } };
  const run = async (assetId: string) => {
    setRes(null);
    const j = await start("/hype/research", { asset_id: assetId, question, persona_id: personaId, portfolio_id: portfolioId, amount_cad: +amount || null, use_fixture: fixture });
    if (j?.status === "done" && j.result_ref) setRes(await api.get(`/hype/research/${j.result_ref}`));
  };
  const att = res?.attention;
  const l3 = res?.lenses?.["3"];
  return (
    <div>
      <PageHeader title="Hype Intelligence" subtitle="Pourquoi un actif attire l'attention, ce qui est vérifié, et ce que cet actif changerait à VOTRE portefeuille. L'attention du marché, le risque de l'actif, l'impact sur le portefeuille et l'adéquation au profil sont quatre sorties séparées." />
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card title="Enquête" accent="violet">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input label="Actif (symbole, nom ou alias)" value={q} onChange={setQ} placeholder="bitcoin, NVDA, Shopify…" />
            <Button onClick={resolve} className="self-end"><Search className="h-4 w-4" /> Identifier</Button>
          </div>
          {resolved && (
            <div className="mt-3 rounded-xl bg-ink-850/70 p-3 text-sm">
              {resolved.status === "resolved" && <div>Identifié sans ambiguïté : <b className="text-white">{resolved.asset_id}</b> <span className="text-xs text-slate-500">({resolved.match})</span></div>}
              {resolved.status === "ambiguous" && <div><div className="text-amber-200">{resolved.message}</div><div className="mt-2 flex flex-wrap gap-2">{resolved.candidates.map((c: any) => <button key={c.asset_id} onClick={() => setResolved({ status: "resolved", asset_id: c.asset_id, match: "choisi" })} className="rounded-lg bg-ink-800 px-2 py-1 text-xs hover:bg-ink-700">{c.asset_id} – {c.name}</button>)}</div></div>}
              {resolved.status === "not_in_universe" && <div><div className="text-amber-200">{resolved.message}</div>{resolved.external_crypto_matches?.length > 0 && <div className="mt-1 text-xs text-slate-400">CoinGecko (identification seulement) : {resolved.external_crypto_matches.slice(0, 4).map((c: any) => `${c.name} (${c.symbol})`).join(", ")}</div>}<div className="text-[11px] text-slate-500">{resolved.external_note}</div></div>}
            </div>
          )}
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_160px]">
            <Input label="Question" value={question} onChange={setQuestion} />
            <Input label="Ajout hypothétique (CAD)" type="number" value={amount} onChange={setAmount} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={fixture} onChange={(e) => setFixture(e.target.checked)} /> Mode démonstration hors ligne (fixture d'actualités FICTIVE, clairement étiquetée)</label>
            <Button className="ml-auto" disabled={running || resolved?.status !== "resolved"} onClick={() => run(resolved.asset_id)}><Sparkles className="h-4 w-4" /> {running ? "Recherche…" : "Lancer la recherche"}</Button>
          </div>
          {running && job && <div className="mt-3 rounded-xl bg-ink-850/70 p-3"><ActivityTimeline steps={job.steps} /></div>}
          <ErrorBox error={error || err} />
        </Card>
        <Card title="Tendances CoinGecko (24 h)" subtitle="Attention mesurée en direct, pas une qualité">
          {trending.loading ? <Loading /> : trending.data?.status === "OK" ? (
            <ol className="space-y-1 text-xs">{trending.data.trending.coins.slice(0, 10).map((c: any) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-ink-800">
                <span><span className="text-slate-500">#{c.rank}</span> {c.name} <span className="text-slate-500">{c.symbol}</span></span>
                {c.in_universe ? <button onClick={() => { setQ(c.in_universe); setResolved({ status: "resolved", asset_id: c.in_universe, match: "tendance" }); }} className="text-aegis-300 hover:underline">{c.in_universe}</button> : <span className="text-[10px] text-slate-600">hors univers</span>}
              </li>))}</ol>
          ) : <div className="text-xs text-amber-200"><StatusPill status="UNAVAILABLE" /> {trending.data?.error}</div>}
          <p className="mt-2 text-[10px] text-slate-500">Source : CoinGecko API publique · {dateTime(trending.data?.trending?.retrieved_at)}</p>
        </Card>
      </div>
      {res && (
        <div className="mt-5 space-y-5" data-testid="hype-result">
          {res.is_fixture && <Notice tone="fixture"><b>{res.fixture_label}</b> — les éditeurs « .test » et manchettes sont inventés pour démontrer la déduplication et la vérification. Aucune de ces manchettes n'est une nouvelle réelle.</Notice>}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900/60 p-4">
            <div><div className="text-lg font-semibold text-white">{res.name} <span className="text-sm text-slate-400">{res.asset_id}</span></div>
              <div className="text-xs text-slate-500">{res.identity.currency} · {res.identity.exchange || ""} {res.identity.cik && `· CIK ${res.identity.cik}`} {res.identity.coingecko_id && `· CoinGecko ${res.identity.coingecko_id}`} · prix historiques au {date(res.data_as_of)} · recherche {dateTime(res.created_at)}</div></div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => nav(`/debate?asset=${res.asset_id}`)}><Scale className="h-4 w-4" /> Débattre de la thèse</Button>
              <Link to={`/scenarios?asset=${res.asset_id}`} className="inline-flex items-center gap-2 rounded-xl border border-ink-600 px-3.5 py-2 text-sm hover:border-aegis-500/60"><FlaskConical className="h-4 w-4" /> Laboratoire</Link>
              <Link to="/xray" className="inline-flex items-center gap-2 rounded-xl border border-ink-600 px-3.5 py-2 text-sm hover:border-aegis-500/60"><Radar className="h-4 w-4" /> Radiographie</Link>
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
            <Card title="1 · Attention du marché" subtitle={att?.label} accent="violet">
              {att?.status === "OK" ? <><div className="text-4xl font-bold text-white">{num(att.value, 1)}<span className="text-base text-slate-500"> / 100</span></div><div className="text-xs text-slate-400">attention {att.band} · couverture des composantes {pct(att.coverage, 0)}</div></>
                : <div><StatusPill status="UNAVAILABLE" /><p className="mt-2 text-xs text-slate-400">{att?.reason}</p></div>}
              <ul className="mt-3 space-y-1 text-[11px]">{Object.entries<any>(att?.components || {}).map(([k, c]) => <li key={k} className="flex justify-between gap-2"><span className="text-slate-400">{COMP_FR[k] || k}</span>{c.status === "OK" ? <span className="tabular-nums text-slate-200">{num(c.score, 0)}</span> : <span className="text-amber-300/80">indisponible</span>}</li>)}</ul>
              {res.search_trending && <div className="mt-2 text-[11px] text-slate-400">CoinGecko : {res.search_trending.in_top ? `rang ${res.search_trending.rank} des recherches` : "absent du top"} (affiché à part)</div>}
              {res.divergence && <div className={`mt-2 text-[11px] ${res.divergence.flag ? "text-amber-300" : "text-slate-500"}`}>{res.divergence.text}</div>}
            </Card>
            <Card title="2 · Risque de l'actif" subtitle="Lentille 3 – données historiques" accent="rose">
              <TierBadge tier={res.tier?.tier} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Metric label="Volatilité" value={pct(l3?.volatility)} hint={`√${l3?.annualization}`} />
                <Metric label="Perte max." value={pct(l3?.drawdown?.max_drawdown)} tone="bad" hint={`${l3?.drawdown?.peak_date} → ${l3?.drawdown?.trough_date}`} />
                <Metric label="Vol. EWMA" value={pct(l3?.ewma_vol)} />
                <Metric label="Recul actuel" value={pct(l3?.drawdown?.current_drawdown)} />
              </div>
              <div className="mt-2 text-[11px] text-slate-500">{res.tier?.rules?.join(" · ")}</div>
            </Card>
            <Card title="3 · Impact sur le portefeuille" subtitle={res.portfolio_impact ? `ajout hypothétique de ${amount} $` : "aucun portefeuille"} accent="amber">
              {res.portfolio_impact ? (
                <div className="space-y-1 text-xs">{res.portfolio_impact.rows.filter((r: any) => ["pf.vol", "pf.mdd", "pf.hhi", "pf.growth_share"].includes(r.metric)).map((r: any) => (
                  <div key={r.metric} className="flex justify-between"><span className="text-slate-400">{r.label}</span><span className="tabular-nums text-slate-200">{r.unit === "pct" ? `${pct(r.before)} → ${pct(r.after)}` : `${num(r.before, 3)} → ${num(r.after, 3)}`}</span></div>))}</div>
              ) : <p className="text-xs text-slate-400">Sélectionnez un portefeuille pour calculer l'impact.</p>}
            </Card>
            <Card title="4 · Adéquation au profil" subtitle="Budget de risque après l'ajout" accent="teal">
              {res.portfolio_impact ? (
                <>
                  <ul className="space-y-1 text-xs">{res.portfolio_impact.budget.map((b: any) => <li key={b.rule_id} className="flex items-center justify-between gap-2"><span className="text-slate-400">{b.label}</span><StatusPill status={b.after_status} /></li>)}</ul>
                  {res.portfolio_impact.new_breaches.length > 0 && <div className="mt-2 text-xs font-semibold text-rose-300">Nouveau dépassement : {res.portfolio_impact.new_breaches.map((b: any) => `${b.label} ${b.after} (limite ${b.limit})`).join(" ; ")}</div>}
                </>
              ) : <p className="text-xs text-slate-400">n/d</p>}
              <div className="mt-3"><SupervisorStatus status={res.status_rule.default} /><p className="mt-1 text-[11px] text-slate-500">Statuts permis (règle 8A.9) : {res.status_rule.allowed.join(", ")}. {res.status_rule.reason}</p></div>
            </Card>
          </div>
          {res.biases?.length > 0 && <Card title="Vérification des biais comportementaux">{res.biases.map((b: any) => <div key={b.bias} className="mb-2 text-sm text-violet-100"><Brain className="mr-1 inline h-4 w-4 text-violet-300" /><b>{b.label}</b> — {b.pattern_description} {b.educational_response} <span className="text-[11px] text-violet-300/60">{b.privacy}</span></div>)}</Card>}
          {res.forecast_policy && <Card title="« Où cela va-t-il ? » — politique de prévision" accent="amber"><div className="grid gap-3 md:grid-cols-2">{res.forecast_policy.parts.map((p: any) => <div key={p.title} className="rounded-xl bg-ink-850/70 p-3 text-sm"><div className="mb-1 font-semibold text-white">{p.title}</div><p className="text-slate-300">{p.text}</p></div>)}</div></Card>}
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Chronologie des événements" subtitle="Vert = source primaire (dépôt officiel); gris = couverture médiatique dédupliquée"><EventsTimeline events={res.events} /></Card>
            <Card title="Registre des affirmations" subtitle={`${res.independence.articles} articles → ${res.independence.independent_reports} rapports indépendants (${res.independence.syndicated_or_duplicate} copies). ${res.independence.rule}`}><ClaimsLedger claims={res.claims} evidence={res.evidence} /></Card>
          </div>
          {res.portfolio_impact && <Card title="Impact détaillé et taille de position éducative"><ImpactPanel impact={res.portfolio_impact} /></Card>}
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Lentilles d'analyse (6)"><LensTable lenses={res.lenses} /></Card>
            <Card title="Matrice de couverture des modes d'échec"><CoverageMatrix rows={res.coverage_matrix} /></Card>
          </div>
          <Card title="Couverture des données" subtitle={`${pct(res.coverage_ratio, 0)} des familles de sources applicables disponibles`}>
            <Table head={["Famille de sources", "Statut", "Détail"]} rows={res.coverage_meter.map((c: any) => [c.family, <StatusPill status={c.status} />, <span className="text-[11px] text-slate-400">{c.detail || c.reason}</span>])} />
            <div className="mt-3 text-[11px] text-slate-500">Appels d'outils : {res.tool_calls.map((c: any) => `${c.tool} (${c.provider}) = ${c.status}${c.error ? ` – ${c.error}` : ""} · ${c.latency_ms} ms`).join(" | ") || "aucun"}</div>
          </Card>
        </div>
      )}
    </div>
  );
}
