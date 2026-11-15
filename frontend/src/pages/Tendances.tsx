import { Link } from "react-router-dom";
import { useApp, useData } from "../state";
import { Chargement, Erreur, Prouve, Terme } from "../components/base";
import * as f from "../format";
import type { Preuve } from "../types";
import { inhabituel } from "../libelles";

export function Tendances() {
  const { profil, asOf, enPassé } = useApp();
  const { data, erreur, charge, recharger } = useData<{ regime: Preuve; titres: { ticker: string; nom: string; preuve: Preuve }[] }>("/tendances", { as_of: asOf });
  const suffixe = `?p=${profil}${enPassé ? `&d=${asOf}` : ""}`;
  if (charge && !data) return <><h1>Tendances</h1><Chargement lignes={6} /><p className="discret">Le détecteur s'entraîne sur l'historique propre de chaque titre (une fois par mois).</p></>;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  const enEngouement = data.titres.filter((x) => x.preuve.valeur?.engouement);
  const autres = data.titres.filter((x) => !x.preuve.valeur?.engouement);
  return (
    <div className="pile">
      <h1>Tendances</h1>
      <p className="essentiel">{enEngouement.length === 0 ? "Aucun titre ne présente une attention inhabituelle à cette date." :
        `${enEngouement.length} titre(s) attirent une attention inhabituelle.`}</p>
      <p className="discret"><Terme cle="engouement">Attention inhabituelle</Terme> : mesurée sur les pages vues Wikipedia de la veille et le volume échangé, comparés au niveau habituel de chaque titre. Elle ne dit ni la cause, ni le sens du prochain mouvement.</p>
      {enEngouement.map(({ ticker, nom, preuve }) => {
        const v = preuve.valeur;
        return (
          <article key={ticker} className="panneau signale" data-niveau="attention">
            <div className="ligne entre"><h2 style={{ margin: 0 }}>{nom} ({ticker})</h2>
              <Link className="bouton principal" to={`/titre/${encodeURIComponent(ticker)}${suffixe}`}>Ce que ça change pour toi</Link></div>
            <p>Attention <Prouve preuve={preuve}>{inhabituel(v.plus_inhabituel_que_pct_des_jours)}</Prouve>.
              {v.vues_vs_habituel != null && <> Pages vues : <Prouve preuve={preuve}>{f.nombre(v.vues_vs_habituel, 1)} fois</Prouve> le niveau habituel.</>}
              {v.volume_vs_habituel != null && <> Volume : <Prouve preuve={preuve}>{f.nombre(v.volume_vs_habituel, 1)} fois</Prouve> le niveau habituel.</>}
              {" "}Sur 20 séances : <Prouve preuve={preuve}>{f.pct(v.rendement_20j_pct)}</Prouve>.</p>
          </article>);
      })}
      <section className="panneau"><h2>Autres titres suivis par le détecteur</h2>
        <table className="donnees"><thead><tr><th>Titre</th><th className="n">Plus inhabituel que…</th><th className="n">Pages vues / habituel</th><th className="n">Volume / habituel</th></tr></thead>
          <tbody>{autres.map(({ ticker, preuve }) => <tr key={ticker}><td><Link to={`/titre/${encodeURIComponent(ticker)}${suffixe}`}>{ticker}</Link></td>
            {preuve.statut === "ok" ? <><td className="n">{f.pct(preuve.valeur.plus_inhabituel_que_pct_des_jours, 0)} des jours</td><td className="n">{preuve.valeur.vues_vs_habituel != null ? f.nombre(preuve.valeur.vues_vs_habituel, 2) : "—"}</td><td className="n">{f.nombre(preuve.valeur.volume_vs_habituel, 2)}</td></>
              : <td colSpan={3} className="discret">{preuve.note}</td>}</tr>)}</tbody></table>
        <p className="source">Sources : pages vues Wikimedia (CC0, vues de la veille), volumes Yahoo Finance. Modèle : Isolation Forest réentraîné chaque mois sur le seul passé du titre + règle d'attention écrite.</p>
      </section>
    </div>
  );
}
