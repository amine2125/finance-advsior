import { Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, ErrorBox, Input, Loading, Notice, PageHeader, Select, Table, TierBadge } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useApi } from "../hooks/useApi";
import { cad, CLASS_FR, num, pct, sector } from "../lib/format";
import { api } from "../services/api";

export default function PortfolioPage() {
  const { portfolioId, setPortfolioId, personaId, refresh } = useApp();
  const assets = useApi<any>("/assets");
  const [xr, setXr] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<{ asset_id: string; amount: string }[]>([{ asset_id: "NVDA", amount: "3000" }]);
  const [name, setName] = useState("Mon portefeuille simulé");
  const [csv, setCsv] = useState("asset_id,amount_cad\nNVDA,3000\nMSFT,2500\nQQQ,2500\nSPY,2000\n");
  const [addAsset, setAddAsset] = useState("XBB.TO");
  const [addAmount, setAddAmount] = useState("1000");

  const load = () => {
    setErr(null);
    api.post("/analysis/portfolio", { portfolio_id: portfolioId, persona_id: personaId, save_snapshot: false }).then(setXr).catch(setErr);
  };
  useEffect(load, [portfolioId, personaId]);
  const options = (assets.data?.assets || []).map((a: any) => ({ value: a.asset_id, label: `${a.asset_id} – ${a.name}` }));

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const pf = await api.post("/portfolios", { name, persona_id: personaId, holdings: rows.filter((r) => r.asset_id && +r.amount > 0).map((r) => ({ asset_id: r.asset_id, amount_cad: +r.amount })) });
      await refresh();
      setPortfolioId(pf.portfolio_id);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const importCsv = async () => {
    setBusy(true);
    setErr(null);
    try {
      const pf = await api.post("/portfolios/import", { name: `${name} (CSV)`, persona_id: personaId, csv });
      await refresh();
      setPortfolioId(pf.portfolio_id);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const add = async () => {
    setBusy(true);
    try {
      await api.post(`/portfolios/${portfolioId}/holdings`, { holdings: [{ asset_id: addAsset, amount_cad: +addAmount }] });
      load();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!confirm("Supprimer ce portefeuille simulé ?")) return;
    await api.del(`/portfolios/${portfolioId}`);
    await refresh();
  };

  return (
    <div>
      <PageHeader title="Mon portefeuille" subtitle="Portefeuilles simulés uniquement : les montants en CAD sont convertis en quantités fractionnaires au dernier cours de clôture du jeu de données. Aucune transaction réelle." />
      <ErrorBox error={err} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card title={xr?.portfolio_name || "Positions"} subtitle={xr ? `Valorisation au ${xr.data_as_of} · ${cad(xr.total_value_cad)}` : ""} className="xl:col-span-2"
          actions={<Button variant="ghost" onClick={del}><Trash2 className="h-4 w-4" /> Supprimer</Button>}>
          {!xr ? <Loading /> : (
            <Table head={["Actif", "Classe / secteur", "Quantité", "Cours (devise)", "FX", "Valeur CAD", "Poids", "Niveau"]} rows={xr.positions.map((p: any) => [
              <div><div className="font-semibold text-white">{p.asset_id}</div><div className="text-[11px] text-slate-500">{p.name}</div></div>,
              <div><div>{CLASS_FR[p.asset_class] || p.asset_class}</div><div className="text-[11px] text-slate-500">{sector(p.sector)}</div></div>,
              <span className="tabular-nums">{num(p.quantity, 4)}</span>,
              <span className="tabular-nums">{num(p.price_native, 2)} {p.currency}<div className="text-[10px] text-slate-500">{p.price_date}</div></span>,
              p.fx_usdcad ? <span className="tabular-nums">{num(p.fx_usdcad, 4)}<div className="text-[10px] text-slate-500">{p.fx_date}</div></span> : "—",
              <span className="tabular-nums">{cad(p.value_cad)}</span>, <span className="tabular-nums font-semibold">{pct(p.weight)}</span>, <TierBadge tier={p.tier} />])} />
          )}
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-ink-700 pt-4">
            <Select label="Ajouter un actif" value={addAsset} onChange={setAddAsset} options={options} className="min-w-[16rem]" />
            <Input label="Montant (CAD)" type="number" value={addAmount} onChange={setAddAmount} className="w-36" />
            <Button onClick={add} disabled={busy}><Plus className="h-4 w-4" /> Ajouter</Button>
          </div>
        </Card>
        <div className="space-y-5">
          <Card title="Créer un portefeuille" subtitle="Saisie manuelle par montants en CAD">
            <Input label="Nom" value={name} onChange={setName} />
            <div className="mt-3 space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Select value={r.asset_id} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, asset_id: v } : x)))} options={options} className="flex-1" />
                  <Input type="number" value={r.amount} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: v } : x)))} className="w-28" />
                  <button className="mb-2 text-slate-500 hover:text-rose-300" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" onClick={() => setRows([...rows, { asset_id: "SPY", amount: "1000" }])}><Plus className="h-4 w-4" /> Ligne</Button>
              <Button onClick={create} disabled={busy}>Créer</Button>
            </div>
          </Card>
          <Card title="Importer un CSV" subtitle="Colonnes : asset_id et quantity OU amount_cad">
            <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} className="w-full rounded-xl border border-ink-600 bg-ink-850 p-2 font-mono text-xs text-slate-200 focus:border-aegis-500 focus:outline-none" />
            <Button onClick={importCsv} disabled={busy} className="mt-2"><Upload className="h-4 w-4" /> Importer</Button>
            <Notice>Seuls les actifs de l'univers du jeu de données sont acceptés; un symbole inconnu est refusé (jamais deviné).</Notice>
          </Card>
        </div>
      </div>
    </div>
  );
}
