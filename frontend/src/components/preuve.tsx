import { useEffect, useRef } from "react";
import { useApp } from "../state";
import * as f from "../format";

const LIBELLES: [string, string][] = [
  ["mesure", "Mesure"], ["sujet", "Sujet"], ["unite", "Unité"], ["devise", "Devise"], ["as_of", "Date de simulation"],
  ["date_de_calcul", "Dernière donnée utilisée"], ["methode", "Méthode"], ["version_du_code", "Version du code"],
];

export function TiroirPreuve() {
  const { preuve, ouvrirPreuve } = useApp();
  const fermer = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!preuve) return;
    fermer.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") ouvrirPreuve(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [preuve, ouvrirPreuve]);
  if (!preuve) return null;
  const p = preuve;
  const aff = p.affichage ?? {};
  return (
    <div className="superpose" onClick={() => ouvrirPreuve(null)}>
      <aside className="tiroir" role="dialog" aria-modal="true" aria-labelledby="titre-preuve" onClick={(e) => e.stopPropagation()}>
        <div className="ligne entre"><h2 id="titre-preuve">Preuve</h2><button ref={fermer} className="bouton" onClick={() => ouvrirPreuve(null)}>Fermer</button></div>
        <p className="essentiel">{p.libelle}</p>
        <p className="discret">Identifiant <code>{p.id}</code> · calculé par le code, jamais par le LLM</p>
        {p.statut !== "ok" && <p className="puce inconnu">{p.statut === "donnees_insuffisantes" ? "Données insuffisantes" : "Non applicable"}{p.note ? ` : ${p.note}` : ""}</p>}
        {Object.keys(aff).length > 0 && (
          <table className="donnees"><caption className="visuellement-cache">Valeurs</caption><tbody>
            {Object.entries(aff).map(([k, v]) => <tr key={k}><th scope="row">{k.replaceAll("_", " ")}</th><td className="n">{v}</td></tr>)}
          </tbody></table>
        )}
        {p.mesure.startsWith("esg_") && p.valeur?.extrait && (
          <blockquote style={{ borderLeft: "3px solid var(--trait-fort)", margin: "12px 0", paddingLeft: 12 }}>
            « {p.valeur.extrait} »<br /><span className="discret">{p.valeur.source} — publié le {f.date(p.valeur.publie_le)}, consulté le {f.date(p.valeur.consulte_le)}. <a href={p.valeur.url} target="_blank" rel="noreferrer">Ouvrir la source</a></span>
          </blockquote>
        )}
        <h3>Origine et méthode</h3>
        <table className="donnees"><tbody>
          {p.periode && <tr><th scope="row">Période</th><td>{f.date(p.periode.debut)} → {f.date(p.periode.fin)}</td></tr>}
          {LIBELLES.map(([k, l]) => (p as any)[k] ? <tr key={k}><th scope="row">{l}</th><td>{String((p as any)[k])}</td></tr> : null)}
          <tr><th scope="row">Données sources</th><td>{p.donnees_source.join(" ; ")}</td></tr>
          {Object.keys(p.parametres ?? {}).length > 0 && <tr><th scope="row">Paramètres</th><td><code style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(p.parametres, null, 1)}</code></td></tr>}
          {p.reference && <tr><th scope="row">Référence</th><td>{p.reference}</td></tr>}
        </tbody></table>
        <p className="source">Catalogue des sources : docs/donnees.md (S1 kit, S2 prolongation Yahoo, S3 Banque du Canada, S4 FRED, S5 Wikipedia, S7 SSGA, S8 iShares Canada).</p>
      </aside>
    </div>
  );
}
