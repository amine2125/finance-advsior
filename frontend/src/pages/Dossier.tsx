import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../state";
import { Chargement, Erreur, Etiquette, PuceNiveau, PuceStatut } from "../components/base";
import * as f from "../format";
import type { Preuve, Signal } from "../types";

const ETAPES: Record<string, string> = { donnees: "Données", constats: "Constats", analyse: "Analyse", options: "Options", explication: "Explication" };
const NOMS: Record<string, string> = { contexte: "Contexte", planification: "Planification", outils: "Outils d'analyse", gouvernance: "Gouvernance", signal: "Politique de signal", redaction: "Rédaction", verification: "Vérification", publication: "Publication" };
const NUM = /[-−]?\d{1,3}(?:[\s  ]\d{3})+(?:,\d+)?|[-−]?\d+(?:,\d+)?/g;

export function DossierPage() {
  const { id = "" } = useParams();
  const { profil, ouvrirPreuve } = useApp();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try { const x = await api<any>(`/dossiers/${id}`); if (stop) return; setD(x); if (x.etat === "en_cours") window.setTimeout(tick, 400); }
      catch (e) { if (!stop) setErr((e as Error).message); }
    };
    tick();
    return () => { stop = true; };
  }, [id]);
  const preuves: Record<string, Preuve> = useMemo(() => d?.preuves ?? {}, [d]);
  if (err) return <Erreur message={err} />;
  if (!d) return <Chargement lignes={5} />;
  const etapes = d.etapes as { etape: string; statut: string; details?: any; duree_ms?: number }[];
  const outils = (etapes.find((e) => e.etape === "outils")?.details?.appels ?? d.progression_outils ?? []) as { libelle: string; statut: string }[];
  const it = d.intention;
  return (
    <div className="pile">
      <h1>Dossier de décision</h1>
      <p className="discret">{it.type === "ordre" ? `Ordre simulé de ${f.cad(it.montant_cad)} sur ${it.ticker}` : it.ticker ? `Titre ${it.ticker}` : "Portefeuille"} · date simulée {f.date(d.as_of)} · <code>{d.id}</code></p>
      <ol className="etapes" aria-label="Étapes du dossier">
        {etapes.map((e) => <li key={e.etape} className={e.statut === "termine" ? "fait" : e.statut === "en_cours" ? "encours" : ""}>{NOMS[e.etape]} {e.statut === "termine" ? "✓" : e.statut === "en_cours" ? "…" : e.statut === "rejet" ? "✕" : ""}</li>)}
      </ol>
      {outils.length > 0 && <p className="discret" aria-live="polite">{outils.map((o) => `${o.libelle} ${o.statut === "echec" ? "✕" : "✓"}`).join(" · ")}</p>}
      {d.etat === "en_cours" && <Chargement lignes={3} />}
      {d.etat === "echec" && <p className="erreur">Le dossier n'a pas pu être produit : {d.erreur}</p>}
      {d.etat === "termine" && <>
        <section className="panneau"><p className="essentiel" style={{ margin: 0 }}><PuceNiveau niveau={d.signal.niveau} /> {d.signal.titre}</p>
          <p className="discret">Niveau décidé par la politique écrite (règles {d.signal.regles_declenchees.join(", ")}). Texte rédigé par : {d.redaction.redige_par === "gabarit" ? "gabarit sans LLM" : d.redaction.redige_par}, puis vérifié phrase par phrase.</p></section>
        {d.redaction.sections.map((s: any) => (
          <section key={s.etape} className="panneau section-dossier" aria-labelledby={`s-${s.etape}`}>
            <h2 id={`s-${s.etape}`}>{ETAPES[s.etape]}</h2>
            {s.phrases.map((ph: any, i: number) => <Phrase key={i} texte={ph.texte} etiquette={ph.etiquette} ids={ph.preuves} preuves={preuves} ouvrir={ouvrirPreuve} />)}
          </section>))}
        {it.type === "ordre" && <Sensibilite intention={it} asOf={d.as_of} profilId={d.profil_id} />}
        <section className="panneau"><h2>Contrôles visibles</h2>
          <ul className="liste-simple">{d.gouvernance.controles.map((c: any) => <li key={c.code}>✓ {c.libelle}</li>)}</ul>
          {d.gouvernance.informations_manquantes.length > 0 && <><h3>Informations manquantes</h3><ul className="liste-simple">{d.gouvernance.informations_manquantes.map((m: any, i: number) => <li key={i}>{m.message}</li>)}</ul></>}
          {d.gouvernance.conflits.length > 0 && <><h3>Conflits entre règles</h3><ul className="liste-simple">{d.gouvernance.conflits.map((c: any) => <li key={c.code}>{c.message}</li>)}</ul></>}
        </section>
        <section className="panneau"><h2>Vérificateur</h2>
          <ul className="sans-puce pile">{d.essais_verification.map((e: any) => <li key={String(e.essai)}><strong>Essai {e.essai}</strong> ({e.redige_par}) : {e.resultat === "accepte" ? "accepté" : "rejeté"}
            {e.defauts_nommes?.length > 0 && <ul className="liste-simple">{e.defauts_nommes.map((x: string, i: number) => <li key={i}><code style={{ whiteSpace: "pre-wrap" }}>{x}</code></li>)}</ul>}</li>)}</ul>
          <p className="source">Durée : {f.nombre(d.duree_totale_ms / 1000, 1)} s · coût LLM estimé : {d.cout_estime_usd > 0 ? `${f.nombre(d.cout_estime_usd, 4)} $ US` : "nul (LLM simulé ou gabarit)"} · <Link to={`/journal?p=${profil}`}>Journal</Link></p>
          <details><summary>Trace complète (étapes, modules choisis, appels d'outils, preuves)</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(d.etapes, null, 1)}</pre></details>
        </section>
      </>}
    </div>
  );
}

function Phrase({ texte, etiquette, ids, preuves, ouvrir }: { texte: string; etiquette: string; ids: string[]; preuves: Record<string, Preuve>; ouvrir: (p: Preuve) => void }) {
  const cites = ids.map((i) => preuves[i]).filter(Boolean);
  const parts: (string | ReactElement)[] = [];
  let last = 0;
  for (const m of texte.matchAll(NUM)) {
    const idx = m.index ?? 0;
    if (/\d{4}-\d{2}-\d{2}/.test(texte.slice(Math.max(0, idx - 5), idx + 10))) continue;
    parts.push(texte.slice(last, idx));
    const tok = m[0];
    const cible = cites.find((p) => Object.values(p.affichage ?? {}).some((v) => v.includes(tok.replace(/\s/g, " ")) || v.replace(/\s/g, "").includes(tok.replace(/\s/g, "")))) ?? cites[0];
    parts.push(cible ? <button key={idx} className="prouve" onClick={() => ouvrir(cible)}>{tok}<span className="visuellement-cache"> (voir la preuve)</span></button> : tok);
    last = idx + tok.length;
  }
  parts.push(texte.slice(last));
  return <p className="phrase"><Etiquette e={etiquette} />{parts}{" "}
    {cites.length > 0 && <span className="discret">[{cites.map((p, i) => <button key={p.id} className="bouton lien" style={{ minHeight: 0 }} onClick={() => ouvrir(p)}>preuve {i + 1}</button>)}]</span>}</p>;
}

function Sensibilite({ intention, asOf, profilId }: { intention: any; asOf: string; profilId: string }) {
  const [montant, setMontant] = useState<number>(intention.montant_cad);
  const [horizon, setHorizon] = useState<number>(0);
  const [s, setS] = useState<Signal | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      api<Signal>("/ordres/verifier", { body: { profil: profilId, ticker: intention.ticker, montant_cad: montant, as_of: asOf, options: false, horizon_annees: horizon || undefined } }).then(setS).catch(() => setS(null));
    }, 200);
    return () => window.clearTimeout(t);
  }, [montant, horizon, intention.ticker, asOf, profilId]);
  return (
    <section className="panneau" aria-labelledby="sens"><h2 id="sens">Ce qui changerait le constat</h2>
      <div className="grille-2">
        <div className="champ"><label htmlFor="sm">Taille de la position : {f.cad(montant)}</label>
          <input id="sm" type="range" min={0} max={Math.max(intention.montant_cad * 1.5, 1000)} step={500} value={montant} onChange={(e) => setMontant(Number(e.target.value))} /></div>
        <div className="champ"><label htmlFor="sh">Horizon : {horizon ? `${horizon} an(s) (hypothèse)` : "celui de ton contrat"}</label>
          <input id="sh" type="range" min={0} max={10} step={1} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} /></div>
      </div>
      <div aria-live="polite">{s && <><p><PuceNiveau niveau={s.niveau} /> <span className="discret">recalculé en {f.nombre(s.latence_ms ?? 0, 0)} ms (règles {s.regles_declenchees.join(", ")})</span></p>
        <ul className="sans-puce pile">{s.clauses.filter((c) => c.statut !== "respectee").slice(0, 4).map((c) => <li key={c.clause_id}><PuceStatut statut={c.statut} /> {c.explication}</li>)}</ul></>}</div>
      <p className="source">Curseurs d'hypothèse : rien n'est enregistré dans ton contrat.</p>
    </section>
  );
}
