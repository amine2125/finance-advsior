import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useApp, useData } from "../state";
import { Chargement, Erreur, Etiquette, Prouve, PuceNiveau, PuceStatut, Terme } from "../components/base";
import { Signale } from "../components/signal";
import { PauseReflexion } from "../components/pause";
import { GraphiqueCours } from "../charts/GraphiqueCours";
import * as f from "../format";
import type { Adaptation, Actif, Niveau, Preuve, Signal } from "../types";
import { SECTEURS, inhabituel } from "../libelles";

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
  const { profil, asOf, t } = useApp();
  const nav = useNavigate();
  const { data, erreur, charge, recharger } = useData<Fiche>(`/marche/${encodeURIComponent(ticker)}`, { profil, as_of: asOf });
  const [montant, setMontant] = useState<string>(sp.get("montant") ?? "");
  const [direct, setDirect] = useState<Signal | null>(null);
  const [verif, setVerif] = useState<"" | "en_cours">("");
  const [pause, setPause] = useState<Signal | null>(null);
  const [confirme, setConfirme] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const parMesure = useMemo(() => Object.fromEntries((data?.preuves ?? []).map((p) => [p.mesure + (p.mesure === "rendement_total_passe" ? `_${p.parametres.fenetre_annees}` : ""), p])), [data]);
  const m = Number(String(montant).replace(/\s/g, "").replace(",", "."));
  useEffect(() => { setDirect(null); setConfirme(null); }, [ticker, profil, asOf]);
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
    setVerif("en_cours");
    try {
      const s = await api<Signal>("/ordres/verifier", { body: { profil, ticker, montant_cad: m, as_of: asOf, options: true, journaliser: true } });
      setDirect(s);
      if (s.niveau === "pause") setPause(s); else setConfirme(s.niveau);
    } finally { setVerif(""); }
  };
  const decider = async (choix: string, niveau: string) => {
    await api("/ordres/decision", { body: { profil, ticker, montant_cad: m, as_of: asOf, choix, niveau } });
    setPause(null); setConfirme(null);
    window.alert(choix === "continuer" ? "Ordre simulé consigné dans le Journal (aucune transaction réelle)." : "Ordre simulé enregistré dans le Journal.");
  };
  const ref = pt?.signal_reference;
  const bandeSignal = ref ? { niveau: ref.niveau, titre: `Selon tes règles, pour une position de ${f.pct(ref.taille_reference_pct, 0)}`, regles_declenchees: ref.regles,
    clauses: ref.clauses.map((c, i) => ({ clause_id: `${c.type}-${i}`, type: c.type, libelle: c.type, origine: "dit" as const, importante: false, statut: c.statut as any,
      valeur_avant: null, valeur_apres: null, limite: null, unite: "%", explication: c.explication, preuves: [], incertain: false, cause_par_intention: true, deja_depassee_avant: false })) } : null;
  const detail = ad?.metriques_detaillees_visibles;
  const tuiles: [string, string, Preuve | undefined, (p: Preuve) => string, string?][] = [
    ["volatilite", "Volatilité sur 1 an", parMesure["volatilite_annualisee"], (p) => f.pct(p.valeur)],
    ["pire_baisse", "Pire baisse passée", parMesure["pire_baisse"], (p) => f.pct(p.valeur.baisse_pct)],
    ["horizon", `Pire période de ${pt?.horizon_annees ? Math.min(pt.horizon_annees, 5) : "?"} an(s)`, parMesure["pire_rendement_sur_horizon"], (p) => f.pct(p.valeur.pire_pct)],
    ["dividendes", "Dividendes sur 12 mois", parMesure["rendement_dividende_12m"], (p) => (p.statut === "ok" ? f.pct(p.valeur) : "non applicable")],
  ];
  if (detail) tuiles.push(["cvar", "Pertes extrêmes (CVaR 20 séances)", parMesure["cvar_historique"], (p) => f.pct(p.valeur.cvar_pct)],
    ["ewma", "Risque récent / risque sur 1 an", parMesure["ratio_risque_recent"], (p) => `${f.nombre(p.valeur, 2)} ×`]);
  return (
    <div className="pile">
      <div className="ligne entre">
        <div><h1 style={{ marginBottom: 4 }}>{a.name} ({a.ticker})</h1>
          <p className="discret" style={{ margin: 0 }}>{SECTEURS[a.sector] ?? a.sector} · {a.market} · cotation en {a.currency}</p></div>
        {prix && prix.statut === "ok" && <p style={{ margin: 0, textAlign: "right" }}><Prouve preuve={prix}><span className="chiffre-cle">{f.devise(prix.valeur.local, a.currency)}</span></Prouve><br />
          <span className="discret">{a.currency !== "CAD" ? `≈ ${f.devise(prix.valeur.cad, "CAD")} · ` : ""}clôture du {f.date(prix.date_de_calcul)}</span></p>}
      </div>
      {pt && (
        <Signale signal={bandeSignal} intention={{ type: "titre", ticker }}>
          <section className="panneau" aria-labelledby="pour-toi" style={{ marginBottom: 0 }}>
            <h2 id="pour-toi" style={{ fontSize: "var(--t-18)" }}>Pour toi</h2>
            <ul className="liste-simple">
              <li>Tu détiens déjà <strong>{f.pct(pt.deja_detenu_pct)}</strong> de ton portefeuille en {a.ticker}{pt.via_fnb.length ? `, dont une partie via ${pt.via_fnb.map((v) => `${v.fonds} (${f.pct(v.poids_dans_fonds_pct)} du fonds au ${f.date(v.composition_au)})`).join(" et ")}` : ""}.</li>
              {parMesure["volatilite_annualisee"]?.statut === "ok" && <li>Risque en clair : son prix a varié d'environ <Prouve preuve={parMesure["volatilite_annualisee"]}>{f.pct(parMesure["volatilite_annualisee"].valeur, 0)}</Prouve> par an ; sa pire baisse passée a atteint <Prouve preuve={parMesure["pire_baisse"]}>{f.pct(parMesure["pire_baisse"]?.valeur?.baisse_pct, 0)}</Prouve>.</li>}
              {ref && <li><PuceNiveau niveau={ref.niveau} /> {ref.clauses[0]?.explication ?? "Une position de 5 % respecterait toutes tes règles évaluées."}</li>}
              {parMesure["engouement"]?.statut === "ok" && <li><Terme cle="engouement">Attention</Terme> : {parMesure["engouement"].valeur.engouement ? <strong>inhabituelle</strong> : "habituelle"} (<Prouve preuve={parMesure["engouement"]}>{inhabituel(parMesure["engouement"].valeur.plus_inhabituel_que_pct_des_jours)}</Prouve>).</li>}
            </ul>
          </section>
        </Signale>)}
      {pt?.esg && (ad?.lentille_esg) && (
        <section className="panneau" aria-labelledby="esg">
          <h2 id="esg" style={{ fontSize: "var(--t-18)" }}><Terme cle="esg">Lentille ESG</Terme> : ta clause « controverses » <PuceStatut statut={pt.esg.statut as any} /></h2>
          <p>{pt.esg.explication}</p>
          <ul className="sans-puce pile">{data.preuves.filter((p) => pt.esg!.preuves.includes(p.id)).map((p) => <li key={p.id}><Etiquette e="DOCUMENTE" /><Prouve preuve={p}>{p.valeur.enonce}</Prouve> <span className="discret">({p.valeur.source}, {f.date(p.valeur.publie_le)})</span></li>)}</ul>
          <p className="source">Aucune cote ESG propriétaire : preuves documentées et datées seulement (docs/donnees.md).</p>
        </section>)}
      <section className="panneau"><GraphiqueCours ticker={ticker} serie={data.serie} titre={`Cours de ${a.ticker}`} /></section>
      <section className="grille-3" aria-label="Indicateurs">
        {tuiles.map(([k, lbl, p, show]) => (
          <div key={k} className="panneau cartouche"><span className="lbl"><Terme cle={k === "horizon" ? "horizon" : k}>{lbl}</Terme></span>
            <span className="v">{p ? (p.statut === "donnees_insuffisantes" ? <span className="discret">données insuffisantes</span> : <Prouve preuve={p}>{show(p)}</Prouve>) : "—"}</span>
            {p?.periode && <span className="discret">{f.date(p.periode.debut)} → {f.date(p.periode.fin)}</span>}</div>))}
      </section>
      {!detail && <p className="discret">Métriques détaillées (CVaR, risque récent) disponibles dans le dossier.</p>}
      <section className="panneau" aria-labelledby="ordre" id="section-ordre">
        <h2 id="ordre">{t("action.preparer_ordre")}</h2>
        <div className="ligne" style={{ alignItems: "flex-end" }}>
          <div className="champ" style={{ maxWidth: 260 }}>
            <label htmlFor="montant">Montant (CAD)</label>
            <input id="montant" name="montant" inputMode="decimal" autoComplete="off" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="ex. 20 000…" />
            <span className="aide">{m > 0 && total ? `≈ ${f.pct((m / total) * 100)} de ton portefeuille` : "Simulation : aucune transaction réelle."}</span>
          </div>
          <button className="bouton principal" onClick={preparer} disabled={!(m > 0) || verif === "en_cours"}>{verif ? "Vérification…" : "Vérifier et préparer l'ordre"}</button>
          <button className="bouton" onClick={ouvrirDossier}>{t("action.dossier")}</button>
        </div>
        <div aria-live="polite" style={{ marginTop: 12, minHeight: 40 }}>
          {direct && m > 0 && (
            <div className={direct.mode === "encadre" || direct.mode === "interruption" ? `panneau signale` : ""} data-niveau={direct.niveau}>
              <p style={{ margin: 0 }}><PuceNiveau niveau={direct.niveau} /> <span className="discret">vérification en direct, {f.nombre(direct.latence_ms ?? 0, 0)} ms</span></p>
              <ul className="liste-simple">{direct.clauses.filter((c) => c.statut !== "respectee").slice(0, 3).map((c) => <li key={c.clause_id}>{c.explication}{c.deja_depassee_avant && !c.cause_par_intention ? " (déjà le cas avant cet ordre)" : ""}</li>)}</ul>
            </div>)}
          {confirme && (
            <div className="panneau"><p><PuceNiveau niveau={confirme as Niveau} /> Ordre simulé prêt : {f.cad(m)} sur {ticker}.</p>
              <div className="actions"><button className="bouton principal" onClick={() => decider("confirmer", confirme)}>Enregistrer l'ordre simulé</button><button className="bouton" onClick={() => setConfirme(null)}>Annuler</button></div></div>)}
        </div>
      </section>
      {pause && <PauseReflexion signal={pause} ticker={ticker} montant={m} ouvert={!!pause} fermer={() => setPause(null)}
        continuer={() => decider("continuer", "pause")} appliquerMontant={(x) => { setMontant(String(x)); setPause(null); }} ouvrirDossier={ouvrirDossier} />}
    </div>
  );
}
