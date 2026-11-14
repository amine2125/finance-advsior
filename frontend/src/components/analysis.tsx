import { ExternalLink } from "lucide-react";
import { cad, date, pct, TIER_FR } from "../lib/format";
import { Card, ClaimBadge, Notice, SeverityBadge, StatusPill, Table, TierBadge } from "./ui";

export function FindingsList({ findings }: { findings: any[] }) {
  if (!findings?.length) return <p className="text-sm text-slate-400">Aucun constat au-delà des seuils.</p>;
  const kindFR: Record<string, string> = {
    direct_issuer: "Concentration directe", sector: "Exposition sectorielle", etf_overlap_suspected: "Chevauchement FNB suspecté (non quantifié)",
    etf_overlap_verified: "Chevauchement FNB vérifié", correlation: "Corrélation statistique", duplicate_line: "Ligne en double", hhi: "Indice HHI",
    currency: "Devise de cotation", asset_class: "Classe d'actifs",
  };
  return (
    <ul className="space-y-2">
      {findings.map((f) => (
        <li key={f.finding_id} className="rounded-xl border border-ink-700/60 bg-ink-850/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity} />
            <span className="text-[11px] uppercase tracking-wide text-slate-500">{kindFR[f.kind] || f.kind}</span>
            {f.info_class === "INTERPRETATION" && <span className="text-[10px] text-violet-300">interprétation</span>}
          </div>
          <div className="mt-1 text-sm font-medium text-slate-100">{f.title}</div>
          <div className="text-xs text-slate-400">{f.detail}</div>
        </li>
      ))}
    </ul>
  );
}

export function BudgetTable({ checks }: { checks: any[] }) {
  return (
    <Table head={["Règle", "Limite", "Mesuré", "Statut"]} rows={(checks || []).map((c) => [
      <span className="text-slate-200">{c.label}</span>, c.limit, <span className="tabular-nums">{c.measured}</span>, <StatusPill status={c.status} />])} />
  );
}

export function PersonaPanel({ pa }: { pa: any }) {
  if (!pa) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">Niveau permis</span> <TierBadge tier={pa.allowed_tier} />
        <span className="text-slate-400">· mesuré</span> <TierBadge tier={pa.portfolio_tier} />
        <span className={pa.compatible ? "text-emerald-300" : "text-rose-300"}>{pa.compatible ? "Compatible avec le budget" : "Incompatible avec le budget déclaré"}</span>
      </div>
      <div className="rounded-xl bg-ink-850/70 p-3 text-xs text-slate-300">
        <div className="mb-1 font-semibold text-slate-200">Règle de l'horizon : niveau permis = min(horizon, capacité, tolérance)</div>
        {Object.entries(pa.tier_inputs || {}).map(([k, v]) => (
          <div key={k} className={pa.binding_inputs?.includes(k) ? "text-amber-200" : ""}>• {k}{pa.binding_inputs?.includes(k) ? " (déterminant)" : ""} : {String(v)}</div>
        ))}
        {pa.uncertainties?.length > 0 && <div className="mt-1 text-slate-500">Incertitudes : {pa.uncertainties.join(" ; ")}</div>}
      </div>
      <BudgetTable checks={pa.budget_checks} />
      <div className="grid gap-1 text-[11px] text-slate-400 md:grid-cols-2">
        {(pa.checks || []).map((c: any) => (
          <div key={c.check} className="flex gap-1.5"><span className={c.triggered ? "text-amber-300" : c.triggered === false ? "text-emerald-400" : "text-slate-500"}>{c.triggered ? "⚠" : c.triggered === false ? "✓" : "?"}</span>{c.detail}</div>
        ))}
      </div>
    </div>
  );
}

export function LensTable({ lenses }: { lenses: Record<string, any> }) {
  const keys = Object.keys(lenses || {}).sort();
  return (
    <Table head={["Lentille", "Question", "Statut", "Détail / angle mort"]} rows={keys.map((k) => {
      const l = lenses[k];
      return [<span className="font-medium text-slate-200">{k}. {l.name}</span>, <span className="text-slate-400">{l.question}</span>, <StatusPill status={l.status} />,
        <div className="max-w-md text-[11px] text-slate-400">{l.reason || lensSummary(l)}{l.blind_spots && <div className="text-slate-500">Angles morts : {l.blind_spots.join(" · ")}</div>}</div>];
    })} />
  );
}

function lensSummary(l: any): string {
  if (l.lens === 3 && l.volatility !== undefined) return `Vol. ${pct(l.volatility)} · EWMA ${pct(l.ewma_vol)} · perte max ${pct(l.drawdown?.max_drawdown)} · bêta ${l.beta?.beta?.toFixed(2) ?? "n/d"}`;
  if (l.lens === 4 && l.status === "COMPUTED") return `Momentum 12-1 ${pct(l.momentum_12_1)} · RSI ${l.rsi14?.toFixed(0) ?? "n/d"} · ${l.moving_averages?.above_ma200 ? "au-dessus" : "sous"} la MM200 (contexte, jamais un signal)`;
  if (l.lens === 1 && l.status === "COMPUTED") return `ROIC ${pct(l.quality?.roic)} · ${l.altman?.variant || ""} ${l.altman?.value?.toFixed?.(2) ?? "n/d"} · M ${l.beneish?.value?.toFixed?.(2) ?? "n/d"} · F ${l.piotroski?.value ?? l.piotroski?.partial_score} — dépôt ${l.filing?.filed}`;
  if (l.lens === 2 && l.status === "COMPUTED") return l.statement;
  if (l.lens === 5) return `${l.verified_events ?? 0} événement(s) vérifié(s), ${l.claims ?? 0} affirmation(s); non connecté : ${(l.not_connected || []).join(", ")}`;
  return "";
}

export function CoverageMatrix({ rows }: { rows: any[] }) {
  if (!rows?.length) return null;
  return (
    <Table head={["#", "Mode d'échec", "Vérification", "Statut", "Résultat"]} rows={rows.map((r) => [r.id, <span className="text-slate-200">{r.name}</span>,
      <span className="text-[11px] text-slate-500">{r.check}</span>, <StatusPill status={r.status} />, <span className="text-[11px]">{r.result}</span>])} />
  );
}

export function ClaimsLedger({ claims, evidence }: { claims: any[]; evidence?: any[] }) {
  const ev = Object.fromEntries((evidence || []).map((e) => [e.evidence_id, e]));
  if (!claims?.length) return <p className="text-sm text-slate-400">Aucune affirmation extraite (aucune source d'actualités disponible ou aucune affirmation vérifiable).</p>;
  return (
    <ul className="space-y-2">
      {claims.map((c) => (
        <li key={c.claim_id} className="rounded-xl border border-ink-700/60 bg-ink-850/60 p-3">
          <div className="flex flex-wrap items-center gap-2"><ClaimBadge status={c.status} /><span className="font-mono text-[10px] text-slate-500">{c.claim_id}</span>
            <span className="text-[10px] text-slate-500">{c.claim_type} · {c.independent_reports} rapport(s) indépendant(s){c.publishers?.length ? ` · ${c.publishers.slice(0, 3).join(", ")}` : ""}</span></div>
          <div className="mt-1 text-sm text-slate-100">{c.proposition}</div>
          <div className="text-xs text-slate-400">{c.rationale}</div>
          {c.injection_flags?.includes("possible_prompt_injection") && <div className="text-[11px] text-fuchsia-300">Tentative d'injection d'instructions neutralisée</div>}
          <div className="mt-1 flex flex-wrap gap-2">
            {(c.source_evidence_ids || []).slice(0, 3).map((id: string) => ev[id] && (
              ev[id].canonical_url ? <a key={id} href={ev[id].canonical_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[11px] text-aegis-300 hover:underline">{ev[id].publisher} · {date(ev[id].published_at)} <ExternalLink className="h-3 w-3" /></a>
                : <span key={id} className="text-[11px] text-fuchsia-300">{ev[id].publisher} (fixture)</span>))}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EventsTimeline({ events }: { events: any[] }) {
  if (!events?.length) return <p className="text-sm text-slate-400">Aucun événement daté disponible.</p>;
  return (
    <ol className="relative space-y-3 border-l border-ink-700 pl-4">
      {events.slice(0, 25).map((e) => (
        <li key={e.event_id} className="relative">
          <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${e.primary_source ? "bg-emerald-400" : "bg-slate-500"}`} />
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>{date(e.published_at || e.occurred_at)}</span><ClaimBadge status={e.status} /><span>{e.primary_source ? "Source primaire" : `Couverture médiatique${e.size > 1 ? ` · ${e.size} articles (1 rapport)` : ""}`}</span>
            {e.red_flags?.length > 0 && <span className="text-rose-300">⚑ {e.red_flags.join(", ")}</span>}
          </div>
          <div className="text-sm text-slate-200">{e.url ? <a href={e.url} target="_blank" rel="noreferrer noopener" className="hover:text-aegis-300 hover:underline">{e.title}</a> : e.title}</div>
        </li>
      ))}
    </ol>
  );
}

export function ImpactPanel({ impact }: { impact: any }) {
  if (!impact) return null;
  const fmt = (r: any, v: any) => (v === null || v === undefined ? "n/d" : r.unit === "pct" ? pct(v) : r.unit === "cad" ? cad(v) : Number(v).toFixed(2));
  return (
    <div className="space-y-4">
      <Notice tone="warn">{impact.label}</Notice>
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-300">Portefeuille avant / après</div>
          <Table head={["Mesure", "Avant", "Après", "Δ"]} rows={impact.rows.map((r: any) => [r.label, fmt(r, r.before), fmt(r, r.after),
            <span className={r.delta > 0 && ["pf.vol", "pf.hhi", "pf.var95", "pf.single_issuers"].includes(r.metric) ? "text-rose-300" : ""}>{r.delta === null ? "n/d" : fmt(r, r.delta)}</span>])} />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-300">Budget de risque du profil avant / après</div>
          <Table head={["Règle", "Avant", "Après", "Limite"]} rows={impact.budget.map((b: any) => [b.label, <span>{b.before} <StatusPill status={b.before_status || "UNKNOWN"} /></span>,
            <span>{b.after} <StatusPill status={b.after_status} />{b.new_breach && <span className="ml-1 text-[10px] font-bold text-rose-300">NOUVEAU</span>}</span>, b.limit])} />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-300">Trois montants hypothétiques</div>
          <Table head={["Montant", "Poids", "Vol. portefeuille", "Perte max.", "Dépassements"]} rows={impact.ladder.map((l: any) => [cad(l.amount_cad), pct(l.weight), pct(l.vol), pct(l.mdd),
            l.breaches.length ? <span className="text-rose-300">{l.breaches.join(", ")}</span> : <span className="text-emerald-300">aucun</span>])} />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-300">Taille de position éducative (perte max. {pct(impact.position_size_education.max_loss_per_idea_pct, 0)} du portefeuille)</div>
          <Table head={["Baisse défavorable supposée", "Perte max. (CAD)", "Taille de position"]} rows={impact.position_size_education.rows.map((r: any) => [pct(r.adverse_move), cad(r.max_loss_cad), `${cad(r.position_cad)} (${pct(r.position_pct)})`])} />
          <p className="mt-1 text-[11px] text-slate-500">{impact.position_size_education.rule}. {impact.position_size_education.label}.</p>
        </div>
      </div>
      {impact.asset_tier && <div className="text-xs text-slate-400">Niveau de l'actif : <TierBadge tier={impact.asset_tier.tier} /> · vol. {pct(impact.asset_tier.volatility)} · perte max {pct(impact.asset_tier.max_drawdown)} ({TIER_FR[impact.asset_tier.tier]})</div>}
    </div>
  );
}

export function Reconciliation({ rec, verdict }: { rec: any; verdict?: any }) {
  if (!rec) return null;
  const vmap = Object.fromEntries((rec.claim_verdicts || []).map((v: any) => [v.claim_id, v]));
  const vcol: Record<string, string> = { Supported: "text-emerald-300", Contradicted: "text-rose-300", Inconclusive: "text-amber-300", "Not testable": "text-slate-400" };
  const vfr: Record<string, string> = { Supported: "Étayée", Contradicted: "Contredite", Inconclusive: "Non concluante", "Not testable": "Non testable" };
  return (
    <Card title="Recherche Internet vs Données" subtitle={rec.agreement_text} accent="violet">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Preuves Internet</div>
          {rec.internet_evidence?.length ? (
            <ul className="space-y-2">
              {rec.internet_evidence.slice(0, 14).map((e: any) => (
                <li key={e.claim_id} className="rounded-lg bg-ink-850/70 p-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2"><ClaimBadge status={e.status} />{vmap[e.claim_id] && <span className={vcol[vmap[e.claim_id].verdict]}>Verdict : {vfr[vmap[e.claim_id].verdict]}</span>}{e.is_fixture && <span className="text-fuchsia-300">fixture fictive</span>}</div>
                  <div className="mt-1 text-slate-200">{e.proposition}</div>
                  {e.sources?.map((s: any, i: number) => s.url ? <a key={i} href={s.url} target="_blank" rel="noreferrer noopener" className="mr-2 inline-flex items-center gap-1 text-[11px] text-aegis-300 hover:underline">{s.publisher} · {date(s.published_at)} <ExternalLink className="h-3 w-3" /></a> : <span key={i} className="mr-2 text-[11px] text-slate-500">{s.publisher}</span>)}
                  {vmap[e.claim_id] && <div className="text-[11px] text-slate-500">{vmap[e.claim_id].basis}</div>}
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-slate-500">Aucune preuve Internet récupérée pour cette question.</p>}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Preuves quantitatives</div>
          <ul className="space-y-1.5">
            {rec.quantitative_evidence?.map((q: any) => (
              <li key={q.metric_id} className="flex items-start justify-between gap-2 rounded-lg bg-ink-850/70 p-2 text-xs">
                <div><div className="text-slate-200">{q.label}</div><div className="text-[10px] text-slate-500">{q.method} · {q.window?.[0] || "…"} → {q.window?.[1] || "…"} · {q.sources?.join(", ")}</div></div>
                <div className="font-semibold tabular-nums text-white">{q.display}</div>
              </li>
            ))}
          </ul>
          <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Hypothèses pré-enregistrées (hors échantillon)</div>
          <ul className="space-y-1.5">
            {rec.hypotheses?.map((h: any) => (
              <li key={h.hypothesis} className="rounded-lg bg-ink-850/70 p-2 text-xs">
                <div className="flex items-center gap-2"><b className="text-white">{h.hypothesis}</b><span className={h.supported ? "text-emerald-300" : h.status === "evaluated" ? "text-rose-300" : "text-slate-400"}>{h.supported ? "confirmée" : h.status === "evaluated" ? "non confirmée" : "non évaluable"}</span>
                  <span className="text-[10px] text-slate-500">test {h.split?.holdout?.[0]} → {h.split?.holdout?.[1]} · empreinte {h.spec_hash}</span></div>
                <div className="text-[11px] text-slate-400">{h.statement}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Notice tone="info">{rec.dataset_limit}</Notice>
      {verdict && <div className="mt-3 text-xs text-slate-400">Verdict du Superviseur : <b className="text-white">{verdict.headline}</b></div>}
      {rec.correction_log?.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Journal de corrections (avant réponse)</div>
          <Table head={["Étape", "Original", "Problème", "Action"]} rows={rec.correction_log.map((c: any) => [c.stage, <span className="text-[11px] text-slate-400">{c.original}</span>, <span className="text-[11px] text-amber-200">{c.issue}</span>, <span className="text-[11px]">{c.action}</span>])} />
        </div>
      )}
    </Card>
  );
}
