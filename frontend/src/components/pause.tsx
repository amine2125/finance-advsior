import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../state";
import { PuceStatut } from "./base";
import * as f from "../format";
import type { Preuve, Signal } from "../types";

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
    <dialog ref={ref} className="pause" aria-labelledby="titre-pause" onClose={fermer} onCancel={fermer}>
      <div className="tete"><h2 id="titre-pause"><span aria-hidden="true">⛔ </span>Pause de réflexion</h2>
        <p style={{ margin: "4px 0 0" }}>Ordre simulé de {f.cad(montant)} sur {ticker} : il s'écarte nettement de {toutes.length} de tes règles.</p></div>
      <div className="contenu-dialogue">
        <ul className="sans-puce pile">
          {causes.map((c) => (
            <li key={c.clause_id}><PuceStatut statut={c.statut} /> <strong>{c.libelle}</strong> <span className="discret">({c.origine === "dit" ? "tu l'as dit" : "valeur par défaut, hypothèse documentée"})</span>
              <div>{c.explication}</div>
              {c.preuves.slice(0, 1).map((pid) => preuves[pid] && <button key={pid} className="bouton lien" onClick={() => ouvrirPreuve(preuves[pid])}>Voir la preuve</button>)}</li>))}
        </ul>
        {contexte.length > 0 && <details style={{ marginTop: 12 }}><summary>Autres règles concernées et contexte ({contexte.length})</summary>
          <ul className="liste-simple">{contexte.map((c) => <li key={c.clause_id}>{c.libelle} : {c.explication}</li>)}</ul></details>}
        <h3 style={{ marginTop: 16 }}>Options</h3>
        <ul className="sans-puce pile">
          {petite && <li>{petite.libelle}{petite.details.montant_max_cad > 0 && <> <button className="bouton lien" onClick={() => appliquerMontant(petite.details.montant_max_cad)}>Utiliser ce montant</button></>}</li>}
          {viaFnb.map((o) => <li key={o.details.fonds}>{o.libelle} <button className="bouton lien" onClick={() => nav(`/titre/${encodeURIComponent(o.details.fonds)}?p=${profil}&d=${asOf}&montant=${Math.round(montant)}`)}>Voir {o.details.fonds}</button></li>)}
        </ul>
        <p className="discret">Tu gardes le dernier mot. Cette pause ne bloque rien : c'est une simulation, et ton choix sera consigné dans le Journal.</p>
        <div className="actions">
          <button className="bouton" onClick={fermer}>Revenir</button>
          <button className="bouton" onClick={ouvrirDossier}>Ouvrir le dossier</button>
          <button className="bouton" onClick={() => nav(`/contrat?p=${profil}&d=${asOf}`)}>Modifier ma règle</button>
          <button className="bouton" onClick={continuer}>Continuer quand même</button>
        </div>
        <p className="source">Niveau décidé par la politique écrite (règles {signal.regles_declenchees.join(", ")}), en {f.nombre(signal.latence_ms ?? 0, 0)} ms, sans LLM.</p>
      </div>
    </dialog>
  );
}
