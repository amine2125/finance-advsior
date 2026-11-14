import { Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AllocationDonut, ContributionBars, CorrelationHeatmap, DrawdownChart, Gauge, PerformanceChart, SectorBars } from "../charts/charts";
import { FindingsList, PersonaPanel } from "../components/analysis";
import { Button, Card, ErrorBox, Loading, Metric, Notice, PageHeader, Select, Table } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { CLASS_FR, num, pct } from "../lib/format";
import { api } from "../services/api";

const BENCH = [
  { value: "", label: "Indice du profil (par défaut)" }, { value: "SPY", label: "SPY" }, { value: "XIU.TO", label: "XIU.TO" }, { value: "QQQ", label: "QQQ" },
  { value: "AGG", label: "AGG" }, { value: "BLEND_GROWTH", label: "Mixte croissance" }, { value: "BLEND_BALANCED", label: "Mixte 60/40" },
  { value: "BLEND_ESG_BALANCED", label: "Mixte ESG" }, { value: "BLEND_CONSERVATIVE", label: "Mixte prudent 40/60" },
];

export default function XRay() {
  const { portfolioId, personaId, personas } = useApp();
  const nav = useNavigate();
  const [xr, setXr] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [bench, setBench] = useState("");
  const [lookback, setLookback] = useState("756");
  const persona = personas.find((p) => p.persona_id === personaId);
  useEffect(() => {
    setXr(null);
    setErr(null);
    api.post("/analysis/portfolio", { portfolio_id: portfolioId, persona_id: personaId, benchmark_id: bench || null, lookback: +lookback }).then(setXr).catch(setErr);
  }, [portfolioId, personaId, bench, lookback]);
  const L = xr?.ledger || {};
  const st = xr?.risk?.stressed;
  return (
    <div>
      <PageHeader title="Radiographie du portefeuille" subtitle="Concentration directe, chevauchement suspecté, corrélation statistique et exposition sectorielle sont quatre notions distinctes; elles sont présentées séparément.">
        <Select value={bench} onChange={setBench} options={BENCH} />
        <Select value={lookback} onChange={setLookback} options={[{ value: "252", label: "1 an" }, { value: "756", label: "3 ans" }, { value: "1260", label: "5 ans" }]} />
        <Button onClick={() => nav("/debate")}><Scale className="h-4 w-4" /> Lancer un débat</Button>
      </PageHeader>
      <ErrorBox error={err} />
      {!xr && !err && <Loading label="Calcul déterministe des métriques…" />}
      {xr && (
        <div className="space-y-5" data-testid="xray">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Metric label="Top 2 titres" value={L["pf.top2_single"]?.display || L["pf.top2"]?.display} tone="warn" hint={L["pf.top2_single"]?.label?.replace("Poids cumulé ", "")} id="pf.top2_single" />
            <Metric label="HHI" value={L["pf.hhi"]?.display} hint={`${L["pf.effective_n"]?.display} positions effectives`} id="pf.hhi" />
            <Metric label="Volatilité" value={L["pf.vol"]?.display} hint="annualisée, historique" id="pf.vol" />
            <Metric label="Perte max." value={L["pf.mdd"]?.display} tone="bad" id="pf.mdd" />
            <Metric label="VaR 1 j 95 %" value={L["pf.var95"]?.display} hint={L["pf.var95_cad"] ? `${L["pf.var95_cad"].display}` : "supprimée (échantillon)"} id="pf.var95" />
            <Metric label="CVaR 1 j 95 %" value={L["pf.cvar95"]?.display} hint="perte moyenne au-delà" id="pf.cvar95" />
            <Metric label="Ratio de diversification" value={L["pf.div_ratio"]?.display} hint="1 = aucun bénéfice" id="pf.div_ratio" />
            <Metric label="Corrélation moyenne" value={L["pf.avg_corr"]?.display} hint="pondérée" id="pf.avg_corr" />
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <Card title="Diagnostic" accent="amber" className="xl:col-span-2">
              <p className="text-sm leading-relaxed text-slate-300">{xr.diagnosis.text}</p>
              <div className="mt-4"><FindingsList findings={xr.findings} /></div>
              <Notice tone="warn">{xr.etf_lookthrough.reason}</Notice>
            </Card>
            <Card title="Indicateur de concentration">
              <div className="flex flex-col items-center gap-2">
                <Gauge value={L["pf.hhi"]?.value || 0} max={0.5} danger={0.25} label={`HHI ${L["pf.hhi"]?.display}`} />
                <div className="text-center text-xs text-slate-400">Seuils méthodologiques : avertissement 0,15 · critique 0,25</div>
              </div>
              <div className="mt-4"><AllocationDonut data={xr.positions.map((p: any) => ({ name: p.asset_id, value: p.weight }))} /></div>
            </Card>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Exposition sectorielle (directe)" subtitle={`Plafond sectoriel du profil : ${pct(persona?.budget?.max_single_sector, 0)}`}>
              <SectorBars data={xr.exposures.sector} limit={persona?.budget?.max_single_sector} />
            </Card>
            <Card title="Poids vs contribution au risque" subtitle="RC_i = w_i·(Σw)_i / σ_p²">
              <ContributionBars data={xr.positions.map((p: any) => ({ name: p.asset_id, weight: p.weight, risk: p.risk_contribution ?? 0 }))} />
            </Card>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Matrice de corrélation" subtitle={`Rendements quotidiens en CAD · ${xr.risk.window_start} → ${xr.risk.window_end} · ${xr.risk.n_obs} obs. Corrélation ≠ prévision.`}>
              <CorrelationHeatmap assets={xr.risk.correlation.assets} matrix={xr.risk.correlation.matrix} />
            </Card>
            <Card title="Test de résistance des corrélations" subtitle="Volatilité recalculée avec les corrélations de la pire fenêtre de 63 séances" accent="rose">
              {st ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <Metric label="Vol. normale" value={pct(st.normal_vol)} id="pf.stress.normal_vol" />
                    <Metric label="Vol. en stress" value={pct(st.stressed_vol)} tone="bad" id="pf.stress.vol" />
                    <Metric label="Corr. moyenne stress" value={num(st.avg_corr_stressed)} hint={`vs ${num(st.avg_corr_normal)}`} id="pf.stress.avg_corr" />
                  </div>
                  <p className="text-xs text-slate-400">Pire fenêtre : {st.window_start} → {st.window_end} (rendement {pct(st.window_return)}). {st.label}. Les corrélations tendent à monter en période de stress, précisément quand la diversification est nécessaire.</p>
                  <Notice>Deux actifs parfaitement anticorrélés à poids égal donnent un rendement proche de zéro : le risque disparaît et le rendement aussi. La diversification utile combine des actifs à rendement espéré positif et faiblement corrélés.</Notice>
                </div>
              ) : <p className="text-sm text-slate-400">Historique insuffisant pour le test de résistance.</p>}
            </Card>
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <Card title="Pondérations actuelles vs indice" subtitle={xr.benchmark_label} className="xl:col-span-2">
              <PerformanceChart series={xr.risk.series} benchLabel={xr.benchmark_label} />
              {xr.risk.benchmark && <div className="text-xs text-slate-400">Erreur de suivi {pct(xr.risk.benchmark.tracking_error)} · écart cumulé {pct(xr.risk.benchmark.excess_return)} · {xr.risk.benchmark.note}</div>}
              <DrawdownChart series={xr.risk.series} />
            </Card>
            <Card title="Classes d'actifs & devises">
              <Table head={["Dimension", "Poids"]} rows={[...Object.entries(xr.exposures.asset_class).map(([k, v]: any) => [CLASS_FR[k] || k, pct(v)]),
                ...Object.entries(xr.exposures.currency).map(([k, v]: any) => [`Devise ${k}`, pct(v)]), ...Object.entries(xr.exposures.region).map(([k, v]: any) => [`Région ${k}`, pct(v)])]} />
              <div className="mt-3 text-[11px] text-slate-500">Hypothèses : {xr.assumptions.join(" · ")}</div>
            </Card>
          </div>
          <Card title={`Adéquation au profil – ${persona?.display_name}`} subtitle={persona?.budget?.binding_constraint_note} accent="violet">
            <PersonaPanel pa={xr.persona_assessment} />
          </Card>
          <div className="text-[11px] text-slate-500">Analyse {xr.analysis_id} · méthode {xr.methodology_version} ({xr.methodology_hash}) · calcul {xr.calculation_version} · jeu de données {xr.dataset_version}</div>
        </div>
      )}
    </div>
  );
}
