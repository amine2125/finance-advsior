import clsx from "clsx";
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, Info, Loader2, MinusCircle, XCircle } from "lucide-react";
import { ReactNode, useState } from "react";
import { ApiError, JobStep } from "../services/api";

export function Button({ children, variant = "primary", size = "md", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...p}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-3 py-1.5 text-sm",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-6 py-3.5 text-base",
        variant === "primary" && "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
        variant === "secondary" && "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        variant === "danger" && "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ title, subtitle, action, children, className, pad = true }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx("rounded-2xl border border-slate-200 bg-white shadow-card", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={clsx(pad && "p-5", title && pad && "pt-4")}>{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-slate-100 text-slate-700",
  good: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  bad: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  info: "bg-brand-50 text-brand-700 ring-1 ring-brand-100",
};
export type Tone = keyof typeof TONES;
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)}>{children}</span>;
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "bad" | "good"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = tone === "warn" ? AlertTriangle : tone === "bad" ? XCircle : tone === "good" ? CheckCircle2 : Info;
  return (
    <div className={clsx("flex gap-3 rounded-xl p-3.5 text-sm",
      tone === "info" && "bg-brand-50 text-brand-900", tone === "warn" && "bg-amber-50 text-amber-900",
      tone === "bad" && "bg-rose-50 text-rose-900", tone === "good" && "bg-emerald-50 text-emerald-900", className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{title && <div className="font-medium">{title}</div>}{children && <div className={clsx(title && "mt-0.5", "opacity-90")}>{children}</div>}</div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {label || "Chargement…"}</div>;
}

export function ErrorBox({ error, onRetry }: { error: ApiError | Error | null | undefined; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <Notice tone="bad" title="Un problème est survenu">
      {error.message}
      {onRetry && <button onClick={onRetry} className="ml-2 font-medium underline">Réessayer</button>}
    </Notice>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>}
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {children && <p className="mt-1 max-w-md text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={clsx("mt-1 text-2xl font-semibold tracking-tight", tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** "Comment c'est calculé ?" – every number can be opened to see its method, window and source. */
export function Explain({ label = "Comment c'est calculé ?", children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
        <ChevronDown className={clsx("h-3.5 w-3.5 transition", open && "rotate-180")} /> {label}
      </button>
      {open && <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

export function Choice({ selected, onClick, title, desc, icon }: { selected: boolean; onClick: () => void; title: ReactNode; desc?: ReactNode; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={clsx("flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition",
        selected ? "border-brand-500 bg-brand-50 ring-4 ring-brand-100" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50")}>
      {icon && <div className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-xl", selected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600")}>{icon}</div>}
      <div className="min-w-0">
        <div className="font-medium text-slate-900">{title}</div>
        {desc && <div className="mt-0.5 text-sm text-slate-500">{desc}</div>}
      </div>
    </button>
  );
}

export function YesNo({ value, onChange }: { value: boolean | null | undefined; onChange: (v: boolean | null) => void }) {
  const opt = (v: boolean | null, l: string) => (
    <button type="button" onClick={() => onChange(v)}
      className={clsx("rounded-lg px-3 py-1.5 text-sm font-medium transition", value === v ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>{l}</button>
  );
  return <div className="flex gap-1.5">{opt(true, "Oui")}{opt(false, "Non")}{opt(null, "Je ne sais pas")}</div>;
}

const AGENT_FR: Record<string, string> = {
  supervisor: "Superviseur", data_agent: "Données", quant_agent: "Calculs", hypothesis_agent: "Validation historique",
  market_intelligence_agent: "Recherche", opportunity_agent: "Opportunités", risk_agent: "Risques", audit_agent: "Vérification",
  persona_agent: "Profil", copilot: "Assistant", guardian: "Surveillance",
};

/** Real agent task states from the backend job (never an animation). */
export function AgentSteps({ steps }: { steps: JobStep[] }) {
  if (!steps?.length) return <Spinner label="Démarrage des agents…" />;
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
        <li key={s.step_id} className="flex items-start gap-2.5 text-sm">
          {s.status === "done" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            : s.status === "running" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-600" />
              : s.status === "failed" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                : s.status === "skipped" ? <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                  : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
          <div className="min-w-0">
            <span className="text-slate-800">{s.label}</span>
            <span className="ml-1.5 text-xs text-slate-400">· {AGENT_FR[s.agent_id] || s.agent_id}</span>
            {s.detail && s.status !== "pending" && <div className="truncate text-xs text-slate-500">{s.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Disclaimer() {
  return (
    <p className="text-xs leading-relaxed text-slate-400">
      Aucune transaction réelle n'est exécutée · ceci n'est pas un conseil financier personnalisé · le passé ne garantit pas l'avenir.
    </p>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
