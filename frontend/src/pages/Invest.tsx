import clsx from "clsx";
import { ArrowLeft, CheckCircle2, ChevronDown, ExternalLink, MessageCircle, Plus, Search, Sparkles, XCircle, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PriceChart } from "../components/charts";
import { TIER_TONE } from "../components/HoldingsEditor";
import { AgentSteps, Badge, Button, Card, Disclaimer, ErrorBox, Explain, inputCls, PageTitle, Spinner } from "../components/ui";
import { useApi, useJob } from "../hooks/useApi";
import { useApp } from "../hooks/useApp";
import { cad, CLASS_FR, date, pct, sector, TIER_FR } from "../lib/format";
import { api, ApiError } from "../services/api";

/** The investing screen: « Puis-je investir X $ dans Y ? » → a clear verdict for MY profile, with its reasons. */
export default function Invest() {
  const { assetId } = useParams();
  const { me } = useApp();
  const p = me!.profile;
  return (
    <div className="space-y-6">
      {assetId ? (
        <Link to="/investir" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Retour</Link>
      ) : (
        <PageTitle title="Investir" subtitle={`Choisissez un placement et un montant : on vérifie s'il convient à votre profil (${p.risk_profile_label.toLowerCase()}, horizon ${p.horizon_years_min} ans) avant tout.`} />
      )}
      <CheckBox key={assetId || "none"} initialAsset={assetId ? decodeURIComponent(assetId) : ""} />
      {assetId ? <AssetInfo id={decodeURIComponent(assetId)} /> : <Options />}
      <Disclaimer />
    </div>
  );
}

function CheckBox({ initialAsset }: { initialAsset: string }) {
  const { me, portfolio, reload, setPortfolioId } = useApp();
  const nav = useNavigate();
  const assets = useApi<any>("/assets");
  const [asset, setAsset] = useState(initialAsset);
  const [q, setQ] = useState("");
  const [amount, setAmount] = useState("1000");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const byId = useMemo(() => Object.fromEntries((assets.data?.assets || []).map((a: any) => [a.asset_id, a])), [assets.data]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? (assets.data?.assets || []).filter((a: any) => a.asset_id.toLowerCase().includes(s) || a.name.toLowerCase().includes(s)).slice(0, 6) : [];
  }, [q, assets.data]);

  const check = async (a = asset, amt = amount) => {
    if (!a || !(+amt > 0)) return;
    setBusy(true);
    setError(null);
    setRes(null);
    try { setRes(await api.post("/invest/check", { asset_id: a, amount_cad: +amt, portfolio_id: portfolio?.portfolio_id })); }
    catch (e) { setError(e as ApiError); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (initialAsset) check(initialAsset); }, []); // eslint-disable-line

  const add = async (amt: number) => {
    setAdding(true);
    setError(null);
    try {
      const pf = portfolio
        ? await api.post<any>(`/portfolios/${portfolio.portfolio_id}/holdings`, { holdings: [{ asset_id: res.asset_id, amount_cad: amt }] })
        : await api.post<any>("/portfolios", { name: "Mon portefeuille", persona_id: me!.profile.persona_id, holdings: [{ asset_id: res.asset_id, amount_cad: amt }] });
      setPortfolioId(pf.portfolio_id);
      await reload();
      nav("/portefeuille");
    } catch (e) { setError(e as ApiError); }
    finally { setAdding(false); }
  };

  const a = byId[asset];
  const V = res?.verdict;
  return (
    <Card>
      <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <div className="relative">
          {a && !q ? (
            <button onClick={() => { setAsset(""); setRes(null); }} className={clsx(inputCls, "flex items-center justify-between text-left")}>
              <span><b>{a.asset_id}</b> <span className="text-slate-500">{a.name}</span></span><span className="text-xs text-brand-600">changer</span>
            </button>
          ) : (
            <>
              <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dans quoi voulez-vous investir ? (NVIDIA, XIU, Bitcoin…)" className={clsx(inputCls, "pl-10")} data-testid="invest-search" />
              {matches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lift">
                  {matches.map((m: any) => (
                    <button key={m.asset_id} onClick={() => { setAsset(m.asset_id); setQ(""); setRes(null); }} className="flex w-full justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                      <span><b>{m.asset_id}</b> <span className="text-slate-500">{m.name}</span></span><span className="text-xs text-slate-500">{CLASS_FR[m.asset_class]}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} aria-label="Montant en dollars" data-testid="invest-amount" />
          <span className="text-sm text-slate-500">$</span>
        </div>
        <Button onClick={() => check()} disabled={!asset || !(+amount > 0) || busy} data-testid="invest-check">{busy ? "Vérification…" : "Vérifier pour mon profil"}</Button>
      </div>
      {busy && <Spinner label="Vérification de vos limites avec ce placement…" />}
      <div className="mt-3"><ErrorBox error={error} /></div>

      {res && (
        <div className={clsx("mt-5 rounded-2xl p-5", V === "suitable" ? "bg-emerald-50" : V === "partial" ? "bg-amber-50" : "bg-rose-50")} data-testid="verdict">
          <div className="flex items-start gap-3">
            {V === "suitable" ? <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" /> : V === "partial" ? <AlertTriangle className="h-7 w-7 shrink-0 text-amber-600" /> : <XCircle className="h-7 w-7 shrink-0 text-rose-600" />}
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold text-slate-900">{res.headline}</h2>
              <p className="mt-0.5 text-sm text-slate-600">{cad(res.amount_cad)} dans {res.asset_id} · profil {res.profile_level.toLowerCase()} · niveau de risque permis : {TIER_FR[res.allowed_tier]?.toLowerCase()}</p>
              <ul className="mt-4 space-y-2">
                {res.reasons.map((r: any, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-800">
                    <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", r.tone === "good" ? "bg-emerald-500" : r.tone === "bad" ? "bg-rose-500" : r.tone === "warn" ? "bg-amber-500" : "bg-slate-400")} />{r.text}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                {V !== "not_suitable" && (
                  <Button onClick={() => add(V === "partial" ? res.max_amount_cad : res.amount_cad)} disabled={adding} data-testid="invest-add">
                    <Plus className="h-4 w-4" /> {adding ? "Ajout…" : `Ajouter ${cad(V === "partial" ? res.max_amount_cad : res.amount_cad)} à mon portefeuille`}
                  </Button>
                )}
                <Link to={`/assistant?debate=1&asset=${encodeURIComponent(res.asset_id)}&amount=${V === "partial" ? res.max_amount_cad : res.amount_cad}`}>
                  <Button variant="secondary"><MessageCircle className="h-4 w-4" /> Avis détaillé des IA</Button>
                </Link>
                {!initialAsset && <Link to={`/investir/${encodeURIComponent(res.asset_id)}`}><Button variant="ghost">En savoir plus sur {res.asset_id}</Button></Link>}
              </div>
              {res.before && res.after && (
                <Explain label="Avant / après dans votre portefeuille">
                  Variation annuelle typique : ± {pct(res.before.volatility)} → ± {pct(res.after.volatility)} · pire baisse historique : {pct(res.before.max_drawdown)} → {pct(res.after.max_drawdown)} ·
                  poids de {res.asset_id} : {pct(res.before.weight || 0)} → {pct(res.after.weight)}. Calculé sur les données au {date(res.data_as_of)}, en $ CA. {res.label}
                </Explain>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Options() {
  const { data, error, loading, reload } = useApi<any>("/invest/options");
  const [showNo, setShowNo] = useState(false);
  const nav = useNavigate();
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const G = data.groups;
  const row = (a: any) => (
    <button key={a.asset_id} onClick={() => nav(`/investir/${encodeURIComponent(a.asset_id)}`)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50">
      <div className="min-w-0"><div className="text-sm font-medium text-slate-900">{a.asset_id} <span className="font-normal text-slate-500">{a.name}</span></div>
        <div className="text-xs text-slate-500">{CLASS_FR[a.asset_class]} · {sector(a.sector)}{a.why ? ` · ${a.why}` : ""}</div></div>
      <div className="shrink-0 text-right"><Badge tone={TIER_TONE[a.tier]}>{TIER_FR[a.tier]}</Badge><div className="mt-0.5 text-xs tabular-nums text-slate-500">± {pct(a.volatility, 0)} / an</div></div>
    </button>
  );
  return (
    <div className="space-y-6">
      <Card title="Adaptés à votre profil" subtitle="Leur risque mesuré sur 5 ans ne dépasse pas ce que votre profil permet" pad={false}>
        <div className="divide-y divide-slate-100 pb-2">{G.fit.length ? G.fit.map(row) : <p className="px-5 py-4 text-sm text-slate-500">Aucun placement de l'univers n'a un risque assez bas pour votre profil.</p>}</div>
      </Card>
      {G.small.length > 0 && (
        <Card title="Possibles, mais en partie seulement" subtitle="Plus risqués que votre niveau : acceptables seulement en petite proportion, dans les limites de votre profil" pad={false}>
          <div className="divide-y divide-slate-100 pb-2">{G.small.map(row)}</div>
        </Card>
      )}
      {G.no.length > 0 && (
        <Card pad={false}>
          <button onClick={() => setShowNo(!showNo)} className="flex w-full items-center justify-between px-5 py-4 text-left">
            <div><div className="text-[15px] font-semibold text-slate-900">Non adaptés à votre profil ({G.no.length})</div><div className="text-sm text-slate-500">Trop risqués pour vous, ou exclus par vos préférences</div></div>
            <ChevronDown className={clsx("h-5 w-5 text-slate-400 transition", showNo && "rotate-180")} />
          </button>
          {showNo && <div className="divide-y divide-slate-100 border-t border-slate-100 pb-2">{G.no.map(row)}</div>}
        </Card>
      )}
      <p className="text-xs text-slate-400">Risque mesuré sur les données du {date(data.data_as_of)} (volatilité et pire baisse). Un titre d'une seule entreprise n'est jamais classé « faible ».</p>
    </div>
  );
}

function AssetInfo({ id }: { id: string }) {
  const { me, portfolio } = useApp();
  const a = useApi<any>(`/assets/${encodeURIComponent(id)}/analysis?persona_id=${encodeURIComponent(me!.profile.persona_id)}`, [id]);
  const prices = useApi<any>(`/assets/${encodeURIComponent(id)}/prices`, [id]);
  const hype = useJob();
  const [research, setResearch] = useState<any>(null);
  const runResearch = async () => {
    setResearch(null);
    const j = await hype.start("/hype/research", { asset_id: id, portfolio_id: portfolio?.portfolio_id, persona_id: me!.profile.persona_id });
    if (j?.status === "done" && j.result_ref) setResearch(await api.get(`/hype/research/${j.result_ref}`));
  };
  if (a.loading) return <Spinner />;
  if (a.error) return <ErrorBox error={a.error} onRetry={a.reload} />;
  if (!a.data) return null;
  const t = a.data.tier;
  return (
    <div className="space-y-6">
      <Card title={`${a.data.asset_id} · ${a.data.name}`} subtitle={`${CLASS_FR[t.asset_class] || t.asset_class} · ${sector(t.sector)}`}
        action={<Badge tone={TIER_TONE[t.tier]} className="px-3 py-1 text-sm">Risque {TIER_FR[t.tier]?.toLowerCase()}</Badge>}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><div className="text-xs text-slate-500">Variation annuelle typique</div><div className="text-xl font-semibold">± {pct(t.volatility, 0)}</div></div>
          <div><div className="text-xs text-slate-500">Pire baisse sur 5 ans</div><div className="text-xl font-semibold">{pct(t.max_drawdown, 0)}</div></div>
          <div><div className="text-xs text-slate-500">Gain nécessaire pour s'en remettre</div><div className="text-xl font-semibold">{t.max_drawdown ? `+${pct(1 / (1 + t.max_drawdown) - 1, 0)}` : "n/d"}</div></div>
        </div>
        {prices.data && <div className="mt-5"><PriceChart series={prices.data.series} currency={prices.data.currency} /></div>}
        <Explain label="Et pour la suite ?">
          Personne ne peut prédire ce cours de façon fiable, et nous ne le prétendons pas. Les données montrent seulement ce qui s'est passé : ± {pct(t.volatility, 0)} par an en moyenne, et jusqu'à {pct(-t.max_drawdown, 0)} de baisse.
          Niveau de risque : {t.rules.join(" · ")}.
        </Explain>
      </Card>
      <Card title="Pourquoi en parle-t-on ?" subtitle="Ce qui est vérifié (dépôts officiels, sources primaires) est séparé du bruit"
        action={!research && <Button variant="secondary" onClick={runResearch} disabled={hype.running}><Sparkles className="h-4 w-4" /> {hype.running ? "Recherche…" : "Vérifier les nouvelles"}</Button>}>
        {hype.running && <AgentSteps steps={hype.job?.steps || []} />}
        <ErrorBox error={hype.error} />
        {!research && !hype.running && <p className="text-sm text-slate-500">La popularité d'un placement n'est ni une preuve de qualité, ni une raison d'investir.</p>}
        {research && <Research r={research} />}
      </Card>
    </div>
  );
}

function Research({ r }: { r: any }) {
  const events = (r.events || []).filter((e: any) => e.primary_source).slice(0, 5);
  const unverified = (r.claims || []).filter((c: any) => ["UNVERIFIED", "DISPUTED"].includes(c.status));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Attention autour du titre</div><div className="text-lg font-semibold">{r.attention?.status === "OK" ? r.attention.band : "Indisponible"}</div><div className="text-xs text-slate-400">indicateur, pas une probabilité</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Faits vérifiés</div><div className="text-lg font-semibold">{events.length}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Rumeurs non confirmées</div><div className="text-lg font-semibold">{unverified.length}</div></div>
      </div>
      {events.length > 0 && (
        <ul className="space-y-2">{events.map((e: any) => (
          <li key={e.event_id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm">
            <div><div className="text-slate-800">{e.title}</div><div className="text-xs text-slate-500">{e.provider} · {date(e.published_at)}</div></div>
            {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="shrink-0 text-brand-600" aria-label="Ouvrir la source"><ExternalLink className="h-4 w-4" /></a>}
          </li>))}</ul>
      )}
      {unverified.length > 0 && <ul className="space-y-1 text-sm text-slate-600">{unverified.slice(0, 5).map((c: any) => <li key={c.claim_id}>• <span className="text-amber-700">Non confirmé :</span> {c.text || c.proposition}</li>)}</ul>}
      {r.is_fixture && <p className="text-xs text-amber-700">{r.fixture_label}</p>}
    </div>
  );
}
