import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../state";

export function Demo() {
  const { toucher, config } = useApp();
  const nav = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const run = async (label: string, fn: () => Promise<unknown>) => { setOccupe(true); setMsg(`${label}…`); try { await fn(); setMsg(`${label} : terminé.`); toucher(); } catch (e) { setMsg(`${label} : ${(e as Error).message}`); } finally { setOccupe(false); } };
  const verificateur = async () => {
    const r = await api<{ id: string }>("/dossiers", { body: { profil: "robert", as_of: config?.as_of_defaut, llm: "simule_defaut", intention: { type: "ordre", ticker: "TSLA", montant_cad: 160000 } } });
    nav(`/dossier/${r.id}?p=robert`);
  };
  return (
    <div className="pile">
      <h1>Mode démo</h1>
      <p className="discret">Remet l'app dans un état connu et rejoue les scénarios de façon fiable (profils pré-remplis, Vigie exécutée au 14 novembre 2026).</p>
      <div className="actions">
        <button className="bouton principal" disabled={occupe} onClick={() => run("Réinitialisation", () => api("/demo/reinitialiser", { body: {} }))}>Réinitialiser la démo</button>
        <button className="bouton" disabled={occupe} onClick={() => run("Vigie", () => api("/vigie/executer", { body: {} }))}>Lancer la Vigie maintenant</button>
        <button className="bouton" disabled={occupe} onClick={() => run("Vigie rejouée au 15 décembre 2021", () => api("/vigie/executer", { body: { as_of: "2021-12-15" } }))}>Rejouer la Vigie au 15 déc. 2021</button>
      </div>
      {msg && <p role="status">{msg}</p>}
      <ol className="pile">
        <li><strong>Robert et un titre très médiatisé.</strong> <Link to="/tendances?p=robert">Tendances</Link> → le titre signalé par le détecteur → fiche (bandeau « Pour toi ») → ordre de 20 % → pause de réflexion → alternative → <Link to="/journal?p=robert">Journal</Link>.</li>
        <li><strong>Amira, mêmes clics.</strong> <Link to="/tendances?p=amira">Tendances</Link> → fiche → ordre : signal proportionné à ses propres règles (tech via FNB, crypto).</li>
        <li><strong>Mateo et l'ESG.</strong> <Link to="/titre/XOM?p=mateo">XOM</Link> (données insuffisantes, exclusion sectorielle documentée) et <Link to="/titre/ENB.TO?p=mateo">ENB</Link> (controverse citée).</li>
        <li><strong>Profil créé en direct.</strong> <Link to="/nouveau-profil">Créer « prudent, achat prochain »</Link> → l'app s'adapte immédiatement.</li>
        <li><strong>Machine à remonter le temps.</strong> <Link to="/titre/TSLA?p=robert&d=2021-12-15&montant=140000">Robert et TSLA au 15 décembre 2021</Link>, puis <Link to="/titre/TSLA?p=robert">ce qui a suivi</Link>. Contre-exemple honnête : <Link to="/titre/NVDA?p=robert&d=2022-12-15&montant=40000">Robert et NVDA au 15 décembre 2022</Link> (la prudence n'a pas « payé » : l'app ne prédit rien).</li>
        <li><strong>Le vérificateur en action.</strong> <button className="bouton lien" onClick={verificateur}>Lancer un dossier dont le premier brouillon contient un chiffre sans preuve</button> : rejet, défaut nommé, version corrigée.</li>
      </ol>
    </div>
  );
}
