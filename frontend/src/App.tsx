import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BookOpen, ChevronDown, FileSignature, Home, MoreHorizontal, PieChart, Sailboat, Search, Wallet } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import { seDeconnecter } from "./auth";
import { AssistantProvider, AvatarAssistant, useAssistant } from "./components/Assistant";
import { Chargement } from "./components/base";
import { CommentCaMarche, Visite } from "./components/Guide";
import { RechercheTitre, ouvrirRecherche } from "./components/Recherche";
import { PageIn, Segmented, spring } from "./components/motion";
import { TiroirPreuve } from "./components/preuve";
import { Disclaimer, inputCls } from "./components/ui";
import * as f from "./format";
import { TOLERANCE } from "./libelles";
import { Accueil } from "./pages/Accueil";
import { AppProvider, useApp, useData } from "./state";
const Marche = lazy(() => import("./pages/Marche").then((m) => ({ default: m.Marche })));
const Tendances = lazy(() => import("./pages/Tendances").then((m) => ({ default: m.Tendances })));
const Fiche = lazy(() => import("./pages/Fiche").then((m) => ({ default: m.Fiche })));
const Portefeuille = lazy(() => import("./pages/Portefeuille").then((m) => ({ default: m.Portefeuille })));
const Comparer = lazy(() => import("./pages/Comparer").then((m) => ({ default: m.Comparer })));
const Surveillance = lazy(() => import("./pages/Surveillance").then((m) => ({ default: m.Surveillance })));
const ContratPage = lazy(() => import("./pages/Contrat").then((m) => ({ default: m.ContratPage })));
const NouveauProfil = lazy(() => import("./pages/NouveauProfil").then((m) => ({ default: m.NouveauProfil })));
const Journal = lazy(() => import("./pages/Journal").then((m) => ({ default: m.Journal })));
const DossierPage = lazy(() => import("./pages/Dossier").then((m) => ({ default: m.DossierPage })));
const Fiabilite = lazy(() => import("./pages/Fiabilite").then((m) => ({ default: m.Fiabilite })));
const Demo = lazy(() => import("./pages/Demo").then((m) => ({ default: m.Demo })));
const Apprendre = lazy(() => import("./pages/Apprendre").then((m) => ({ default: m.Apprendre })));
const Lecon = lazy(() => import("./pages/Apprendre").then((m) => ({ default: m.Lecon })));
const Connexion = lazy(() => import("./pages/Connexion").then((m) => ({ default: m.Connexion })));
const Placements = lazy(() => import("./pages/Placements").then((m) => ({ default: m.Placements })));

/** Product name is configuration (VITE_APP_NAME). */
export const APP_NAME: string = (import.meta as any).env?.VITE_APP_NAME || "ULYSSE";

export function App() {
  return <AppProvider><AssistantProvider><Porte /></AssistantProvider></AppProvider>;
}

/** With accounts (Cognito): sign in first, then create a profile if the account has none. Without: the app as before. */
function Porte() {
  const { config, connecte, compte } = useApp();
  const loc = useLocation();
  if (!config) return <div className="mx-auto max-w-[1140px] px-4 py-10"><Chargement lignes={4} /></div>;
  if (config.auth?.mode === "cognito") {
    if (!connecte) return <Suspense fallback={<Chargement lignes={4} />}><Connexion /></Suspense>;
    if (!compte) return <div className="mx-auto max-w-[1140px] px-4 py-10"><Chargement lignes={4} /></div>;
    if (!compte.profils?.length && loc.pathname !== "/nouveau-profil") return <Navigate to="/nouveau-profil" replace />;
  }
  return <Coquille />;
}

const PRINCIPAL = [
  { to: "/", k: "nav.accueil", icon: Home }, { to: "/marche", k: "nav.marche", icon: Search }, { to: "/placements", k: "nav.placements", icon: Wallet },
  { to: "/portefeuille", k: "nav.portefeuille", icon: PieChart },
  { to: "/contrat", k: "nav.contrat", icon: FileSignature }, { to: "/journal", k: "nav.journal", icon: BookOpen },
] as const;
const PLUS = [["/apprendre", "nav.apprendre"], ["/tendances", "nav.tendances"], ["/surveillance", "nav.surveillance"], ["/comparer", "nav.comparer"], ["/fiabilite", "nav.fiabilite"], ["/demo", "nav.demo"]] as const;

/** Closes a popover on outside click or Escape. */
function useFermeture(ouvert: boolean, fermer: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") fermer(); };
    const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fermer(); };
    window.addEventListener("keydown", k); window.addEventListener("mousedown", c);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("mousedown", c); };
  }, [ouvert, fermer]);
  return ref;
}

function Popover({ ouvert, children, className }: { ouvert: boolean; children: ReactNode; className?: string }) {
  return <AnimatePresence>{ouvert && (
    <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={spring}
      className={clsx("absolute z-40 rounded-2xl bg-white p-2 shadow-lift", className)}>{children}</motion.div>)}</AnimatePresence>;
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label={`${APP_NAME}, accueil`}>
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"><Sailboat className="h-4 w-4 text-white" aria-hidden /></span>
      <span className="font-display text-[19px] font-semibold tracking-[0.02em] text-ink">{APP_NAME}</span>
    </Link>
  );
}

function Coquille() {
  const { t, config, profil, asOf, enPassé, setAsOf } = useApp();
  const loc = useLocation();
  const suffixe = `?p=${profil}${enPassé ? `&d=${asOf}` : ""}`;
  useEffect(() => { document.getElementById("contenu")?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <div className="ambient" aria-hidden />
      <header className="glass sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1140px] items-center gap-6 px-4 sm:px-8">
          <Logo />
          <NavPrincipale suffixe={suffixe} />
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={ouvrirRecherche} aria-label="Rechercher un titre" title="Rechercher un titre (touche /)"
              className="flex h-9 items-center gap-2 rounded-full px-2.5 text-sm text-ink-muted hover:bg-ink/[0.04] hover:text-ink xl:w-52 xl:bg-ink/[0.035] xl:px-3.5">
              <Search className="h-4 w-4" aria-hidden /><span className="hidden xl:inline">Rechercher un titre</span><kbd className="ml-auto hidden rounded-md bg-white px-1.5 text-[11px] font-medium text-ink-muted shadow-card xl:inline">/</kbd>
            </button>
            <BoutonAssistant />
            <Cloche suffixe={suffixe} />
            <MenuProfil />
          </div>
        </div>
        <div className={clsx("border-t border-line text-xs", enPassé ? "bg-warn-50 text-warn-700" : "text-ink-muted")} role="status">
          <div className="mx-auto flex max-w-[1140px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 sm:px-8">
            <strong className={enPassé ? "" : "text-ink"}>{t("app.mention")}</strong>
            {config && <span>{t("app.donnees")} {f.date(enPassé ? asOf : config.donnees_jusqu_au)}.</span>}
            {enPassé && <><span>{t("app.temps", { date: f.date(asOf) })}</span>
              <button className="font-semibold underline underline-offset-2" onClick={() => setAsOf(null)}>{t("app.retour_present")}</button></>}
          </div>
        </div>
      </header>
      <main id="contenu" tabIndex={-1} className="mx-auto max-w-[1140px] px-4 pb-16 pt-8 sm:px-8 sm:pt-10">
        <Suspense fallback={<Chargement lignes={4} />}>
          <PageIn key={loc.pathname}>
            <Routes>
              <Route path="/" element={<Accueil />} />
              <Route path="/marche" element={<Marche />} />
              <Route path="/tendances" element={<Tendances />} />
              <Route path="/titre/:ticker" element={<Fiche />} />
              <Route path="/portefeuille" element={<Portefeuille />} />
              <Route path="/placements" element={<Placements />} />
              <Route path="/apprendre" element={<Apprendre />} />
              <Route path="/apprendre/:id" element={<Lecon />} />
              <Route path="/comparer" element={<Comparer />} />
              <Route path="/surveillance" element={<Surveillance />} />
              <Route path="/contrat" element={<ContratPage />} />
              <Route path="/nouveau-profil" element={<NouveauProfil />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/dossier/:id" element={<DossierPage />} />
              <Route path="/fiabilite" element={<Fiabilite />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="*" element={<p>Page introuvable. <Link className="text-primary-600 underline" to={`/${suffixe}`}>Retour à l'accueil</Link></p>} />
            </Routes>
          </PageIn>
        </Suspense>
      </main>
      <footer className="mx-auto flex max-w-[1140px] flex-wrap items-start justify-between gap-3 px-4 pb-10 sm:px-8">
        <Disclaimer className="max-w-2xl" />
        <div className="flex gap-4"><Link to={`/apprendre${suffixe}`} className="text-xs font-semibold text-ink-muted hover:text-ink">Apprendre les bases</Link>
          <Link to={`/fiabilite${suffixe}`} className="text-xs font-semibold text-ink-muted hover:text-ink">Fiabilité des chiffres</Link></div>
      </footer>
      <NavMobile suffixe={suffixe} />
      <TiroirPreuve />
      <CommentCaMarche />
      <RechercheTitre />
      <Visite />
    </div>
  );
}

function actif(pathname: string, to: string) { return to === "/" ? pathname === "/" : pathname.startsWith(to) || (to === "/marche" && pathname.startsWith("/titre")); }

function NavPrincipale({ suffixe }: { suffixe: string }) {
  const { t } = useApp();
  const loc = useLocation();
  const [plus, setPlus] = useState(false);
  const ref = useFermeture(plus, () => setPlus(false));
  const dansPlus = PLUS.some(([to]) => loc.pathname.startsWith(to));
  useEffect(() => setPlus(false), [loc.pathname]);
  return (
    <nav aria-label="Navigation principale" className="hidden items-center gap-1 rounded-full bg-ink/[0.035] p-1 lg:flex">
      {PRINCIPAL.map((n) => {
        const a = actif(loc.pathname, n.to);
        return (
          <Link key={n.to} to={`${n.to}${suffixe}`} aria-current={a ? "page" : undefined}
            className={clsx("relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors", a ? "text-ink" : "text-ink-muted hover:text-ink")}>
            {a && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-white shadow-card" transition={spring} />}
            <span className="relative">{t(n.k)}</span>
          </Link>
        );
      })}
      <div ref={ref} className="relative">
        <button onClick={() => setPlus((v) => !v)} aria-expanded={plus} aria-haspopup="true"
          className={clsx("relative flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors", dansPlus ? "text-ink" : "text-ink-muted hover:text-ink")}>
          {dansPlus && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-white shadow-card" transition={spring} />}
          <span className="relative">Plus</span><ChevronDown className="relative h-3.5 w-3.5" />
        </button>
        <Popover ouvert={plus} className="left-0 top-11 w-56">
          {PLUS.map(([to, k]) => <Link key={to} to={`${to}${suffixe}`} className={clsx("block rounded-xl px-3 py-2 text-sm hover:bg-canvas", loc.pathname.startsWith(to) ? "font-semibold text-ink" : "text-ink-soft")}>{t(k)}</Link>)}
        </Popover>
      </div>
    </nav>
  );
}

function NavMobile({ suffixe }: { suffixe: string }) {
  const { t } = useApp();
  const loc = useLocation();
  const [plus, setPlus] = useState(false);
  const ref = useFermeture(plus, () => setPlus(false));
  useEffect(() => setPlus(false), [loc.pathname]);
  const items = PRINCIPAL.slice(0, 4);
  return (
    <div ref={ref} className="lg:hidden">
      <AnimatePresence>{plus && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={spring}
          className="fixed inset-x-3 bottom-[76px] z-40 rounded-2xl bg-white p-2 shadow-lift">
          {[["/contrat", "nav.contrat"] as const, ["/journal", "nav.journal"] as const, ...PLUS].map(([to, k]) => <Link key={to} to={`${to}${suffixe}`} className="block rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-canvas">{t(k)}</Link>)}
        </motion.div>)}</AnimatePresence>
      <nav aria-label="Navigation" className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line pb-[env(safe-area-inset-bottom)]">
        {items.map((n) => (
          <NavLink key={n.to} to={`${n.to}${suffixe}`} end={n.to === "/"} className={() => clsx("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold", actif(loc.pathname, n.to) ? "text-ink" : "text-ink-muted")}>
            <n.icon className="h-5 w-5" aria-hidden /> {t(n.k)}
          </NavLink>
        ))}
        <button onClick={() => setPlus((v) => !v)} aria-expanded={plus} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold text-ink-muted">
          <MoreHorizontal className="h-5 w-5" aria-hidden /> Plus
        </button>
      </nav>
    </div>
  );
}

function BoutonAssistant() {
  const { setOuvert } = useAssistant();
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={() => setOuvert(true)} className="hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium text-ink hover:bg-ink/[0.04] sm:flex">
      <AvatarAssistant size={28} /> Poser une question
    </motion.button>
  );
}

function Cloche({ suffixe }: { suffixe: string }) {
  const { t, profil, asOf } = useApp();
  const loc = useLocation();
  const { data: notes } = useData<{ notifications: { id: string; titre: string; niveau: string; lien: string; as_of: string }[] }>(`/profils/${profil}/notifications`);
  const [ouvert, setOuvert] = useState(false);
  const ref = useFermeture(ouvert, () => setOuvert(false));
  useEffect(() => setOuvert(false), [loc.pathname]);
  const visibles = (notes?.notifications ?? []).filter((n) => n.as_of <= asOf);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} aria-label={`${t("app.notifications")} : ${visibles.length}`}
        className="relative grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-ink/[0.04] hover:text-ink">
        <Bell className="h-[18px] w-[18px]" />
        {visibles.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary-500 px-1 text-[10px] font-bold text-white">{visibles.length}</span>}
      </button>
      <Popover ouvert={ouvert} className="right-0 top-11 w-[min(360px,calc(100vw-24px))] p-4">
        <h2 className="font-display text-lg font-medium">Vigie</h2>
        {visibles.length === 0 ? <p className="mt-1 text-sm text-ink-muted">Rien de nouveau. La Vigie ne parle que lorsqu'elle a quelque chose de pertinent.</p> : (
          <ul className="mt-2 space-y-1">{visibles.slice(0, 8).map((n) => (
            <li key={n.id}><Link to={`${n.lien}${suffixe}`} className="flex gap-2 rounded-xl p-2 text-sm hover:bg-canvas">
              <span aria-hidden className={n.niveau === "pause" ? "text-loss-600" : n.niveau === "attention" ? "text-warn-500" : "text-ink-muted"}>{n.niveau === "attention" ? "⚠" : n.niveau === "pause" ? "⛔" : "ℹ"}</span>
              <span className="min-w-0"><span className="block text-ink">{n.titre}</span><span className="text-xs text-ink-muted">{f.date(n.as_of)}</span></span></Link></li>))}</ul>)}
      </Popover>
    </div>
  );
}

function MenuProfil() {
  const { t, config, profil, setProfil, asOf, setAsOf, enPassé, langue, setLangue, compte, rechargerCompte } = useApp();
  const effacer = async () => {
    if (!window.confirm("Effacer tous tes profils, placements et ton journal ? C'est définitif.")) return;
    await api("/compte/effacer", { body: {} });
    window.location.assign("/");
    await rechargerCompte();
  };
  const loc = useLocation();
  const { data: profils } = useData<{ id: string; nom: string; tolerance: string }[]>("/profils");
  const [ouvert, setOuvert] = useState(false);
  const ref = useFermeture(ouvert, () => setOuvert(false));
  useEffect(() => setOuvert(false), [loc.pathname]);
  const courant = profils?.find((p) => p.id === profil);
  const nom = courant?.nom ?? "Profil";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} aria-haspopup="true" className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-sm font-medium text-ink hover:bg-ink/[0.04]">
        <span className={clsx("grid h-8 w-8 place-items-center rounded-full text-xs font-semibold shadow-card", enPassé ? "bg-warn-100 text-warn-700" : "bg-white text-ink")}>{nom[0]?.toUpperCase()}</span>
        <span className="hidden max-w-[120px] truncate sm:inline">{nom}</span><ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
      </button>
      <Popover ouvert={ouvert} className="right-0 top-11 w-[min(320px,calc(100vw-24px))] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{t("app.profil")} (fictif)</p>
        <div className="mt-2 space-y-1">
          {(profils ?? []).map((p) => (
            <button key={p.id} onClick={() => setProfil(p.id)} aria-pressed={p.id === profil}
              className={clsx("flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm", p.id === profil ? "bg-ink text-white" : "hover:bg-canvas")}>
              <span>{p.nom}</span><span className={clsx("text-xs", p.id === profil ? "text-white/70" : "text-ink-muted")}>{TOLERANCE[p.tolerance] ?? p.tolerance}</span>
            </button>))}
          <Link to={`/nouveau-profil?p=${profil}`} className="block rounded-xl px-3 py-2 text-sm font-medium text-primary-600 hover:bg-canvas">+ Créer un profil</Link>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <label htmlFor="date-simulee" className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{t("app.date")} · machine à remonter le temps</label>
          <input id="date-simulee" type="date" className={clsx(inputCls, "mt-2")} value={asOf} min="2016-06-01" max={config?.as_of_defaut}
            onChange={(e) => setAsOf(e.target.value && e.target.value !== config?.as_of_defaut ? e.target.value : null)} />
          {enPassé && <button onClick={() => setAsOf(null)} className="mt-2 text-sm font-medium text-primary-600 hover:underline">{t("app.retour_present")}</button>}
        </div>
        {compte?.mode === "cognito" && <div className="mt-4 border-t border-line pt-4 text-sm">
          <p className="truncate text-ink-muted">{compte.email}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <button onClick={() => seDeconnecter()} className="font-medium text-primary-600 hover:underline">Se déconnecter</button>
            <button onClick={effacer} className="font-medium text-loss-700 hover:underline">Effacer mes données</button>
          </div>
        </div>}
        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{t("app.langue")}</span>
          <Segmented size="sm" label={t("app.langue")} value={langue} onChange={(l) => setLangue(l)} options={[["fr", "Français"], ["en", "English"]]} />
        </div>
      </Popover>
    </div>
  );
}
