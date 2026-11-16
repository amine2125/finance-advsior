import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../state";
import type { Niveau, Option, Preuve, Signal } from "../types";
import { PuceStatut } from "./base";
import { spring } from "./motion";
import { Button, TextButton } from "./ui";

const ICONES: Record<Niveau, string> = { ok: "✓", attention: "⚠", pause: "⛔", aucun: "–" };
const PASTILLE: Record<Niveau, string> = { ok: "bg-gain-600 text-white", attention: "bg-warn-500 text-ink", pause: "bg-loss-600 text-white", aucun: "bg-ink text-white" };

/** The same gesture everywhere: the element lights up (halo) and carries a pastille; a click opens the panel. */
export function Signale({ signal, intention, children, etiquette }: {
  signal: Pick<Signal, "niveau" | "titre" | "clauses"> & Partial<Signal> | null | undefined; intention?: Record<string, unknown>;
  children?: ReactNode; etiquette?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const { t } = useApp();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false); };
    window.addEventListener("keydown", k); window.addEventListener("mousedown", c);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("mousedown", c); };
  }, [ouvert]);
  if (!signal || signal.niveau === "aucun") return <>{children}</>;
  const n = signal.niveau;
  return (
    <div ref={ref} className={clsx("relative", children ? "block" : "inline-block")}>
      {children && <div className="halo rounded-2xl" data-niveau={n}>{children}</div>}
      <div className={children ? "absolute -top-3 right-4" : undefined}>
        <motion.button type="button" whileTap={{ scale: 0.96 }} className={clsx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-lift", PASTILLE[n])}
          aria-expanded={ouvert} aria-controls={id} onClick={() => setOuvert((o) => !o)} aria-label={`${t(`niveau.${n}`)} — ${signal.titre}. Ouvrir le détail`}>
          <span aria-hidden="true">{ICONES[n]}</span>{etiquette ?? t(`niveau.${n}`)}
        </motion.button>
      </div>
      <AnimatePresence>
        {ouvert && (
          <motion.div id={id} role="dialog" aria-label={signal.titre} initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={spring}
            className="absolute right-0 top-8 z-30 w-[min(440px,calc(100vw-32px))] rounded-2xl bg-white p-5 shadow-lift">
            <PanneauSignal signal={signal} intention={intention} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PanneauSignal({ signal, intention, compact = true }: { signal: Partial<Signal> & Pick<Signal, "niveau" | "titre" | "clauses">; intention?: Record<string, unknown>; compact?: boolean }) {
  const { profil, asOf, ouvrirPreuve, t } = useApp();
  const nav = useNavigate();
  const [occupe, setOccupe] = useState(false);
  const preuves: Record<string, Preuve> = Object.fromEntries((signal.preuves ?? []).map((p) => [p.id, p]));
  const faits = (signal.clauses ?? []).filter((c) => c.statut !== "respectee" && c.statut !== "non_applicable").slice(0, compact ? 3 : 8);
  const lancerDossier = async () => {
    setOccupe(true);
    try {
      const r = await api<{ id: string }>("/dossiers", { body: { profil, as_of: asOf, intention: intention ?? { type: "portefeuille" } } });
      nav(`/dossier/${r.id}?p=${profil}&d=${asOf}`);
    } finally { setOccupe(false); }
  };
  return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold text-ink">{signal.titre}</p>
      {faits.length === 0 && <p className="text-ink-muted">Toutes les règles évaluées sont respectées.</p>}
      <ul className="space-y-3">
        {faits.map((c) => (
          <li key={c.clause_id} className="border-t border-line pt-3 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2"><PuceStatut statut={c.statut} />
              <span className="text-xs text-ink-muted">{c.origine === "dit" ? "Ta règle" : "Règle par défaut (hypothèse)"}{c.deja_depassee_avant && !c.cause_par_intention ? " · déjà dépassée avant" : ""}</span></div>
            <p className="mt-1.5 leading-relaxed text-ink-soft">{c.explication}</p>
            <div className="mt-1 flex flex-wrap gap-x-3">{c.preuves.slice(0, 2).map((pid) => preuves[pid] && <TextButton key={pid} onClick={() => ouvrirPreuve(preuves[pid])}>Preuve : {preuves[pid].libelle}</TextButton>)}</div>
          </li>
        ))}
      </ul>
      {(signal.options ?? []).filter((o: Option) => !["continuer", "modifier_regle"].includes(o.code)).map((o) => <p key={o.code} className="rounded-xl bg-canvas p-3 text-ink-soft">Option : {o.libelle}</p>)}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onClick={lancerDossier} disabled={occupe}>{occupe ? "Préparation…" : t("action.dossier")}</Button>
        <Button size="sm" variant="secondary" onClick={() => nav(`/contrat?p=${profil}&d=${asOf}`)}>{t("action.modifier_regle")}</Button>
      </div>
      {signal.regles_declenchees && <p className="text-xs text-ink-muted">Niveau décidé par la politique écrite (règles {signal.regles_declenchees.join(", ")}), jamais par le LLM.</p>}
    </div>
  );
}
