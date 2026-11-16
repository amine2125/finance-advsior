import { useState } from "react";
import { Chargement, Erreur, Note, Prouve, PuceNiveau } from "../components/base";
import { Field, PageTitle, Panel, Table, inputCls } from "../components/ui";
import * as f from "../format";
import { useApp, useData } from "../state";
import type { Niveau, Preuve } from "../types";

export function Comparer() {
  const { profil, asOf, config } = useApp();
  const [a, setA] = useState("XOM");
  const [b, setB] = useState("ESGV");
  const { data, erreur, charge, recharger } = useData<{ titres: Record<string, { preuves: Preuve[]; signal: { niveau: Niveau; clauses: { explication: string }[] } | null }>; note: string }>("/comparer", { a, b, profil, as_of: asOf });
  const choix = (v: string, set: (x: string) => void, id: string, lbl: string) => (
    <Field label={lbl} htmlFor={id}><select id={id} value={v} onChange={(e) => set(e.target.value)} className={inputCls}>{(config?.univers ?? []).map((x) => <option key={x.ticker} value={x.ticker}>{x.ticker} — {x.name}</option>)}</select></Field>);
  const lignes: [string, string, (p: Preuve) => string][] = [["volatilite_annualisee", "Volatilité sur 1 an", (p) => f.pct(p.valeur)], ["pire_baisse", "Pire baisse passée", (p) => f.pct(p.valeur.baisse_pct)],
    ["cvar_historique", "Pertes extrêmes (20 séances)", (p) => f.pct(p.valeur.cvar_pct)], ["rendement_dividende_12m", "Dividendes sur 12 mois", (p) => (p.statut === "ok" ? f.pct(p.valeur) : "—")]];
  return (
    <div>
      <PageTitle title="Comparer deux titres pour ton profil" subtitle={<>Pas un classement universel : chaque titre est confronté à <strong className="text-ink">tes</strong> règles, pour une position de référence de 5 %.</>} />
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">{choix(a, setA, "ca", "Premier titre")}{choix(b, setB, "cb", "Second titre")}</div>
      <Panel className="mt-6">
        {charge && !data ? <Chargement /> : erreur || !data ? <Erreur message={erreur ?? ""} recharger={recharger} /> : (
          <Table caption="Comparaison selon tes règles">
            <thead><tr><th>Critère</th><th className="!text-right">{a}</th><th className="!text-right">{b}</th></tr></thead>
            <tbody>
              <tr><th scope="row">Selon tes règles</th>{[a, b].map((t) => <td key={t} className="text-right">{data.titres[t]?.signal ? <PuceNiveau niveau={data.titres[t].signal!.niveau} /> : "—"}</td>)}</tr>
              {lignes.map(([m, l, show]) => <tr key={m}><th scope="row">{l}</th>{[a, b].map((t) => { const p = data.titres[t]?.preuves.find((x) => x.mesure === m); return <td key={t} className="tabular text-right">{p ? (p.statut === "donnees_insuffisantes" ? <span className="text-ink-muted">données insuffisantes</span> : <Prouve preuve={p}>{show(p)}</Prouve>) : "—"}</td>; })}</tr>)}
              <tr><th scope="row">Ce qui compte pour toi</th>{[a, b].map((t) => <td key={t} className="text-ink-soft">{data.titres[t]?.signal?.clauses[0]?.explication ?? "Toutes tes règles évaluées sont respectées."}</td>)}</tr>
            </tbody>
          </Table>)}
      </Panel>
      <Note>Données passées (jusqu'au {f.date(asOf)}) ; elles décrivent des risques, ne prédisent rien.</Note>
    </div>
  );
}
