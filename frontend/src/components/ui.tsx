import clsx from "clsx";
import { AlertTriangle, CheckCircle2, CircleDashed, Info, Loader2, MinusCircle, XCircle } from "lucide-react";
import { ReactNode, useState } from "react";
import { AGENT_FR, CLAIM_FR, STATUS_FR, TIER_FR } from "../lib/format";
import type { JobStep } from "../services/api";

export function Card({ title, subtitle, actions, children, className, accent }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; accent?: "teal" | "rose" | "violet" | "amber" }) {
  return (
    <section className={clsx("rounded-2xl border border-ink-700/70 bg-ink-900/70 backdrop-blur-sm p-5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
      accent === "teal" && "border-t-2 border-t-aegis-500/70", accent === "rose" && "border-t-2 border-t-rose-500/70",
      accent === "violet" && "border-t-2 border-t-violet-500/70", accent === "amber" && "border-t-2 border-t-amber-500/70", className)}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-slate-100 tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Button({ children, onClick, variant = "primary", disabled, className, type = "button", title }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "danger" | "subtle"; disabled?: boolean; className?: string; type?: "button" | "submit"; title?: string }) {
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled}
      className={clsx("inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-aegis-400 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-aegis-500 text-ink-950 hover:bg-aegis-400",
        variant === "ghost" && "border border-ink-600 text-slate-200 hover:border-aegis-500/60 hover:text-white",
        variant === "subtle" && "bg-ink-800 text-slate-200 hover:bg-ink-700",
        variant === "danger" && "bg-rose-500/90 text-white hover:bg-rose-500", className)}>
      {children}
    </button>
  );
}

const tierColor: Record<string, string> = {
  LOW: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  HIGH: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  UNKNOWN: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};
export function TierBadge({ tier, className }: { tier?: string; className?: string }) {
  const t = tier || "UNKNOWN";
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", tierColor[t], className)}>Risque {TIER_FR[t] || t}</span>;
}

const sevColor: Record<string, string> = {
  critical: "bg-rose-500/15 text-rose-300 ring-rose-500/40",
  warning: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
  informational: "bg-sky-500/15 text-sky-300 ring-sky-500/40",
};
const sevFR: Record<string, string> = { critical: "Critique", warning: "Avertissement", informational: "Informatif" };
export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", sevColor[severity] || sevColor.informational)}>{sevFR[severity] || severity}</span>;
}

const claimColor: Record<string, string> = {
  VERIFIED: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  CORROBORATED: "bg-teal-500/15 text-teal-300 ring-teal-500/40",
  DISPUTED: "bg-orange-500/15 text-orange-300 ring-orange-500/40",
  UNVERIFIED: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
  FALSE_AS_SUPPORTED_BY_EVIDENCE: "bg-rose-500/15 text-rose-300 ring-rose-500/40",
  UNKNOWN: "bg-slate-500/15 text-slate-300 ring-slate-500/40",
  REPORTED: "bg-slate-500/15 text-slate-300 ring-slate-500/40",
};
export function ClaimBadge({ status }: { status: string }) {
  return <span className={clsx("inline-flex whitespace-nowrap items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", claimColor[status] || claimColor.UNKNOWN)}>{CLAIM_FR[status] || status}</span>;
}

const lensColor: Record<string, string> = {
  COMPUTED: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  PARTIAL: "bg-teal-500/10 text-teal-200 ring-teal-500/30",
  UNAVAILABLE: "bg-amber-500/10 text-amber-200 ring-amber-500/30 border-dashed",
  NOT_APPLICABLE: "bg-slate-500/10 text-slate-400 ring-slate-500/30",
  COVERED: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  NOT_COVERED_DATA_UNAVAILABLE: "bg-amber-500/10 text-amber-200 ring-amber-500/30",
  NOT_COVERABLE: "bg-violet-500/10 text-violet-200 ring-violet-500/30",
  OK: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  FIXTURE: "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-500/40",
  NOT_CONNECTED: "bg-slate-500/10 text-slate-400 ring-slate-500/30",
  BREACH: "bg-rose-500/15 text-rose-300 ring-rose-500/40",
  ABOVE_BAND: "bg-rose-500/15 text-rose-300 ring-rose-500/40",
  BELOW_BAND: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
};
const lensFR: Record<string, string> = {
  COMPUTED: "Calculé", PARTIAL: "Partiel", UNAVAILABLE: "Indisponible", NOT_APPLICABLE: "Non applicable", COVERED: "Couvert",
  NOT_COVERED_DATA_UNAVAILABLE: "Non couvert – données indisponibles", NOT_COVERABLE: "Non couvrable", OK: "OK", FIXTURE: "Fixture fictive",
  NOT_CONNECTED: "Non connecté", BREACH: "Dépassement", ABOVE_BAND: "Au-dessus de la bande", BELOW_BAND: "Sous la bande", UNKNOWN: "Inconnu",
};
export function StatusPill({ status }: { status: string }) {
  return <span className={clsx("inline-flex whitespace-nowrap items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", lensColor[status] || "bg-slate-500/10 text-slate-300 ring-slate-500/30")}>{lensFR[status] || status}</span>;
}

export function SupervisorStatus({ status }: { status?: string }) {
  const color = status === "research-supported" ? "from-emerald-500/30 to-emerald-500/5 text-emerald-200 ring-emerald-400/40"
    : status === "conflicts-with-persona-constraints" ? "from-rose-500/30 to-rose-500/5 text-rose-200 ring-rose-400/40"
    : status === "insufficient-data" ? "from-slate-500/30 to-slate-500/5 text-slate-200 ring-slate-400/40"
    : "from-amber-500/25 to-amber-500/5 text-amber-100 ring-amber-400/40";
  return <span className={clsx("inline-flex items-center rounded-xl bg-gradient-to-r px-3 py-1 text-xs font-semibold ring-1", color)}>{STATUS_FR[status || ""] || status}</span>;
}

export function Metric({ label, value, hint, tone, id }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" | "warn"; id?: string }) {
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-850/70 p-3.5" title={id ? `Identifiant de calcul : ${id}` : undefined}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={clsx("mt-1 text-xl font-semibold tabular-nums", tone === "good" && "text-emerald-300", tone === "bad" && "text-rose-300", tone === "warn" && "text-amber-300", !tone && "text-white")}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return <div className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> {label}</div>;
}

export function ErrorBox({ error }: { error: any }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div><div className="font-medium">{error.message || "Erreur"}</div>{error.code && <div className="text-xs text-rose-300/70">code : {error.code}</div>}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-ink-600 p-6 text-center text-sm text-slate-400">{children}</div>;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "fixture" }) {
  return (
    <div className={clsx("flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed",
      tone === "info" && "border-sky-500/30 bg-sky-500/5 text-sky-200", tone === "warn" && "border-amber-500/30 bg-amber-500/5 text-amber-100",
      tone === "fixture" && "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-100")}>
      {tone === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

export function MetricRef({ id, ledger }: { id: string; ledger?: Record<string, any> }) {
  const [open, setOpen] = useState(false);
  const m = ledger?.[id];
  return (
    <span className="relative inline-block">
      <button onClick={() => setOpen(!open)} className={clsx("rounded-md px-1.5 py-0.5 font-mono text-[10px] ring-1", m ? "bg-aegis-500/10 text-aegis-300 ring-aegis-500/30" : "bg-rose-500/10 text-rose-300 ring-rose-500/30")}>
        {id}{m ? ` = ${m.display}` : " (inexistant)"}
      </button>
      {open && m && (
        <span className="absolute left-0 top-6 z-30 w-80 rounded-xl border border-ink-600 bg-ink-850 p-3 text-xs text-slate-300 shadow-2xl">
          <span className="block font-semibold text-white">{m.label}</span>
          <span className="mt-1 block">Valeur : <b>{m.display}</b> · {m.info_class}</span>
          <span className="block">Méthode : {m.method}</span>
          {m.window_start && <span className="block">Fenêtre : {m.window_start} → {m.window_end}</span>}
          <span className="block">Sources : {(m.source_ids || []).join(", ")}</span>
          {m.quality_flags?.length > 0 && <span className="block text-amber-300">Drapeaux : {m.quality_flags.join(", ")}</span>}
          <span className="block text-slate-500">{m.calculation_version}</span>
        </span>
      )}
    </span>
  );
}

const stepIcon = (s: JobStep["status"]) =>
  s === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : s === "running" ? <Loader2 className="h-4 w-4 animate-spin text-aegis-400" />
    : s === "failed" ? <XCircle className="h-4 w-4 text-rose-400" /> : s === "skipped" ? <MinusCircle className="h-4 w-4 text-slate-500" /> : <CircleDashed className="h-4 w-4 text-slate-600" />;

export function ActivityTimeline({ steps, compact }: { steps: JobStep[]; compact?: boolean }) {
  if (!steps?.length) return null;
  return (
    <ol className="space-y-1.5">
      {steps.map((s) => (
        <li key={s.step_id} className={clsx("flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs", s.status === "running" && "bg-aegis-500/5")}>
          <span className="mt-0.5">{stepIcon(s.status)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium text-slate-200">{s.label}</span>
              <span className="text-[10px] text-slate-500">{AGENT_FR[s.agent_id] || s.agent_id}</span>
              {s.latency_ms > 0 && <span className="text-[10px] text-slate-500">{(s.latency_ms / 1000).toFixed(1)} s</span>}
              {s.input_tokens > 0 && <span className="text-[10px] text-violet-300/80">Bedrock · {s.input_tokens + s.output_tokens} jetons</span>}
            </div>
            {!compact && s.detail && <div className="truncate text-[11px] text-slate-500" title={s.detail || ""}>{s.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Table({ head, rows, className }: { head: ReactNode[]; rows: ReactNode[][]; className?: string }) {
  return (
    <div className={clsx("overflow-x-auto", className)}>
      <table className="w-full text-left text-xs">
        <thead><tr className="border-b border-ink-700 text-[11px] uppercase tracking-wide text-slate-400">{head.map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-ink-800/80 last:border-0 hover:bg-ink-800/40">{r.map((c, j) => <td key={j} className="px-2 py-2 align-top text-slate-300">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Select({ value, onChange, options, className, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string; label?: string }) {
  return (
    <label className={clsx("flex flex-col gap-1 text-xs text-slate-400", className)}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-slate-100 focus:border-aegis-500 focus:outline-none">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Input({ value, onChange, label, type = "text", placeholder, className, step }: { value: string | number; onChange: (v: string) => void; label?: string; type?: string; placeholder?: string; className?: string; step?: string }) {
  return (
    <label className={clsx("flex flex-col gap-1 text-xs text-slate-400", className)}>
      {label}
      <input type={type} step={step} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-aegis-500 focus:outline-none" />
    </label>
  );
}

export function Disclaimer() {
  return <p className="text-[11px] leading-relaxed text-slate-500">Simulation et éducation uniquement. AEGIS n'exécute aucune transaction, ne fournit pas de conseil en placement personnalisé et ne prédit pas les rendements futurs.</p>;
}
