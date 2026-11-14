import clsx from "clsx";
import { Home, MessageCircle, TrendingUp, Wallet } from "lucide-react";
import { ReactNode } from "react";
import { NavLink, Link } from "react-router-dom";
import { useApp } from "../hooks/useApp";

/** Product name is configuration (VITE_APP_NAME), never hard-coded to a bank. */
export const APP_NAME: string = (import.meta as any).env?.VITE_APP_NAME || "AEGIS";

export const NAV = [
  { to: "/", label: "Accueil", icon: Home, end: true },
  { to: "/investir", label: "Investir", icon: TrendingUp },
  { to: "/portefeuille", label: "Mon portefeuille", icon: Wallet },
  { to: "/assistant", label: "Assistant", icon: MessageCircle },
];

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600">
        <svg viewBox="0 0 32 32" className="h-5 w-5"><path d="M7 21l6-7 4.5 3.5L25 9" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <span className="text-[17px] font-semibold tracking-tight text-slate-900">{APP_NAME}</span>
    </Link>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { me } = useApp();
  const name: string = me?.profile?.display_name || "";
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => clsx("rounded-lg px-3 py-2 text-sm font-medium transition", isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/profil" className="ml-auto flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 text-sm hover:bg-slate-50 md:ml-0" title="Mon profil">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">{(name[0] || "?").toUpperCase()}</span>
            <span className="max-w-[120px] truncate font-medium text-slate-700">{name || "Profil"}</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => clsx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive ? "text-brand-600" : "text-slate-500")}>
            <n.icon className="h-5 w-5" /> {n.label.replace("Mon portefeuille", "Portefeuille")}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
