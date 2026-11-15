import clsx from "clsx";
import { Home, LayoutList, Sparkles, UserRound } from "lucide-react";
import { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
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
      <div className={clsx("grid h-8 w-8 place-items-center rounded-full", light ? "bg-white" : "bg-ink")}>
        <svg viewBox="0 0 32 32" className="h-4 w-4"><path d="M7 21l6-7 4.5 3.5L25 9" stroke={light ? "#1d1d1b" : "white"} strokeWidth="3.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <span className={clsx("font-display text-xl font-medium tracking-wide", light ? "text-white" : "text-ink")}>{APP_NAME}</span>
    </Link>
  );
}

function TopBar() {
  const { me } = useApp();
  const { setOpen } = useAdvisor();
  const name: string = me?.profile?.display_name || "";
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1100px] items-stretch gap-10 px-5 sm:px-8">
        <div className="flex items-center"><Logo /></div>
        <nav className="hidden items-stretch gap-6 md:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => clsx("flex items-center border-b-2 text-[15px] font-semibold transition", isActive ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setOpen(true)} className="hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold text-ink hover:bg-canvas sm:flex" data-testid="topbar-advisor">
            <AdvisorAvatar size={30} /> Demander à Léa
          </button>
          <Link to="/profil" className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold text-ink hover:bg-canvas" title="Mon profil">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-canvas text-xs font-bold text-ink">{(name[0] || "?").toUpperCase()}</span>
            <span className="hidden max-w-[120px] truncate sm:inline">{name || "Profil"}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdvisorProvider>
      <div className="min-h-screen pb-24 md:pb-0">
        <TopBar />
        <main>{children}</main>
        <footer className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-3 px-4 pb-10 pt-10 sm:px-6"><Disclaimer className="max-w-2xl" /><Link to="/a-propos" className="text-xs font-semibold text-ink-muted hover:text-ink">À propos des chiffres</Link></footer>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
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

/** White account strip under the nav (Wealthsimple style): label, big numbers, one action. */
export function AccountStrip({ children }: { children: ReactNode }) {
  return <div className="border-b border-line bg-white"><div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</div></div>;
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("mx-auto max-w-6xl space-y-5 px-4 pt-6 sm:px-6", className)}>{children}</div>;
}

/** Dark headline card (used on the decision screens). */
export function Hero({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("overflow-hidden rounded-3xl bg-ink px-6 py-7 text-white sm:px-9 sm:py-8", className)}>{children}</section>;
}
export function Body({ children }: { children: ReactNode; overlap?: boolean }) {
  return <div className="space-y-5">{children}</div>;
}
