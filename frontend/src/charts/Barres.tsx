import { useState } from "react";
import * as f from "../format";

/** Horizontal bars (≤ 24 px, rounded data-end), value at the tip, text in text tokens, table view. */
export function Barres({ titre, donnees, limite, source, unite = "%" }: { titre: string; donnees: { cle: string; libelle: string; valeur: number }[]; limite?: number; source: string; unite?: string }) {
  const [tableau, setTableau] = useState(false);
  const max = Math.max(limite ?? 0, ...donnees.map((d) => d.valeur), 1);
  return (
    <figure style={{ margin: 0 }}>
      <div className="ligne entre"><figcaption><strong>{titre}</strong></figcaption>
        <button className="bouton lien" onClick={() => setTableau((v) => !v)} aria-pressed={tableau}>{tableau ? "Voir les barres" : "Voir le tableau"}</button></div>
      {tableau ? (
        <table className="donnees"><thead><tr><th>Élément</th><th className="n">Valeur</th></tr></thead>
          <tbody>{donnees.map((d) => <tr key={d.cle}><td>{d.libelle}</td><td className="n">{unite === "%" ? f.pct(d.valeur) : f.nombre(d.valeur)}</td></tr>)}</tbody></table>
      ) : (
        <div className="barres" role="list">
          {donnees.map((d) => (
            <div className="barre" role="listitem" key={d.cle}>
              <span>{d.libelle}</span>
              <span className="piste" aria-hidden="true"><span className={`rempli ${limite != null && d.valeur > limite ? "alerte" : ""}`} style={{ display: "block", width: `${(Math.max(d.valeur, 0) / max) * 100}%` }} /></span>
              <span className="val">{unite === "%" ? f.pct(d.valeur) : f.nombre(d.valeur)}{limite != null && d.valeur > limite ? <span className="visuellement-cache"> (au-delà de la limite)</span> : null}</span>
            </div>
          ))}
          {limite != null && <p className="discret">Ta limite : {f.pct(limite, 0)} — une barre rouge signale un dépassement (repère aussi écrit dans le tableau).</p>}
        </div>
      )}
      <p className="source">Source : {source}</p>
    </figure>
  );
}
