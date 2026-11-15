import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp, useData } from "../state";
import { Chargement, Erreur, PuceNiveau } from "../components/base";
import * as f from "../format";
import type { Adaptation, Clause, Contrat, Profil, Signal } from "../types";

interface R { profil: Profil; contrat: Contrat; contradictions: { code: string; gravite: string; message: string; clauses: string[] }[]; adaptation: Adaptation }

export function ContratPage() {
  const { profil, asOf, enPassé, toucher } = useApp();
  const { data, erreur, charge, recharger } = useData<R>(`/profils/${profil}`, { as_of: asOf });
  const [edit, setEdit] = useState<Clause | null>(null);
  const [valeur, setValeur] = useState("");
  const [contexte, setContexte] = useState("");
  const [apercu, setApercu] = useState<{ avant: Signal; apres: Signal } | null>(null);
  if (charge && !data) return <Chargement lignes={6} />;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  const p = data.profil, c = data.contrat;
  const cle = (cl: Clause) => Object.keys(cl.parametres).find((k) => ["max_pct", "min_pct", "annees"].includes(k));
  const params = (cl: Clause) => { const k = cle(cl); return k ? { [k]: Number(valeur.replace(",", ".")) } : {}; };
  const voir = async () => { if (!edit) return; setApercu(await api(`/profils/${profil}/regles/${edit.id}/apercu`, { body: { parametres: params(edit) }, params: { as_of: asOf } })); };
  const valider = async () => {
    if (!edit) return;
    await api(`/profils/${profil}/regles/${edit.id}`, { body: { parametres: params(edit), contexte: contexte || "modification par l'utilisateur" }, params: { as_of: asOf } });
    setEdit(null); setApercu(null); setContexte(""); toucher();
  };
  return (
    <div className="pile">
      <h1>Mon contrat</h1>
      <p className="essentiel">Les règles que {p.nom} a fixées à froid : le mât auquel ULYSSE compare chaque intention.</p>
      <p className="discret">Profil fictif · {p.age ? `${p.age} ans · ` : ""}tolérance « {p.tolerance} » · expérience « {p.experience} » · contrat version {c.version}. {p.description}</p>
      <div className="actions"><Link className="bouton" to={`/nouveau-profil?p=${profil}${enPassé ? `&d=${asOf}` : ""}`}>Créer un nouveau profil</Link></div>
      {data.contradictions.length > 0 && (
        <section className="panneau signale" data-niveau="attention" aria-labelledby="contra"><h2 id="contra" style={{ fontSize: "var(--t-18)" }}>⚠ Contradictions relevées entre tes règles</h2>
          <ul className="liste-simple">{data.contradictions.map((k) => <li key={k.code}>{k.message}</li>)}</ul></section>)}
      <section className="panneau" aria-labelledby="clauses"><h2 id="clauses">Clauses</h2>
        <ul className="sans-puce pile">
          {c.clauses.map((cl) => (
            <li key={cl.id} className="panneau" style={{ marginBottom: 0 }}>
              <div className="ligne entre"><strong>{cl.libelle}</strong>{cle(cl) && <button className="bouton" onClick={() => { setEdit(cl); setValeur(String(cl.parametres[cle(cl)!])); setApercu(null); }}>Modifier ma règle</button>}</div>
              <p className="discret" style={{ margin: "4px 0 0" }}>{cl.origine === "dit" ? "Tu l'as dit." : `Valeur par défaut, hypothèse documentée : ${cl.justification}`}{cl.importante ? " · Clause importante (un grand écart déclenche une pause de réflexion)." : ""}</p>
              {edit?.id === cl.id && (
                <div className="pile" style={{ marginTop: 12 }}>
                  <div className="ligne">
                    <div className="champ"><label htmlFor={`v-${cl.id}`}>Nouvelle valeur ({cle(cl) === "annees" ? "années" : "%"})</label><input id={`v-${cl.id}`} inputMode="decimal" value={valeur} onChange={(e) => setValeur(e.target.value)} /></div>
                    <div className="champ" style={{ flex: 1 }}><label htmlFor={`c-${cl.id}`}>Pourquoi ? (consigné avec la date)</label><input id={`c-${cl.id}`} value={contexte} onChange={(e) => setContexte(e.target.value)} placeholder="ex. après avoir revu mon objectif de retraite…" /></div>
                  </div>
                  <div className="actions"><button className="bouton" onClick={voir}>Voir l'effet avant de valider</button><button className="bouton principal" onClick={valider}>Valider la modification</button><button className="bouton lien" onClick={() => { setEdit(null); setApercu(null); }}>Annuler</button></div>
                  {apercu && <p aria-live="polite">Sur ton portefeuille actuel : avant <PuceNiveau niveau={apercu.avant.niveau} /> → après <PuceNiveau niveau={apercu.apres.niveau} />. {apercu.apres.clauses[0]?.explication}</p>}
                </div>)}
            </li>))}
        </ul></section>
      {c.historique.length > 0 && <section className="panneau"><h2>Historique des modifications</h2>
        <ul className="liste-simple">{c.historique.map((h: any, i: number) => <li key={i}>Version {h.version}, le {h.le.slice(0, 10)} : {h.clause} {JSON.stringify(h.avant)} → {JSON.stringify(h.apres)} — contexte : « {h.contexte} »</li>)}</ul></section>}
      <section className="panneau"><h2>Objectifs</h2><ul className="liste-simple">{p.objectifs.map((o) => <li key={o.id}>{o.libelle} : dans {f.nombre(o.horizon_annees, 1)} an(s), {f.pct(o.part_pct, 0)} du portefeuille{o.montant_cible_cad ? `, cible ${f.cad(o.montant_cible_cad)}` : ""}</li>)}</ul>
        <p className="discret">Adaptation de l'app à ce profil : vocabulaire {data.adaptation.vocabulaire} ; lentille ESG {data.adaptation.lentille_esg ? "visible" : "masquée"} ; module crypto {data.adaptation.module_crypto} ; priorité : {data.adaptation.priorite_modules.join(", ")}.</p></section>
    </div>
  );
}
