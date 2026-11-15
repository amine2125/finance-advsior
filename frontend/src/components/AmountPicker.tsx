import clsx from "clsx";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cad } from "../lib/format";
import { spring } from "./motion";

/** Parses what people type: « 2 500 », « 2500,50 », « 2 500 $ », « 3k ». */
export function parseAmount(s: string): number | null {
  const t = s.toLowerCase().replace(/\s| | |\$/g, "").replace(",", ".");
  const m = t.match(/^(\d+(?:\.\d{1,2})?)(k)?$/);
  if (!m) return null;
  return parseFloat(m[1]) * (m[2] ? 1000 : 1);
}

export type Preset = number | [number, string];

/** Suggested amounts as chips, plus « Autre » to type any amount. `onChange(null)` while the typed amount is not valid. */
export default function AmountPicker({ value, onChange, presets, min = 1, max, testid, autoFocus }: {
  value: number | null; onChange: (v: number | null) => void; presets: Preset[]; min?: number; max?: number; testid?: string; autoFocus?: boolean;
}) {
  const opts = presets.map((p) => (Array.isArray(p) ? p : [p, cad(p)] as [number, string]));
  const [custom, setCustom] = useState(() => value != null && !opts.some(([v]) => v === value));
  const [text, setText] = useState(() => (custom && value != null ? String(value) : ""));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (custom) input.current?.focus(); }, [custom]);
  const typed = parseAmount(text);
  const problem = !custom || !text.trim() ? null
    : typed == null ? "Entrez un montant en dollars, ex. 1 500."
    : typed < min ? `Minimum ${cad(min)}.`
    : max != null && typed > max ? `Maximum ${cad(max)}.` : null;
  const type = (s: string) => {
    setText(s);
    const v = parseAmount(s);
    onChange(v != null && v >= min && (max == null || v <= max) ? v : null);
  };
  const chip = (active: boolean) => clsx("relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors", active ? "text-white" : "text-ink-soft hover:text-ink");
  return (
    <div data-testid={testid}>
      <div className="flex flex-wrap gap-1.5" role="radiogroup">
        {opts.map(([v, l]) => {
          const on = !custom && value === v;
          return (
            <motion.button key={v} type="button" role="radio" aria-checked={on} whileTap={{ scale: 0.96 }} onClick={() => { setCustom(false); onChange(v); }}
              className={clsx(chip(on), !on && "bg-ink/[0.04]")}>
              {on && <motion.span layoutId={`amt-${testid || "x"}`} className="absolute inset-0 -z-0 rounded-full bg-ink" transition={spring} />}
              <span className="relative tabular-nums">{l}</span>
            </motion.button>
          );
        })}
        <motion.button type="button" role="radio" aria-checked={custom} whileTap={{ scale: 0.96 }} data-testid={testid && `${testid}-other`}
          onClick={() => { setCustom(true); onChange(parseAmount(text)); }} className={clsx(chip(custom), !custom && "bg-ink/[0.04]")}>
          {custom && <motion.span layoutId={`amt-${testid || "x"}`} className="absolute inset-0 -z-0 rounded-full bg-ink" transition={spring} />}
          <span className="relative">Autre montant</span>
        </motion.button>
      </div>
      {custom && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2.5">
          <label className={clsx("flex w-full max-w-[240px] items-center rounded-2xl bg-white/70 px-4 hairline transition-shadow focus-within:shadow-glow", problem && "ring-1 ring-accent-600")}>
            <input ref={input} autoFocus={autoFocus} inputMode="decimal" value={text} onChange={(e) => type(e.target.value)} placeholder="Ex. 1 500"
              aria-label="Montant en dollars canadiens" aria-invalid={!!problem} data-testid={testid && `${testid}-input`}
              className="tabular-nums h-11 min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-muted/70" />
            <span className="text-sm text-ink-muted">$ CA</span>
          </label>
          {problem && <p className="mt-1.5 text-xs text-accent-700">{problem}</p>}
        </motion.div>
      )}
    </div>
  );
}
