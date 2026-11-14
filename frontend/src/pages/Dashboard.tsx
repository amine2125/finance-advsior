import { ArrowRight, Bot, Radar, Scale, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { AllocationDonut, PerformanceChart, SectorBars } from "../charts/charts";
import { FindingsList } from "../components/analysis";
import { Card, Disclaimer, ErrorBox, Loading, Metric, PageHeader, SeverityBadge, StatusPill, SupervisorStatus, TierBadge } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useApi } from "../hooks/useApi";
import { api } from "../services/api";
import { useEffect, useState } from "react";
import { cad, date, pct } from "../lib/format";

export default function Dashboard() {
  const { portfolioId, personaId, personas } = useApp();
  const [xr, setXr] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const alerts = useApi<any>(`/alerts?portfolio_id=${portfolioId}`, [portfolioId]);
  const debates = useApi<any>("/agents/debates");
  const hype = useApi<any>("/hype/research");
  const persona = personas.find((p) => p.persona_id === personaId);
  useEffect(() => {
    setXr(null);
    setErr(null);
    api.post("/analysis/portfolio", { portfolio_id: portfolioId, persona_id: personaId, save_snapshot: false }).then(setXr).catch(setErr);
  }, [portfolioId, personaId]);
  const L = xr?.ledger || {};
  return (
    <div>
      <PageHeader title="Tableau de bord" subtitle={<>Vue d'ensemble du portefeuille simulé pour <b className="text-slate-200">{persona?.display_name}</b>. Données au <b className="text-slate-200">{xr ? date(xr.data_as_of) : "…"}</b> (rejeu historique, pas un flux en direct).</>}>
        <Link to="/copilot" className="inline-flex items-center gap-2 rounded-xl bg-aegis-500 px-3.5 py-2 text-sm font-medium text-ink-950 hover:bg-aegis-400"><Bot className="h-4 w-4" /> Demander au Copilote</Link>
      </PageHeader>
      <ErrorBox error={err} />
      {!xr && !err && <Loading label="Calcul de la radiographie…" />}
      {xr && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Metric label="Valeur simulée" value={cad(xr.total_value_cad)} hint="CAD, quantités × cours × FX" id="pf.total_value" />
            <Metric label="Rendement historique" value={L["pf.total_return"]?.display} hint={`pondérations actuelles · ${xr.risk.window_start} → ${xr.risk.window_end}`} id="pf.total_return" />
            <Metric label="Volatilité annualisée" value={L["pf.vol"]?.display} hint="historique, pas une prévision" id="pf.vol" />
            <Metric label="Perte maximale" value={L["pf.mdd"]?.display} tone="bad" hint={`${L["pf.mdd"]?.params?.peak} → ${L["pf.mdd"]?.params?.trough}`} id="pf.mdd" />
            <Metric label="Positions effectives" value={L["pf.effective_n"]?.display} hint={`sur ${xr.positions.length} lignes (1/HHI)`} tone={(L["pf.effective_n"]?.value ?? 9) < 5 ? "warn" : undefined} id="pf.effective_n" />
            <Metric label="Niveau du profil" value={<TierBadge tier={xr.persona_assessment?.portfolio_tier} />} hint={<>permis : {xr.persona_assessment?.allowed_tier}</>} />
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <Card title="Performance historique vs indice" subtitle={`${xr.benchmark_label} · CAD · rendements totaux`} className="xl:col-span-2">
              <PerformanceChart series={xr.risk.series} benchLabel={xr.benchmark_label} />
              {xr.risk.benchmark && <div className="mt-2 text-xs text-slate-400">Portefeuille {L["pf.total_return"]?.display} vs indice {L["bench.total_return"]?.display} · volatilité {L["pf.vol"]?.display} vs {L["bench.vol"]?.display}. Performances passées, sans frais.</div>}
            </Card>
            <Card title="Allocation" subtitle="Poids directs par position">
              <AllocationDonut data={xr.positions.map((p: any) => ({ name: p.asset_id, value: p.weight }))} />
            </Card>
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <Card title="État de la diversification" subtitle={xr.diagnosis.info_class} accent="amber" className="xl:col-span-2">
              <p className="mb-3 text-sm leading-relaxed text-slate-300">{xr.diagnosis.text}</p>
              <FindingsList findings={xr.findings.filter((f: any) => f.severity !== "informational").slice(0, 4)} />
              <Link to="/xray" className="mt-3 inline-flex items-center gap-1 text-sm text-aegis-300 hover:underline"><Radar className="h-4 w-4" /> Radiographie complète <ArrowRight className="h-3 w-3" /></Link>
            </Card>
            <Card title="Exposition sectorielle" subtitle="Classification directe (FNB non reclassés)">
              <SectorBars data={xr.exposures.sector} limit={persona?.budget?.max_single_sector} />
            </Card>
          </div>
        </>
      )}
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card title="Dernières alertes Guardian" actions={<Link to="/guardian" className="text-xs text-aegis-300 hover:underline">Tout voir</Link>}>
          {alerts.loading ? <Loading /> : (alerts.data?.alerts || []).slice(0, 5).map((a: any) => (
            <div key={a.alert_id} className="mb-2 rounded-xl bg-ink-850/70 p-2.5 text-xs">
              <div className="flex items-center gap-2"><SeverityBadge severity={a.severity} />{a.simulated_replay && <span className="text-[10px] font-semibold text-amber-300">SIMULÉ / REJEU</span>}<span className="text-slate-500">{date(a.data_date)}</span></div>
              <div className="mt-1 text-slate-200">{a.title}</div>
            </div>
          ))}
          {!alerts.loading && !alerts.data?.alerts?.length && <p className="text-sm text-slate-400">Aucune alerte. Lancez une analyse Guardian ou un rejeu historique.</p>}
        </Card>
        <Card title="Débats récents" actions={<Link to="/debate" className="text-xs text-aegis-300 hover:underline"><Scale className="inline h-3 w-3" /> Chambre</Link>}>
          {(debates.data?.debates || []).slice(0, 4).map((d: any) => (
            <div key={d.debate_id} className="mb-2 rounded-xl bg-ink-850/70 p-2.5 text-xs">
              <SupervisorStatus status={d.status} /><div className="mt-1 text-slate-200">{d.headline}</div><div className="text-[10px] text-slate-500">{d.persona} · {date(d.created_at)}</div>
            </div>
          ))}
          {!debates.data?.debates?.length && <p className="text-sm text-slate-400">Aucun débat pour l'instant.</p>}
        </Card>
        <Card title="Attention vs adéquation" actions={<Link to="/hype" className="text-xs text-aegis-300 hover:underline"><Sparkles className="inline h-3 w-3" /> Hype Intelligence</Link>}>
          {(hype.data?.research || []).slice(0, 4).map((r: any) => (
            <div key={r.research_id} className="mb-2 flex items-center justify-between rounded-xl bg-ink-850/70 p-2.5 text-xs">
              <div><div className="text-slate-200">{r.name}</div><div className="text-[10px] text-slate-500">{date(r.created_at)} {r.is_fixture && "· fixture fictive"}</div></div>
              {r.attention !== null && r.attention !== undefined ? <span className="text-slate-300">attention {r.attention}</span> : <StatusPill status="UNAVAILABLE" />}
            </div>
          ))}
          {!hype.data?.research?.length && <p className="text-sm text-slate-400">Aucune recherche. L'attention du marché est mesurée séparément de l'adéquation au profil.</p>}
        </Card>
      </div>
      <div className="mt-6"><Disclaimer /></div>
    </div>
  );
}
