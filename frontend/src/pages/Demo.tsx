import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAssistant } from "../components/Assistant";
import { Stagger, StaggerItem } from "../components/motion";
import { Button, Notice, PageTitle, TextButton } from "../components/ui";
import { useApp } from "../state";

const lien = "font-medium text-primary-600 hover:underline";

export function Demo() {
  const { toucher, config, setProfil } = useApp();
  const { envoyer } = useAssistant();
  const nav = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const run = async (label: string, fn: () => Promise<unknown>) => { setOccupe(true); setMsg(`${label}…`); try { await fn(); setMsg(`${label} : terminé.`); toucher(); } catch (e) { setMsg(`${label} : ${(e as Error).message}`); } finally { setOccupe(false); } };
  const verificateur = async () => {
    const r = await api<{ id: string }>("/dossiers", { body: { profil: "robert", as_of: config?.as_of_defaut, llm: "simule_defaut", intention: { type: "ordre", ticker: "TSLA", montant_cad: 160000 } } });
    nav(`/dossier/${r.id}?p=robert`);
  };
  const scenarios = [
    <><strong>Robert et un titre très médiatisé.</strong> <Link className={lien} to="/tendances?p=robert">Tendances</Link> → le titre signalé par le détecteur → fiche (« Pour toi ») → ordre de 20 % → pause de réflexion → alternative → <Link className={lien} to="/journal?p=robert">Journal</Link>.</>,
    <><strong>Amira, mêmes clics.</strong> <Link className={lien} to="/tendances?p=amira">Tendances</Link> → fiche → ordre : signal proportionné à ses propres règles (tech via FNB, crypto).</>,
    <><strong>Mateo et l'ESG.</strong> <Link className={lien} to="/titre/XOM?p=mateo">XOM</Link> (données insuffisantes, exclusion sectorielle documentée) et <Link className={lien} to="/titre/ENB.TO?p=mateo">ENB</Link> (controverse citée).</>,
    <><strong>Profil créé en direct.</strong> <Link className={lien} to="/nouveau-profil">Créer « prudent, achat prochain »</Link> → l'app s'adapte immédiatement.</>,
    <><strong>Machine à remonter le temps.</strong> <Link className={lien} to="/titre/TSLA?p=robert&d=2021-12-15&montant=140000">Robert et TSLA au 15 décembre 2021</Link>, puis <Link className={lien} to="/titre/TSLA?p=robert">ce qui a suivi</Link>. Contre-exemple honnête : <Link className={lien} to="/titre/NVDA?p=robert&d=2022-12-15&montant=40000">Robert et NVDA au 15 décembre 2022</Link> (la prudence n'a pas « payé » : l'app ne prédit rien).</>,
    <><strong>Le vérificateur en action.</strong> <TextButton onClick={verificateur}>Lancer un dossier dont le premier brouillon contient un chiffre sans preuve</TextButton> : rejet, défaut nommé, version corrigée.</>,
    <><strong>L'assistant encadré.</strong> <TextButton onClick={() => { setProfil("robert"); envoyer("Est-ce que je devrais mettre 160 000 $ dans Tesla ?"); }}>Robert demande « Est-ce que je devrais mettre 160 000 $ dans Tesla ? »</TextButton> : pas de recommandation, le même niveau que le Mât, chaque chiffre prouvé.</>,
  ];
  return (
    <div className="mx-auto max-w-[920px]">
      <PageTitle title="Mode démo" subtitle="Remet l'app dans un état connu et rejoue les scénarios de façon fiable (profils pré-remplis, Vigie exécutée au 14 novembre 2026)." />
      <div className="flex flex-wrap gap-2">
        <Button variant="accent" disabled={occupe} onClick={() => run("Réinitialisation", () => api("/demo/reinitialiser", { body: {} }))}>Réinitialiser la démo</Button>
        <Button variant="secondary" disabled={occupe} onClick={() => run("Vigie", () => api("/vigie/executer", { body: {} }))}>Lancer la Vigie maintenant</Button>
        <Button variant="secondary" disabled={occupe} onClick={() => run("Vigie rejouée au 15 décembre 2021", () => api("/vigie/executer", { body: { as_of: "2021-12-15" } }))}>Rejouer la Vigie au 15 déc. 2021</Button>
      </div>
      {msg && <Notice tone="info" role="status" className="mt-4">{msg}</Notice>}
      <Stagger as="ol" className="mt-8 space-y-3">
        {scenarios.map((s, i) => (
          <StaggerItem key={i} className="flex gap-4 rounded-2xl bg-white p-4 text-sm leading-relaxed text-ink-soft shadow-card">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{i + 1}</span><div className="min-w-0">{s}</div>
          </StaggerItem>))}
      </Stagger>
    </div>
  );
}
