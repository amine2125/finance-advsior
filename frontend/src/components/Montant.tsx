import clsx from "clsx";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import * as f from "../format";
import { spring } from "./motion";

/** Parses what people type: « 2 500 », « 2500,50 », « 2 500 $ », « 3k ». */
export function lireMontant(s: string): number | null {
  const t = s.toLowerCase().replace(/[\s  $]/g, "").replace(",", ".");
  const m = t.match(/^(\d+(?:\.\d{1,2})?)(k)?$/);
  return m ? parseFloat(m[1]) * (m[2] ? 1000 : 1) : null;
}

/** Suggested amounts as chips, plus « Autre montant » to type any amount (from AEGIS, Raouf).
 *  `onChange(null)` while the typed amount is not valid; going back to « Autre » re-checks min and max. */
export function Montant({ value, onChange, suggestions, min = 1, max, id = "montant" }: {
  value: number | null; onChange: (v: number | null) => void; suggestions: number[]; min?: number; max?: number; id?: string;
}) {
  const [autre, setAutre] = useState(() => value != null && !suggestions.includes(value));
  const [texte, setTexte] = useState(() => (autre && value != null ? String(value) : ""));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autre) input.current?.focus(); }, [autre]);
  useEffect(() => {                                    // a value set from outside (e.g. « Utiliser ce montant ») shows as typed
    if (value != null && !suggestions.includes(value) && String(value) !== texte) { setAutre(true); setTexte(String(value)); }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const valide = (s: string) => { const v = lireMontant(s); return v != null && v >= min && (max == null || v <= max) ? v : null; };
  const tape = lireMontant(texte);
  const probleme = !autre || !texte.trim() ? null : tape == null ? "Entre un montant en dollars, ex. 1 500."
    : tape < min ? `Minimum ${f.cad(min)}.` : max != null && tape > max ? `Maximum ${f.cad(max)}.` : null;
  const puce = (on: boolean) => clsx("relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors", on ? "text-white" : "bg-ink/[0.04] text-ink-soft hover:text-ink");
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Montant">
        {suggestions.map((v) => {
          const on = !autre && value === v;
          return (
            <motion.button key={v} type="button" role="radio" aria-checked={on} whileTap={{ scale: 0.96 }} onClick={() => { setAutre(false); onChange(v); }} className={puce(on)}>
              {on && <motion.span layoutId={`m-${id}`} className="absolute inset-0 rounded-full bg-ink" transition={spring} />}
              <span className="relative tabular">{f.cad(v)}</span>
            </motion.button>);
        })}
        <motion.button type="button" role="radio" aria-checked={autre} whileTap={{ scale: 0.96 }} onClick={() => { setAutre(true); onChange(valide(texte)); }} className={puce(autre)}>
          {autre && <motion.span layoutId={`m-${id}`} className="absolute inset-0 rounded-full bg-ink" transition={spring} />}
          <span className="relative">Autre montant</span>
        </motion.button>
      </div>
      {autre && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2.5">
          <label className={clsx("flex w-full max-w-[240px] items-center rounded-xl border bg-white px-3.5", probleme ? "border-loss-600" : "border-line focus-within:border-ink")}>
            <input ref={input} id={id} inputMode="decimal" autoComplete="off" value={texte} onChange={(e) => { setTexte(e.target.value); onChange(valide(e.target.value)); }}
              placeholder="ex. 1 500" aria-label="Montant en dollars canadiens" aria-invalid={!!probleme}
              className="tabular h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-muted" />
            <span className="text-sm text-ink-muted">$ CA</span>
          </label>
          {probleme && <p className="mt-1.5 text-xs text-loss-700" role="alert">{probleme}</p>}
        </motion.div>)}
    </div>
  );
}
