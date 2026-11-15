import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp, useData } from "../state";
import { Chargement, Erreur, PuceNiveau, Vide } from "../components/base";
import * as f from "../format";

const TYPES: Record<string, string> = { dossier: "Dossier de décision", signal: "Signal affiché", decision: "Ta décision", regle_modifiee: "Règle modifiée",
  notification: "Notification de la Vigie", contrat: "Contrat", surveillance: "Liste de surveillance" };

export function Journal() {
  const { profil, asOf } = useApp();
  const nav = useNavigate();
  const { data, erreur, charge, recharger } = useData<{ entrees: any[] }>(`/profils/${profil}/journal`);
  const rejouer = async (e: any) => {
    const r = await api<{ id: string }>("/dossiers", { body: { profil, as_of: e.as_of, intention: e.intention } });
    nav(`/dossier/${r.id}?p=${profil}&d=${e.as_of}`);
  };
  if (charge && !data) return <Chargement lignes={6} />;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  return (
    <div className="pile">
      <h1>Journal de bord</h1>
      <p className="discret">Toutes les interventions et tes décisions, dans l'ordre. Chaque dossier garde sa trace complète et peut être rejoué.</p>
      {data.entrees.length === 0 ? <Vide>Aucune entrée pour l'instant. Ouvre un dossier ou prépare un ordre simulé.</Vide> : (
        <table className="donnees"><thead><tr><th>Quand</th><th>Type</th><th>Détail</th><th><span className="visuellement-cache">Actions</span></th></tr></thead>
          <tbody>{data.entrees.map((e, i) => (
            <tr key={i}><td className="num">{e.a?.replace("T", " ")}{e.as_of && e.as_of !== asOf ? <div className="discret">date simulée : {f.date(e.as_of)}</div> : null}</td>
              <td>{TYPES[e.type] ?? e.type}</td>
              <td>{e.niveau && <PuceNiveau niveau={e.niveau === "ok" && e.type === "notification" ? "ok" : e.niveau} />}{" "}
                {e.type === "dossier" && <>{e.intention?.type === "ordre" ? `Ordre simulé de ${f.cad(e.intention.montant_cad)} sur ${e.intention.ticker}` : e.intention?.ticker ? `Titre ${e.intention.ticker}` : "Portefeuille"}</>}
                {e.type === "signal" && <>Ordre de {f.cad(e.montant_cad)} sur {e.ticker} (règles {e.regles?.join(", ")})</>}
                {e.type === "decision" && <>« {e.choix === "continuer" ? "Continuer quand même" : "Enregistrer"} » — {e.ticker} {f.cad(e.montant_cad)} (simulation)</>}
                {e.type === "regle_modifiee" && <>{e.clause} → version {e.version}. Contexte : « {e.contexte} »</>}
                {(e.type === "notification" || e.type === "contrat") && <>{e.titre ?? e.message}</>}
                {e.type === "surveillance" && <>Ajout de {e.ticker}</>}</td>
              <td>{e.type === "dossier" && <><Link to={`/dossier/${e.id}?p=${profil}&d=${e.as_of}`}>Ouvrir</Link>{" · "}<button className="bouton lien" onClick={() => rejouer(e)}>Rejouer</button></>}</td></tr>))}</tbody></table>)}
    </div>
  );
}
