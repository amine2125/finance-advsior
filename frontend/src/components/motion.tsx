import clsx from "clsx";
import { animate, motion, MotionConfig, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { ReactNode, useEffect, useId } from "react";

/** One spring for the whole app: quick, slightly soft, never bouncy enough to feel playful. */
export const spring = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.8 };
export const softSpring = { type: "spring" as const, stiffness: 220, damping: 28 };

/** Honors the OS « reduce motion » setting everywhere. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={spring}>{children}</MotionConfig>;
}

/** Page enter: a short rise + fade. */
export function PageIn({ children, className, testid }: { children: ReactNode; className?: string; testid?: string }) {
  return (
    <motion.div className={className} data-testid={testid} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={softSpring}>
      {children}
    </motion.div>
  );
}

const list = { hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: softSpring } };

/** Staggered list: wrap rows in <StaggerItem>. */
export function Stagger({ children, className, as = "ul" }: { children: ReactNode; className?: string; as?: "ul" | "div" | "ol" }) {
  const C = motion[as];
  return <C className={className} variants={list} initial="hidden" animate="show">{children}</C>;
}
export function StaggerItem({ children, className, as = "li" }: { children: ReactNode; className?: string; as?: "li" | "div" }) {
  const C = motion[as];
  return <C className={className} variants={item}>{children}</C>;
}

/** Frosted card: translucent surface, 1px hairline, optional ambient accent glow. */
export function Glass({ children, className, glow }: { children: ReactNode; className?: string; glow?: boolean }) {
  return (
    <div className={clsx("relative overflow-hidden rounded-[28px] glass hairline", className)}>
      {glow && <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-500/15 blur-3xl" />}
      <div className="relative">{children}</div>
    </div>
  );
}

/** Segmented control with a sliding pill (shared layout animation). */
export function Segmented<T extends string | number>({ value, onChange, options, size = "md", testid }:
  { value: T; onChange: (v: T) => void; options: [T, string][]; size?: "sm" | "md"; testid?: string }) {
  const id = useId();
  return (
    <div className={clsx("relative inline-flex rounded-full bg-ink/[0.04] p-1", size === "sm" ? "text-xs" : "text-sm")} data-testid={testid}>
      {options.map(([v, l]) => (
        <motion.button key={String(v)} type="button" onClick={() => onChange(v)} whileTap={{ scale: 0.96 }}
          className={clsx("relative z-10 rounded-full font-medium transition-colors", size === "sm" ? "px-3 py-1" : "px-4 py-1.5", value === v ? "text-white" : "text-ink-soft hover:text-ink")}>
          {value === v && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 -z-10 rounded-full bg-ink" transition={spring} />}
          {l}
        </motion.button>
      ))}
    </div>
  );
}

/** Underline tabs with a sliding indicator. */
export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, ReactNode][] }) {
  const id = useId();
  return (
    <div className="flex gap-6 overflow-x-auto border-b border-line">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={clsx("relative shrink-0 pb-3 text-sm font-medium transition-colors", value === v ? "text-ink" : "text-ink-muted hover:text-ink")}>
          {l}
          {value === v && <motion.span layoutId={`tab-${id}`} className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink" transition={spring} />}
        </button>
      ))}
    </div>
  );
}

/** Animated number (counts to its value); formatter decides the text, digits stay tabular. */
export function CountUp({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    const c = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, reduce, mv]);
  return <motion.span className={clsx("tabular-nums", className)}>{text}</motion.span>;
}

/** Thin progress meter (e.g. limits respected), animates its fill. */
export function Meter({ value, tone = "ink", className }: { value: number; tone?: "ink" | "primary" | "gain" | "loss"; className?: string }) {
  return (
    <div className={clsx("h-1.5 overflow-hidden rounded-full bg-ink/[0.06]", className)}>
      <motion.div className={clsx("h-full rounded-full", tone === "primary" ? "bg-primary-500" : tone === "gain" ? "bg-gain-600" : tone === "loss" ? "bg-accent-600" : "bg-ink")}
        initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={softSpring} />
    </div>
  );
}
