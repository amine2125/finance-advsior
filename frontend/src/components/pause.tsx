import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../state";
import type { Preuve, Signal } from "../types";
import * as f from "../format";
import { PuceStatut } from "./base";
import { Button, TextButton } from "./ui";

/** ⛔ Pause de réflexion: interrupts a simulated order. No countdown, no hidden button, choices of equal weight. */
export function PauseReflexion({ signal, ticker, montant, ouvert, fermer, continuer, appliquerMontant, ouvrirDossier }: {
  signal: Signal; ticker: string; montant: number; ouvert: boolean; fermer: () => void; continuer: () => void;
  appliquerMontant: (m: number) => void; ouvrirDossier: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { ouvrirPreuve, profil, asOf } = useApp();
  const nav = useNavigate();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouvert && !d.open) d.showModal();
    if (!ouvert && d.open) d.close();
  }, [ouvert]);
  const preuves: Record<string, Preuve> = Object.fromEntries(signal.preuves.map((p) => [p.id, p]));
  const toutes = signal.clauses.filter((c) => c.statut === "depassee" && c.cause_par_intention);
  const rang = (c: typeof toutes[number]) => (c.importante ? 2 : 1) * ((c.valeur_apres ?? 0) / Math.max(c.limite ?? 1, 0.01));
  const causes = [...toutes].sort((x, y) => rang(y) - rang(x)).slice(0, 3);       // 2-3 facts, the rest folded
  const contexte = [...toutes.filter((c) => !causes.includes(c)), ...signal.clauses.filter((c) => c.statut !== "depassee" || !c.cause_par_intention)].filter((c) => c.statut !== "respectee");
  const petite = signal.options.find((o) => o.code === "position_plus_petite");
  const viaFnb = signal.options.filter((o) => o.code === "meme_exposition_via_fnb");
  return (
    <dialog ref={ref} className="pause m-auto max-h-[calc(100dvh-32px)] w-[min(640px,calc(100vw-24px))] overflow-y-auto rounded-[28px] bg-white p-0 text-ink shadow-lift"
      aria-labelledby="titre-pause" onClose={fermer} onCancel={fermer}>
      <div className="relative overflow-hidden bg-ink px-6 py-6 text-white sm:px-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-loss-500/30 blur-3xl" />
        <p className="relative text-sm text-white/70">Ordre simulé de {f.cad(montant)} sur {ticker}</p>
        <h2 id="titre-pause" className="relative mt-1 font-display text-[28px] font-medium tracking-[-0.02em]"><span aria-hidden="true">⛔ </span>Pause de réflexion</h2>
        <p className="relative mt-1 text-sm text-white/80">Il s'écarte nettement de {toutes.length} de tes règles, écrites à froid.</p>
      </div>
      <div className="space-y-5 px-6 py-6 sm:px-8">
        <ul className="space-y-4">
          {causes.map((c) => (
            <li key={c.clause_id} className="border-b border-line pb-4 last:border-0">
              <div className="flex flex-wrap items-center gap-2"><PuceStatut statut={c.statut} /><strong className="text-sm">{c.libelle}</strong></div>
              <p className="mt-1 text-xs text-ink-muted">{c.origine === "dit" ? "Tu l'as dit" : "Valeur par défaut, hypothèse documentée"}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{c.explication}</p>
              {c.preuves.slice(0, 1).map((pid) => preuves[pid] && <TextButton key={pid} onClick={() => ouvrirPreuve(preuves[pid])}>Voir la preuve</TextButton>)}
            </li>))}
        </ul>
        {contexte.length > 0 && <details className="rounded-xl bg-canvas p-3 text-sm"><summary className="cursor-pointer font-medium">Autres règles concernées et contexte ({contexte.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">{contexte.map((c) => <li key={c.clause_id}>{c.libelle} : {c.explication}</li>)}</ul></details>}
        {(petite || viaFnb.length > 0) && <div>
          <h3 className="text-sm font-semibold">Options</h3>
          <ul className="mt-2 space-y-2 text-sm text-ink-soft">
            {petite && <li>{petite.libelle}{petite.details.montant_max_cad > 0 && <> <TextButton onClick={() => appliquerMontant(petite.details.montant_max_cad)}>Utiliser ce montant</TextButton></>}</li>}
            {viaFnb.map((o) => <li key={o.details.fonds}>{o.libelle} <TextButton onClick={() => nav(`/titre/${encodeURIComponent(o.details.fonds)}?p=${profil}&d=${asOf}&montant=${Math.round(montant)}`)}>Voir {o.details.fonds}</TextButton></li>)}
          </ul></div>}
        <p className="text-xs text-ink-muted">Niveau décidé par la politique écrite (règles {signal.regles_declenchees.join(", ")}), en {f.nombre(signal.latence_ms ?? 0, 0)} ms, sans LLM.</p>
      </div>
      {/* choices of equal weight, always visible (sticky): never a hidden « Continuer quand même » */}
      <div className="sticky bottom-0 border-t border-line bg-white/95 px-6 py-4 backdrop-blur sm:px-8">
        <p className="mb-3 text-xs text-ink-muted">Tu gardes le dernier mot. Cette pause ne bloque rien : c'est une simulation, et ton choix sera consigné dans le Journal.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={fermer}>Revenir</Button>
          <Button variant="secondary" onClick={ouvrirDossier}>Ouvrir le dossier</Button>
          <Button variant="secondary" onClick={() => nav(`/contrat?p=${profil}&d=${asOf}`)}>Modifier ma règle</Button>
          <Button variant="secondary" onClick={continuer}>Continuer quand même</Button>
        </div>
      </div>
    </dialog>
  );
}
