import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAssistant } from "../components/Assistant";
import { Chargement, Erreur, Prouve, PuceNiveau, Terme } from "../components/base";
import { CountUp, Glass, Stagger, StaggerItem } from "../components/motion";
import { Signale } from "../components/signal";
import { LinkButton, Section } from "../components/ui";
import * as f from "../format";
import { MODULES, VOCABULAIRE } from "../libelles";
import { useApp, useData } from "../state";
import type { Adaptation, Preuve, Signal } from "../types";

interface Accueil { as_of: string; donnees_jusqu_au: string; valeur: Preuve; statut_contrat: Signal; changements: { type: string; depuis: string; avant_cad: number; apres_cad: number }[];
  notifications: { id: string; titre: string; message: string; niveau: string; lien: string; as_of: string }[]; regime: Preuve; adaptation: Adaptation }

const SUGGESTIONS = ["Je veux mettre 20 000 $ dans NVIDIA", "Mon portefeuille respecte-t-il mes règles ?", "Et Tesla ?"];

export function Accueil() {
  const { profil, asOf, enPassé } = useApp();
  const { envoyer } = useAssistant();
  const { data, erreur, charge, recharger } = useData<Accueil>(`/profils/${profil}/accueil`, { as_of: asOf });
  const { data: profils } = useData<{ id: string; nom: string; tolerance: string }[]>("/profils");
  if (charge && !data) return <Chargement lignes={5} />;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  const s = data.statut_contrat;
  const suffixe = `?p=${profil}${enPassé ? `&d=${asOf}` : ""}`;
  const depassees = s.clauses.filter((c) => c.statut === "depassee");
  const reg = data.regime.valeur;
  const nom = profils?.find((p) => p.id === profil)?.nom;
  return (
    <div className="mx-auto max-w-[920px]">
      <Glass glow className="px-6 pb-7 pt-7 sm:px-9 sm:pt-9">
        <p className="text-sm text-ink-muted">Portefeuille fictif{nom ? ` de ${nom}` : ""} · au {f.date(data.as_of)}</p>
        <h1 className="mt-2 font-display text-[48px] font-semibold leading-none tracking-[-0.045em] text-ink sm:text-[64px]">
          <Prouve preuve={data.valeur}><CountUp value={data.valeur.valeur.total_cad} format={(v) => f.cad(v)} /></Prouve>
        </h1>
        <div className="mt-6">
          <Signale signal={s} intention={{ type: "portefeuille" }}>
            <div className="rounded-2xl bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2"><PuceNiveau niveau={s.niveau} />
                <span className="text-sm font-medium text-ink">{s.niveau === "ok" ? "Ton portefeuille respecte les règles de ton contrat." :
                  depassees.length ? `${depassees.length} de tes règles ${depassees.length > 1 ? "sont dépassées" : "est dépassée"} par la dérive du portefeuille.` :
                    "Une de tes règles est approchée ou ne peut pas être vérifiée."}</span></div>
              {depassees.slice(0, 2).map((c) => <p key={c.clause_id} className="mt-2 text-sm leading-relaxed text-ink-soft">{c.explication}</p>)}
            </div>
          </Signale>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <LinkButton to={`/portefeuille${suffixe}`} variant="primary">Voir la radiographie du portefeuille</LinkButton>
          <LinkButton to={`/contrat${suffixe}`}>Mes règles</LinkButton>
        </div>
      </Glass>

      <section className="mt-10" aria-labelledby="t-intention">
        <h2 id="t-intention" className="font-display text-[22px] font-semibold tracking-[-0.03em]">Une intention en tête ?</h2>
        <p className="mt-1 text-sm text-ink-muted">Écris-la à l'assistant : il la compare à tes règles, chiffres prouvés à l'appui. Il ne te dira jamais quoi faire.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((q) => <button key={q} onClick={() => envoyer(q)} className="rounded-full border border-line bg-white px-4 py-2 text-sm text-ink shadow-card hover:border-ink/30">{q}</button>)}
        </div>
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Section title="Ce qui a changé" id="t-chg" className="min-w-0">
          {data.notifications.length === 0 && data.changements.length === 0 && <p className="text-sm text-ink-muted">Rien de nouveau depuis ta dernière visite. La Vigie ne te dérange que lorsqu'elle a quelque chose de pertinent.</p>}
          <Stagger className="space-y-1">
            {data.changements.map((c) => <StaggerItem key={c.type} className="border-b border-line py-3 text-sm">Depuis ta dernière visite ({f.date(c.depuis)}), la valeur est passée de {f.cad(c.avant_cad)} à {f.cad(c.apres_cad)}.</StaggerItem>)}
            {data.notifications.map((n) => (
              <StaggerItem key={n.id}>
                <Link to={`${n.lien}${suffixe}`} className="group flex items-start gap-3 border-b border-line py-3.5 transition-opacity hover:opacity-80">
                  {n.niveau === "ok" ? <span className="mt-0.5 rounded-full bg-ink/[0.04] px-2.5 py-0.5 text-xs font-semibold text-ink-soft">ℹ Info</span> : <PuceNiveau niveau={n.niveau as any} />}
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{n.titre}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{n.message} — {f.date(n.as_of)}</span></span>
                  <ArrowRight className="mt-1 h-4 w-4 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </StaggerItem>))}
          </Stagger>
        </Section>
        <Section title={<Terme cle="regime">Climat de marché</Terme>} id="t-climat">
          {data.regime.statut === "ok" ? (
            <p className="text-sm leading-relaxed text-ink-soft">Les marchés ressemblent à un climat <Prouve preuve={data.regime}><strong className="text-ink">« {reg.regime} »</strong></Prouve> depuis {reg.semaines_consecutives} semaine(s). Description du présent, pas une prévision.</p>
          ) : <p className="text-sm text-ink-muted">Données insuffisantes pour décrire le climat à cette date.</p>}
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">Adaptation à ton profil : vocabulaire {VOCABULAIRE[data.adaptation.vocabulaire]} ({data.adaptation.raisons.vocabulaire}) ; en premier : {data.adaptation.priorite_modules.slice(0, 2).map((m) => MODULES[m] ?? m).join(", ")} ({data.adaptation.raisons.priorite_modules}).</p>
        </Section>
      </div>
    </div>
  );
}
