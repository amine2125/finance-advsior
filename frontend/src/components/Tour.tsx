import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../hooks/useApp";
import { api } from "../services/api";
import { softSpring } from "./motion";
import { Button } from "./ui";

/** One stop of the guided tour: the element it points at (data-tour="…") and what it says. Missing elements are skipped. */
type Stop = { target: string; title: string; text: string };

const STOPS: Stop[] = [
  { target: "balance", title: "Votre argent, en un coup d'œil", text: "La valeur totale : vos placements, plus l'argent disponible à investir. Tout est simulé : c'est de l'argent fictif pour apprendre sans risque." },
  { target: "cash", title: "Votre solde à investir", text: "Chaque compte commence avec de l'argent fictif. Investir le dépense, vendre le remplit. Vous pouvez en ajouter quand vous voulez." },
  { target: "connect", title: "Vos placements", text: "Si vous avez déjà des placements ailleurs, connectez votre compte (simulation) ou entrez-les à la main : les agents vérifient s'ils vous conviennent." },
  { target: "health", title: "Est-ce que ça vous ressemble ?", text: "Les agents comparent vos placements à votre profil et vous disent, en clair, ce qui dépasse vos limites." },
  { target: "decide", title: "Dites ce que vous voulez faire", text: "Écrivez en français : « J'ai 2 000 $ à investir », « Est-ce que Tesla me convient ? ». Des agents analysent et vous proposent un plan. Rien n'est fait sans votre accord." },
  { target: "nav-placements", title: "Placements", text: "Le détail de ce que vous détenez : la liste, la répartition, et vos limites respectées ou non." },
  { target: "nav-decisions", title: "Décisions", text: "Toutes les propositions des agents, approuvées, refusées ou en attente, avec leur explication." },
  { target: "nav-learn", title: "Apprendre", text: "Sept leçons de 2 minutes pour comprendre l'investissement : risque, diversification, intérêts composés…" },
  { target: "lea", title: "Léa, toujours là", text: "Une question, un mot que vous ne comprenez pas ? Demandez à Léa, à tout moment." },
  { target: "account", title: "Votre profil", text: "Modifiez une réponse si votre situation change, relancez cette visite ou déconnectez-vous." },
];

// Demo accounts are shared by the jury: remember the tour per browser session, so every judge gets it once.
const SESSION_KEY = "aegis.tour.seen";
const isDemo = (email?: string | null) => !!email && email.endsWith("@demo.aegis-finance.ca");
const sessionSeen = () => { try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; } };

const visible = (name: string): HTMLElement | null => {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
};

/** Guided tour of the home screen: starts by itself on the first visit, and on demand (event « aegis:tour »). */
export default function Tour() {
  const { me, reload } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const start = useCallback(() => {
    if (loc.pathname !== "/") nav("/");
    setTimeout(() => { setStops(STOPS.filter((s) => visible(s.target))); setI(0); }, 500);
  }, [loc.pathname, nav]);

  useEffect(() => {
    const h = () => start();
    window.addEventListener("aegis:tour", h);
    return () => window.removeEventListener("aegis:tour", h);
  }, [start]);
  useEffect(() => {  // first visit after the questionnaire
    const seen = isDemo(me?.email) ? sessionSeen() : me?.guide?.tour_done;
    if (me?.onboarded && me.guide && !seen && loc.pathname === "/" && !stops) {
      const t = setTimeout(start, 900);
      return () => clearTimeout(t);
    }
  }, [me?.onboarded, me?.guide?.tour_done]); // eslint-disable-line

  const stop = stops?.[i];
  const measure = useCallback(() => {
    const el = stop && visible(stop.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [stop]);
  useLayoutEffect(() => {
    const el = stop && visible(stop.target);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [stop, measure]);

  const finish = async () => {
    setStops(null); setRect(null);
    if (isDemo(me?.email)) { try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* private mode */ } return; }
    if (!me?.guide?.tour_done) { await api.put("/guide", { tour_done: true }).catch(() => undefined); reload(); }
  };
  useEffect(() => {
    if (!stops) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1)); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line
  const next = () => (stops && i < stops.length - 1 ? setI(i + 1) : finish());

  if (!stops || !stop) return null;
  const pad = 8;
  const box = rect && { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  const vw = window.innerWidth, vh = window.innerHeight;
  const cardW = Math.min(360, vw - 32);
  const below = box ? box.top + box.height + 220 < vh : true;
  const cardTop = box ? (below ? box.top + box.height + 12 : Math.max(16, box.top - 12 - 200)) : vh / 2 - 100;
  const cardLeft = box ? Math.min(Math.max(16, box.left), vw - cardW - 16) : (vw - cardW) / 2;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Visite guidée" data-testid="tour">
      <div className="absolute inset-0" onClick={finish} />
      <AnimatePresence>
        {box && (
          <motion.div key="spot" className="pointer-events-none absolute rounded-[24px] ring-2 ring-primary-500" style={{ boxShadow: "0 0 0 9999px rgba(21,20,19,0.55)" }}
            initial={false} animate={box} transition={softSpring} />
        )}
      </AnimatePresence>
      <motion.div className="absolute rounded-[22px] bg-surface p-5 shadow-lift hairline" style={{ width: cardW }}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, top: cardTop, left: cardLeft }} transition={softSpring}>
        <div className="flex items-start justify-between gap-3">
          <span className="tabular-nums text-xs font-medium text-primary-600">Visite guidée · {i + 1} sur {stops.length}</span>
          <button onClick={finish} className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-full text-ink-muted hover:bg-ink/[0.05]" aria-label="Passer la visite" data-testid="tour-skip"><X className="h-4 w-4" /></button>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={stop.target} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.16 }}>
            <h3 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">{stop.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{stop.text}</p>
          </motion.div>
        </AnimatePresence>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">{stops.map((_, k) => <span key={k} className={k === i ? "h-1.5 w-4 rounded-full bg-primary-500" : "h-1.5 w-1.5 rounded-full bg-ink/15"} />)}</div>
          <div className="flex gap-1.5">
            {i > 0 && <Button size="sm" variant="ghost" onClick={() => setI(i - 1)} aria-label="Précédent"><ArrowLeft className="h-4 w-4" /></Button>}
            <Button size="sm" onClick={next} data-testid="tour-next">{i < stops.length - 1 ? <>Suivant <ArrowRight className="h-3.5 w-3.5" /></> : "C'est parti !"}</Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
