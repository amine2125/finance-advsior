import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { Chargement, Erreur, Note } from "../components/base";
import { Segmented } from "../components/motion";
import { Button, Field, Notice, PageTitle, Panel, Table, TextButton, inputCls } from "../components/ui";
import * as f from "../format";
import { useApp, useData } from "../state";

interface Ligne { ticker: string; nom: string; quantite: number; prix_cad: number; valeur_cad: number; poids: number; cout_cad: number | null; gain_cad: number | null; gain_pct: number | null; comptes: string[] }
interface Mouvement { id: string; date: string; type: string; montant_cad: number; libelle: string; ticker?: string }
interface Vue { as_of: string; total_cad: number; liquidites_cad: number; lignes: Ligne[]; mouvements: Mouvement[]; origine: string; note: string }
interface Institution { id: string; nom: string; type: string }
interface Compte { id: string; libelle: string; numero: string; valeur_cad: number; cout_cad: number; n_lignes: number }

const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", "."));
const ORIGINE: Record<string, string> = { allocation_initiale: "portefeuille fictif du profil", saisie: "saisi à la main", import_csv: "importé d'un fichier CSV" };

export function Placements() {
  const { profil, asOf, toucher, enPassé } = useApp();
  const { data, erreur, charge, recharger } = useData<Vue>(`/profils/${profil}/positions`, { as_of: asOf });
  const [onglet, setOnglet] = useState<"liste" | "saisie" | "connexion">("liste");
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const apres = (text: string) => { setMsg({ tone: "good", text }); recharger(); toucher(); };
  const echec = (e: unknown) => setMsg({ tone: "bad", text: (e as ApiError).message });
  if (charge && !data) return <Chargement lignes={6} />;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  const origine = data.origine.startsWith("connexion:") ? "connecté (simulation)" : ORIGINE[data.origine] ?? data.origine;
  return (
    <div className="space-y-6">
      <PageTitle title="Mes placements" subtitle={`Ce que ton profil détient au ${f.date(data.as_of)} : ${origine}. Tout est simulé, évalué aux vrais cours de clôture.`}
        action={<Link to={`/portefeuille?p=${profil}${enPassé ? `&d=${asOf}` : ""}`} className="text-sm font-semibold text-primary-600 hover:underline">Voir la radiographie</Link>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel><p className="text-sm text-ink-muted">Valeur totale</p><p className="mt-1 font-display text-3xl font-semibold tabular">{f.cad(data.total_cad)}</p></Panel>
        <Panel><p className="text-sm text-ink-muted">Liquidités disponibles</p><p className="mt-1 font-display text-3xl font-semibold tabular">{f.cad(data.liquidites_cad)}</p>
          <Depot onFait={apres} onErreur={echec} /></Panel>
        <Panel><p className="text-sm text-ink-muted">Lignes</p><p className="mt-1 font-display text-3xl font-semibold tabular">{data.lignes.length}</p></Panel>
      </div>
      {msg && <Notice tone={msg.tone} role="status">{msg.text}</Notice>}
      <Segmented label="Vue" value={onglet} onChange={(v) => { setOnglet(v); setMsg(null); }}
        options={[["liste", "Mes lignes"], ["saisie", "Saisir ou importer"], ["connexion", "Connecter un compte"]]} />
      {onglet === "liste" && <Liste vue={data} onFait={apres} onErreur={echec} />}
      {onglet === "saisie" && <Saisie onFait={(t) => { apres(t); setOnglet("liste"); }} onErreur={echec} />}
      {onglet === "connexion" && <Connexion onFait={(t) => { apres(t); setOnglet("liste"); }} onErreur={echec} />}
      <Note>{data.note} Un achat se fait depuis la fiche d'un titre, après la vérification de tes règles.</Note>
    </div>
  );
}

function Depot({ onFait, onErreur }: { onFait: (t: string) => void; onErreur: (e: unknown) => void }) {
  const { profil, asOf } = useApp();
  const [m, setM] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await api(`/profils/${profil}/depot`, { body: { montant_cad: num(m), as_of: asOf } }); setM(""); onFait(`Dépôt de ${f.cad(num(m))} ajouté (simulation).`); }
    catch (e) { onErreur(e); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 flex gap-2">
      <input aria-label="Montant du dépôt" inputMode="decimal" placeholder="ex. 5 000" value={m} onChange={(e) => setM(e.target.value)} className={`${inputCls} !min-h-[38px] !py-1.5`} />
      <Button size="sm" variant="secondary" disabled={!(num(m) > 0) || busy} onClick={go}>Déposer</Button>
    </div>
  );
}

function Liste({ vue, onFait, onErreur }: { vue: Vue; onFait: (t: string) => void; onErreur: (e: unknown) => void }) {
  const { profil, asOf } = useApp();
  const [vente, setVente] = useState<string | null>(null);
  const [montant, setMontant] = useState("");
  const vendre = async (t: string, tout: boolean) => {
    try {
      const r = await api<{ montant_cad: number }>(`/profils/${profil}/vente`, { body: { ticker: t, tout, montant_cad: tout ? undefined : num(montant), as_of: asOf, ordre_id: crypto.randomUUID() } });
      setVente(null); setMontant(""); onFait(`Vente simulée de ${f.cad(r.montant_cad)} de ${t} : le produit est dans tes liquidités.`);
    } catch (e) { onErreur(e); }
  };
  const reinit = async () => { try { await api(`/profils/${profil}/positions/reinitialiser`, { body: { as_of: asOf } }); onFait("Retour au portefeuille fictif du profil."); } catch (e) { onErreur(e); } };
  return (
    <Panel>
      {vue.lignes.length === 0 ? <p className="text-sm text-ink-muted">Aucune ligne pour l'instant.</p> : (
        <Table caption="Lignes détenues">
          <thead><tr><th>Titre</th><th className="!text-right">Valeur</th><th className="!text-right">Poids</th><th className="!text-right">Gain</th><th /></tr></thead>
          <tbody>{vue.lignes.map((l) => (
            <tr key={l.ticker}>
              <td><Link to={`/titre/${encodeURIComponent(l.ticker)}?p=${profil}`} className="font-semibold text-ink hover:underline">{l.ticker}</Link>
                <span className="block text-xs text-ink-muted">{l.nom}{l.comptes.length ? ` · ${l.comptes.join(", ")}` : ""}</span></td>
              <td className="tabular text-right">{f.cad(l.valeur_cad)}<span className="block text-xs text-ink-muted">{f.nombre(l.quantite, 3)} × {f.cad(l.prix_cad, 2)}</span></td>
              <td className="tabular text-right">{f.pct(l.poids * 100)}</td>
              <td className={`tabular text-right ${l.gain_cad == null ? "text-ink-muted" : l.gain_cad >= 0 ? "text-gain-700" : "text-loss-700"}`}>{l.gain_cad == null ? "—" : <>{f.cad(l.gain_cad)}<span className="block text-xs">{f.pct(l.gain_pct)}</span></>}</td>
              <td className="text-right">{vente === l.ticker ? (
                <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                  <input aria-label={`Montant à vendre de ${l.ticker}`} inputMode="decimal" placeholder="montant" value={montant} onChange={(e) => setMontant(e.target.value)} className={`${inputCls} !min-h-[34px] w-28 !py-1`} />
                  <Button size="sm" variant="secondary" disabled={!(num(montant) > 0)} onClick={() => vendre(l.ticker, false)}>Vendre</Button>
                  <Button size="sm" variant="ghost" onClick={() => vendre(l.ticker, true)}>Tout</Button>
                  <TextButton onClick={() => setVente(null)}>Annuler</TextButton></span>
              ) : <TextButton onClick={() => { setVente(l.ticker); setMontant(""); }}>Vendre…</TextButton>}</td>
            </tr>))}</tbody>
        </Table>)}
      {vue.mouvements.length > 0 && <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">Mouvements de liquidités ({vue.mouvements.length})</summary>
        <ul className="mt-2 space-y-1 text-ink-soft">{vue.mouvements.map((m) => <li key={m.id} className="flex justify-between gap-3"><span>{f.date(m.date)} · {m.libelle}</span><span className="tabular">{f.cad(m.montant_cad)}</span></li>)}</ul></details>}
      {vue.origine !== "allocation_initiale" && <p className="mt-4 text-xs text-ink-muted">Tu peux revenir au portefeuille fictif du profil : <TextButton onClick={reinit}>réinitialiser</TextButton></p>}
    </Panel>
  );
}

function Saisie({ onFait, onErreur }: { onFait: (t: string) => void; onErreur: (e: unknown) => void }) {
  const { profil, asOf, config } = useApp();
  const [lignes, setLignes] = useState<{ ticker: string; montant: string }[]>([{ ticker: "", montant: "" }]);
  const [cash, setCash] = useState("");
  const [csv, setCsv] = useState("");
  const univers = config?.univers ?? [];
  const envoyer = async (body: object, text: string) => {
    try { await api(`/profils/${profil}/positions`, { body: { ...body, liquidites_cad: num(cash) || 0, as_of: asOf } }); onFait(text); } catch (e) { onErreur(e); }
  };
  const ok = lignes.filter((l) => l.ticker && num(l.montant) > 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <h2 className="font-display text-lg font-medium">Saisir mes placements</h2>
        <p className="mt-1 text-sm text-ink-muted">Remplace les lignes actuelles. Montants en $ CA au cours du {f.date(asOf)}.</p>
        <div className="mt-3 space-y-2">{lignes.map((l, i) => (
          <div key={i} className="flex gap-2">
            <select aria-label={`Titre ${i + 1}`} className={inputCls} value={l.ticker} onChange={(e) => setLignes(lignes.map((x, j) => j === i ? { ...x, ticker: e.target.value } : x))}>
              <option value="">Choisir un titre…</option>{univers.map((a) => <option key={a.ticker} value={a.ticker}>{a.ticker} · {a.name}</option>)}</select>
            <input aria-label={`Montant ${i + 1}`} inputMode="decimal" placeholder="montant $" className={`${inputCls} w-36`} value={l.montant} onChange={(e) => setLignes(lignes.map((x, j) => j === i ? { ...x, montant: e.target.value } : x))} />
          </div>))}</div>
        <div className="mt-2 flex gap-3"><TextButton onClick={() => setLignes([...lignes, { ticker: "", montant: "" }])}>+ Ajouter une ligne</TextButton>
          {lignes.length > 1 && <TextButton onClick={() => setLignes(lignes.slice(0, -1))}>Retirer la dernière</TextButton>}</div>
        <Field label="Liquidités (optionnel)" htmlFor="cash" className="mt-4"><input id="cash" inputMode="decimal" className={inputCls} value={cash} onChange={(e) => setCash(e.target.value)} placeholder="ex. 2 000" /></Field>
        <Button className="mt-4" disabled={!ok.length} onClick={() => envoyer({ lignes: ok.map((l) => ({ ticker: l.ticker, montant_cad: num(l.montant) })) }, "Placements enregistrés.")}>Enregistrer</Button>
      </Panel>
      <Panel>
        <h2 className="font-display text-lg font-medium">Importer un fichier CSV</h2>
        <p className="mt-1 text-sm text-ink-muted">Colonnes : <code>ticker,quantite</code> ou <code>ticker,montant_cad</code>. Seuls les 31 actifs du jeu de données sont reconnus.</p>
        <textarea aria-label="Contenu CSV" rows={7} className={`${inputCls} mt-3 font-mono text-xs`} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"ticker,montant_cad\nXIU.TO,4000\nXBB.TO,3000"} />
        <input type="file" accept=".csv,text/csv" aria-label="Choisir un fichier CSV" className="mt-2 text-sm" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); }} />
        <Button className="mt-4" disabled={csv.trim().length < 10} onClick={() => envoyer({ csv }, "Fichier importé.")}>Importer</Button>
      </Panel>
    </div>
  );
}

function Connexion({ onFait, onErreur }: { onFait: (t: string) => void; onErreur: (e: unknown) => void }) {
  const { profil, asOf } = useApp();
  const { data: inst } = useData<{ institutions: Institution[] }>("/connexions/institutions");
  const [choisie, setChoisie] = useState<string | null>(null);
  const { data: apercu, charge } = useData<{ comptes: Compte[]; note: string }>(choisie ? `/profils/${profil}/connexions/${choisie}` : null, { as_of: asOf });
  const [sel, setSel] = useState<string[]>([]);
  const connecter = async () => {
    try { await api(`/profils/${profil}/connexions/${choisie}`, { body: { comptes: sel, as_of: asOf } }); onFait("Comptes connectés (simulation) : tes lignes ont été remplacées."); } catch (e) { onErreur(e); }
  };
  return (
    <Panel>
      <h2 className="font-display text-lg font-medium">Connecter un compte de placement</h2>
      <Notice className="mt-2">Simulation : aucune institution n'est contactée et aucun identifiant n'est demandé. Les comptes sont fictifs, achetés aux vrais cours historiques.</Notice>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{(inst?.institutions ?? []).map((i) => (
        <button key={i.id} onClick={() => { setChoisie(i.id); setSel([]); }} aria-pressed={choisie === i.id}
          className={`rounded-xl border px-3 py-3 text-left text-sm ${choisie === i.id ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}>
          <span className="font-semibold">{i.nom}</span><span className={`block text-xs ${choisie === i.id ? "text-white/70" : "text-ink-muted"}`}>{i.type}</span></button>))}</div>
      {choisie && (charge ? <Chargement lignes={2} /> : apercu && (
        <div className="mt-5">
          <p className="text-sm font-semibold">Comptes trouvés</p>
          <ul className="mt-2 space-y-2">{apercu.comptes.map((c) => (
            <li key={c.id}><label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm">
              <span className="flex items-center gap-3"><input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />
                <span><strong>{c.libelle}</strong> <span className="text-ink-muted">{c.numero} · {c.n_lignes} lignes</span></span></span>
              <span className="tabular text-right">{f.cad(c.valeur_cad)}<span className="block text-xs text-ink-muted">payé {f.cad(c.cout_cad)}</span></span></label></li>))}</ul>
          <Button className="mt-4" disabled={!sel.length} onClick={connecter}>Importer {sel.length || ""} compte{sel.length > 1 ? "s" : ""}</Button>
        </div>))}
    </Panel>
  );
}
