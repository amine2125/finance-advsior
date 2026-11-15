import { useData } from "../state";
import { Chargement, Erreur } from "../components/base";
import * as f from "../format";

interface Metrique { cle: string; libelle: string; valeur: number | null; unite: string; n: number; ic95?: [number, number] | null; niveau: "Mesuré" | "Indicatif"; note?: string }

export function Fiabilite() {
  const { data, erreur, charge, recharger } = useData<{ disponible?: boolean; message?: string; execute_le?: string; metriques?: Metrique[]; scenarios?: any[]; environnement?: string }>("/fiabilite");
  if (charge && !data) return <Chargement />;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  if (data.disponible === false) return <div className="pile"><h1>Fiabilité</h1><p className="vide">{data.message}</p></div>;
  return (
    <div className="pile">
      <h1>Fiabilité</h1>
      <p className="essentiel">Ce que le banc d'essai a mesuré, avec la taille de l'échantillon. Aucune métrique n'est annoncée sans mesure.</p>
      <p className="discret">Exécuté le {data.execute_le} · environnement : {data.environnement}</p>
      <table className="donnees"><thead><tr><th>Mesure</th><th className="n">Résultat</th><th className="n">Échantillon</th><th>Intervalle (Wilson 95 %)</th><th>Niveau</th></tr></thead>
        <tbody>{(data.metriques ?? []).map((m) => <tr key={m.cle}><td>{m.libelle}{m.note && <div className="discret">{m.note}</div>}</td>
          <td className="n">{m.valeur == null ? "—" : m.unite === "%" ? f.pct(m.valeur) : `${f.nombre(m.valeur, m.unite === "ms" ? 0 : 4)} ${m.unite}`}</td>
          <td className="n">{m.n}</td><td className="num">{m.ic95 ? `${f.pct(m.ic95[0])} – ${f.pct(m.ic95[1])}` : "—"}</td><td>{m.niveau}</td></tr>)}</tbody></table>
      <p className="source">Banc d'essai : bench/ (scénarios personas et profils × titres × tailles × dates). Rejouable : make bench.</p>
    </div>
  );
}
