import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../state";
import type { Niveau, Option, Preuve, Signal } from "../types";
import { PuceStatut } from "./base";

const ICONES: Record<Niveau, string> = { ok: "✅", attention: "⚠", pause: "⛔", aucun: "–" };

/** The same gesture everywhere: an element lights up (halo) and carries a pastille; a click opens the panel. */
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
    <div ref={ref} className="porteur-signal" style={{ display: children ? "block" : "inline-block" }}>
      {children && <div className="signale allume" data-niveau={n}>{children}</div>}
      <div style={children ? { position: "absolute", top: -14, right: 8 } : undefined}>
        <button type="button" className={`pastille ${n}`} aria-expanded={ouvert} aria-controls={id}
          onClick={() => setOuvert((o) => !o)} aria-label={`${t(`niveau.${n}`)} — ${signal.titre}. Ouvrir le détail`}>
          <span aria-hidden="true">{ICONES[n]}</span>{etiquette ?? t(`niveau.${n}`)}
        </button>
      </div>
      {ouvert && <div id={id} role="dialog" aria-label={signal.titre} className="panneau-signal"><PanneauSignal signal={signal} intention={intention} /></div>}
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
    <div className="pile">
      <p style={{ fontWeight: 700, margin: 0 }}>{signal.titre}</p>
      {faits.length === 0 && <p className="discret">Toutes les règles évaluées sont respectées.</p>}
      <ul className="sans-puce pile">
        {faits.map((c) => (
          <li key={c.clause_id}>
            <PuceStatut statut={c.statut} />{" "}
            <span className="discret">{c.origine === "dit" ? "Ta règle" : "Règle par défaut (hypothèse)"}{c.deja_depassee_avant && !c.cause_par_intention ? " · déjà dépassée avant" : ""}</span>
            <div>{c.explication}</div>
            {c.preuves.slice(0, 2).map((pid) => preuves[pid] && <button key={pid} className="bouton lien" onClick={() => ouvrirPreuve(preuves[pid])}>Preuve : {preuves[pid].libelle}</button>)}
          </li>
        ))}
      </ul>
      {(signal.options ?? []).filter((o: Option) => !["continuer", "modifier_regle"].includes(o.code)).map((o) => <p key={o.code} className="discret">Option : {o.libelle}</p>)}
      <div className="actions">
        <button className="bouton principal" onClick={lancerDossier} disabled={occupe}>{occupe ? "Préparation…" : t("action.dossier")}</button>
        <button className="bouton" onClick={() => nav(`/contrat?p=${profil}&d=${asOf}`)}>{t("action.modifier_regle")}</button>
      </div>
      {signal.regles_declenchees && <p className="source">Niveau décidé par la politique écrite (règles {signal.regles_declenchees.join(", ")}), jamais par le LLM.</p>}
    </div>
  );
}
