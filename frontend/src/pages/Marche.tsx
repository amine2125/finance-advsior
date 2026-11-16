import { ArrowUpRight, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Chargement, Erreur, PuceNiveau, Vide } from "../components/base";
import { Stagger, StaggerItem } from "../components/motion";
import { PageTitle } from "../components/ui";
import * as f from "../format";
import { SECTEURS } from "../libelles";
import { useApp, useData } from "../state";
import type { Actif, Niveau } from "../types";

interface Resultat extends Actif { signal: { niveau: Niveau; clauses: { explication: string }[] } | null; deja_detenu_pct: number | null }

const CLASSE: Record<string, string> = { equity: "Action", etf_equity: "FNB d'actions", etf_bond: "FNB d'obligations", etf_commodity: "FNB d'or", crypto: "Cryptoactif" };

export function Marche() {
  const { profil, asOf, enPassé } = useApp();
  const [q, setQ] = useState("");
  const { data, erreur, charge, recharger } = useData<{ resultats: Resultat[] }>("/recherche", { q, profil, as_of: asOf });
  const suffixe = `?p=${profil}${enPassé ? `&d=${asOf}` : ""}`;
  return (
    <div>
      <PageTitle title="Marché" subtitle="Univers du jeu de départ : 31 actifs. Chaque titre indique, selon tes règles, ce qu'une position de 5 % donnerait." />
      <div className="relative max-w-xl">
        <label htmlFor="recherche" className="visuellement-cache">Chercher un titre (symbole, nom ou secteur)</label>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input id="recherche" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="NVDA, banque, obligations…" autoComplete="off"
          className="h-12 w-full rounded-full border border-line bg-white pl-11 pr-4 text-sm shadow-card focus:border-ink focus:outline-none" />
      </div>
      <div className="mt-6">
        {charge && !data ? <Chargement /> : erreur ? <Erreur message={erreur} recharger={recharger} /> : (data?.resultats.length ?? 0) === 0 ?
          <Vide>Aucun titre ne correspond. Ce titre n'est peut-être pas couvert par l'univers du jeu de départ (31 actifs).</Vide> : (
          <Stagger className="divide-y divide-line">
            {data!.resultats.map((r) => (
              <StaggerItem key={r.ticker}>
                <Link to={`/titre/${encodeURIComponent(r.ticker)}${suffixe}`} className="group grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 py-4 transition-opacity hover:opacity-80 sm:grid-cols-[44px_minmax(0,1.3fr)_minmax(0,1fr)_auto]">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-[11px] font-bold tracking-tight text-ink shadow-card">{r.ticker.split(/[.-]/)[0].slice(0, 4)}</span>
                  <span className="min-w-0"><span className="block font-medium text-ink">{r.name} <span className="text-ink-muted">· {r.ticker}</span></span>
                    <span className="block truncate text-xs text-ink-muted">{CLASSE[r.asset_class] ?? r.asset_class} · {SECTEURS[r.sector] ?? r.sector} · déjà détenu : {r.deja_detenu_pct != null ? f.pct(r.deja_detenu_pct) : "?"} (FNB compris)</span></span>
                  <span className="col-span-3 min-w-0 sm:col-span-1">{r.signal ? <><PuceNiveau niveau={r.signal.niveau} /><span className="mt-1 block truncate text-xs text-ink-muted">{r.signal.clauses[0]?.explication ?? "Toutes tes règles évaluées sont respectées."}</span></>
                    : <span className="text-xs text-ink-muted">Non évalué à cette date</span>}</span>
                  <ArrowUpRight className="hidden h-4 w-4 text-ink-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 sm:block" aria-hidden />
                </Link>
              </StaggerItem>))}
          </Stagger>)}
      </div>
    </div>
  );
}
