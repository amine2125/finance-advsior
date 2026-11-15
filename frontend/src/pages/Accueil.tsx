import { Link } from "react-router-dom";
import { useApp, useData } from "../state";
import { Chargement, Erreur, Prouve, PuceNiveau, Terme } from "../components/base";
import { Signale } from "../components/signal";
import * as f from "../format";
import type { Adaptation, Preuve, Signal } from "../types";
import { MODULES, VOCABULAIRE } from "../libelles";

interface Accueil { as_of: string; donnees_jusqu_au: string; valeur: Preuve; statut_contrat: Signal; changements: { type: string; depuis: string; avant_cad: number; apres_cad: number }[];
  notifications: { id: string; titre: string; message: string; niveau: string; lien: string; as_of: string }[]; regime: Preuve; adaptation: Adaptation }

export function Accueil() {
  const { profil, asOf, enPassé } = useApp();
  const { data, erreur, charge, recharger } = useData<Accueil>(`/profils/${profil}/accueil`, { as_of: asOf });
  if (charge && !data) return <Chargement lignes={5} />;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  const s = data.statut_contrat;
  const suffixe = `?p=${profil}${enPassé ? `&d=${asOf}` : ""}`;
  const depassees = s.clauses.filter((c) => c.statut === "depassee");
  const reg = data.regime.valeur;
  return (
    <div className="pile">
      <h1>Accueil</h1>
      <section className="panneau" aria-labelledby="t-valeur">
        <h2 id="t-valeur" className="visuellement-cache">Ton portefeuille</h2>
        <p className="essentiel">Ton portefeuille fictif vaut <Prouve preuve={data.valeur}><span className="chiffre-cle">{f.cad(data.valeur.valeur.total_cad)}</span></Prouve>.</p>
        <Signale signal={s} intention={{ type: "portefeuille" }}>
          <div className="panneau" style={{ marginBottom: 0 }}>
            <p style={{ margin: 0 }}><PuceNiveau niveau={s.niveau} />{" "}
              {s.niveau === "ok" ? "Ton portefeuille respecte les règles de ton contrat." :
                depassees.length ? `${depassees.length} de tes règles ${depassees.length > 1 ? "sont dépassées" : "est dépassée"} par la dérive du portefeuille.` :
                  "Une de tes règles est approchée ou ne peut pas être vérifiée."}</p>
            {depassees.slice(0, 2).map((c) => <p key={c.clause_id} className="discret" style={{ margin: "6px 0 0" }}>{c.explication}</p>)}
          </div>
        </Signale>
        <div className="actions"><Link className="bouton principal" to={`/portefeuille${suffixe}`}>Voir la radiographie du portefeuille</Link></div>
      </section>
      <section className="panneau" aria-labelledby="t-chg">
        <h2 id="t-chg">Ce qui a changé</h2>
        {data.notifications.length === 0 && data.changements.length === 0 && <p className="discret">Rien de nouveau depuis ta dernière visite. La Vigie ne te dérange que lorsqu'elle a quelque chose de pertinent.</p>}
        <ul className="sans-puce pile">
          {data.changements.map((c) => <li key={c.type}>Depuis ta dernière visite ({f.date(c.depuis)}), la valeur est passée de {f.cad(c.avant_cad)} à {f.cad(c.apres_cad)}.</li>)}
          {data.notifications.map((n) => (
            <li key={n.id}>{n.niveau === "ok" ? <span className="puce aucun"><span className="ic" aria-hidden="true">ℹ</span>Info</span> : <PuceNiveau niveau={n.niveau as any} />} <Link to={`${n.lien}${suffixe}`}>{n.titre}</Link>
              <div className="discret">{n.message} — {f.date(n.as_of)}</div></li>))}
        </ul>
      </section>
      <section className="panneau" aria-labelledby="t-climat">
        <h2 id="t-climat"><Terme cle="regime">Climat de marché</Terme></h2>
        {data.regime.statut === "ok" ? (
          <p>Les marchés ressemblent actuellement à un climat <Prouve preuve={data.regime}><strong>« {reg.regime} »</strong></Prouve> depuis {reg.semaines_consecutives} semaine(s). Description du présent, pas une prévision.</p>
        ) : <p className="discret">Données insuffisantes pour décrire le climat à cette date.</p>}
      </section>
      <p className="discret">Adaptation à ton profil : vocabulaire {VOCABULAIRE[data.adaptation.vocabulaire]} ({data.adaptation.raisons.vocabulaire}) ; en premier : {data.adaptation.priorite_modules.slice(0, 2).map((m) => MODULES[m] ?? m).join(", ")} ({data.adaptation.raisons.priorite_modules}).</p>
    </div>
  );
}
