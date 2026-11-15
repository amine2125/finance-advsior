import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

const PAD = 8;   // space between the element and the highlight ring, identical on all four sides
const GAP = 14;  // space between the highlight and the explanation card
const M = 16;    // minimum distance from the viewport edges

/** The element that actually draws the shape: skips bare wrappers (no padding, border or background) around a single child. */
const shape = (el: HTMLElement): HTMLElement => {
  let e = el;
  while (e.children.length === 1) {
    const s = getComputedStyle(e);
    const boxed = ["top", "right", "bottom", "left"].some((k) => parseFloat(s.getPropertyValue(`padding-${k}`)) || parseFloat(s.getPropertyValue(`border-${k}-width`)));
    if (boxed || s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.backgroundImage !== "none") break;
    const c = e.firstElementChild as HTMLElement;
    const cr = c.getBoundingClientRect();
    if (!cr.width || !cr.height) break;
    e = c;
  }
  return e;
};
const pinned = (el: HTMLElement) => {
  for (let e: HTMLElement | null = el; e; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === "fixed" || p === "sticky") return true; }
  return false;
};
/** Bottom edge of the sticky header: content scrolled above it is hidden behind it. */
const headerBottom = () => {
  const h = document.querySelector("header");
  if (!h) return 0;
  const p = getComputedStyle(h).position;
  return p === "sticky" || p === "fixed" ? Math.max(0, h.getBoundingClientRect().bottom) : 0;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

type Box = { top: number; left: number; width: number; height: number; borderRadius: number };

const measureBox = (el: HTMLElement): Box => {
  const v = shape(el);
  const r = v.getBoundingClientRect();
  const raw = getComputedStyle(v).borderTopLeftRadius;
  const height = r.height + PAD * 2;
  const rad = raw.endsWith("%") ? Infinity : parseFloat(raw) || 0;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height, borderRadius: Math.min(rad > 0 ? rad + PAD : 12, height / 2, (r.width + PAD * 2) / 2) };
};

/** Card position: below, then above, then right, then left of the highlight; never on top of it when any side has room. */
const placeCard = (b: Box, cw: number, ch: number, vw: number, vh: number) => {
  const x = clamp(b.width >= cw ? b.left : b.left + b.width / 2 - cw / 2, M, vw - cw - M);
  const fitsY = (t: number) => t >= M && t + ch <= vh - M;
  const below = b.top + b.height + GAP;
  if (fitsY(below)) return { top: below, left: x };
  const above = b.top - GAP - ch;
  if (fitsY(above)) return { top: above, left: x };
  const midY = clamp(b.top + b.height / 2 - ch / 2, M, vh - ch - M);
  const right = b.left + b.width + GAP;
  if (right + cw <= vw - M) return { top: midY, left: right };
  const left = b.left - GAP - cw;
  if (left >= M) return { top: midY, left };
  return { top: vh - (b.top + b.height) >= b.top ? clamp(below, M, vh - ch - M) : clamp(above, M, vh - ch - M), left: x };
};

/** Guided tour of the home screen: starts by itself on the first visit, and on demand (event « aegis:tour »). */
export default function Tour() {
  const { me, reload } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [snap, setSnap] = useState(false); // true while following a scroll/resize: no spring lag behind the element
  const [cardH, setCardH] = useState(260);
  const cardRef = useRef<HTMLDivElement>(null);

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
    setBox(el ? measureBox(el) : null);
  }, [stop]);

  // Card height follows its content, so placement never relies on a guess.
  useLayoutEffect(() => {
    const c = cardRef.current;
    if (!c) return;
    setCardH(c.offsetHeight);
    const ro = new ResizeObserver(() => setCardH(c.offsetHeight));
    ro.observe(c);
    return () => ro.disconnect();
  }, [stops]);

  useLayoutEffect(() => {
    const el = stop && visible(stop.target);
    if (!el) return;
    const v = shape(el);
    if (!pinned(v)) {
      // Scroll so that the element AND the card fit together, clear of the sticky header.
      const r = v.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const ch = cardRef.current?.offsetHeight ?? cardH;
      const cw = Math.min(360, vw - 2 * M);
      const T = headerBottom() + M, B = vh - M, bh = r.height + PAD * 2;
      const sideRoom = r.right + PAD + GAP + cw <= vw - M || r.left - PAD - GAP - cw >= M;
      const boxTop = bh + GAP + ch <= B - T ? T + (B - T - bh - GAP - ch) / 2   // card below, the pair centred
        : bh <= B - T && sideRoom ? T + (B - T - bh) / 2                          // card beside
        : Math.max(T, M + ch + GAP);                                              // card above, element continues below
      window.scrollBy({ top: r.top - PAD - boxTop, behavior: "smooth" });
    }
    setSnap(false);
    measure();
    const follow = () => { setSnap(true); measure(); };
    const t = setTimeout(follow, 600);
    const ro = new ResizeObserver(follow);
    ro.observe(v);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => { clearTimeout(t); ro.disconnect(); window.removeEventListener("resize", follow); window.removeEventListener("scroll", follow, true); };
  }, [stop, measure]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async () => {
    setStops(null); setBox(null);
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
  const vw = window.innerWidth, vh = window.innerHeight;
  const cardW = Math.min(360, vw - 2 * M);
  const card = box ? placeCard(box, cardW, cardH, vw, vh) : { top: (vh - cardH) / 2, left: (vw - cardW) / 2 };
  const move = snap ? { ...softSpring, top: { duration: 0 }, left: { duration: 0 }, width: { duration: 0 }, height: { duration: 0 } } : softSpring;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Visite guidée" data-testid="tour">
      <div className="absolute inset-0" onClick={finish} />
      <AnimatePresence>
        {box && (
          <motion.div key="spot" className="pointer-events-none absolute ring-2 ring-primary-500" style={{ boxShadow: "0 0 0 9999px rgba(21,20,19,0.55)" }}
            initial={false} animate={box} transition={move} />
        )}
      </AnimatePresence>
      <motion.div ref={cardRef} className="absolute left-0 top-0 rounded-[22px] bg-surface p-5 shadow-lift hairline" style={{ width: cardW }}
        initial={{ opacity: 0, y: 8, top: card.top, left: card.left }} animate={{ opacity: 1, y: 0, top: card.top, left: card.left }} transition={move}>
        <div className="flex items-start justify-between gap-3">
          <span className="tabular-nums text-xs font-medium text-primary-600">Visite guidée · {i + 1} sur {stops.length}</span>
          <button onClick={finish} className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-full text-ink-muted hover:bg-ink/[0.05]" aria-label="Passer la visite" data-testid="tour-skip"><X className="h-4 w-4" /></button>
        </div>
        {/* No exit animation: the new text is in the DOM at once, so the card height measured for placement is the right one. */}
        <AnimatePresence initial={false}>
          <motion.div key={stop.target} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.16 }}>
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
