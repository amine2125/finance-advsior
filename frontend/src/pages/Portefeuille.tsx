import { useApp, useData } from "../state";
import { Chargement, Erreur, Prouve, PuceNiveau, Terme } from "../components/base";
import { Signale } from "../components/signal";
import { Barres } from "../charts/Barres";
import * as f from "../format";
import type { Preuve, Signal } from "../types";
import { SECTEURS } from "../libelles";

const PAYS: Record<string, string> = { CA: "Canada", US: "États-Unis", Mondial: "Mondial (crypto)" };

interface P { valeur: Preuve; transparence: Preuve[]; risque: Preuve[]; paris_reels: Preuve; rejeux: Preuve[]; signal: Signal }

export function Portefeuille() {
  const { profil, asOf } = useApp();
  const { data, erreur, charge, recharger } = useData<P>(`/profils/${profil}/portefeuille`, { as_of: asOf });
  if (charge && !data) return <Chargement lignes={8} />;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  const tr = Object.fromEntries(data.transparence.map((p) => [p.mesure, p]));
  const rk = Object.fromEntries(data.risque.map((p) => [p.mesure, p]));
  const pr = data.paris_reels;
  const bars = (p: Preuve | undefined, nom: Record<string, string> = {}) => p ? Object.entries(p.valeur as Record<string, number>).map(([k, v]) => ({ cle: k, libelle: nom[k] ?? k, valeur: v })) : [];
  return (
    <div className="pile">
      <h1>Radiographie du portefeuille</h1>
      {pr.statut === "ok" && <p className="essentiel">Tes <Prouve preuve={pr}>{pr.valeur.n_lignes} lignes</Prouve> forment <Prouve preuve={pr}><strong>{pr.valeur.n_paris} <Terme cle="paris_reels">paris réels</Terme></strong></Prouve> : les lignes d'un même groupe montent et baissent ensemble.</p>}
      <Signale signal={data.signal} intention={{ type: "portefeuille" }}>
        <div className="panneau" style={{ marginBottom: 0 }}><PuceNiveau niveau={data.signal.niveau} /> {data.signal.niveau === "ok" ? "Le portefeuille respecte tes règles." : data.signal.clauses[0]?.explication}</div>
      </Signale>
      {pr.statut === "ok" && <section className="panneau"><h2>Groupes de lignes qui bougent ensemble</h2>
        <ul className="liste-simple">{pr.valeur.groupes.map((g: { titres: string[]; poids_pct: number }, i: number) => <li key={i}>{g.titres.join(", ")} — {f.pct(g.poids_pct)} du portefeuille</li>)}</ul>
        <p className="source">Méthode : regroupement des corrélations hebdomadaires sur 3 ans (seuil 0,7). {pr.reference}</p></section>}
      <div className="grille-2">
        <section className="panneau"><Barres titre="Exposition réelle par secteur (FNB ouverts)" donnees={bars(tr["exposition_secteurs"], SECTEURS).slice(0, 10)} source={`compositions publiées (SSGA, iShares Canada), au ${f.date(asOf)}. ${tr["exposition_secteurs"]?.note ?? ""}`} /></section>
        <section className="panneau"><Barres titre="Classes d'actifs" donnees={bars(tr["exposition_classes"])} source="positions fictives × cours de clôture convertis en CAD" />
          <div style={{ marginTop: 16 }}><Barres titre="Pays" donnees={bars(tr["exposition_pays"], PAYS)} source="pays des titres sous-jacents" /></div></section>
      </div>
      <div className="grille-2">
        <section className="panneau"><Barres titre="Part de chaque ligne dans le risque total" donnees={bars(rk["contribution_risque"])} source={`covariance hebdomadaire sur 3 ans. ${rk["contribution_risque"]?.reference ?? ""}`} />
          {rk["volatilite_portefeuille"] && <p>Volatilité du portefeuille : <Prouve preuve={rk["volatilite_portefeuille"]}>{f.pct(rk["volatilite_portefeuille"].valeur)}</Prouve> ; <Terme cle="diversification">nombre effectif de paris</Terme> : <Prouve preuve={rk["nombre_effectif_paris"]}>{f.nombre(rk["nombre_effectif_paris"]?.valeur, 1)}</Prouve>.</p>}</section>
        <section className="panneau"><h2 style={{ fontSize: "var(--t-18)" }}><Terme cle="rejeu">Si une crise passée se répétait</Terme></h2>
          <table className="donnees"><thead><tr><th>Épisode</th><th className="n">Pire baisse</th><th className="n">En dollars</th></tr></thead>
            <tbody>{data.rejeux.map((p) => <tr key={p.id}><td>{p.libelle.replace("Rejeu : ", "")}</td>
              {p.statut === "ok" ? <><td className="n"><Prouve preuve={p}>{f.pct(p.valeur.pire_baisse_pct)}</Prouve></td><td className="n">{f.cad(p.valeur.pire_baisse_cad)}</td></> : <td colSpan={2} className="discret">{p.note}</td>}</tr>)}</tbody></table>
          <p className="source">Poids actuels appliqués aux rendements réels de chaque épisode. Faits passés, pas une prévision.</p></section>
      </div>
      <section className="panneau"><Barres titre="Exposition par titre, directe et via FNB (15 premiers)" donnees={bars(tr["exposition_titres"])} source={`compositions publiées des FNB à la date ; part du portefeuille dont la composition est connue : ${f.pct(tr["couverture_transparence"]?.valeur)}`} /></section>
    </div>
  );
}
