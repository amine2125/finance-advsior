import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Chargement, Erreur, Note, Prouve, PuceNiveau, Vide } from "../components/base";
import { Button, Field, PageTitle, Panel, Table, TextButton, inputCls } from "../components/ui";
import * as f from "../format";
import { useApp, useData } from "../state";
import type { Niveau, Preuve } from "../types";

export function Surveillance() {
  const { profil, asOf, enPassé, config, toucher } = useApp();
  const { data, erreur, charge, recharger } = useData<{ titres: { ticker: string; signal: { niveau: Niveau; clauses: { explication: string }[] } | null; engouement: Preuve | null }[] }>(`/profils/${profil}/surveillance`, { as_of: asOf });
  const [ajout, setAjout] = useState("");
  const suffixe = `?p=${profil}${enPassé ? `&d=${asOf}` : ""}`;
  const maj = async (ticker: string, retirer = false) => { await api(`/profils/${profil}/surveillance`, { body: { ticker, retirer } }); toucher(); };
  return (
    <div>
      <PageTitle title="Liste de surveillance" subtitle="La Vigie te signale quand un titre suivi attire une attention inhabituelle ou change de statut par rapport à ton contrat." />
      <form className="flex max-w-xl flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (ajout) { maj(ajout); setAjout(""); } }}>
        <Field label="Ajouter un titre" htmlFor="ajout" className="min-w-[240px] flex-1"><select id="ajout" value={ajout} onChange={(e) => setAjout(e.target.value)} className={inputCls}><option value="">Choisir…</option>{(config?.univers ?? []).map((x) => <option key={x.ticker} value={x.ticker}>{x.ticker} — {x.name}</option>)}</select></Field>
        <Button type="submit" disabled={!ajout}>Ajouter</Button>
      </form>
      <div className="mt-6">
        {charge && !data ? <Chargement /> : erreur || !data ? <Erreur message={erreur ?? ""} recharger={recharger} /> : data.titres.length === 0 ? <Vide>Ta liste est vide. Ajoute un titre pour que la Vigie le suive.</Vide> : (
          <Panel><Table caption="Titres suivis">
            <thead><tr><th>Titre</th><th>Selon tes règles (5 %)</th><th>Attention</th><th><span className="visuellement-cache">Actions</span></th></tr></thead>
            <tbody>{data.titres.map((x) => <tr key={x.ticker}><td><Link className="font-medium text-ink hover:text-primary-600" to={`/titre/${encodeURIComponent(x.ticker)}${suffixe}`}>{x.ticker}</Link></td>
              <td>{x.signal ? <><PuceNiveau niveau={x.signal.niveau} /><div className="mt-1 text-xs text-ink-muted">{x.signal.clauses[0]?.explication}</div></> : "—"}</td>
              <td>{x.engouement?.statut === "ok" ? <Prouve preuve={x.engouement}>{x.engouement.valeur.engouement ? "⚠ inhabituelle" : "habituelle"}</Prouve> : "—"}</td>
              <td className="text-right"><TextButton onClick={() => maj(x.ticker, true)}>Retirer</TextButton></td></tr>)}</tbody>
          </Table></Panel>)}
      </div>
      <Note>Signal d'attention au {f.date(asOf)} ; règles évaluées en code sur une position de référence de 5 %.</Note>
    </div>
  );
}
