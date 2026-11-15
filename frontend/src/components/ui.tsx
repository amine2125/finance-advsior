import clsx from "clsx";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { spring } from "./motion";

/* Visual building blocks taken from AEGIS (buttons, sections, notices, titles), with ULYSSE names kept where pages use them. */

type BtnVariant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "onDark";
const btn = (variant: BtnVariant, size: "sm" | "md" | "lg", className?: string) => clsx(
  "inline-flex select-none items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-40",
  size === "sm" && "h-8 px-3.5 text-sm", size === "md" && "h-10 px-5 text-sm", size === "lg" && "h-12 px-6 text-[15px]",
  variant === "primary" && "bg-ink text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-black",
  variant === "accent" && "bg-primary-500 text-white shadow-glow hover:bg-primary-600",
  variant === "secondary" && "glass hairline text-ink hover:bg-white",
  variant === "ghost" && "text-ink-soft hover:bg-ink/[0.04] hover:text-ink",
  variant === "danger" && "text-loss-700 hover:bg-loss-50",
  variant === "onDark" && "border border-white/20 text-white hover:bg-white/10",
  className);

/** Tactile button: springs down on press. « accent » (cobalt) is reserved for the one main action of a screen. */
export function Button({ children, variant = "primary", size = "md", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return (
    <motion.button whileTap={p.disabled ? undefined : { scale: 0.97 }} whileHover={p.disabled ? undefined : { y: -1 }} transition={spring}
      type={p.type ?? "button"} {...(p as any)} className={btn(variant, size, className)}>
      {children}
    </motion.button>
  );
}

export function LinkButton({ to, children, variant = "secondary", size = "md", className }: { to: string; children: ReactNode; variant?: BtnVariant; size?: "sm" | "md" | "lg"; className?: string }) {
  return <Link to={to} className={btn(variant, size, className)}>{children}</Link>;
}

/** Inline text button (secondary actions inside a sentence or a list). */
export function TextButton({ children, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...p} className={clsx("text-sm font-medium text-primary-600 underline-offset-4 hover:underline disabled:opacity-40", className)}>{children}</button>;
}

/** A section of the page: a heading, then content on the page itself (AEGIS « Card »). */
export function Section({ title, subtitle, action, children, className, id }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; id?: string }) {
  return (
    <section className={clsx("border-t border-line", className)} aria-labelledby={title && id ? id : undefined}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-4 pt-6">
          <div>
            {title && <h2 id={id} className="font-display text-[22px] font-medium tracking-[-0.02em] text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={clsx("py-5", title && "pt-4")}>{children}</div>
    </section>
  );
}

/** White card with hairline (used for tiles, rule items, forms). */
export function Panel({ children, className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={clsx("rounded-2xl bg-white p-5 shadow-card", className)}>{children}</div>;
}

/** Dark headline card (key message of a screen). */
export function Hero({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("relative overflow-hidden rounded-[28px] bg-ink px-6 py-7 text-white sm:px-9 sm:py-8", className)}>
    <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary-500/25 blur-3xl" />
    <div className="relative">{children}</div>
  </section>;
}

export function PageTitle({ title, subtitle, action, eyebrow }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm text-ink-muted">{eyebrow}</p>}
        <h1 className="font-display text-[34px] font-medium leading-tight tracking-[-0.03em] text-ink sm:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Notice({ tone = "info", title, children, className, role }: { tone?: "info" | "warn" | "bad" | "good"; title?: ReactNode; children?: ReactNode; className?: string; role?: string }) {
  const Icon = tone === "warn" ? AlertTriangle : tone === "bad" ? XCircle : tone === "good" ? CheckCircle2 : Info;
  return (
    <div role={role} className={clsx("flex gap-3 rounded-2xl p-4 text-sm",
      tone === "info" && "bg-primary-50 text-primary-700", tone === "warn" && "bg-warn-50 text-warn-700",
      tone === "bad" && "bg-loss-50 text-loss-700", tone === "good" && "bg-gain-50 text-gain-700", className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{title && <div className="font-semibold">{title}</div>}{children && <div className={clsx(title && "mt-0.5")}>{children}</div>}</div>
    </div>
  );
}

/** Metric tile: small label, large number, optional period. */
export function Tile({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="tabular mt-1.5 font-display text-2xl font-medium tracking-[-0.02em] text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

export function Field({ label, hint, htmlFor, children, className }: { label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export const inputCls = "w-full min-h-[44px] rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none";

export function Choice({ selected, onClick, title, desc, icon }: { selected: boolean; onClick: () => void; title: ReactNode; desc?: ReactNode; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
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

/** Data table in the AEGIS style: hairlines, muted header, tabular numbers. */
export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm [&_td]:border-b [&_td]:border-line [&_td]:px-2 [&_td]:py-3 [&_td]:align-top [&_th]:border-b [&_th]:border-line [&_th]:px-2 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-ink-muted [&_tbody_th]:text-sm [&_tbody_th]:font-medium [&_tbody_th]:text-ink">
        {caption && <caption className="visuellement-cache">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={clsx("text-xs leading-relaxed text-ink-muted", className)}>
      Simulation éducative : aucune transaction réelle n'est exécutée. Ceci n'est pas un conseil financier. Profils et portefeuilles fictifs ; données publiques uniquement. Le passé ne garantit pas l'avenir.
    </p>
  );
}
