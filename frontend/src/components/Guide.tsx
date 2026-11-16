import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../state";
import { spring } from "./motion";
import { Button } from "./ui";

const ETAPES_VISITE: { titre: string; texte: string }[] = [
  { titre: "Bienvenue", texte: "ULYSSE compare chaque intention de placement aux règles que tu as fixées toi-même. Tout est simulé : argent fictif, aucune transaction réelle, jamais un conseil." },
  { titre: "Ton contrat", texte: "Tes règles, écrites à froid : perte maximale en crise, part en actions, poids d'une seule entreprise, cryptoactifs, liquidités. Chacune dit d'où elle vient : ce que tu as dit, ou une valeur par défaut documentée." },
  { titre: "Trouver un titre", texte: "Apple, NVIDIA, un fonds d'obligations… Le bouton « Rechercher un titre » (ou la touche /) ouvre n'importe lequel des 31 actifs du jeu de données." },
  { titre: "Le Mât", texte: "Sur la fiche d'un titre, tape un montant : l'ordre est vérifié en direct contre tes règles, en code. S'il s'en écarte nettement, une pause de réflexion s'affiche. Tu gardes le dernier mot." },
  { titre: "Le dossier", texte: "Pour aller plus loin, ouvre un dossier : des agents réunissent les données, deux d'entre eux argumentent pour et contre, et un vérificateur rejette tout chiffre sans preuve." },
  { titre: "Tes placements et la Vigie", texte: "Saisis, importe ou connecte (en simulation) tes placements. La Vigie les surveille et ne te parle que lorsqu'elle a quelque chose de pertinent. Tout est consigné dans le Journal." },
  { titre: "Apprendre", texte: "Sept leçons de 2 minutes t'attendent dans « Plus », et le bouton « Comment ça marche ? » explique chaque écran." },
];

/** First-visit guided tour (progress kept with the account). Accessible dialog, can be skipped at any step. */
export function Visite() {
  const { compte, rechargerCompte } = useApp();
  const [i, setI] = useState(0);
  const [ferme, setFerme] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const ouvert = !!compte && !compte.guide?.visite_faite && !ferme;
  useEffect(() => { const d = ref.current; if (d && ouvert && !d.open) d.showModal(); if (d && !ouvert && d.open) d.close(); }, [ouvert]);
  const finir = async () => { setFerme(true); try { await api("/guide", { body: { visite_faite: true } }); await rechargerCompte(); } catch { /* not blocking */ } };
  const e = ETAPES_VISITE[i];
  return (
    <dialog ref={ref} aria-labelledby="titre-visite" onCancel={finir} className="m-auto w-[min(520px,calc(100vw-24px))] rounded-[28px] bg-white p-0 text-ink shadow-lift">
      <div className="p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">Visite guidée · {i + 1} sur {ETAPES_VISITE.length}</p>
        <AnimatePresence mode="wait"><motion.div key={i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={spring}>
          <h2 id="titre-visite" className="mt-2 font-display text-[26px] font-medium tracking-[-0.02em]">{e.titre}</h2>
          <p className="mt-3 leading-relaxed text-ink-soft">{e.texte}</p>
        </motion.div></AnimatePresence>
        <div className="mt-6 flex items-center justify-between gap-2">
          <button onClick={finir} className="text-sm font-medium text-ink-muted hover:text-ink">Passer la visite</button>
          <div className="flex gap-2">
            {i > 0 && <Button variant="ghost" onClick={() => setI(i - 1)}>Retour</Button>}
            {i < ETAPES_VISITE.length - 1 ? <Button onClick={() => setI(i + 1)}>Suivant</Button> : <Button variant="accent" onClick={finir}>C'est parti</Button>}
          </div>
        </div>
      </div>
    </dialog>
  );
}

const AIDE: [RegExp, string, string[]][] = [
  [/^\/$/, "L'accueil", ["La valeur de ton portefeuille fictif et l'état de ton contrat en un coup d'œil.", "Le climat de marché (calme, agité, tendu) décrit le présent : il ne prédit rien.", "Les nouvelles de la Vigie apparaissent dans la cloche."]],
  [/^\/marche/, "Le marché", ["Les 31 actifs du jeu de données du datathon, avec leurs chiffres prouvés.", "Clique sur un titre pour voir sa fiche et préparer un ordre simulé."]],
  [/^\/titre/, "La fiche d'un titre", ["« Pour toi » : ce titre vu à travers tes règles.", "Tape un montant : le Mât vérifie l'ordre en direct, en code, sans IA.", "« Enregistrer » applique l'achat simulé à tes placements ; une pause de réflexion s'affiche si l'ordre s'écarte nettement de tes règles.", "Les dépôts officiels et la presse s'arrêtent à la date simulée."]],
  [/^\/placements/, "Mes placements", ["Ce que ton profil détient, évalué aux vrais cours de clôture.", "Tu peux déposer de l'argent fictif, vendre une ligne, saisir ou importer tes placements, ou connecter un compte (simulation, aucun identifiant demandé)."]],
  [/^\/portefeuille/, "La radiographie", ["Ce que ton portefeuille contient vraiment, FNB ouverts.", "Les « paris réels » regroupent les lignes qui montent et baissent ensemble.", "Le rejeu des crises applique tes poids actuels aux rendements réels d'épisodes passés : ce n'est pas une prévision."]],
  [/^\/contrat/, "Mon contrat", ["Tes règles, écrites à froid, et d'où vient chacune.", "Tu peux modifier une règle : l'effet est montré avant de valider, et le changement est consigné avec son contexte."]],
  [/^\/journal/, "Le journal", ["Tout ce qui s'est passé : ordres, décisions, pauses, dépôts, dossiers, changements de règles."]],
  [/^\/dossier/, "Le dossier de décision", ["Les étapes en haut sont l'exécution réelle des agents.", "Chaque phrase porte une étiquette (mesuré, documenté, hypothèse, incertain) ; clique sur un chiffre pour voir sa preuve.", "Deux agents argumentent pour et contre sur les mêmes preuves ; aucun ne décide."]],
  [/^\/nouveau-profil/, "Le questionnaire", ["Trois mesures : ce que tu es prêt à risquer, ce que ta situation permet, ce que tu connais.", "La plus basse fixe ton profil, et chaque raison est affichée."]],
];

/** « Comment ça marche ? » : the current screen explained in a few lines. */
export function CommentCaMarche() {
  const loc = useLocation();
  const { profil } = useApp();
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => setOuvert(false), [loc.pathname]);
  const aide = AIDE.find(([rx]) => rx.test(loc.pathname));
  if (!aide) return null;
  return (
    <div className="fixed bottom-24 right-4 z-30 md:bottom-6">
      <AnimatePresence>{ouvert && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={spring}
          role="dialog" aria-label={`Comment ça marche : ${aide[1]}`} className="mb-3 w-[min(340px,calc(100vw-32px))] rounded-2xl bg-white p-4 shadow-lift">
          <div className="flex items-start justify-between gap-2"><h2 className="font-display text-lg font-medium">{aide[1]}</h2>
            <button onClick={() => setOuvert(false)} aria-label="Fermer" className="text-ink-muted hover:text-ink"><X className="h-4 w-4" /></button></div>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">{aide[2].map((x) => <li key={x}>{x}</li>)}</ul>
          <Link to={`/apprendre?p=${profil}`} className="mt-3 inline-block text-sm font-semibold text-primary-600 hover:underline">Les leçons de 2 minutes</Link>
        </motion.div>)}</AnimatePresence>
      <button onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert}
        className="ml-auto flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-lift"><HelpCircle className="h-4 w-4" /> Comment ça marche ?</button>
    </div>
  );
}
