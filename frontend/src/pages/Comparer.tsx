import { useState } from "react";
import { useApp, useData } from "../state";
import { Chargement, Erreur, Prouve, PuceNiveau } from "../components/base";
import * as f from "../format";
import type { Niveau, Preuve } from "../types";

export function Comparer() {
  const { profil, asOf, config } = useApp();
  const [a, setA] = useState("XOM");
  const [b, setB] = useState("ESGV");
  const { data, erreur, charge, recharger } = useData<{ titres: Record<string, { preuves: Preuve[]; signal: { niveau: Niveau; clauses: { explication: string }[] } | null }>; note: string }>("/comparer", { a, b, profil, as_of: asOf });
  const choix = (v: string, set: (x: string) => void, id: string, lbl: string) => (
    <div className="champ"><label htmlFor={id}>{lbl}</label><select id={id} value={v} onChange={(e) => set(e.target.value)}>{(config?.univers ?? []).map((x) => <option key={x.ticker} value={x.ticker}>{x.ticker} — {x.name}</option>)}</select></div>);
  const lignes: [string, string, (p: Preuve) => string][] = [["volatilite_annualisee", "Volatilité sur 1 an", (p) => f.pct(p.valeur)], ["pire_baisse", "Pire baisse passée", (p) => f.pct(p.valeur.baisse_pct)],
    ["cvar_historique", "Pertes extrêmes (20 séances)", (p) => f.pct(p.valeur.cvar_pct)], ["rendement_dividende_12m", "Dividendes sur 12 mois", (p) => (p.statut === "ok" ? f.pct(p.valeur) : "—")]];
  return (
    <div className="pile">
      <h1>Comparer deux titres pour ton profil</h1>
      <p className="discret">Pas un classement universel : chaque titre est confronté à <strong>tes</strong> règles, pour une position de référence de 5 %.</p>
      <div className="grille-2">{choix(a, setA, "ca", "Premier titre")}{choix(b, setB, "cb", "Second titre")}</div>
      {charge && !data ? <Chargement /> : erreur || !data ? <Erreur message={erreur ?? ""} recharger={recharger} /> : (
        <table className="donnees"><thead><tr><th>Critère</th><th className="n">{a}</th><th className="n">{b}</th></tr></thead>
          <tbody>
            <tr><th scope="row">Selon tes règles</th>{[a, b].map((t) => <td key={t} className="n">{data.titres[t]?.signal ? <PuceNiveau niveau={data.titres[t].signal!.niveau} /> : "—"}</td>)}</tr>
            {lignes.map(([m, l, show]) => <tr key={m}><th scope="row">{l}</th>{[a, b].map((t) => { const p = data.titres[t]?.preuves.find((x) => x.mesure === m); return <td key={t} className="n">{p ? (p.statut === "donnees_insuffisantes" ? "données insuffisantes" : <Prouve preuve={p}>{show(p)}</Prouve>) : "—"}</td>; })}</tr>)}
            <tr><th scope="row">Ce qui compte pour toi</th>{[a, b].map((t) => <td key={t}>{data.titres[t]?.signal?.clauses[0]?.explication ?? "Toutes tes règles évaluées sont respectées."}</td>)}</tr>
          </tbody></table>)}
      <p className="source">Données passées (jusqu'au {f.date(asOf)}) ; elles décrivent des risques, ne prédisent rien.</p>
    </div>
  );
}
