import clsx from "clsx";
import { Check, ChevronDown, Pencil, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SplitBar } from "../components/charts";
import { PageIn, Segmented, Stagger, Tabs } from "../components/motion";
import HoldingsEditor from "../components/HoldingsEditor";
import HowItWorks from "../components/HowItWorks";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { checkLabel, checkText, useAnalysis } from "../hooks/useAnalysis";
import { useApi } from "../hooks/useApi";
import { useApp } from "../hooks/useApp";
import { byCategory, CATEGORY, ORDER } from "../lib/assets";
import { cad, pct } from "../lib/format";
import { HoldingRow, launchMandate, REVIEW, signed, signedPct } from "./Home";

type Filter = "all" | "stocks" | "etf" | "crypto";
const FILTERS: [Filter, string][] = [["all", "Tout"], ["stocks", "Actions"], ["etf", "FNB"], ["crypto", "Crypto"]];
const SORTS: Record<string, [string, (a: any, b: any) => number]> = {
  value: ["Valeur", (a, b) => b.value_cad - a.value_cad],
  alpha: ["Alphabétique", (a, b) => a.asset_id.localeCompare(b.asset_id)],
  day: ["Variation du jour", (a, b) => (b.day_change_pct ?? 0) - (a.day_change_pct ?? 0)],
  gain: ["Gain depuis l'achat", (a, b) => (b.gain_pct ?? -9) - (a.gain_pct ?? -9)],
};

export default function Holdings() {
  const { me, portfolio, setPortfolioId, reload } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"list" | "mix">("list");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState("value");
  const [editing, setEditing] = useState(params.get("ajouter") === "1");
  const h = useApi<any>("/holdings");
  const rows = useMemo(() => (h.data?.holdings || [])
    .filter((x: any) => filter === "all" || (filter === "crypto" ? x.asset_class === "crypto" : filter === "etf" ? x.asset_class === "etf" : x.asset_class === "equity"))
    .sort(SORTS[sort][1]), [h.data, filter, sort]);
  const has = (h.data?.holdings || []).length > 0;

  return (
    <PageIn className="mx-auto max-w-3xl px-5 pb-16 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3"><HowItWorks topic="placements" /></div>
          <h1 className="font-display text-[40px] font-semibold leading-none tracking-tightest text-ink">Placements</h1>
          {has && <p className="tabular-nums mt-3 text-sm text-ink-muted">{cad(h.data.total_value_cad, 2)}{h.data.gain_cad != null && <> · <span className={h.data.gain_cad >= 0 ? "text-gain-700" : "text-accent-700"}>{signed(h.data.gain_cad, 0)} ({signedPct(h.data.gain_pct)}) depuis vos achats</span></>} · <span className={h.data.day_change_cad >= 0 ? "text-gain-700" : "text-accent-700"}>{signed(h.data.day_change_cad)} aujourd'hui</span></p>}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}>{editing ? <><X className="h-4 w-4" /> Fermer</> : <><Pencil className="h-4 w-4" /> Modifier</>}</Button>
      </div>

      {editing && (
        <section className="mt-6 border-t border-line py-6">
          <h2 className="font-display text-xl font-medium text-ink">Vos placements</h2>
          <p className="mb-4 mt-0.5 text-sm text-ink-muted">Ce que vous détenez, ici ou ailleurs. Montants en dollars canadiens.</p>
          <HoldingsEditor personaId={me!.profile.persona_id} portfolioId={portfolio?.portfolio_id} submitLabel="Enregistrer et analyser"
            initial={(h.data?.holdings || []).map((x: any) => ({ asset_id: x.asset_id, amount_cad: Math.round(x.value_cad) }))}
            onSaved={async (pf) => { setPortfolioId(pf.portfolio_id); setEditing(false); await reload(); await launchMandate(nav, REVIEW, pf.portfolio_id); }} />
        </section>
      )}

      {has && (
        <div className="mt-8"><Tabs value={tab} onChange={setTab} options={[["list", "Liste"], ["mix", "Répartition"]]} /></div>
      )}

      {h.loading && !h.data && <Spinner />}
      <ErrorBox error={h.error} onRetry={h.reload} />

      {has && tab === "list" && (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Segmented value={filter} onChange={setFilter} options={FILTERS} />
            <label className="relative flex items-center gap-1 text-sm text-ink-soft">
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="appearance-none bg-transparent pr-5 font-medium text-ink outline-none" aria-label="Trier">
                {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4" />
            </label>
          </div>
          <div className="mt-3" data-testid="holdings-list">
            <Stagger key={filter + sort}>
              {rows.map((x: any) => <HoldingRow key={x.asset_id} h={x} />)}
            </Stagger>
            {!rows.length && <p className="py-8 text-center text-sm text-ink-muted">Aucun placement dans cette catégorie.</p>}
          </div>
        </>
      )}

      {has && tab === "mix" && <Mix />}

      {h.data && !has && !editing && (
        <div className="mt-10 border-t border-line py-12 text-center">
          <p className="font-medium text-ink">Aucun placement</p>
          <p className="mt-1 text-sm text-ink-muted">Ajoutez ce que vous détenez pour que les agents en tiennent compte.</p>
          <Button className="mt-5" onClick={() => setEditing(true)}>Ajouter mes placements</Button>
        </div>
      )}
    </PageIn>
  );
}

function Mix() {
  const { me, portfolio } = useApp();
  const nav = useNavigate();
  const { data: xr, loading } = useAnalysis(portfolio?.portfolio_id);
  if (loading && !xr) return <Spinner />;
  if (!xr) return null;
  const b = me!.profile.budget;
  const cats = byCategory(xr.positions);
  const checks: any[] = (xr.persona_assessment?.budget_checks || []).filter((c: any) => c.status !== "UNKNOWN");
  const bad = checks.filter((c) => c.status !== "OK");
  return (
    <div className="mt-6 space-y-5">
      <section className="border-t border-line py-6">
        <h2 className="font-display text-xl font-medium text-ink">Répartition</h2>
        <div className="mt-4"><SplitBar slices={ORDER.map((k) => ({ id: k, label: CATEGORY[k].label, value: cats[k], color: CATEGORY[k].color }))} /></div>
        <p className="mt-4 text-sm text-ink-muted">Votre profil {me!.profile.risk_profile_label.toLowerCase()} prévoit entre {pct(b.growth_min, 0)} et {pct(b.growth_max, 0)} en actions et cryptos. Vous en avez {pct(cats.growth + cats.speculative, 0)}.</p>
      </section>
      <section className="border-t border-line">
        <div className="flex items-center justify-between pt-6">
          <h2 className="font-display text-xl font-medium text-ink">Vos limites</h2>
          <span className={clsx("text-sm font-medium", bad.length ? "text-accent-700" : "text-gain-700")}>{bad.length ? `${bad.length} dépassée${bad.length > 1 ? "s" : ""}` : "Toutes respectées"}</span>
        </div>
        <ul className="mt-2 pb-2">
          {checks.map((c) => (
            <li key={c.rule_id} className="flex gap-3 py-3">
              {c.status === "OK" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-gain-600" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-x-3 text-sm"><span className="font-medium text-ink">{checkLabel(c)}</span><span className="tabular text-ink-muted">{c.measured} · limite {c.limit}</span></div>
                {c.status !== "OK" && <p className="mt-0.5 text-sm text-ink-muted">{checkText(c)}</p>}
              </div>
            </li>
          ))}
        </ul>
        {bad.length > 0 && (
          <div className="border-t border-line py-4">
            <Button onClick={() => launchMandate(nav, REVIEW, portfolio?.portfolio_id)}>Demander aux agents de corriger</Button>
          </div>
        )}
      </section>
    </div>
  );
}
