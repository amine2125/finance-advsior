import { FileText, Printer } from "lucide-react";
import { useState } from "react";
import { FindingsList, PersonaPanel } from "../components/analysis";
import { ActivityTimeline, Button, Card, ErrorBox, Metric, Notice, PageHeader, SeverityBadge, Table } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useApi, useJob } from "../hooks/useApi";
import { cad, date, pct, sector } from "../lib/format";
import { api } from "../services/api";

export default function Reports() {
  const { portfolioId, personaId } = useApp();
  const list = useApi<any>("/reports");
  const [rep, setRep] = useState<any>(null);
  const { job, running, error, start } = useJob();
  const gen = async () => {
    const j = await start("/reports/generate", { portfolio_id: portfolioId, persona_id: personaId });
    if (j?.status === "done" && j.result_ref) { setRep(await api.get(`/reports/${j.result_ref}`)); list.reload(); }
  };
  return (
    <div>
      <PageHeader title="Rapports d'intelligence" subtitle="Rapport mensuel généré à la demande (et planifiable) : chaque chiffre provient du registre de calcul.">
        <Button onClick={gen} disabled={running}><FileText className="h-4 w-4" /> Générer le rapport mensuel</Button>
        {rep && <Button variant="ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimer</Button>}
      </PageHeader>
      <ErrorBox error={error} />
      {running && job && <ActivityTimeline steps={job.steps} />}
      <div className="grid gap-5 xl:grid-cols-[260px_1fr]">
        <Card title="Rapports">
          {(list.data?.reports || []).map((r: any) => <button key={r.report_id} onClick={async () => setRep(await api.get(`/reports/${r.report_id}`))} className="mb-1 block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-ink-800"><div className="text-slate-200">{r.title}</div><div className="text-slate-500">{r.period?.[0]} → {r.period?.[1]}</div></button>)}
          {!list.data?.reports?.length && <p className="text-xs text-slate-500">Aucun rapport.</p>}
        </Card>
        {rep ? (
          <div className="space-y-5">
            <Card title={rep.title} subtitle={`Période ${rep.period[0]} → ${rep.period[1]} · données au ${rep.data_as_of} · ${rep.label}`} accent="teal">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Metric label="Valeur début" value={cad(rep.value.start)} /><Metric label="Valeur fin" value={cad(rep.value.end)} />
                <Metric label="Variation" value={cad(rep.value.change)} tone={rep.value.change < 0 ? "bad" : "good"} />
                <Metric label="Effet marché" value={cad(rep.value.market_effect)} /><Metric label="Effet composition" value={cad(rep.value.composition_effect)} />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Table head={["Performance historique", ""]} rows={Object.entries(rep.performance).map(([k, v]: any) => [k, v ?? "n/d"])} />
                <Table head={["Indicateurs de risque", ""]} rows={Object.entries(rep.risk).map(([k, v]: any) => [k, v ?? "n/d"])} />
              </div>
            </Card>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card title="Changements d'exposition"><Table head={["Secteur", "Début", "Fin", "Δ"]} rows={rep.exposure_changes.map((s: any) => [sector(s.sector), pct(s.before), pct(s.after), pct(s.change)])} /></Card>
              <Card title="Scénarios hypothétiques"><Table head={["Scénario", "Variation", "CAD"]} rows={rep.scenarios.map((s: any) => [s.name, pct(s.return), cad(s.pnl)])} /></Card>
            </div>
            <Card title="Constats et adéquation au profil"><FindingsList findings={rep.findings} /><div className="mt-4"><PersonaPanel pa={rep.persona_assessment} /></div></Card>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card title="Alertes de la période">{rep.alerts.length ? rep.alerts.map((a: any) => <div key={a.alert_id} className="mb-1 text-xs"><SeverityBadge severity={a.severity} /> {a.title} <span className="text-slate-500">{date(a.data_date)}{a.simulated_replay ? " · simulé" : ""}</span></div>) : <p className="text-xs text-slate-500">Aucune alerte sur la période.</p>}</Card>
              <Card title="Attention et événements vérifiés">{rep.hype.length ? <Table head={["Actif", "Attention", "Événements vérifiés", "Non vérifiées"]} rows={rep.hype.map((h: any) => [h.asset_id + (h.is_fixture ? " (fixture)" : ""), h.attention ?? h.attention_status, h.verified_events, h.unverified_claims])} /> : <p className="text-xs text-slate-500">Aucune recherche Hype Intelligence exécutée : couverture d'actualités nulle pour ce rapport.</p>}</Card>
            </div>
            <Card title="Incertitudes et questions à explorer">
              <ul className="ml-4 list-disc space-y-1 text-sm text-slate-300">{rep.uncertainties.map((u: string) => <li key={u}>{u}</li>)}</ul>
              <div className="mt-3 text-sm text-aegis-300">{rep.questions_to_explore.map((q: string) => <div key={q}>→ {q}</div>)}</div>
              <Notice>{rep.market_context.note}</Notice>
            </Card>
          </div>
        ) : <Card><p className="text-sm text-slate-400">Générez ou sélectionnez un rapport.</p></Card>}
      </div>
    </div>
  );
}
