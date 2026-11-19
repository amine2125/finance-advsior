import clsx from "clsx";
import { Check, ChevronDown, Pencil, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SplitBar } from "../components/charts";
import { PageIn, Segmented, Stagger, Tabs } from "../components/motion";
import HoldingsEditor from "../components/HoldingsEditor";
import HowItWorks from "../components/HowItWorks";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useApp, useProfilePath } from "../hooks/useApp";
import { useMarket } from "../hooks/useMarket";
import { byCategory, CATEGORY, group, ORDER } from "../lib/assets";
import { cad, date, pct } from "../lib/format";
import { REVIEW, useLaunch } from "../lib/launch";
import { clauseShort, Signal, StatutClause, vous } from "../lib/ulysse";
import { api } from "../services/api";
import { gainSince, Holding, HoldingRow, Positions, signed, signedPct, toHoldings } from "./Home";

type Filter = "all" | "stocks" | "etf" | "crypto";
const FILTERS: [Filter, string][] = [["all", "Tout"], ["stocks", "Actions"], ["etf", "FNB"], ["crypto", "Crypto"]];
const SORTS: Record<string, [string, (a: Holding, b: Holding) => number]> = {
  value: ["Valeur", (a, b) => b.value_cad - a.value_cad],
  alpha: ["Alphabétique", (a, b) => a.asset_id.localeCompare(b.asset_id)],
  day: ["Variation du jour", (a, b) => (b.day_change_pct ?? 0) - (a.day_change_pct ?? 0)],
  gain: ["Gain depuis l'achat", (a, b) => (b.gain_pct ?? -9) - (a.gain_pct ?? -9)],
};
const ORIGIN: Record<string, string> = { allocation_initiale: "portefeuille de départ du profil (fictif)", saisie: "saisis à la main", import_csv: "importés d'un fichier CSV" };

export default function Holdings() {
  const { reload, asOf } = useApp();
  const path = useProfilePath();
  const launch = useLaunch();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"list" | "mix">("list");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState("value");
  const [editing, setEditing] = useState(params.get("ajouter") === "1");
  const [tick, setTick] = useState(0);
  const h = useApi<Positions>(path("/positions"), [tick]);
  const hist = useApi<any>(path("/historique", { jours: 10 }), [tick]);
  const market = useMarket();
  const all = useMemo(() => toHoldings(h.data, market.data?.actifs), [h.data, market.data]);
  const rows = useMemo(() => all
    .filter((x) => filter === "all" || (filter === "crypto" ? group(x) === "crypto" : filter === "etf" ? group(x) === "etf" : group(x) === "equity"))
    .sort(SORTS[sort][1]), [all, filter, sort]);
  const has = all.length > 0;
  const g = gainSince(all);
  const day = hist.data?.veille_cad;
  const origin = h.data ? (h.data.origine.startsWith("connexion:") ? "compte connecté (simulation)" : ORIGIN[h.data.origine] ?? h.data.origine) : "";
  const resetToStart = async () => {
    const p = path("/positions/reinitialiser", { as_of: null });
    if (!p || !confirm("Revenir au portefeuille de départ du profil ? Vos placements actuels seront remplacés.")) return;
    await api.post(p, { as_of: asOf });
    await reload(); setTick((t) => t + 1);
  };

  return (
    <PageIn className="mx-auto max-w-3xl px-5 pb-16 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3"><HowItWorks topic="placements" /></div>
          <h1 className="font-display text-[40px] font-semibold leading-none tracking-tightest text-ink">Placements</h1>
          {has && h.data && <p className="tabular-nums mt-3 text-sm text-ink-muted">{cad(h.data.total_cad - h.data.liquidites_cad, 2)}{g && <> · <span className={g.gain >= 0 ? "text-gain-700" : "text-accent-700"}>{signed(g.gain, 0)} ({signedPct(g.pct)}) depuis vos achats</span></>}{day != null && <> · <span className={day >= 0 ? "text-gain-700" : "text-accent-700"}>{signed(day)} à la dernière clôture</span></>}</p>}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}>{editing ? <><X className="h-4 w-4" /> Fermer</> : <><Pencil className="h-4 w-4" /> Modifier</>}</Button>
      </div>

      {editing && (
        <section className="mt-6 border-t border-line py-6">
          <h2 className="font-display text-xl font-medium text-ink">Vos placements</h2>
          <p className="mb-4 mt-0.5 text-sm text-ink-muted">Ce que vous détenez, ici ou ailleurs. Montants en dollars canadiens.</p>
          <HoldingsEditor submitLabel="Enregistrer et analyser"
            initial={all.map((x) => ({ asset_id: x.asset_id, amount_cad: Math.round(x.value_cad) }))}
            onSaved={async () => { setEditing(false); await reload(); setTick((t) => t + 1); await launch(REVIEW, { type: "portefeuille" }); }} />
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
              {rows.map((x) => <HoldingRow key={x.asset_id} h={x} />)}
            </Stagger>
            {!rows.length && <p className="py-8 text-center text-sm text-ink-muted">Aucun placement dans cette catégorie.</p>}
          </div>
          {h.data && (
            <div className="mt-6 space-y-3 text-sm">
              <p className="text-ink-muted">Liquidités : <span className="tabular-nums font-medium text-ink">{cad(h.data.liquidites_cad, 2)}</span> · placements {origin}, évalués aux vrais cours de clôture en $ CA.</p>
              {h.data.mouvements?.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-ink-muted hover:text-ink">Mouvements de liquidités ({h.data.mouvements.length})</summary>
                  <ul className="mt-2 divide-y divide-line border-y border-line">
                    {h.data.mouvements.map((m: any) => (
                      <li key={m.id} className="flex justify-between gap-3 py-2.5"><span className="text-ink-soft">{date(m.date)} · {m.libelle}</span><span className={clsx("tabular-nums", m.montant_cad >= 0 ? "text-gain-700" : "text-ink")}>{signed(m.montant_cad)}</span></li>
                    ))}
                  </ul>
                </details>
              )}
              {h.data.origine !== "allocation_initiale" && <button onClick={resetToStart} className="text-ink-muted underline-offset-4 hover:text-ink hover:underline">Revenir au portefeuille de départ du profil</button>}
            </div>
          )}
        </>
      )}

      {has && tab === "mix" && h.data && <Mix pos={h.data} onFix={() => launch(REVIEW, { type: "portefeuille" })} />}

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

/** « 54,8 % · limite 50 % » from a clause status (the engine's values are in percent). */
function measured(c: StatutClause): string {
  const val = c.valeur_apres ?? c.valeur_avant;
  if (val == null || c.limite == null) return c.statut === "donnees_insuffisantes" ? "données insuffisantes" : "";
  const f = (x: number) => `${x.toLocaleString("fr-CA", { maximumFractionDigits: 1 })}${c.unite === "%" ? " %" : ` ${c.unite}`}`;
  return `${f(val)} · ${c.type === "liquidites_min" ? "minimum" : "limite"} ${f(c.limite)}`;
}

function Mix({ pos, onFix }: { pos: Positions; onFix: () => Promise<void> }) {
  const { me } = useApp();
  const path = useProfilePath();
  const home = useApi<{ statut_contrat: Signal }>(path("/accueil"));
  const [busy, setBusy] = useState(false);
  const cats = byCategory(pos.lignes, pos.total_cad ? pos.liquidites_cad / pos.total_cad : 0);
  const s = home.data?.statut_contrat;
  const checks = (s?.clauses || []).filter((c) => c.statut !== "non_applicable");
  const bad = checks.filter((c) => c.statut === "depassee");
  const actions = s?.clauses.find((c) => c.type === "actions_max");
  return (
    <div className="mt-6 space-y-5">
      <section className="border-t border-line py-6">
        <h2 className="font-display text-xl font-medium text-ink">Répartition</h2>
        <div className="mt-4"><SplitBar slices={ORDER.map((k) => ({ id: k, label: CATEGORY[k].label, value: cats[k], color: CATEGORY[k].color }))} /></div>
        {actions?.limite != null && actions.valeur_apres != null && (
          <p className="mt-4 text-sm text-ink-muted">Votre profil {me!.profile!.risk_profile_label.toLowerCase()} prévoit au plus {pct(actions.limite / 100, 0)} en actions (FNB compris). Vous en avez {pct(actions.valeur_apres / 100, 0)}.</p>
        )}
        <p className="mt-2 text-xs text-ink-muted">Stabilité : obligations, or et liquidités. Les FNB d'actions sont ouverts quand leur composition publiée est disponible.</p>
      </section>
      <section className="border-t border-line">
        <div className="flex items-center justify-between pt-6">
          <h2 className="font-display text-xl font-medium text-ink">Vos règles</h2>
          {s && <span className={clsx("text-sm font-medium", bad.length ? "text-accent-700" : "text-gain-700")}>{bad.length ? `${bad.length} dépassée${bad.length > 1 ? "s" : ""}` : "Toutes respectées"}</span>}
        </div>
        {!s && <Spinner />}
        <ul className="mt-2 pb-2">
          {checks.map((c) => (
            <li key={c.clause_id} className="flex gap-3 py-3">
              {c.statut === "respectee" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-gain-600" /> : c.statut === "depassee" ? <X className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" /> : <span className="mt-1.5 h-2 w-2 shrink-0 translate-x-1 rounded-full bg-primary-500" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-x-3 text-sm"><span className="font-medium text-ink">{clauseShort(c)}</span><span className="tabular text-ink-muted">{measured(c)}</span></div>
                {c.statut !== "respectee" && <p className="mt-0.5 text-sm text-ink-muted">{vous(c.explication)}</p>}
              </div>
            </li>
          ))}
        </ul>
        {bad.length > 0 && (
          <div className="border-t border-line py-4">
            <Button disabled={busy} onClick={async () => { setBusy(true); try { await onFix(); } catch { setBusy(false); } }}>{busy ? "Les agents démarrent…" : "Demander aux agents d'analyser"}</Button>
          </div>
        )}
      </section>
    </div>
  );
}
