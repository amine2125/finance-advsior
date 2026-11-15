import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, useData } from "../state";
import { Chargement, Erreur, PuceNiveau } from "../components/base";
import * as f from "../format";
import type { Actif, Niveau } from "../types";

interface Resultat extends Actif { signal: { niveau: Niveau; clauses: { explication: string }[] } | null; deja_detenu_pct: number | null }

const CLASSE: Record<string, string> = { equity: "Action", etf_equity: "FNB d'actions", etf_bond: "FNB d'obligations", etf_commodity: "FNB d'or", crypto: "Cryptoactif" };

export function Marche() {
  const { profil, asOf, enPassé } = useApp();
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const { data, erreur, charge, recharger } = useData<{ resultats: Resultat[] }>("/recherche", { q, profil, as_of: asOf });
  const suffixe = `?p=${profil}${enPassé ? `&d=${asOf}` : ""}`;
  return (
    <div className="pile">
      <h1>Marché</h1>
      <div className="champ" style={{ maxWidth: 480 }}>
        <label htmlFor="recherche">Chercher un titre (symbole, nom ou secteur)</label>
        <input id="recherche" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex. NVDA, banque, obligations…" autoComplete="off" />
        <span className="aide">Univers du jeu de départ : 31 actifs. Chaque résultat indique, selon tes règles, ce qu'une position de 5 % donnerait.</span>
      </div>
      {charge && !data ? <Chargement /> : erreur ? <Erreur message={erreur} recharger={recharger} /> : (
        <table className="donnees">
          <caption className="visuellement-cache">Résultats annotés pour ton profil</caption>
          <thead><tr><th>Titre</th><th>Type</th><th className="n">Déjà détenu (FNB compris)</th><th>Selon tes règles (position de 5 %)</th></tr></thead>
          <tbody>
            {(data?.resultats ?? []).map((r) => (
              <tr key={r.ticker} className="cliquable" onClick={() => nav(`/titre/${encodeURIComponent(r.ticker)}${suffixe}`)}>
                <td><a href={`/titre/${encodeURIComponent(r.ticker)}${suffixe}`} onClick={(e) => { e.preventDefault(); nav(`/titre/${encodeURIComponent(r.ticker)}${suffixe}`); }}><strong>{r.ticker}</strong></a><div className="discret">{r.name}</div></td>
                <td>{CLASSE[r.asset_class] ?? r.asset_class}<div className="discret">{r.sector}</div></td>
                <td className="n">{r.deja_detenu_pct != null ? f.pct(r.deja_detenu_pct) : "?"}</td>
                <td>{r.signal ? <><PuceNiveau niveau={r.signal.niveau} /><div className="discret">{r.signal.clauses[0]?.explication ?? "Toutes tes règles évaluées sont respectées."}</div></> : <span className="discret">Non évalué à cette date</span>}</td>
              </tr>))}
          </tbody>
        </table>)}
      {data && data.resultats.length === 0 && <p className="vide">Aucun titre ne correspond. Ce titre n'est peut-être pas couvert par l'univers du jeu de départ (31 actifs).</p>}
    </div>
  );
}
