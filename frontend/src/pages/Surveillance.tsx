import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp, useData } from "../state";
import { Chargement, Erreur, Prouve, PuceNiveau, Vide } from "../components/base";
import * as f from "../format";
import type { Niveau, Preuve } from "../types";

export function Surveillance() {
  const { profil, asOf, enPassé, config, toucher } = useApp();
  const { data, erreur, charge, recharger } = useData<{ titres: { ticker: string; signal: { niveau: Niveau; clauses: { explication: string }[] } | null; engouement: Preuve | null }[] }>(`/profils/${profil}/surveillance`, { as_of: asOf });
  const [ajout, setAjout] = useState("");
  const suffixe = `?p=${profil}${enPassé ? `&d=${asOf}` : ""}`;
  const maj = async (ticker: string, retirer = false) => { await api(`/profils/${profil}/surveillance`, { body: { ticker, retirer } }); toucher(); };
  return (
    <div className="pile">
      <h1>Liste de surveillance</h1>
      <p className="discret">La Vigie te signale quand un titre suivi attire une attention inhabituelle ou change de statut par rapport à ton contrat.</p>
      <form className="ligne" onSubmit={(e) => { e.preventDefault(); if (ajout) { maj(ajout); setAjout(""); } }}>
        <div className="champ"><label htmlFor="ajout">Ajouter un titre</label><select id="ajout" value={ajout} onChange={(e) => setAjout(e.target.value)}><option value="">Choisir…</option>{(config?.univers ?? []).map((x) => <option key={x.ticker} value={x.ticker}>{x.ticker} — {x.name}</option>)}</select></div>
        <button className="bouton principal" type="submit" disabled={!ajout} style={{ alignSelf: "flex-end" }}>Ajouter</button>
      </form>
      {charge && !data ? <Chargement /> : erreur || !data ? <Erreur message={erreur ?? ""} recharger={recharger} /> : data.titres.length === 0 ? <Vide>Ta liste est vide. Ajoute un titre pour que la Vigie le suive.</Vide> : (
        <table className="donnees"><thead><tr><th>Titre</th><th>Selon tes règles (5 %)</th><th>Attention</th><th><span className="visuellement-cache">Actions</span></th></tr></thead>
          <tbody>{data.titres.map((x) => <tr key={x.ticker}><td><Link to={`/titre/${encodeURIComponent(x.ticker)}${suffixe}`}>{x.ticker}</Link></td>
            <td>{x.signal ? <><PuceNiveau niveau={x.signal.niveau} /><div className="discret">{x.signal.clauses[0]?.explication}</div></> : "—"}</td>
            <td>{x.engouement?.statut === "ok" ? <Prouve preuve={x.engouement}>{x.engouement.valeur.engouement ? "⚠ inhabituelle" : "habituelle"}</Prouve> : "—"}</td>
            <td><button className="bouton lien" onClick={() => maj(x.ticker, true)}>Retirer</button></td></tr>)}</tbody></table>)}
      <p className="source">Signal d'attention au {f.date(asOf)} ; règles évaluées en code sur une position de référence de 5 %.</p>
    </div>
  );
}
