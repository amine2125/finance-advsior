import clsx from "clsx";
import { Bell, CalendarClock, Check, Compass, GraduationCap, Home, LayoutList, LogOut, Search, Sparkles, UserRound, Users } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { spring } from "./motion";
import { useApi } from "../hooks/useApi";
import { useApp, useProfilePath } from "../hooks/useApp";
import { APP_NAME } from "../lib/brand";
import { date } from "../lib/format";
import { levelLabel, vous } from "../lib/ulysse";
import { ADVISOR_NAME, AdvisorAvatar, AdvisorProvider, useAdvisor } from "./Advisor";
import AssetSearch, { openSearch } from "./AssetSearch";
import Tour from "./Tour";
import { Disclaimer } from "./ui";

export { APP_NAME };

/** The three places people act from. Learning stays one tap away (account menu, « Bien démarrer », each « Comment ça marche »). */
export const NAV = [
  { to: "/", label: "Accueil", icon: Home, end: true },
  { to: "/placements", label: "Placements", icon: LayoutList, end: false },
  { to: "/decisions", label: "Décisions", icon: Sparkles, end: false },
];
const TOUR_ID: Record<string, string> = { "/placements": "nav-placements", "/decisions": "nav-decisions", "/profil": "account" };

export function Logo({ light }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className={clsx("grid h-8 w-8 place-items-center rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]", light ? "bg-white" : "bg-ink")}>
        <svg viewBox="0 0 32 32" className="h-4 w-4"><path d="M7 21l6-7 4.5 3.5L25 9" stroke={light ? "#1d1d1b" : "white"} strokeWidth="3.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <span className={clsx("font-display text-[19px] font-semibold tracking-[-0.02em]", light ? "text-white" : "text-ink")}>{APP_NAME}</span>
    </Link>
  );
}

/** Avatar menu: who is signed in, the profile, and sign-out (Cognito accounts). */
function AccountMenu({ name }: { name: string }) {
  const { me, authConfig, signOut, setProfileId, config, asOf, inPast, setAsOf } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const accounts = authConfig?.mode === "cognito";
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium text-ink hover:bg-ink/[0.04]" data-testid="account-menu" data-tour="account" aria-expanded={open}>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-xs font-semibold text-ink shadow-card">{(name[0] || "?").toUpperCase()}</span>
        <span className="hidden max-w-[120px] truncate sm:inline">{name || "Profil"}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={spring}
            className="absolute right-0 top-12 z-40 w-64 origin-top-right overflow-hidden rounded-[20px] bg-surface p-1.5 shadow-lift hairline">
            {accounts && me?.email && <div className="truncate px-3 pb-2 pt-2 text-xs text-ink-muted">Connecté : <span className="text-ink-soft">{me.email}</span></div>}
            {(me?.profiles.length || 0) > 1 && (
              <div className="mb-1 border-b border-line pb-1.5" data-testid="profiles">
                <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs text-ink-muted"><Users className="h-3.5 w-3.5" /> Profils (fictifs)</div>
                {me!.profiles.map((p) => (
                  <button key={p.id} onClick={() => { setOpen(false); if (p.id !== me!.pid) { setProfileId(p.id); nav("/"); } }}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-ink/[0.04]">
                    <span className="truncate">{p.nom}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">{levelLabel(p.tolerance)}{p.id === me!.pid && <Check className="h-3.5 w-3.5 text-ink" strokeWidth={3} />}</span>
                  </button>
                ))}
              </div>
            )}
            <Link to="/profil" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-ink/[0.04]"><UserRound className="h-4 w-4" /> Mon profil</Link>
            <Link to="/apprendre" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-ink/[0.04]" data-testid="menu-learn"><GraduationCap className="h-4 w-4" /> Apprendre les bases</Link>
            <button onClick={() => { setOpen(false); window.dispatchEvent(new Event("ulysse:visite")); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-ink hover:bg-ink/[0.04]" data-testid="restart-tour">
              <Compass className="h-4 w-4" /> Revoir la visite guidée
            </button>
            <label className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink" title="Machine à remonter le temps : tout est recalculé à cette date, sans aucune donnée postérieure">
              <CalendarClock className="h-4 w-4 shrink-0" />
              <span className="flex-1">Date simulée</span>
              <input type="date" value={asOf} min="2016-06-01" max={config?.as_of_defaut}
                onChange={(e) => setAsOf(e.target.value || null)} className="w-[132px] rounded-lg bg-ink/[0.04] px-2 py-1 text-xs text-ink outline-none" data-testid="as-of" />
            </label>
            {inPast && <button onClick={() => { setAsOf(null); setOpen(false); }} className="w-full rounded-xl px-3 py-1.5 text-left text-xs font-medium text-primary-600 hover:bg-ink/[0.04]">Revenir au présent</button>}
            {accounts && (
              <button onClick={() => { setOpen(false); signOut(); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-ink hover:bg-ink/[0.04]" data-testid="sign-out">
                <LogOut className="h-4 w-4" /> Se déconnecter
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TopBar() {
  const { me } = useApp();
  const { setOpen } = useAdvisor();
  const loc = useLocation();
  const name: string = me?.profile?.display_name || "";
  const active = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.to;
  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-8 px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-1 rounded-full bg-ink/[0.035] p-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} data-tour={TOUR_ID[n.to]} className={clsx("relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors", active === n.to ? "text-ink" : "text-ink-muted hover:text-ink")}>
              {active === n.to && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-white shadow-card" transition={spring} />}
              <span className="relative">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={openSearch} data-tour="search" data-testid="open-search" aria-label="Rechercher un titre" title="Rechercher un titre (touche /)"
            className="flex h-9 items-center gap-2 rounded-full px-2.5 text-sm text-ink-muted hover:bg-ink/[0.04] hover:text-ink lg:w-56 lg:bg-ink/[0.035] lg:px-3.5">
            <Search className="h-4 w-4" /><span className="hidden lg:inline">Rechercher un titre</span><kbd className="ml-auto hidden rounded-md bg-white px-1.5 text-[11px] font-medium text-ink-muted shadow-card lg:inline">/</kbd>
          </button>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setOpen(true)} className="hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium text-ink hover:bg-ink/[0.04] sm:flex" data-testid="topbar-advisor">
            <AdvisorAvatar size={28} /> Demander à {ADVISOR_NAME}
          </motion.button>
          <Vigie />
          <AccountMenu name={name} />
        </div>
      </div>
    </header>
  );
}

/** The Vigie (the agent that watches between visits): what it noticed, only when it is relevant. */
function Vigie() {
  const path = useProfilePath();
  const { asOf } = useApp();
  const { data } = useApi<{ notifications: { id: string; titre: string; message: string; niveau: string; lien: string; as_of: string }[] }>(path("/notifications", { as_of: null }));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const items = (data?.notifications || []).filter((n) => n.as_of <= asOf);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Vigie : ${items.length} notification${items.length > 1 ? "s" : ""}`} data-testid="vigie"
        className="relative grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-ink/[0.04] hover:text-ink">
        <Bell className="h-[18px] w-[18px]" />
        {items.length > 0 && <span className="tabular-nums absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary-500 px-1 text-[10px] font-bold text-white">{items.length}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={spring}
            className="absolute right-0 top-12 z-40 w-[min(340px,calc(100vw-24px))] origin-top-right overflow-hidden rounded-[20px] bg-surface p-1.5 shadow-lift hairline">
            <div className="px-3 pb-1 pt-2"><div className="font-display text-lg font-semibold tracking-tight text-ink">Vigie</div>
              <p className="text-xs text-ink-muted">Ce que l'agent de veille a remarqué entre vos visites.</p></div>
            {items.length === 0 ? <p className="px-3 py-3 text-sm text-ink-muted">Rien de nouveau. La Vigie ne parle que lorsqu'elle a quelque chose de pertinent.</p> : (
              <ul className="max-h-[60vh] overflow-y-auto">
                {items.slice(0, 8).map((n) => (
                  <li key={n.id}>
                    <Link to={vigieLink(n.lien)} onClick={() => setOpen(false)} className="flex gap-2.5 rounded-xl px-3 py-2.5 hover:bg-ink/[0.04]">
                      <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.niveau === "pause" ? "bg-accent-600" : n.niveau === "attention" ? "bg-primary-500" : "bg-ink/25")} />
                      <span className="min-w-0"><span className="block text-sm leading-snug text-ink">{vous(n.titre)}</span><span className="text-xs text-ink-muted">{date(n.as_of)}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The Vigie's links point at engine pages; each one opens the matching screen of this interface. */
export function vigieLink(lien: string): string {
  const t = lien.match(/^\/titre\/([^?]+)/);
  if (t) return `/placement/${t[1]}`;
  if (lien.startsWith("/portefeuille") || lien.startsWith("/placements")) return "/placements";
  if (lien.startsWith("/contrat")) return "/profil";
  if (lien.startsWith("/dossier/")) return `/mandats/${lien.slice(9)}`;
  return "/";
}

/** Time machine: a thin banner while the app shows a past date. */
function PastBanner() {
  const { inPast, asOf, setAsOf } = useApp();
  if (!inPast) return null;
  return (
    <div className="border-b border-line bg-primary-50 text-xs text-ink" role="status">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 sm:px-8">
        <CalendarClock className="h-3.5 w-3.5 text-primary-600" />
        <span>Date simulée : <b className="font-semibold">{date(asOf)}</b>. Tout est recalculé à cette date, sans aucune donnée postérieure.</span>
        <button onClick={() => setAsOf(null)} className="font-semibold text-primary-600 hover:underline">Revenir au présent</button>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdvisorProvider>
      <div className="min-h-screen pb-24 md:pb-0">
        <div className="ambient" aria-hidden />
        <TopBar />
        <PastBanner />
        <main id="contenu" tabIndex={-1} className="outline-none">{children}</main>
        <Tour />
        <AssetSearch />
        <footer className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-3 px-4 pb-10 pt-10 sm:px-6"><Disclaimer className="max-w-2xl" />
          <div className="flex gap-4"><Link to="/apprendre" className="text-xs font-semibold text-ink-muted hover:text-ink">Apprendre les bases</Link><Link to="/a-propos" className="text-xs font-semibold text-ink-muted hover:text-ink">À propos des chiffres</Link></div></footer>
        <nav className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden">
          {[...NAV, { to: "/profil", label: "Profil", icon: UserRound, end: false }].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} data-tour={TOUR_ID[n.to]}
              className={({ isActive }) => clsx("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold", isActive ? "text-ink" : "text-ink-muted")}>
              <n.icon className="h-5 w-5" /> {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </AdvisorProvider>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("mx-auto max-w-6xl space-y-5 px-4 pt-6 sm:px-6", className)}>{children}</div>;
}
export function Body({ children }: { children: ReactNode; overlap?: boolean }) {
  return <div className="space-y-5">{children}</div>;
}
