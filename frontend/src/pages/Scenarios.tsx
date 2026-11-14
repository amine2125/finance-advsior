import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MultiLine } from "../charts/charts";
import { ImpactPanel } from "../components/analysis";
import { Button, Card, ErrorBox, Input, Loading, Metric, Notice, PageHeader, Select, StatusPill, Table } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useApi } from "../hooks/useApi";
import { cad, num, pct } from "../lib/format";
import { api } from "../services/api";

function Slider({ label, value, onChange, min = -60, max = 30 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="block text-xs text-slate-400">
      <div className="flex justify-between"><span>{label}</span><span className={value < 0 ? "text-rose-300" : value > 0 ? "text-emerald-300" : "text-slate-300"}>{value > 0 ? "+" : ""}{value} %</span></div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-teal-400" />
    </label>
  );
}

export default function Scenarios() {
  const { portfolioId, personaId } = useApp();
  const [params] = useSearchParams();
  const assets = useApi<any>("/assets");
  const meth = useApi<any>("/methodology");
  const [shock, setShock] = useState({ tech: -30, eq: -10, bonds: 2, crypto: -40, gold: 0, usd: 0 });
  const [res, setRes] = useState<any>(null);
  const [cmp, setCmp] = useState<any>(null);
  const [paths, setPaths] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [start, setStart] = useState("2022-01-03");
  const [end, setEnd] = useState("2026-11-12");
  const [reb, setReb] = useState("none");
  const [preset, setPreset] = useState("tech_crash_30");
  const [addAsset, setAddAsset] = useState(params.get("asset") || "BTC-USD");
  const [addAmount, setAddAmount] = useState("5000");
  const [impact, setImpact] = useState<any>(null);
  const [impactBusy, setImpactBusy] = useState(false);
  const shocks = useMemo(() => ({ "sector:Information Technology": shock.tech / 100, "asset_class:equity": shock.eq / 100, "sub_class:equity_etf": shock.eq / 100,
    "sub_class:esg_equity_etf": shock.eq / 100, "sub_class:bond_etf": shock.bonds / 100, "asset_class:crypto": shock.crypto / 100, "sub_class:gold_etf": shock.gold / 100,
    "fx:USDCAD": shock.usd / 100 }), [shock]);
  useEffect(() => {
    const t = setTimeout(() => api.post("/scenarios/run", { portfolio_id: portfolioId, kind: "shock", shocks }).then(setRes).catch(setErr), 250);
    return () => clearTimeout(t);
  }, [shocks, portfolioId]);
  useEffect(() => {
    setCmp(null);
    api.post("/scenarios/compare", { portfolio_id: portfolioId, persona_id: personaId, preset }).then(setCmp).catch(setErr);
  }, [portfolioId, personaId, preset]);
  const runPaths = async () => {
    if (!cmp) return;
    setPaths(null);
    const out: any = {};
    for (const [k, a] of Object.entries<any>(cmp.alternatives)) {
      if (!a.weights) continue;
      try { out[k] = await api.post("/scenarios/run", { portfolio_id: portfolioId, kind: "historical_replay", weights: a.weights, start, end, rebalancing: reb }); } catch (e) { out[k] = { error: (e as any).message }; }
    }
    setPaths(out);
  };
  useEffect(() => { if (cmp) runPaths(); }, [cmp]); // eslint-disable-line
  const runImpact = async () => {
    setImpactBusy(true);
    setImpact(null);
    try { setImpact(await api.post("/hype/portfolio-impact", { portfolio_id: portfolioId, persona_id: personaId, asset_id: addAsset, amount_cad: +addAmount })); }
    catch (e) { setErr(e); } finally { setImpactBusy(false); }
  };
  const chart = useMemo(() => {
    if (!paths) return [];
    const byDate: Record<string, any> = {};
    for (const [k, p] of Object.entries<any>(paths)) for (const pt of p.series || []) (byDate[pt.date] ||= { date: pt.date })[k] = pt.value;
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [paths]);
  const presets = Object.entries<any>(meth.data?.shock_presets || {}).map(([k, v]) => ({ value: k, label: v.name }));
  return (
    <div>
      <PageHeader title="Laboratoire de scénarios" subtitle="Les chocs sont des HYPOTHÈSES explicites appliquées instantanément, jamais des prévisions. Changer l'allocation (ce que vous contrôlez) et changer les conditions de marché (hypothèse) sont traités séparément." />
      <ErrorBox error={err} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Choc de marché hypothétique" subtitle="Recalcul instantané à chaque modification" accent="rose">
          <div className="space-y-3">
            <Slider label="Technologies de l'information (titres directs)" value={shock.tech} onChange={(v) => setShock({ ...shock, tech: v })} />
            <Slider label="Autres actions et FNB d'actions" value={shock.eq} onChange={(v) => setShock({ ...shock, eq: v })} />
            <Slider label="FNB obligataires" value={shock.bonds} onChange={(v) => setShock({ ...shock, bonds: v })} min={-20} max={15} />
            <Slider label="Cryptoactifs" value={shock.crypto} onChange={(v) => setShock({ ...shock, crypto: v })} min={-90} max={50} />
            <Slider label="Or" value={shock.gold} onChange={(v) => setShock({ ...shock, gold: v })} min={-30} max={30} />
            <Slider label="USD/CAD (négatif = le dollar canadien s'apprécie)" value={shock.usd} onChange={(v) => setShock({ ...shock, usd: v })} min={-20} max={20} />
          </div>
        </Card>
        <Card title="Effet sur le portefeuille" className="xl:col-span-2">
          {!res ? <Loading /> : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Metric label="Avant" value={cad(res.value_before)} />
                <Metric label="Après (hypothèse)" value={cad(res.value_after)} tone={res.pnl < 0 ? "bad" : "good"} />
                <Metric label="Variation" value={`${pct(res.return)} (${cad(res.pnl)})`} tone={res.pnl < 0 ? "bad" : "good"} />
              </div>
              <Table className="mt-3" head={["Actif", "Valeur avant", "Choc appliqué", "Règle", "Effet FX", "Après"]} rows={res.positions.map((p: any) => [p.asset_id, cad(p.value_before), pct(p.price_shock), <span className="text-[11px] text-slate-500">{p.rule}</span>, pct(p.fx_effect), cad(p.value_after)])} />
              <Notice tone="warn">{res.label}. Les frais, écarts et impôts sont omis.</Notice>
            </>
          )}
        </Card>
      </div>
      <Card title="Comparaison d'allocations hypothétiques" subtitle="Original vs diversifié vs défensif — mêmes données, même méthode" className="mt-5"
        actions={<Select value={preset} onChange={setPreset} options={presets.length ? presets : [{ value: "tech_crash_30", label: "Choc tech" }]} />}>
        {!cmp ? <Loading /> : (
          <>
            <Table head={["Allocation", "Volatilité", "Perte max.", "HHI", "Corr. moy.", "Choc choisi", "Rendement hist.", "Profil"]} rows={Object.entries<any>(cmp.alternatives).filter(([, a]) => !a.error).map(([k, a]) => [
              <div><div className="font-semibold text-white">{k === "original" ? "Actuel" : k === "diversified" ? "Diversifié" : k === "defensive" ? "Défensif" : k}</div><div className="max-w-xs text-[10px] text-slate-500">{a.label}</div></div>,
              pct(a.vol), pct(a.mdd), num(a.hhi, 3), num(a.avg_corr), <span className={a.shock < 0 ? "text-rose-300" : ""}>{pct(a.shock)}</span>, pct(a.total_return),
              a.persona ? <div>{a.persona.compatible ? <StatusPill status="OK" /> : <StatusPill status="BREACH" />}<div className="text-[10px] text-slate-500">{a.persona.breaches.join(", ")}</div></div> : "—"])} />
            <Notice>{cmp.label}. Le rendement historique est mesuré sur le passé et ne prédit rien.</Notice>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Input label="Début (date de décision)" type="date" value={start} onChange={setStart} />
              <Input label="Fin" type="date" value={end} onChange={setEnd} />
              <Select label="Rééquilibrage" value={reb} onChange={setReb} options={[{ value: "none", label: "Aucun (achat-conservation)" }, { value: "monthly", label: "Mensuel" }]} />
              <Button variant="ghost" onClick={runPaths}>Rejouer l'historique</Button>
            </div>
            {paths ? <MultiLine data={chart} lines={[{ key: "original", name: "Actuel" }, { key: "diversified", name: "Diversifié" }, { key: "defensive", name: "Défensif" }]} yFmt={(v) => `${Math.round(v / 1000)} k`} /> : <Loading label="Rejeu historique…" />}
            {paths && <div className="text-[11px] text-slate-500">Pondérations fixées avec les seuls prix connus à la date de départ; {Object.entries<any>(paths).map(([k, p]) => `${k}: ${pct(p.total_return)} (perte max ${pct(p.max_drawdown)})`).join(" · ")}</div>}
          </>
        )}
      </Card>
      <Card title="Ajout hypothétique d'un actif" subtitle="Effet calculé sur la concentration, le risque et le budget du profil (avant / après)" className="mt-5" accent="violet">
        <div className="flex flex-wrap items-end gap-2">
          <Select label="Actif" value={addAsset} onChange={setAddAsset} options={(assets.data?.assets || []).map((a: any) => ({ value: a.asset_id, label: `${a.asset_id} – ${a.name}` }))} className="min-w-[16rem]" />
          <Input label="Montant (CAD)" type="number" value={addAmount} onChange={setAddAmount} className="w-36" />
          <Button onClick={runImpact} disabled={impactBusy}>Calculer</Button>
        </div>
        <div className="mt-4">{impactBusy ? <Loading /> : <ImpactPanel impact={impact} />}</div>
      </Card>
    </div>
  );
}
