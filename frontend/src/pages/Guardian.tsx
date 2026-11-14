import { History, Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { MultiLine } from "../charts/charts";
import { ActivityTimeline, Button, Card, ErrorBox, Loading, Metric, Notice, PageHeader, Select, SeverityBadge, Table } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useApi, useJob } from "../hooks/useApi";
import { cad, date, num, pct, sector } from "../lib/format";
import { api } from "../services/api";

function WhatChanged({ wc }: { wc: any }) {
  if (!wc) return null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Variation totale" value={cad(wc.total_change)} tone={wc.total_change < 0 ? "bad" : "good"} hint={`${date(wc.before.as_of)} → ${date(wc.after.as_of)}`} />
        <Metric label="Effet marché" value={cad(wc.market_effect)} hint="mêmes quantités, nouveaux prix/FX" />
        <Metric label="Effet composition" value={cad(wc.composition_effect)} hint="variations de quantités" />
        <Metric label="Versions modifiées" value={Object.values<any>(wc.versions).filter((v) => v.changed).length} hint="données / méthode / calcul" />
      </div>
      <Table head={["Mesure", "Avant", "Après", "Δ"]} rows={wc.metrics.filter((m: any) => m.before !== null || m.after !== null).map((m: any) => [m.metric, num(m.before, 3), num(m.after, 3), <span className={wc.material_changes.find((x: any) => x.metric === m.metric) ? "font-semibold text-amber-300" : ""}>{num(m.change, 3)}</span>])} />
      <Table head={["Secteur", "Avant", "Après", "Δ"]} rows={wc.sectors.map((s: any) => [sector(s.sector), pct(s.before), pct(s.after), pct(s.change)])} />
      <p className="text-[11px] text-slate-500">{wc.explanation}</p>
    </div>
  );
}

export default function Guardian() {
  const { portfolioId, personaId } = useApp();
  const alerts = useApi<any>(`/alerts?portfolio_id=${portfolioId}`, [portfolioId]);
  const snaps = useApi<any>(`/snapshots?portfolio_id=${portfolioId}`, [portfolioId]);
  const [scan, setScan] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [replay, setReplay] = useState<any>(null);
  const [guided, setGuided] = useState("tech_2022");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [wc, setWc] = useState<any>(null);
  const [filter, setFilter] = useState("all");
  const { job, running, error, start } = useJob();
  const doScan = async () => { setErr(null); try { setScan(await api.post("/alerts/scan", { portfolio_id: portfolioId, persona_id: personaId })); alerts.reload(); snaps.reload(); } catch (e) { setErr(e); } };
  const doReplay = async () => {
    setReplay(null);
    const body = guided === "custom" ? { portfolio_id: portfolioId, persona_id: personaId, start: "2022-03-01", end: "2022-12-30" } : { guided, persona_id: personaId };
    const j = await start("/replay", body);
    if (j?.status === "done" && j.result_ref) { setReplay(await api.get(`/replay/${j.result_ref}`)); alerts.reload(); snaps.reload(); }
  };
  const setStatus = async (id: string, s: "dismiss" | "review") => { await api.post(`/alerts/${id}/${s}`); alerts.reload(); };
  const compare = async () => { setErr(null); try { setWc(await api.post("/snapshots/compare", { before: a, after: b })); } catch (e) { setErr(e); } };
  const list = (alerts.data?.alerts || []).filter((x: any) => filter === "all" || (filter === "live" ? !x.simulated_replay : x.simulated_replay));
  const snapOpts = (snaps.data?.snapshots || []).map((s: any) => ({ value: s.snapshot_id, label: `${s.as_of} · ${s.label || ""} · ${cad(s.total_value_cad)}` }));
  return (
    <div>
      <PageHeader title="Portfolio Guardian" subtitle="Surveillance déterministe (sans LLM en continu). Les niveaux indiquent l'urgence d'un examen selon des règles définies, jamais une prédiction de marché. Déduplication et périodes de refroidissement évitent la fatigue d'alerte.">
        <Button onClick={doScan}><RefreshCw className="h-4 w-4" /> Analyse maintenant</Button>
      </PageHeader>
      <ErrorBox error={err || error} />
      {scan && <Notice>Analyse au {scan.data_as_of} : {scan.candidates} condition(s) détectée(s), {scan.new_alerts.length} nouvelle(s) alerte(s), {scan.deduplicated} dédupliquée(s). Instantané {scan.snapshot_id}.</Notice>}
      <div className="mt-4 grid gap-5 xl:grid-cols-3">
        <Card title="Rejeu historique guidé" subtitle="À chaque étape, seules les observations publiées à cette date sont visibles" accent="amber">
          <Select value={guided} onChange={setGuided} options={[{ value: "tech_2022", label: "Concentration tech pendant le repli de 2022 (Démo 1)" }, { value: "growth_2022_personas", label: "Portefeuille croissance 2022 (Démo 2, profil actif)" }, { value: "custom", label: "Portefeuille actif, mars → déc. 2022" }]} />
          <Button className="mt-3" onClick={doReplay} disabled={running}><Play className="h-4 w-4" /> {running ? "Rejeu…" : "Lancer le rejeu"}</Button>
          {running && job && <div className="mt-3"><ActivityTimeline steps={job.steps} /></div>}
          <p className="mt-3 text-[11px] text-slate-500">Les alertes générées sont étiquetées SIMULÉ / REJEU HISTORIQUE et ne sont jamais envoyées en notification.</p>
        </Card>
        <Card title="Alertes" className="xl:col-span-2" actions={<Select value={filter} onChange={setFilter} options={[{ value: "all", label: "Toutes" }, { value: "live", label: "Analyses" }, { value: "replay", label: "Rejeux simulés" }]} />}>
          {alerts.loading ? <Loading /> : list.length ? (
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {list.map((x: any) => (
                <div key={x.alert_id} className={`rounded-xl border p-3 text-xs ${x.status === "dismissed" ? "border-ink-800 opacity-50" : "border-ink-700 bg-ink-850/60"}`}>
                  <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={x.severity} />{x.simulated_replay && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">SIMULÉ / REJEU HISTORIQUE</span>}
                    <span className="text-slate-500">données du {date(x.data_date)}</span><span className="text-slate-600">{x.rule_id}</span><span className="ml-auto text-slate-500">{x.status === "new" ? "nouvelle" : x.status === "reviewed" ? "examinée" : "ignorée"}</span></div>
                  <div className="mt-1 text-sm font-medium text-slate-100">{x.title}</div>
                  <div className="text-slate-400">Déclencheur : {x.trigger}{x.persona_constraint ? ` · contrainte : ${x.persona_constraint}` : ""}</div>
                  <div className="text-slate-500">{x.explanation} · positions : {x.affected_assets.join(", ")} · {x.delivery}</div>
                  {x.status === "new" && <div className="mt-1 flex gap-3"><button className="text-aegis-300 hover:underline" onClick={() => setStatus(x.alert_id, "review")}>Marquer examinée</button><button className="text-slate-400 hover:underline" onClick={() => setStatus(x.alert_id, "dismiss")}>Ignorer</button></div>}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400">Aucune alerte pour ce portefeuille.</p>}
        </Card>
      </div>
      {replay && (
        <Card title={`${replay.title} — ${replay.label}`} subtitle={`${replay.start} → ${replay.end} · pas de ${replay.step_days} j · ${replay.alerts.length} alerte(s) simulée(s)`} className="mt-5" accent="amber">
          <div className="grid gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <MultiLine data={replay.steps.map((s: any) => ({ date: s.date, valeur: Math.round(s.value) }))} lines={[{ key: "valeur", name: "Valeur (quantités fixes, CAD)" }]} height={220} yFmt={(v) => `${Math.round(v)}`} />
              <MultiLine data={replay.steps.map((s: any) => ({ date: s.date, recul: +(s.drawdown_from_start_peak * 100).toFixed(2), vol: s.vol_252 ? +(s.vol_252 * 100).toFixed(2) : null, corr: s.avg_corr ? +(s.avg_corr * 100).toFixed(1) : null }))}
                lines={[{ key: "recul", name: "Recul depuis le sommet (%)", color: "#fb7185" }, { key: "vol", name: "Volatilité 1 an (%)", color: "#fbbf24" }, { key: "corr", name: "Corrélation moyenne (×100)", color: "#818cf8" }]} height={200} yFmt={(v) => `${v}`} />
            </div>
            <div className="space-y-3 text-xs">
              <div className="rounded-xl bg-ink-850/70 p-3"><div className="mb-1 font-semibold text-white">Ce que le système savait au départ ({replay.initial_knowledge.date})</div><ul className="ml-4 list-disc text-slate-300">{replay.initial_knowledge.findings.map((f: string) => <li key={f}>{f}</li>)}</ul></div>
              <div className="rounded-xl bg-ink-850/70 p-3"><div className="mb-1 font-semibold text-white">Alternatives rejouées sur la même période</div>{Object.entries<any>(replay.alternatives).map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span className="tabular-nums">{pct(v.total_return)} · perte max {pct(v.max_drawdown)}</span></div>)}</div>
              <ul className="space-y-1 text-[11px] text-slate-500">{replay.integrity.map((x: string) => <li key={x}>• {x}</li>)}</ul>
            </div>
          </div>
          <Table className="mt-4" head={["Date", "Valeur", "Recul", "Alertes déclenchées", "Règles du budget en dépassement"]} rows={replay.steps.filter((s: any) => s.alerts.length).map((s: any) => [s.date, cad(s.value), pct(s.drawdown_from_start_peak), s.alerts.map((x: any) => <div key={x.title}><SeverityBadge severity={x.severity} /> {x.title}</div>), <span className="text-[11px] text-slate-500">{s.budget_breaches.join(", ")}</span>])} />
          <div className="mt-5"><div className="mb-2 text-sm font-semibold text-white"><History className="mr-1 inline h-4 w-4" /> Qu'est-ce qui a changé entre le début et la fin du rejeu ?</div><WhatChanged wc={replay.what_changed} /></div>
        </Card>
      )}
      <Card title="Qu'est-ce qui a changé ?" subtitle="Comparer deux instantanés d'analyse enregistrés" className="mt-5">
        <div className="flex flex-wrap items-end gap-2">
          <Select label="Avant" value={a} onChange={setA} options={[{ value: "", label: "—" }, ...snapOpts]} className="min-w-[18rem]" />
          <Select label="Après" value={b} onChange={setB} options={[{ value: "", label: "—" }, ...snapOpts]} className="min-w-[18rem]" />
          <Button variant="ghost" onClick={compare} disabled={!a || !b}>Comparer</Button>
        </div>
        <div className="mt-4"><WhatChanged wc={wc} /></div>
      </Card>
    </div>
  );
}
