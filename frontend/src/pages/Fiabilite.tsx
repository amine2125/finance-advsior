import { Chargement, Erreur, Note, Vide } from "../components/base";
import { PageTitle, Panel, Table } from "../components/ui";
import * as f from "../format";
import { useData } from "../state";

interface Metrique { cle: string; libelle: string; valeur: number | null; unite: string; n: number; ic95?: [number, number] | null; niveau: "Mesuré" | "Indicatif"; note?: string }

export function Fiabilite() {
  const { data, erreur, charge, recharger } = useData<{ disponible?: boolean; message?: string; execute_le?: string; metriques?: Metrique[]; scenarios?: any[]; environnement?: string }>("/fiabilite");
  if (charge && !data) return <Chargement />;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  if (data.disponible === false) return <div><PageTitle title="Fiabilité" /><Vide>{data.message}</Vide></div>;
  return (
    <div>
      <PageTitle title="Fiabilité" subtitle="Ce que le banc d'essai a mesuré, avec la taille de l'échantillon. Aucune métrique n'est annoncée sans mesure." eyebrow={`Exécuté le ${data.execute_le} · environnement : ${data.environnement}`} />
      <Panel><Table caption="Métriques du banc d'essai">
        <thead><tr><th>Mesure</th><th className="!text-right">Résultat</th><th className="!text-right">Échantillon</th><th>Intervalle (Wilson 95 %)</th><th>Niveau</th></tr></thead>
        <tbody>{(data.metriques ?? []).map((m) => <tr key={m.cle}><td>{m.libelle}{m.note && <div className="mt-0.5 text-xs text-ink-muted">{m.note}</div>}</td>
          <td className="tabular text-right font-semibold">{m.valeur == null ? "—" : m.unite === "%" ? f.pct(m.valeur) : `${f.nombre(m.valeur, m.unite === "ms" ? 0 : 4)} ${m.unite}`}</td>
          <td className="tabular text-right">{m.n}</td><td className="tabular">{m.ic95 ? `${f.pct(m.ic95[0])} – ${f.pct(m.ic95[1])}` : "—"}</td>
          <td><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.niveau === "Mesuré" ? "bg-gain-50 text-gain-700" : "bg-ink/[0.04] text-ink-soft"}`}>{m.niveau}</span></td></tr>)}</tbody>
      </Table></Panel>
      <Note>Banc d'essai : bench/ (scénarios personas et profils × titres × tailles × dates). Rejouable : make bench.</Note>
    </div>
  );
}
