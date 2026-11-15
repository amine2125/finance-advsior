import { useState } from "react";
import { api } from "../api";
import { useApp } from "../state";
import type { Adaptation, Contrat, Profil } from "../types";

export function NouveauProfil() {
  const { setProfil, toucher } = useApp();
  const [v, setV] = useState({ nom: "Profil prudent", age: "34", experience: "debutant", tolerance: "faible", objectif: "Mise de fonds pour un achat", horizon: "1.5", part: "70", cible: "60000",
    capital: "70000", esg: false, crypto: false, techno: false, perte: "" });
  const [res, setRes] = useState<{ profil: Profil; contrat: Contrat; contradictions: { code: string; message: string }[]; adaptation: Adaptation } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ch = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((o) => ({ ...o, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const creer = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try {
      const r = await api<typeof res>("/profils", { body: { nom: v.nom, age: Number(v.age) || null, experience: v.experience, tolerance: v.tolerance, capital_cad: Number(v.capital),
        objectifs: [{ libelle: v.objectif, horizon_annees: Number(v.horizon.replace(",", ".")), part_pct: Number(v.part), montant_cible_cad: Number(v.cible) || null }],
        esg_important: v.esg, eviter_controverses: v.esg, interet_crypto: v.crypto, interet_techno: v.techno, limites: v.perte ? { perte_max: Number(v.perte) } : {}, description: "Profil créé en direct" } });
      setRes(r); toucher();
    } catch (x) { setErr((x as Error).message); }
  };
  return (
    <div className="pile">
      <h1>Créer un profil en direct</h1>
      <p className="discret">Le moteur lit n'importe quel profil : rien n'est codé pour un persona. Exemple de l'énoncé : « profil prudent préparant un achat prochain ».</p>
      <form className="panneau pile" onSubmit={creer}>
        <div className="grille-3">
          <div className="champ"><label htmlFor="nom">Nom du profil</label><input id="nom" name="nom" autoComplete="off" value={v.nom} onChange={ch("nom")} /></div>
          <div className="champ"><label htmlFor="age">Âge</label><input id="age" inputMode="numeric" value={v.age} onChange={ch("age")} /></div>
          <div className="champ"><label htmlFor="exp">Expérience</label><select id="exp" value={v.experience} onChange={ch("experience")}><option value="debutant">Débutant</option><option value="intermediaire">Intermédiaire</option><option value="avance">Avancé</option></select></div>
          <div className="champ"><label htmlFor="tol">Tolérance au risque</label><select id="tol" value={v.tolerance} onChange={ch("tolerance")}><option value="faible">Faible</option><option value="faible_modere">Faible à modérée</option><option value="modere">Modérée</option><option value="eleve">Élevée</option></select></div>
          <div className="champ"><label htmlFor="cap">Capital fictif (CAD)</label><input id="cap" inputMode="numeric" value={v.capital} onChange={ch("capital")} /></div>
          <div className="champ"><label htmlFor="perte">Perte maximale acceptée en crise (%) <span className="discret">facultatif</span></label><input id="perte" inputMode="decimal" value={v.perte} onChange={ch("perte")} placeholder="sinon : valeur par défaut…" /></div>
        </div>
        <fieldset className="grille-3" style={{ border: 0, padding: 0, margin: 0 }}><legend style={{ fontWeight: 700, marginBottom: 8 }}>Objectif principal</legend>
          <div className="champ"><label htmlFor="obj">Objectif</label><input id="obj" value={v.objectif} onChange={ch("objectif")} /></div>
          <div className="champ"><label htmlFor="hz">Dans combien d'années ?</label><input id="hz" inputMode="decimal" value={v.horizon} onChange={ch("horizon")} /></div>
          <div className="champ"><label htmlFor="part">Part du portefeuille (%)</label><input id="part" inputMode="numeric" value={v.part} onChange={ch("part")} /></div>
          <div className="champ"><label htmlFor="cible">Montant visé (CAD)</label><input id="cible" inputMode="numeric" value={v.cible} onChange={ch("cible")} /></div>
        </fieldset>
        <div className="ligne">
          <label className="ligne"><input type="checkbox" checked={v.esg} onChange={ch("esg")} /> L'ESG compte pour moi</label>
          <label className="ligne"><input type="checkbox" checked={v.crypto} onChange={ch("crypto")} /> Intérêt pour les cryptoactifs</label>
          <label className="ligne"><input type="checkbox" checked={v.techno} onChange={ch("techno")} /> Intérêt pour la techno</label>
        </div>
        <div className="actions"><button className="bouton principal" type="submit">Créer le profil et son contrat</button></div>
        {err && <p className="erreur" role="alert">{err}</p>}
      </form>
      {res && (
        <section className="panneau pile" aria-live="polite">
          <h2>Contrat de « {res.profil.nom} » (version {res.contrat.version})</h2>
          {res.contradictions.length > 0 && <div className="panneau signale" data-niveau="attention"><strong>⚠ Contradictions relevées</strong><ul className="liste-simple">{res.contradictions.map((k) => <li key={k.code}>{k.message}</li>)}</ul></div>}
          <ul className="liste-simple">{res.contrat.clauses.map((c) => <li key={c.id}>{c.libelle} <span className="discret">— {c.origine === "dit" ? "tu l'as dit" : "valeur par défaut (hypothèse)"}</span></li>)}</ul>
          <p className="discret">L'app s'adapte tout de suite : vocabulaire {res.adaptation.vocabulaire}, priorité {res.adaptation.priorite_modules.slice(0, 3).join(", ")}, module crypto {res.adaptation.module_crypto}.</p>
          <div className="actions"><button className="bouton principal" onClick={() => setProfil(res.profil.id)}>Utiliser ce profil</button></div>
        </section>)}
    </div>
  );
}
