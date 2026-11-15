import clsx from "clsx";
import { Home, LayoutList, LogOut, Sparkles, UserRound } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, NavLink, useLocation } from "react-router-dom";
import { spring } from "./motion";
import { useApp } from "../hooks/useApp";
import { AdvisorAvatar, AdvisorProvider, useAdvisor } from "./Advisor";
import { Disclaimer } from "./ui";

/** Product name is configuration (VITE_APP_NAME), never hard-coded to a bank. */
export const APP_NAME: string = (import.meta as any).env?.VITE_APP_NAME || "AEGIS";

export const NAV = [
  { to: "/", label: "Accueil", icon: Home, end: true },
  { to: "/placements", label: "Placements", icon: LayoutList, end: false },
  { to: "/decisions", label: "Décisions", icon: Sparkles, end: false },
];

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
  const { me, authConfig, signOut } = useApp();
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
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium text-ink hover:bg-ink/[0.04]" data-testid="account-menu" aria-expanded={open}>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-xs font-semibold text-ink shadow-card">{(name[0] || "?").toUpperCase()}</span>
        <span className="hidden max-w-[120px] truncate sm:inline">{name || "Profil"}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={spring}
            className="absolute right-0 top-12 z-40 w-64 origin-top-right overflow-hidden rounded-[20px] bg-surface p-1.5 shadow-lift hairline">
            {accounts && me?.email && <div className="truncate px-3 pb-2 pt-2 text-xs text-ink-muted">Connecté : <span className="text-ink-soft">{me.email}</span></div>}
            <Link to="/profil" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-ink/[0.04]"><UserRound className="h-4 w-4" /> Mon profil</Link>
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
            <Link key={n.to} to={n.to} className={clsx("relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors", active === n.to ? "text-ink" : "text-ink-muted hover:text-ink")}>
              {active === n.to && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-white shadow-card" transition={spring} />}
              <span className="relative">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setOpen(true)} className="hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium text-ink hover:bg-ink/[0.04] sm:flex" data-testid="topbar-advisor">
            <AdvisorAvatar size={28} /> Demander à Léa
          </motion.button>
          <AccountMenu name={name} />
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdvisorProvider>
      <div className="min-h-screen pb-24 md:pb-0">
        <div className="ambient" aria-hidden />
        <TopBar />
        <main>{children}</main>
        <footer className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-3 px-4 pb-10 pt-10 sm:px-6"><Disclaimer className="max-w-2xl" /><Link to="/a-propos" className="text-xs font-semibold text-ink-muted hover:text-ink">À propos des chiffres</Link></footer>
        <nav className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden">
          {[...NAV, { to: "/profil", label: "Profil", icon: UserRound, end: false }].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
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
