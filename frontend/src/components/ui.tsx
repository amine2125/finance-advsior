import clsx from "clsx";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, XCircle } from "lucide-react";
import { ReactNode, useState } from "react";
import { ApiError } from "../services/api";

type BtnVariant = "primary" | "gold" | "navy" | "secondary" | "ghost" | "danger" | "onDark";
export function Button({ children, variant = "primary", size = "md", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...p}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" && "h-8 px-3.5 text-sm",
        size === "md" && "h-10 px-5 text-sm",
        size === "lg" && "h-12 px-6 text-[15px]",
        (variant === "primary" || variant === "navy") && "bg-ink text-white hover:bg-black",
        variant === "gold" && "bg-gold-500 text-ink hover:bg-gold-400",
        variant === "secondary" && "border border-line bg-white text-ink hover:border-ink/30",
        variant === "ghost" && "text-ink-soft hover:bg-canvas hover:text-ink",
        variant === "danger" && "text-accent-700 hover:bg-accent-50",
        variant === "onDark" && "border border-white/25 text-white hover:bg-white/10",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A section of the page, not a box: a heading, then content on the page itself. */
export function Card({ title, subtitle, action, children, className, pad = true }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx("border-t border-line", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 pt-6">
          <div>
            {title && <h2 className="font-display text-xl font-medium text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={clsx(pad && "py-5", title && pad && "pt-4")}>{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-canvas text-ink-soft",
  good: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  bad: "bg-accent-50 text-accent-700 ring-1 ring-accent-100",
  info: "bg-brand-50 text-brand-800 ring-1 ring-brand-100",
};
export type Tone = keyof typeof TONES;
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>{children}</span>;
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "bad" | "good"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = tone === "warn" ? AlertTriangle : tone === "bad" ? XCircle : tone === "good" ? CheckCircle2 : Info;
  return (
    <div className={clsx("flex gap-3 rounded-xl p-3.5 text-sm",
      tone === "info" && "bg-brand-50 text-brand-800", tone === "warn" && "bg-amber-50 text-amber-900",
      tone === "bad" && "bg-accent-50 text-accent-700", tone === "good" && "bg-emerald-50 text-emerald-900", className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{title && <div className="font-semibold">{title}</div>}{children && <div className={clsx(title && "mt-0.5", "opacity-90")}>{children}</div>}</div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center gap-2 py-8 text-sm text-ink-soft"><Loader2 className="h-4 w-4 animate-spin text-brand-500" /> {label || "Chargement…"}</div>;
}

export function ErrorBox({ error, onRetry }: { error: ApiError | Error | null | undefined; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <Notice tone="bad" title="Un problème est survenu">
      {error.message}
      {onRetry && <button onClick={onRetry} className="ml-2 font-semibold underline">Réessayer</button>}
    </Notice>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-800">{icon}</div>}
      <h3 className="font-bold text-brand-800">{title}</h3>
      {children && <p className="mt-1 max-w-md text-sm text-ink-soft">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
      <div className="text-xs font-medium text-ink-soft">{label}</div>
      <div className={clsx("tabular mt-1 text-2xl font-bold tracking-tight", tone === "bad" ? "text-accent-700" : tone === "warn" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : "text-brand-800")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

/** Collapsed details: the method behind a number, for those who want it. */
export function Explain({ label = "Comment c'est calculé ?", children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-500 hover:text-brand-600">
        <ChevronDown className={clsx("h-3.5 w-3.5 transition", open && "rotate-180")} /> {label}
      </button>
      {open && <div className="mt-2 rounded-xl bg-canvas p-3 text-xs leading-relaxed text-ink-soft">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none";

export function Choice({ selected, onClick, title, desc, icon }: { selected: boolean; onClick: () => void; title: ReactNode; desc?: ReactNode; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={clsx("flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3.5 text-left transition",
        selected ? "border-ink ring-1 ring-ink" : "border-line hover:border-ink/30")}>
      {icon && <div className="grid h-8 w-8 shrink-0 place-items-center text-ink-soft">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{title}</div>
        {desc && <div className="mt-0.5 text-sm text-ink-muted">{desc}</div>}
      </div>
      <span className={clsx("grid h-5 w-5 shrink-0 place-items-center rounded-full border", selected ? "border-ink bg-ink" : "border-line")}>{selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
    </button>
  );
}

export function YesNo({ value, onChange }: { value: boolean | null | undefined; onChange: (v: boolean | null) => void }) {
  const opt = (v: boolean | null, l: string) => (
    <button type="button" onClick={() => onChange(v)}
      className={clsx("rounded-full px-3.5 py-1.5 text-sm font-medium transition", value === v ? "bg-ink text-white" : "border border-line bg-white text-ink hover:border-ink/30")}>{l}</button>
  );
  return <div className="flex gap-1.5">{opt(true, "Oui")}{opt(false, "Non")}{opt(null, "Je ne sais pas")}</div>;
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={clsx("text-xs leading-relaxed text-ink-muted", className)}>
      Simulation éducative : aucune transaction réelle n'est exécutée. Ceci n'est pas un conseil financier personnalisé. Le passé ne garantit pas l'avenir.
    </p>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-4xl font-medium text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Risk level as a 3-step gauge + word: readable without colour. */
export function RiskLevel({ tier, compact }: { tier: string; compact?: boolean }) {
  const n = tier === "LOW" ? 1 : tier === "MEDIUM" ? 2 : tier === "HIGH" ? 3 : 0;
  const label = { LOW: "Faible", MEDIUM: "Moyen", HIGH: "Élevé" }[tier] || "Inconnu";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft" title={`Risque ${label.toLowerCase()}`}>
      <span className="flex items-end gap-[2px]">
        {[1, 2, 3].map((i) => (
          <span key={i} className={clsx("w-1.5 rounded-sm", i === 1 ? "h-2" : i === 2 ? "h-3" : "h-4",
            i <= n ? (n === 3 ? "bg-accent-600" : n === 2 ? "bg-amber-500" : "bg-emerald-600") : "bg-line")} />
        ))}
      </span>
      {!compact && <span>{label}</span>}
    </span>
  );
}
