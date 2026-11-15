import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation, Link } from "react-router-dom";
import { AppProvider, useApp, useData } from "./state";
import { TiroirPreuve } from "./components/preuve";
import * as f from "./format";
import { Accueil } from "./pages/Accueil";
import { Chargement } from "./components/base";
const Marche = lazy(() => import("./pages/Marche").then((m) => ({ default: m.Marche })));
const Tendances = lazy(() => import("./pages/Tendances").then((m) => ({ default: m.Tendances })));
const Fiche = lazy(() => import("./pages/Fiche").then((m) => ({ default: m.Fiche })));
const Portefeuille = lazy(() => import("./pages/Portefeuille").then((m) => ({ default: m.Portefeuille })));
const Comparer = lazy(() => import("./pages/Comparer").then((m) => ({ default: m.Comparer })));
const Surveillance = lazy(() => import("./pages/Surveillance").then((m) => ({ default: m.Surveillance })));
const ContratPage = lazy(() => import("./pages/Contrat").then((m) => ({ default: m.ContratPage })));
const NouveauProfil = lazy(() => import("./pages/NouveauProfil").then((m) => ({ default: m.NouveauProfil })));
const Journal = lazy(() => import("./pages/Journal").then((m) => ({ default: m.Journal })));
const DossierPage = lazy(() => import("./pages/Dossier").then((m) => ({ default: m.DossierPage })));
const Fiabilite = lazy(() => import("./pages/Fiabilite").then((m) => ({ default: m.Fiabilite })));
const Demo = lazy(() => import("./pages/Demo").then((m) => ({ default: m.Demo })));

export function App() {
  return <AppProvider><Coquille /></AppProvider>;
}

const NAV = [["/", "nav.accueil"], ["/marche", "nav.marche"], ["/tendances", "nav.tendances"], ["/portefeuille", "nav.portefeuille"],
  ["/surveillance", "nav.surveillance"], ["/comparer", "nav.comparer"], ["/contrat", "nav.contrat"], ["/journal", "nav.journal"],
  ["/fiabilite", "nav.fiabilite"], ["/demo", "nav.demo"]] as const;

function Coquille() {
  const { t, config, profil, setProfil, asOf, setAsOf, enPassé, langue, setLangue } = useApp();
  const { data: profils } = useData<{ id: string; nom: string; tolerance: string }[]>("/profils");
  const { data: notes } = useData<{ notifications: { id: string; titre: string; niveau: string; lien: string; as_of: string }[] }>(`/profils/${profil}/notifications`);
  const [cloche, setCloche] = useState(false);
  const loc = useLocation();
  const suffixe = `?p=${profil}${enPassé ? `&d=${asOf}` : ""}`;
  useEffect(() => { document.getElementById("contenu")?.focus({ preventScroll: true }); setCloche(false); }, [loc.pathname]);
  const visibles = (notes?.notifications ?? []).filter((n) => n.as_of <= asOf);
  return (
    <div className="coquille">
      <header className="entete">
        <Link to={`/${suffixe}`} className="marque" aria-label="ULYSSE, accueil"><img src="/mat.svg" alt="" width={28} height={28} />ULYSSE</Link>
        <span className="espace" />
        <label className="controle-entete"><span className="lbl-entete">{t("app.profil")}</span>
          <select value={profil} onChange={(e) => setProfil(e.target.value)} aria-label={t("app.profil")}>
            {(profils ?? []).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </label>
        <label className="controle-entete"><span className="lbl-entete">{t("app.date")}</span>
          <input type="date" value={asOf} min="2016-06-01" max={config?.as_of_defaut} onChange={(e) => setAsOf(e.target.value && e.target.value !== config?.as_of_defaut ? e.target.value : null)} />
        </label>
        <label className="controle-entete"><span className="lbl-entete">{t("app.langue")}</span>
          <select value={langue} onChange={(e) => setLangue(e.target.value as "fr" | "en")}><option value="fr">Français</option><option value="en">English</option></select>
        </label>
        <div className="porteur-signal">
          <button className="bouton" aria-expanded={cloche} onClick={() => setCloche((v) => !v)} aria-label={`${t("app.notifications")} : ${visibles.length}`}>
            <span aria-hidden="true">🔔</span> {visibles.length}
          </button>
          {cloche && (
            <div className="panneau-signal" role="dialog" aria-label={t("app.notifications")}>
              <h2 style={{ fontSize: "var(--t-18)" }}>Vigie : notifications</h2>
              {visibles.length === 0 ? <p className="discret">Rien de nouveau. La Vigie ne parle que lorsqu'elle a quelque chose de pertinent.</p> : (
                <ul className="sans-puce pile">{visibles.slice(0, 8).map((n) => <li key={n.id}><span className={`puce ${n.niveau === "ok" ? "aucun" : n.niveau}`}>{n.niveau === "attention" ? "⚠" : n.niveau === "pause" ? "⛔" : "ℹ"}</span>{" "}
                  <Link to={`${n.lien}${suffixe}`}>{n.titre}</Link> <span className="discret">({f.date(n.as_of)})</span></li>)}</ul>)}
            </div>)}
        </div>
      </header>
      <div className={`bandeau ${enPassé ? "temps" : ""}`} role="status">
        <span><strong>{t("app.mention")}</strong></span>
        {config && <span>{t("app.donnees")} {f.date(enPassé ? asOf : config.donnees_jusqu_au)}.</span>}
        {enPassé && <><span>{t("app.temps", { date: f.date(asOf) })}</span><button className="bouton lien" onClick={() => setAsOf(null)}>{t("app.retour_present")}</button></>}
      </div>
      <div className="corps">
        <nav className="navigation" aria-label="Navigation principale">
          <ul>{NAV.map(([to, k]) => <li key={to}><NavLink to={`${to}${suffixe}`} end={to === "/"}>{t(k)}</NavLink></li>)}</ul>
        </nav>
        <main id="contenu" className="contenu" tabIndex={-1}>
          <Suspense fallback={<Chargement lignes={4} />}>
          <Routes>
            <Route path="/" element={<Accueil />} />
            <Route path="/marche" element={<Marche />} />
            <Route path="/tendances" element={<Tendances />} />
            <Route path="/titre/:ticker" element={<Fiche />} />
            <Route path="/portefeuille" element={<Portefeuille />} />
            <Route path="/comparer" element={<Comparer />} />
            <Route path="/surveillance" element={<Surveillance />} />
            <Route path="/contrat" element={<ContratPage />} />
            <Route path="/nouveau-profil" element={<NouveauProfil />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/dossier/:id" element={<DossierPage />} />
            <Route path="/fiabilite" element={<Fiabilite />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="*" element={<p>Page introuvable. <Link to={`/${suffixe}`}>Retour à l'accueil</Link></p>} />
          </Routes>
          </Suspense>
        </main>
      </div>
      <TiroirPreuve />
    </div>
  );
}
