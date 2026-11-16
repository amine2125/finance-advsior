import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { GraphiqueCours } from "../charts/GraphiqueCours";
import { Chargement, Erreur, Etiquette, Note, Prouve, PuceNiveau, PuceStatut, Terme } from "../components/base";
import { Montant } from "../components/Montant";
import { PauseReflexion } from "../components/pause";
import { Signale } from "../components/signal";
import { Button, Notice, Panel, Section, Tile } from "../components/ui";
import * as f from "../format";
import { SECTEURS, inhabituel } from "../libelles";
import { useApp, useData } from "../state";
import type { Adaptation, Actif, Niveau, Preuve, Signal } from "../types";

interface Fiche {
  as_of: string; actif: Actif; preuves: Preuve[];
  serie: { dates: string[]; local: number[]; cad: number[]; devise: string; source: string };
  pour_toi: null | { signal_reference: { niveau: Niveau; regles: string[]; clauses: { type: string; statut: string; explication: string }[]; taille_reference_pct: number } | null;
    deja_detenu_pct: number; via_fnb: { fonds: string; poids_dans_fonds_pct: number; composition_au: string }[];
    esg: { statut: string; explication: string; preuves: string[] } | null; horizon_annees: number; pire_sur_horizon: string; total_portefeuille_cad: number; adaptation: Adaptation };
}

export function Fiche() {
  const { ticker = "" } = useParams();
  const [sp] = useSearchParams();
  const { profil, asOf, t, toucher } = useApp();
  const nav = useNavigate();
  const { data, erreur, charge, recharger } = useData<Fiche>(`/marche/${encodeURIComponent(ticker)}`, { profil, as_of: asOf });
  const [montant, setMontant] = useState<string>(sp.get("montant") ?? "");
  const [direct, setDirect] = useState<Signal | null>(null);
  const [verif, setVerif] = useState<"" | "en_cours">("");
  const [pause, setPause] = useState<Signal | null>(null);
  const [confirme, setConfirme] = useState<string | null>(null);
  const [consigne, setConsigne] = useState<string | null>(null);
  const [erreurOrdre, setErreurOrdre] = useState<string | null>(null);
  const ordreId = useRef<string>(crypto.randomUUID());   // one id per prepared order: a double click never buys twice
  const timer = useRef<number | undefined>(undefined);
  const parMesure = useMemo(() => Object.fromEntries((data?.preuves ?? []).map((p) => [p.mesure + (p.mesure === "rendement_total_passe" ? `_${p.parametres.fenetre_annees}` : ""), p])), [data]);
  const m = Number(String(montant).replace(/\s/g, "").replace(",", "."));
  const { data: positions } = useData<{ liquidites_cad: number }>(profil ? `/profils/${profil}/positions` : null, { as_of: asOf });
  const cash = positions?.liquidites_cad ?? null;
  useEffect(() => { setDirect(null); setConfirme(null); setConsigne(null); }, [ticker, profil, asOf]);
  useEffect(() => { const s = sp.get("montant"); if (s) setMontant(s); }, [sp]);
  useEffect(() => {                 // live check while typing (policy only, no LLM; < 300 ms)
    window.clearTimeout(timer.current);
    if (!data?.pour_toi || !(m > 0)) { setDirect(null); return; }
    timer.current = window.setTimeout(() => {
      api<Signal>("/ordres/verifier", { body: { profil, ticker, montant_cad: m, as_of: asOf, options: false } }).then(setDirect).catch(() => setDirect(null));
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [m, profil, ticker, asOf, data]);
  if (charge && !data) return <Chargement lignes={6} />;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  const a = data.actif, pt = data.pour_toi, ad = pt?.adaptation;
  const prix = parMesure["prix_cloture"];
  const total = pt?.total_portefeuille_cad ?? 0;
  const ouvrirDossier = async () => {
    const r = await api<{ id: string }>("/dossiers", { body: { profil, as_of: asOf, intention: m > 0 ? { type: "ordre", ticker, montant_cad: m } : { type: "titre", ticker } } });
    nav(`/dossier/${r.id}?p=${profil}&d=${asOf}`);
  };
  const preparer = async () => {
    if (!(m > 0)) return;
    setVerif("en_cours"); setConsigne(null);
    try {
      const s = await api<Signal>("/ordres/verifier", { body: { profil, ticker, montant_cad: m, as_of: asOf, options: true, journaliser: true } });
      setDirect(s);
      if (s.niveau === "pause") setPause(s); else setConfirme(s.niveau);
    } finally { setVerif(""); }
  };
  const decider = async (choix: string, niveau: string) => {
    setErreurOrdre(null);
    try {
      const r = await api<{ execute: boolean; liquidites_cad?: number }>("/ordres/decision", { body: { profil, ticker, montant_cad: m, as_of: asOf, choix, niveau, ordre_id: ordreId.current } });
      ordreId.current = crypto.randomUUID();
      setPause(null); setConfirme(null); toucher();
      const reste = r.liquidites_cad != null ? ` Il te reste ${f.cad(r.liquidites_cad)} de liquidités.` : "";
      setConsigne((choix === "continuer" ? "Ordre simulé appliqué, avec ton choix « Continuer quand même », et consigné dans le Journal." : "Ordre simulé appliqué à ton portefeuille et consigné dans le Journal.") + reste + " Aucune transaction réelle.");
    } catch (e) { setPause(null); setErreurOrdre((e as Error).message); }
  };
  const ref = pt?.signal_reference;
  const bandeSignal = ref ? { niveau: ref.niveau, titre: `Selon tes règles, pour une position de ${f.pct(ref.taille_reference_pct, 0)}`, regles_declenchees: ref.regles,
    clauses: ref.clauses.map((c, i) => ({ clause_id: `${c.type}-${i}`, type: c.type, libelle: c.type, origine: "dit" as const, importante: false, statut: c.statut as any,
      valeur_avant: null, valeur_apres: null, limite: null, unite: "%", explication: c.explication, preuves: [], incertain: false, cause_par_intention: true, deja_depassee_avant: false })) } : null;
  const detail = ad?.metriques_detaillees_visibles;
  const tuiles: [string, string, Preuve | undefined, (p: Preuve) => string][] = [
    ["volatilite", "Volatilité sur 1 an", parMesure["volatilite_annualisee"], (p) => f.pct(p.valeur)],
    ["pire_baisse", "Pire baisse passée", parMesure["pire_baisse"], (p) => f.pct(p.valeur.baisse_pct)],
    ["horizon", `Pire période de ${pt?.horizon_annees ? Math.min(pt.horizon_annees, 5) : "?"} an(s)`, parMesure["pire_rendement_sur_horizon"], (p) => f.pct(p.valeur.pire_pct)],
    ["dividendes", "Dividendes sur 12 mois", parMesure["rendement_dividende_12m"], (p) => (p.statut === "ok" ? f.pct(p.valeur) : "non applicable")],
  ];
  if (detail) tuiles.push(["cvar", "Pertes extrêmes (CVaR 20 séances)", parMesure["cvar_historique"], (p) => f.pct(p.valeur.cvar_pct)],
    ["ewma", "Risque récent / risque sur 1 an", parMesure["ratio_risque_recent"], (p) => `${f.nombre(p.valeur, 2)} ×`]);
  const encadre = direct && (direct.mode === "encadre" || direct.mode === "interruption");
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-ink-muted">{SECTEURS[a.sector] ?? a.sector} · {a.market} · cotation en {a.currency}</p>
          <h1 className="mt-1 font-display text-[34px] font-medium leading-tight tracking-[-0.03em] sm:text-[40px]">{a.name} <span className="text-ink-muted">{a.ticker}</span></h1>
        </div>
        {prix && prix.statut === "ok" && <div className="sm:text-right">
          <p className="font-display text-[34px] font-semibold leading-none tracking-[-0.03em]"><Prouve preuve={prix}>{f.devise(prix.valeur.local, a.currency)}</Prouve></p>
          <p className="mt-1 text-xs text-ink-muted">{a.currency !== "CAD" ? `≈ ${f.devise(prix.valeur.cad, "CAD")} · ` : ""}clôture du {f.date(prix.date_de_calcul)}</p></div>}
      </div>

      {pt && (
        <Signale signal={bandeSignal} intention={{ type: "titre", ticker }}>
          <section className="rounded-2xl bg-white p-5 shadow-card" aria-labelledby="pour-toi">
            <h2 id="pour-toi" className="font-display text-lg font-medium tracking-[-0.02em]">Pour toi</h2>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-soft">
              <li>Tu détiens déjà <strong className="text-ink">{f.pct(pt.deja_detenu_pct)}</strong> de ton portefeuille en {a.ticker}{pt.via_fnb.length ? `, dont une partie via ${pt.via_fnb.map((v) => `${v.fonds} (${f.pct(v.poids_dans_fonds_pct)} du fonds au ${f.date(v.composition_au)})`).join(" et ")}` : ""}.</li>
              {parMesure["volatilite_annualisee"]?.statut === "ok" && <li>Risque en clair : son prix a varié d'environ <Prouve preuve={parMesure["volatilite_annualisee"]}>{f.pct(parMesure["volatilite_annualisee"].valeur, 0)}</Prouve> par an ; sa pire baisse passée a atteint <Prouve preuve={parMesure["pire_baisse"]}>{f.pct(parMesure["pire_baisse"]?.valeur?.baisse_pct, 0)}</Prouve>.</li>}
              {ref && <li className="flex flex-wrap items-start gap-2"><PuceNiveau niveau={ref.niveau} /> <span>{ref.clauses[0]?.explication ?? "Une position de 5 % respecterait toutes tes règles évaluées."}</span></li>}
              {parMesure["engouement"]?.statut === "ok" && <li><Terme cle="engouement">Attention</Terme> : {parMesure["engouement"].valeur.engouement ? <strong className="text-warn-700">inhabituelle</strong> : "habituelle"} (<Prouve preuve={parMesure["engouement"]}>{inhabituel(parMesure["engouement"].valeur.plus_inhabituel_que_pct_des_jours)}</Prouve>).</li>}
            </ul>
          </section>
        </Signale>)}

      <Panel className="p-6" id="section-ordre" aria-labelledby="ordre">
        <h2 id="ordre" className="font-display text-xl font-medium tracking-[-0.02em]">{t("action.preparer_ordre")}</h2>
        <p className="mt-1 text-sm text-ink-muted">Vérifié en direct contre tes règles, en code, sans LLM. Simulation : aucune transaction réelle.</p>
        <div className="mt-4">
          <p className="text-sm font-semibold">Montant (CAD)</p>
          <div className="mt-2"><Montant value={m > 0 ? m : null} onChange={(v) => setMontant(v == null ? "" : String(v))} suggestions={[500, 1000, 2500, 5000]} min={1} max={10_000_000} /></div>
          <p className="mt-2 min-h-4 text-xs text-ink-muted">{m > 0 && total ? `≈ ${f.pct((m / total) * 100)} de ton portefeuille` : ""}
            {cash != null && <> · liquidités disponibles : {f.cad(cash)}</>}
            {cash != null && m > cash && <span className="text-warn-700"> · au-delà de tes liquidités : l'ordre sera refusé tant que tu n'ajoutes pas de fonds (Mes placements)</span>}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Button variant="accent" size="lg" onClick={preparer} disabled={!(m > 0) || verif === "en_cours"}>{verif ? "Vérification…" : m > 0 ? `Vérifier et préparer l'ordre de ${f.cad(m)}` : "Vérifier et préparer l'ordre"}</Button>
          <Button variant="secondary" size="lg" onClick={ouvrirDossier}>{t("action.dossier")}</Button>
        </div>
        <div aria-live="polite" className="min-h-[40px]">
          {direct && m > 0 && (
            <div className={encadre ? "halo rounded-2xl bg-white p-4" : "py-1"} data-niveau={direct.niveau}>
              <p className="flex flex-wrap items-center gap-2"><PuceNiveau niveau={direct.niveau} /> <span className="text-xs text-ink-muted">vérification en direct, {f.nombre(direct.latence_ms ?? 0, 0)} ms</span></p>
              <ul className="mt-2 space-y-1 text-sm text-ink-soft">{direct.clauses.filter((c) => c.statut !== "respectee").slice(0, 3).map((c) => <li key={c.clause_id}>{c.explication}{c.deja_depassee_avant && !c.cause_par_intention ? " (déjà le cas avant cet ordre)" : ""}</li>)}</ul>
            </div>)}
          {confirme && (
            <div className="mt-3 rounded-2xl bg-canvas p-4"><p className="flex flex-wrap items-center gap-2 text-sm"><PuceNiveau niveau={confirme as Niveau} /> Ordre simulé prêt : {f.cad(m)} sur {ticker}.</p>
              <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => decider("confirmer", confirme)}>Enregistrer l'ordre simulé</Button><Button variant="ghost" onClick={() => setConfirme(null)}>Annuler</Button></div></div>)}
          {consigne && <Notice tone="good" className="mt-3">{consigne} <Link to={`/placements?p=${profil}`} className="font-semibold underline">Voir mes placements</Link></Notice>}
          {erreurOrdre && <Notice tone="bad" className="mt-3">{erreurOrdre} <Link to={`/placements?p=${profil}`} className="font-semibold underline">Ajouter des fonds</Link></Notice>}
        </div>
      </Panel>

      {pt?.esg && ad?.lentille_esg && (
        <Section id="esg" title={<span className="flex flex-wrap items-center gap-2"><Terme cle="esg">Lentille ESG</Terme> : ta clause « controverses » <PuceStatut statut={pt.esg.statut as any} /></span>}>
          <p className="text-sm leading-relaxed text-ink-soft">{pt.esg.explication}</p>
          <ul className="mt-3 space-y-2 text-sm">{data.preuves.filter((p) => pt.esg!.preuves.includes(p.id)).map((p) => <li key={p.id}><Etiquette e="DOCUMENTE" /><Prouve preuve={p}>{p.valeur.enonce}</Prouve> <span className="text-xs text-ink-muted">({p.valeur.source}, {f.date(p.valeur.publie_le)})</span></li>)}</ul>
          <Note>Aucune cote ESG propriétaire : preuves documentées et datées seulement (docs/donnees.md).</Note>
        </Section>)}

      <Recherche ticker={ticker} />

      <Panel className="p-6"><GraphiqueCours ticker={ticker} serie={data.serie} titre={`Cours de ${a.ticker}`} /></Panel>

      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tuiles.map(([k, lbl, p, show]) => (
          <Tile key={k} label={<Terme cle={k === "horizon" ? "horizon" : k}>{lbl}</Terme>}
            value={p ? (p.statut === "donnees_insuffisantes" ? <span className="text-base text-ink-muted">données insuffisantes</span> : <Prouve preuve={p}>{show(p)}</Prouve>) : "—"}
            hint={p?.periode ? `${f.date(p.periode.debut)} → ${f.date(p.periode.fin)}` : undefined} />))}
      </section>
      {!detail && <Note>Métriques détaillées (CVaR, risque récent) disponibles dans le dossier.</Note>}

      {pause && <PauseReflexion signal={pause} ticker={ticker} montant={m} ouvert={!!pause} fermer={() => setPause(null)}
        continuer={() => decider("continuer", "pause")} appliquerMontant={(x) => { setMontant(String(x)); setPause(null); }} ouvrirDossier={ouvrirDossier} />}
    </div>
  );
}

interface Depot { forme: string; date: string; objet: string | null; url: string }
interface Article { titre: string; source: string; date: string; url: string; reprises: number }

/** Official filings (SEC EDGAR) and press coverage (GDELT), up to the simulated date only. */
function Recherche({ ticker }: { ticker: string }) {
  const { asOf } = useApp();
  const { data, charge } = useData<{ depots: Preuve; articles: Preuve }>(`/marche/${encodeURIComponent(ticker)}/nouvelles`, { as_of: asOf });
  if (charge && !data) return <Chargement lignes={2} />;
  if (!data) return null;
  const { depots, articles } = data;
  return (
    <Section id="recherche" title="Sources officielles et presse" subtitle={`Jusqu'au ${f.date(asOf)} seulement : rien de ce qui a été publié après n'est montré.`}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Etiquette e="DOCUMENTE" /> Dépôts à la SEC</h3>
          {depots.statut !== "ok" ? <p className="mt-2 text-sm text-ink-muted">{depots.note}</p> : (depots.valeur.depots as Depot[]).length === 0 ? <p className="mt-2 text-sm text-ink-muted">Aucun dépôt sur les {String(depots.parametres.fenetre_jours)} jours précédents.</p> : (
            <ul className="mt-2 space-y-2 text-sm">{(depots.valeur.depots as Depot[]).map((x) => (
              <li key={x.url}><a href={x.url} target="_blank" rel="noreferrer noopener" className="font-medium text-ink hover:underline">{x.forme}</a> <span className="text-ink-muted">· {f.date(x.date)}{x.objet ? ` · ${x.objet}` : ""}</span></li>))}</ul>)}
          <Note>{depots.valeur?.lu_le ? `Lu à la source le ${new Date(depots.valeur.lu_le).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })}. ` : ""}{depots.reference}</Note>
        </Panel>
        <Panel>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Etiquette e="DOCUMENTE" /> Presse ({articles.statut === "ok" ? `${articles.valeur.n_articles} articles, ${articles.valeur.n_independants} nouvelles distinctes` : "indisponible"})</h3>
          {articles.statut !== "ok" ? <p className="mt-2 text-sm text-ink-muted">{articles.note}</p> : (
            <ul className="mt-2 space-y-2 text-sm">{(articles.valeur.articles as Article[]).map((x) => (
              <li key={x.url}><a href={x.url} target="_blank" rel="noreferrer noopener" className="text-ink hover:underline">{x.titre}</a>
                <span className="block text-xs text-ink-muted">{x.source} · {f.date(x.date)}{x.reprises > 1 ? ` · repris ${x.reprises} fois` : ""}</span></li>))}</ul>)}
          <Note>{articles.valeur?.lu_le ? `Lu à la source le ${new Date(articles.valeur.lu_le).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })}. ` : ""}{articles.note ?? ""} {articles.reference}</Note>
        </Panel>
      </div>
    </Section>
  );
}
