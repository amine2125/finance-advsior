import clsx from "clsx";
import { Plus, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp, useProfilePath } from "../hooks/useApp";
import { useMarket } from "../hooks/useMarket";
import { sector } from "../lib/assets";
import { cad } from "../lib/format";
import { NIVEAU } from "../lib/ulysse";
import { api, ApiError } from "../services/api";
import { Badge, Button, ErrorBox, inputCls, Notice } from "./ui";

export type Row = { asset_id: string; amount_cad: number };
const CLASS_FR: Record<string, string> = { equity: "Action", etf_equity: "FNB d'actions", etf_bond: "FNB d'obligations", etf_commodity: "FNB d'or", crypto: "Cryptoactif" };
export const LEVEL_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { ok: "good", attention: "warn", pause: "bad", aucun: "neutral" };

/** Lets the user enter what they hold (CAD amounts) or import a CSV; the holdings become exactly this list. The cash is kept. */
export default function HoldingsEditor({ initial = [], submitLabel = "Enregistrer", onSaved }: { initial?: Row[]; submitLabel?: string; onSaved: () => void }) {
  const { me, asOf } = useApp();
  const path = useProfilePath();
  const market = useMarket();
  const [rows, setRows] = useState<Row[]>(initial);
  const [q, setQ] = useState("");
  const [csv, setCsv] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const byId = useMemo(() => Object.fromEntries((market.data?.actifs || []).map((a: any) => [a.ticker, a])), [market.data]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return (market.data?.actifs || []).filter((a: any) => a.ticker.toLowerCase().includes(s) || a.name.toLowerCase().includes(s)).slice(0, 6);
  }, [q, market.data]);
  const total = rows.reduce((s, r) => s + (r.amount_cad || 0), 0);

  const add = (id: string) => {
    if (!rows.find((r) => r.asset_id === id)) setRows([...rows, { asset_id: id, amount_cad: 1000 }]);
    setQ("");
  };
  const save = async () => {
    const p = path("/positions", { as_of: null });
    if (!p) return;
    setBusy(true);
    setError(null);
    try {
      const keep = { liquidites_cad: Math.max(0, Math.floor((me?.cash || 0) * 100) / 100), as_of: asOf };
      await api.post(p, csv !== null ? { csv, ...keep } : { lignes: rows.map((r) => ({ ticker: r.asset_id, montant_cad: r.amount_cad })), ...keep });
      onSaved();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  if (csv !== null) {
    return (
      <div className="space-y-3">
        <Notice>Format : une ligne d'en-tête <code className="rounded bg-white px-1">ticker,montant_cad</code> (montant en $ CA) ou <code className="rounded bg-white px-1">ticker,quantite</code>, puis une ligne par placement.</Notice>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={7} className={clsx(inputCls, "font-mono")} placeholder={"ticker,montant_cad\nXIU.TO,4000\nAGG,3000\nNVDA,1500"} />
        <input type="file" accept=".csv,text/csv" className="text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
        <ErrorBox error={error} />
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy || csv.trim().length < 10}>{busy ? "Import…" : "Importer"}</Button>
          <Button variant="ghost" onClick={() => setCsv(null)}>Saisir à la main</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-ink-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un placement : NVIDIA, XIU, obligations, Bitcoin…" className={clsx(inputCls, "pl-10")} data-testid="asset-search" />
        {matches.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lift">
            {matches.map((a: any) => (
              <button key={a.ticker} onClick={() => add(a.ticker)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-canvas">
                <span><b className="font-bold">{a.ticker}</b> <span className="text-ink-soft">{a.name}</span></span>
                <span className="flex items-center gap-2 text-xs text-ink-soft">{CLASS_FR[a.asset_class] || a.asset_class} <Plus className="h-4 w-4 text-primary-500" /></span>
              </button>
            ))}
          </div>
        )}
      </div>
      {!market.data && <p className="text-xs text-ink-muted">Chargement de la liste des placements disponibles…</p>}
      {market.data && !rows.length && (
        <div className="flex flex-wrap gap-2 text-xs text-ink-soft">Exemples à ajouter :
          {["XIU.TO", "SPY", "XBB.TO", "AGG", "NVDA", "RY.TO", "GLD", "BTC-USD"].filter((x) => byId[x]).map((x) => (
            <button key={x} onClick={() => add(x)} className="rounded-full border border-line px-2.5 py-0.5 hover:border-primary-500 hover:text-primary-700">{x}</button>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div className="divide-y divide-line rounded-xl border border-line">
          {rows.map((r, i) => {
            const a = byId[r.asset_id];
            const sig = a?.signal?.niveau as keyof typeof NIVEAU | undefined;
            return (
              <div key={r.asset_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-ink">{r.asset_id} <span className="font-normal text-ink-soft">{a?.name}</span></div>
                  {a && <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">{sector(a.sector)}{sig && <> · <Badge tone={LEVEL_TONE[sig]}>{NIVEAU[sig].short.toLowerCase()}</Badge></>}</div>}
                </div>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={1} value={r.amount_cad || ""} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, amount_cad: +e.target.value } : x))}
                    className={clsx(inputCls, "w-32 text-right")} aria-label={`Montant ${r.asset_id}`} />
                  <span className="text-sm text-ink-soft">$</span>
                </div>
                <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded-lg p-2 text-ink-muted hover:bg-accent-50 hover:text-accent-700" aria-label="Retirer"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
          <div className="flex justify-between px-4 py-3 text-sm"><span className="text-ink-soft">Total</span><b>{cad(total)}</b></div>
        </div>
      )}
      <p className="text-xs text-ink-muted">Les montants sont convertis en quantités simulées au cours de clôture de la date simulée (en $ CA, taux de change Banque du Canada). Votre solde disponible ne change pas.</p>
      <ErrorBox error={error} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy || !rows.length || rows.some((r) => !(r.amount_cad > 0))} data-testid="save-holdings">{busy ? "Enregistrement…" : submitLabel}</Button>
        <Button variant="ghost" onClick={() => setCsv("")}><Upload className="h-4 w-4" /> Importer un fichier CSV</Button>
      </div>
    </div>
  );
}
