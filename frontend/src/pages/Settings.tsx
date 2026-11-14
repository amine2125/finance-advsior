import { Save, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, ErrorBox, Input, Notice, PageHeader, Select, Table, TierBadge } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { api } from "../services/api";

const pctIn = (v: number) => String(Math.round(v * 1000) / 10);

export default function Settings() {
  const { personas, personaId, setPersonaId, refresh, system } = useApp();
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [saved, setSaved] = useState("");
  useEffect(() => { const x = personas.find((q) => q.persona_id === personaId); setP(x ? JSON.parse(JSON.stringify(x)) : null); setSaved(""); }, [personaId, personas]);
  if (!p) return null;
  const setB = (k: string, v: string) => setP({ ...p, budget: { ...p.budget, [k]: +v / 100 } });
  const clean = (x: any) => { const { allowed_tier, binding_inputs, tier_inputs, uncertainties, ...rest } = x; return rest; };
  const save = async () => {
    setErr(null);
    try { await api.put(`/personas/${p.persona_id}`, clean(p)); await refresh(); setSaved("Profil enregistré (nouvelle version du budget)."); } catch (e) { setErr(e); }
  };
  const createCustom = async () => {
    setErr(null);
    const id = `custom-${Date.now().toString(36)}`;
    try {
      await api.post("/personas", { ...clean(p), persona_id: id, display_name: `${p.display_name} (copie)`, is_official: false });
      await refresh();
      setPersonaId(id);
    } catch (e) { setErr(e); }
  };
  const bool = (v: any) => (v === null || v === undefined ? "" : v ? "true" : "false");
  const parseBool = (v: string) => (v === "" ? null : v === "true");
  return (
    <div>
      <PageHeader title="Paramètres / Profil" subtitle="Profils fictifs. Les budgets de risque sont des heuristiques de démonstration configurables, pas des règles réglementaires de convenance. Le niveau de risque n'est jamais déduit de l'âge seul.">
        <Button variant="ghost" onClick={createCustom}><UserPlus className="h-4 w-4" /> Dupliquer en profil personnalisé</Button>
        <Button onClick={save}><Save className="h-4 w-4" /> Enregistrer</Button>
      </PageHeader>
      <ErrorBox error={err} />
      {saved && <Notice>{saved}</Notice>}
      <div className="mt-4 grid gap-5 xl:grid-cols-3">
        <Card title={`${p.display_name}${p.is_official ? " · profil officiel du datathon" : ""}`} subtitle={p.objective} accent="violet">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nom affiché" value={p.display_name} onChange={(v) => setP({ ...p, display_name: v })} />
            <Input label="Âge (indicatif seulement)" type="number" value={p.age ?? ""} onChange={(v) => setP({ ...p, age: v ? +v : null })} />
            <Input label="Horizon min. (ans)" type="number" value={p.horizon_years_min} onChange={(v) => setP({ ...p, horizon_years_min: +v })} />
            <Input label="Horizon max. (ans)" type="number" value={p.horizon_years_max ?? ""} onChange={(v) => setP({ ...p, horizon_years_max: v ? +v : null })} />
            <Input label="Baisse tolérée déclarée (%)" type="number" value={p.stated_max_decline ? pctIn(p.stated_max_decline) : ""} onChange={(v) => setP({ ...p, stated_max_decline: v ? +v / 100 : null, stated_max_decline_provenance: "user_input" })} />
            <Input label="Capital fictif (CAD)" type="number" value={p.fictional_capital_cad ?? ""} onChange={(v) => setP({ ...p, fictional_capital_cad: v ? +v : null })} />
            <Select label="Revenu stable" value={bool(p.stable_income)} onChange={(v) => setP({ ...p, stable_income: parseBool(v) })} options={[{ value: "", label: "non renseigné" }, { value: "true", label: "oui" }, { value: "false", label: "non" }]} />
            <Select label="Réserve d'urgence" value={bool(p.emergency_reserve)} onChange={(v) => setP({ ...p, emergency_reserve: parseBool(v) })} options={[{ value: "", label: "non renseigné" }, { value: "true", label: "oui" }, { value: "false", label: "non" }]} />
            <Select label="Besoins de liquidité" value={p.liquidity_needs ?? ""} onChange={(v) => setP({ ...p, liquidity_needs: v || null })} options={[{ value: "", label: "non renseigné" }, { value: "low", label: "faibles" }, { value: "moderate", label: "modérés" }, { value: "high", label: "élevés" }]} />
            <Select label="Préférence ESG" value={bool(p.esg_preference)} onChange={(v) => setP({ ...p, esg_preference: v === "true" })} options={[{ value: "false", label: "non" }, { value: "true", label: "oui" }]} />
            <Select label="Notifications (SNS) – consentement" value={bool(p.notifications_opt_in)} onChange={(v) => setP({ ...p, notifications_opt_in: v === "true" })} options={[{ value: "false", label: "non" }, { value: "true", label: "oui" }]} />
            <Select label="Indice de référence" value={p.benchmark_id} onChange={(v) => setP({ ...p, benchmark_id: v })} options={["BLEND_GROWTH", "BLEND_BALANCED", "BLEND_ESG_BALANCED", "BLEND_CONSERVATIVE", "SPY", "XIU.TO", "QQQ", "AGG"].map((x) => ({ value: x, label: x }))} />
          </div>
          {p.stated_max_decline_provenance !== "user_input" && <p className="mt-2 text-[11px] text-amber-200/80">Tolérance : {p.stated_max_decline_provenance}</p>}
          <div className="mt-3 text-xs text-slate-400">Préférences : {p.preferences.join(" · ")}</div>
        </Card>
        <Card title="Budget de risque" subtitle={`Version ${p.budget.version} · contrainte déterminante : ${p.budget.binding_constraint_note}`} accent="amber">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Croissance min. (%)" type="number" value={pctIn(p.budget.growth_min)} onChange={(v) => setB("growth_min", v)} />
            <Input label="Croissance max. (%)" type="number" value={pctIn(p.budget.growth_max)} onChange={(v) => setB("growth_max", v)} />
            <Input label="Émetteur unique max. (%)" type="number" value={pctIn(p.budget.max_single_issuer)} onChange={(v) => setB("max_single_issuer", v)} />
            <Input label="Secteur unique max. (%)" type="number" value={pctIn(p.budget.max_single_sector)} onChange={(v) => setB("max_single_sector", v)} />
            <Input label="Poche spéculative max. (%)" type="number" value={pctIn(p.budget.max_speculative)} onChange={(v) => setB("max_speculative", v)} />
            <Input label="Seuil de revue (perte, %)" type="number" value={pctIn(p.budget.drawdown_review)} onChange={(v) => setB("drawdown_review", v)} />
          </div>
          <div className="mt-4 rounded-xl bg-ink-850/70 p-3 text-xs">
            <div className="mb-1 flex items-center gap-2 font-semibold text-slate-200">Niveau permis : <TierBadge tier={p.allowed_tier} /></div>
            {Object.entries(p.tier_inputs || {}).map(([k, v]) => <div key={k} className={p.binding_inputs?.includes(k) ? "text-amber-200" : "text-slate-400"}>• {k} : {String(v)}</div>)}
            {p.uncertainties?.length > 0 && <div className="mt-1 text-slate-500">Incertitudes : {p.uncertainties.join(" ; ")}</div>}
          </div>
        </Card>
        <Card title="Intégration AWS (état réel)">
          {system ? <Table head={["Élément", "Valeur"]} rows={[["Environnement", system.env], ["Région", system.region], ["Région Bedrock", system.bedrock_region], ["Modèle des agents", system.agent_model_id], ["Modèle du Superviseur", system.supervisor_model_id],
            ["Stockage", system.storage_backend], ["Exécution des tâches", system.job_runner], ["Orchestration", system.orchestration], ["Notifications", system.notifications], ["Recherche Web", system.web_research_enabled ? "activée" : "désactivée"], ["Mode", system.mode]]} /> : <p className="text-xs text-slate-500">n/d</p>}
        </Card>
      </div>
    </div>
  );
}
