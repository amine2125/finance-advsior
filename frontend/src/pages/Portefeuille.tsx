import { Barres } from "../charts/Barres";
import { Chargement, Erreur, Note, Prouve, PuceNiveau, Terme } from "../components/base";
import { Signale } from "../components/signal";
import { Hero, Panel, PageTitle, Table } from "../components/ui";
import * as f from "../format";
import { SECTEURS } from "../libelles";
import { useApp, useData } from "../state";
import type { Preuve, Signal } from "../types";

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
    <div className="space-y-8">
      <PageTitle title="Radiographie du portefeuille" subtitle="Ce que ton portefeuille fictif contient vraiment, FNB ouverts, et comment il se comporterait si une crise passée se répétait." />
      {pr.statut === "ok" && (
        <Hero>
          <p className="text-sm text-white/70">Diversification réelle</p>
          <p className="mt-2 font-display text-[28px] font-medium leading-snug tracking-[-0.02em] sm:text-[34px]">
            Tes <Prouve preuve={pr}>{pr.valeur.n_lignes} lignes</Prouve> forment <Prouve preuve={pr}>{pr.valeur.n_paris} <Terme cle="paris_reels">paris réels</Terme></Prouve>.
          </p>
          <p className="mt-2 max-w-2xl text-sm text-white/75">Les lignes d'un même groupe montent et baissent ensemble.</p>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">{pr.valeur.groupes.map((g: { titres: string[]; poids_pct: number }, i: number) => (
            <li key={i} className="rounded-2xl bg-white/[0.08] p-3 text-sm"><span className="tabular font-semibold">{f.pct(g.poids_pct)}</span> <span className="text-white/75">· {g.titres.join(", ")}</span></li>))}</ul>
          <p className="mt-4 text-xs text-white/55">Méthode : regroupement des corrélations hebdomadaires sur 3 ans (seuil 0,7). {pr.reference}</p>
        </Hero>)}
      <Signale signal={data.signal} intention={{ type: "portefeuille" }}>
        <div className="flex flex-wrap items-start gap-2 rounded-2xl bg-white p-4 text-sm shadow-card"><PuceNiveau niveau={data.signal.niveau} /> <span className="min-w-0 flex-1 text-ink-soft">{data.signal.niveau === "ok" ? "Le portefeuille respecte tes règles." : data.signal.clauses[0]?.explication}</span></div>
      </Signale>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel><Barres titre="Exposition réelle par secteur (FNB ouverts)" donnees={bars(tr["exposition_secteurs"], SECTEURS).slice(0, 10)} source={`compositions publiées (SSGA, iShares Canada), au ${f.date(asOf)}. ${tr["exposition_secteurs"]?.note ?? ""}`} /></Panel>
        <Panel><Barres titre="Classes d'actifs" donnees={bars(tr["exposition_classes"])} source="positions fictives × cours de clôture convertis en CAD" />
          <div className="mt-6"><Barres titre="Pays" donnees={bars(tr["exposition_pays"], PAYS)} source="pays des titres sous-jacents" /></div></Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel><Barres titre="Part de chaque ligne dans le risque total" donnees={bars(rk["contribution_risque"])} source={`covariance hebdomadaire sur 3 ans. ${rk["contribution_risque"]?.reference ?? ""}`} />
          {rk["volatilite_portefeuille"] && <p className="mt-4 text-sm text-ink-soft">Volatilité du portefeuille : <Prouve preuve={rk["volatilite_portefeuille"]}>{f.pct(rk["volatilite_portefeuille"].valeur)}</Prouve> ; <Terme cle="diversification">nombre effectif de paris</Terme> : <Prouve preuve={rk["nombre_effectif_paris"]}>{f.nombre(rk["nombre_effectif_paris"]?.valeur, 1)}</Prouve>.</p>}</Panel>
        <Panel><h2 className="font-display text-lg font-medium tracking-[-0.02em]"><Terme cle="rejeu">Si une crise passée se répétait</Terme></h2>
          <div className="mt-3"><Table caption="Rejeu des crises passées sur les poids actuels">
            <thead><tr><th>Épisode</th><th className="!text-right">Pire baisse</th><th className="!text-right">En dollars</th></tr></thead>
            <tbody>{data.rejeux.map((p) => <tr key={p.id}><td>{p.libelle.replace("Rejeu : ", "")}</td>
              {p.statut === "ok" ? <><td className="tabular text-right font-semibold text-loss-700"><Prouve preuve={p}>{f.pct(p.valeur.pire_baisse_pct)}</Prouve></td><td className="tabular text-right">{f.cad(p.valeur.pire_baisse_cad)}</td></> : <td colSpan={2} className="text-ink-muted">{p.note}</td>}</tr>)}</tbody>
          </Table></div>
          <Note>Poids actuels appliqués aux rendements réels de chaque épisode. Faits passés, pas une prévision.</Note></Panel>
      </div>
      <Panel><Barres titre="Exposition par titre, directe et via FNB (15 premiers)" donnees={bars(tr["exposition_titres"])} source={`compositions publiées des FNB à la date ; part du portefeuille dont la composition est connue : ${f.pct(tr["couverture_transparence"]?.valeur)}`} /></Panel>
    </div>
  );
}
