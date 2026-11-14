import clsx from "clsx";
import { Activity, Bell, BookOpen, Bot, Briefcase, FileText, FlaskConical, Gauge, LayoutDashboard, Menu, Radar, Scale, Settings, ShieldCheck, Sparkles, X } from "lucide-react";
import { ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import { useApp } from "../hooks/AppContext";
import { TIER_FR } from "../lib/format";

const NAV = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/portfolio", label: "Mon portefeuille", icon: Briefcase },
  { to: "/xray", label: "Radiographie", icon: Radar },
  { to: "/copilot", label: "Copilote IA", icon: Bot },
  { to: "/debate", label: "Chambre de débat", icon: Scale },
  { to: "/scenarios", label: "Laboratoire de scénarios", icon: FlaskConical },
  { to: "/hype", label: "Hype Intelligence", icon: Sparkles },
  { to: "/guardian", label: "Alertes Guardian", icon: Bell },
  { to: "/reports", label: "Rapports", icon: FileText },
  { to: "/sources", label: "Sources & méthodologie", icon: BookOpen },
  { to: "/settings", label: "Paramètres / Profil", icon: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { personas, portfolios, personaId, setPersonaId, portfolioId, setPortfolioId, system } = useApp();
  const [open, setOpen] = useState(false);
  const persona = personas.find((p) => p.persona_id === personaId);
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_left,rgba(20,184,166,0.08),transparent_45%),radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.07),transparent_40%)]">
      <aside className={clsx("fixed inset-y-0 left-0 z-40 w-64 border-r border-ink-700/70 bg-ink-950/95 backdrop-blur transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-16 items-center gap-2.5 px-5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-aegis-400 to-teal-700 shadow-glow"><ShieldCheck className="h-5 w-5 text-ink-950" /></div>
          <div>
            <div className="text-base font-bold tracking-tight text-white">{system?.app || "AEGIS"}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-aegis-400/80">Portfolio Intelligence</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Fermer"><X className="h-5 w-5" /></button>
        </div>
        <nav className="mt-2 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} onClick={() => setOpen(false)}
              className={({ isActive }) => clsx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition", isActive ? "bg-aegis-500/10 text-aegis-300 ring-1 ring-aegis-500/25" : "text-slate-400 hover:bg-ink-800 hover:text-slate-100")}>
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 w-full space-y-2 border-t border-ink-700/70 p-4 text-[11px] text-slate-500">
          <div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-aegis-400" /> {system?.mode || "Rejeu historique"}</div>
          <div className="flex items-center gap-2"><Gauge className="h-3.5 w-3.5 text-violet-400" /> Bedrock · {system?.bedrock_region || "—"} · {system?.storage_backend || "—"}</div>
          <div>Simulation éducative · aucune transaction réelle</div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-700/60 bg-ink-950/80 px-4 backdrop-blur lg:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Menu"><Menu className="h-5 w-5" /></button>
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Profil
              <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="rounded-lg border border-ink-600 bg-ink-850 px-2 py-1.5 text-sm text-white focus:border-aegis-500 focus:outline-none" data-testid="persona-select">
                {personas.map((p) => <option key={p.persona_id} value={p.persona_id}>{p.display_name} – {p.risk_profile_label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Portefeuille
              <select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className="max-w-[18rem] rounded-lg border border-ink-600 bg-ink-850 px-2 py-1.5 text-sm text-white focus:border-aegis-500 focus:outline-none" data-testid="portfolio-select">
                {portfolios.map((p) => <option key={p.portfolio_id} value={p.portfolio_id}>{p.name}</option>)}
              </select>
            </label>
            {persona && <span className="hidden rounded-lg bg-ink-800 px-2 py-1 text-[11px] text-slate-300 md:inline">Niveau permis : <b className="text-white">{TIER_FR[persona.allowed_tier] || persona.allowed_tier}</b> · horizon {persona.horizon_years_min}{persona.horizon_years_max ? `–${persona.horizon_years_max}` : "+"} ans</span>}
          </div>
          <span className="hidden rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-200 ring-1 ring-amber-500/30 sm:inline">SIMULATION · données historiques</span>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
