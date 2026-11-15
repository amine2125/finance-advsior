import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CircleHelp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { lessonById } from "../lib/lessons";
import { softSpring } from "./motion";

type Topic = "home" | "placements" | "decisions" | "proposal" | "profile" | "connect";

/** « Comment ça marche ? » for every screen: what you see, what you can do, and the lesson that explains the idea. */
const HELP: Record<Topic, { title: string; points: string[]; lesson?: string }> = {
  home: {
    title: "L'accueil",
    points: [
      "En haut, la valeur de tout votre argent : vos placements plus le solde disponible à investir (simulé).",
      "La carte suivante dit si vos placements respectent votre profil, et propose de corriger.",
      "« Que voulez-vous faire ? » : écrivez votre idée en français, des agents l'analysent et vous proposent un plan.",
      "À droite, le climat de marché et les titres qui attirent une attention inhabituelle : une description du présent, pas une prévision.",
    ],
    lesson: "aegis",
  },
  placements: {
    title: "Vos placements",
    points: [
      "« Liste » : chaque placement, sa valeur, ce qu'il a gagné ou perdu depuis l'achat et aujourd'hui.",
      "« Répartition » : la part de stabilité (obligations) et de croissance (actions), et vos limites respectées ou non.",
      "Touchez un placement pour voir son risque, ses mesures avancées et demander aux agents s'il vous convient.",
    ],
    lesson: "diversifier",
  },
  decisions: {
    title: "Vos décisions",
    points: [
      "Chaque demande faite aux agents devient une proposition, gardée ici.",
      "« En attente » : vous n'avez pas encore choisi. « Approuvée » : votre portefeuille simulé a été mis à jour. « Refusée » : rien n'a changé.",
      "Ouvrez une décision pour revoir le plan, les raisons et l'analyse complète des agents.",
    ],
    lesson: "aegis",
  },
  proposal: {
    title: "Une proposition des agents",
    points: [
      "En haut, le verdict en une phrase, puis ce que les agents ont trouvé.",
      "« Le plan » : les achats et ventes proposés, regroupés ; touchez un groupe pour le détail et la raison de chaque ordre.",
      "« Ce que ça change » : votre part en actions et vos baisses possibles, avant et après.",
      "Rien n'est fait sans vous : Approuver met à jour le portefeuille simulé, Refuser ne change rien.",
    ],
    lesson: "risque",
  },
  profile: {
    title: "Votre profil",
    points: [
      "Votre niveau de risque vient de trois mesures : ce que vous êtes prêt à risquer, ce que votre situation permet, ce que vous connaissez. La plus basse décide.",
      "Il fixe vos limites : part en actions, poids d'une seule entreprise, cryptoactifs.",
      "Votre situation a changé ? Modifiez seulement la réponse concernée : le profil est recalculé et prévisualisé avant d'enregistrer.",
    ],
    lesson: "risque",
  },
  connect: {
    title: "Connecter un compte",
    points: [
      "Choisissez votre institution, autorisez l'accès en lecture seule, puis les comptes à analyser.",
      "C'est une simulation : aucun identifiant n'est demandé et aucune banque n'est contactée ; les placements affichés sont fictifs, achetés aux vrais prix historiques.",
      "Ensuite, les agents vérifient tout de suite si ces placements respectent votre profil.",
    ],
    lesson: "briques",
  },
};

export default function HowItWorks({ topic, className }: { topic: Topic; className?: string }) {
  const [open, setOpen] = useState(false);
  const h = HELP[topic];
  const lesson = h.lesson ? lessonById(h.lesson) : undefined;
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <>
      <button onClick={() => setOpen(true)} data-testid={`help-${topic}`}
        className={"inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/[0.07] hover:text-ink " + (className || "")}>
        <CircleHelp className="h-3.5 w-3.5" /> Comment ça marche ?
      </button>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
            <motion.div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={softSpring}
              className="relative w-full max-w-lg rounded-t-[28px] bg-surface p-6 shadow-lift sm:rounded-[28px] sm:p-7" data-testid="help-sheet">
              <button onClick={() => setOpen(false)} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-ink/[0.05] text-ink-soft hover:bg-ink/10" aria-label="Fermer"><X className="h-4 w-4" /></button>
              <div className="flex items-center gap-2 text-sm font-medium text-primary-600"><CircleHelp className="h-4 w-4" /> Comment ça marche ?</div>
              <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">{h.title}</h2>
              <ol className="mt-4 space-y-3">
                {h.points.map((p, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink-soft">
                    <span className="tabular-nums mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink/[0.05] text-xs font-semibold text-ink">{i + 1}</span>{p}
                  </li>
                ))}
              </ol>
              {lesson && (
                <Link to={`/apprendre/${lesson.id}`} onClick={() => setOpen(false)} className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-primary-50 px-4 py-3 text-sm text-ink hover:bg-primary-50/70">
                  <span><span className="font-medium">Pour aller plus loin · </span>{lesson.title}</span><ArrowRight className="h-4 w-4 text-primary-600" />
                </Link>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
