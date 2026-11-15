import { Chargement, Erreur, Note, Prouve, Terme } from "../components/base";
import { Stagger, StaggerItem } from "../components/motion";
import { LinkButton, PageTitle, Section, Table } from "../components/ui";
import * as f from "../format";
import { inhabituel } from "../libelles";
import { useApp, useData } from "../state";
import type { Preuve } from "../types";
import { Link } from "react-router-dom";

export function Tendances() {
  const { profil, asOf, enPassé } = useApp();
  const { data, erreur, charge, recharger } = useData<{ regime: Preuve; titres: { ticker: string; nom: string; preuve: Preuve }[] }>("/tendances", { as_of: asOf });
  const suffixe = `?p=${profil}${enPassé ? `&d=${asOf}` : ""}`;
  if (charge && !data) return <><PageTitle title="Tendances" /><Chargement lignes={6} /><Note>Le détecteur s'entraîne sur l'historique propre de chaque titre (une fois par mois).</Note></>;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  const enEngouement = data.titres.filter((x) => x.preuve.valeur?.engouement);
  const autres = data.titres.filter((x) => !x.preuve.valeur?.engouement);
  return (
    <div>
      <PageTitle title="Tendances" subtitle={enEngouement.length === 0 ? "Aucun titre ne présente une attention inhabituelle à cette date." : `${enEngouement.length} titre(s) attirent une attention inhabituelle.`} />
      <p className="max-w-2xl text-sm leading-relaxed text-ink-soft"><Terme cle="engouement">Attention inhabituelle</Terme> : mesurée sur les pages vues Wikipedia de la veille et le volume échangé, comparés au niveau habituel de chaque titre. Elle ne dit ni la cause, ni le sens du prochain mouvement.</p>
      <Stagger as="div" className="mt-6 grid gap-4 md:grid-cols-2">
        {enEngouement.map(({ ticker, nom, preuve }) => {
          const v = preuve.valeur;
          return (
            <StaggerItem as="div" key={ticker}>
              <article className="halo h-full rounded-2xl bg-white p-5" data-niveau="attention">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-warn-700">⚠ Attention inhabituelle</p>
                <h2 className="mt-1 font-display text-xl font-medium tracking-[-0.02em]">{nom} <span className="text-ink-muted">({ticker})</span></h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">Attention <Prouve preuve={preuve}>{inhabituel(v.plus_inhabituel_que_pct_des_jours)}</Prouve>.
                  {v.vues_vs_habituel != null && <> Pages vues : <Prouve preuve={preuve}>{f.nombre(v.vues_vs_habituel, 1)} fois</Prouve> le niveau habituel.</>}
                  {v.volume_vs_habituel != null && <> Volume : <Prouve preuve={preuve}>{f.nombre(v.volume_vs_habituel, 1)} fois</Prouve> le niveau habituel.</>}
                  {" "}Sur 20 séances : <Prouve preuve={preuve}>{f.pct(v.rendement_20j_pct)}</Prouve>.</p>
                <LinkButton to={`/titre/${encodeURIComponent(ticker)}${suffixe}`} variant="primary" size="sm" className="mt-4">Ce que ça change pour toi</LinkButton>
              </article>
            </StaggerItem>);
        })}
      </Stagger>
      <Section title="Autres titres suivis par le détecteur" className="mt-10">
        <Table caption="Attention mesurée par titre">
          <thead><tr><th>Titre</th><th className="!text-right">Plus inhabituel que…</th><th className="!text-right">Pages vues / habituel</th><th className="!text-right">Volume / habituel</th></tr></thead>
          <tbody>{autres.map(({ ticker, preuve }) => <tr key={ticker}><td><Link className="font-medium text-ink hover:text-primary-600" to={`/titre/${encodeURIComponent(ticker)}${suffixe}`}>{ticker}</Link></td>
            {preuve.statut === "ok" ? <><td className="tabular text-right">{f.pct(preuve.valeur.plus_inhabituel_que_pct_des_jours, 0)} des jours</td><td className="tabular text-right">{preuve.valeur.vues_vs_habituel != null ? f.nombre(preuve.valeur.vues_vs_habituel, 2) : "—"}</td><td className="tabular text-right">{f.nombre(preuve.valeur.volume_vs_habituel, 2)}</td></>
              : <td colSpan={3} className="text-ink-muted">{preuve.note}</td>}</tr>)}</tbody>
        </Table>
        <Note>Sources : pages vues Wikimedia (CC0, vues de la veille), volumes Yahoo Finance. Modèle : Isolation Forest réentraîné chaque mois sur le seul passé du titre + règle d'attention écrite.</Note>
      </Section>
    </div>
  );
}
