import clsx from "clsx";
import { Bot, Check, Gavel, Scale, Send, ShieldAlert, TrendingUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AgentSteps, Badge, Button, Card, Disclaimer, ErrorBox, Explain, inputCls, Notice, PageTitle } from "../components/ui";
import { useApi, useJob } from "../hooks/useApi";
import { useApp } from "../hooks/useApp";
import { STATUS_FR } from "../lib/format";
import { api } from "../services/api";
import Markdown from "../components/Markdown";

const EXAMPLES = [
  "Mon portefeuille est-il assez diversifié ?",
  "Est-ce que je devrais investir 1 000 $ dans NVIDIA ?",
  "Tout le monde parle de Bitcoin. Si j'ajoute 2 000 $, est-ce compatible avec mon profil ?",
  "Où va NVIDIA dans 12 mois ?",
  "Comment mon portefeuille se compare-t-il au marché ?",
];

type Msg = { role: "user" | "assistant"; text: string; meta?: any };

export default function Assistant() {
  const { me, portfolio } = useApp();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"chat" | "debate">(params.get("debate") ? "debate" : "chat");
  const sys = useApi<any>("/system/info");
  return (
    <div>
      <PageTitle title="Assistant" subtitle="Posez vos questions en français. L'assistant connaît votre profil et vos placements : chaque chiffre de sa réponse est vérifié avant affichage." />
      <div className="mb-5 inline-flex rounded-xl bg-slate-100 p-1">
        {([["chat", "Discuter"], ["debate", "Débat des IA"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx("rounded-lg px-4 py-2 text-sm font-medium transition", tab === k ? "bg-white text-slate-900 shadow-card" : "text-slate-600 hover:text-slate-900")}>{l}</button>
        ))}
      </div>
      {sys.data && !sys.data.llm_ready && (
        <Notice tone="warn" className="mb-5" title="L'IA générative n'est pas connectée sur ce serveur">
          {sys.data.llm_status}. La vérification « Investir » et l'analyse de votre portefeuille fonctionnent sans elle. Pour activer l'assistant et le débat, configurez Amazon Bedrock (voir le README).
        </Notice>
      )}
      {!portfolio ? <Notice>Ajoutez d'abord des placements dans « Mon portefeuille » : l'assistant raisonne sur vos placements et votre profil.</Notice>
        : tab === "chat" ? <Chat portfolioId={portfolio.portfolio_id} personaId={me!.profile.persona_id} /> : <Debate portfolioId={portfolio.portfolio_id} personaId={me!.profile.persona_id} />}
      <div className="mt-6"><Disclaimer /></div>
    </div>
  );
}

function Chat({ portfolioId, personaId }: { portfolioId: string; personaId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [conv, setConv] = useState<string | null>(null);
  const { job, running, error, start } = useJob();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, job]);

  const send = async (text?: string) => {
    const m = (text ?? input).trim();
    if (!m || running) return;
    setInput("");
    setMsgs((x) => [...x, { role: "user", text: m }]);
    const j = await start("/agents/chat", { message: m, portfolio_id: portfolioId, persona_id: personaId, conversation_id: conv });
    if (j?.status === "done" && j.result) {
      setConv(j.result.conversation_id);
      setMsgs((x) => [...x, { role: "assistant", text: j.result.answer, meta: j.result }]);
    }
  };

  return (
    <Card className="flex min-h-[60vh] flex-col" pad={false}>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {!msgs.length && (
          <div className="py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Bot className="h-5 w-5 text-brand-600" /> Quelques idées de questions</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-left text-sm text-slate-700 hover:border-brand-300 hover:bg-brand-50">{e}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={m.role === "user" ? "max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm text-white" : "max-w-[92%] rounded-2xl rounded-bl-md bg-slate-50 px-4 py-3 text-sm text-slate-800 ring-1 ring-slate-200"}>
              {m.role === "user" ? m.text : <Markdown text={m.text} />}
              {m.meta?.biases?.map((b: any) => (
                <div key={b.bias} className="mt-2 rounded-xl bg-violet-50 p-2.5 text-xs text-violet-900"><b>{b.label}</b> — {b.pattern_description} {b.educational_response}</div>
              ))}
              {m.meta?.corrections?.length > 0 && <div className="mt-2 text-xs text-amber-700">Vérification avant réponse : une phrase non traçable a été corrigée.</div>}
              {m.meta?.data_as_of && <div className="mt-2 text-[11px] text-slate-400">Données au {m.meta.data_as_of}{m.meta.usage ? ` · ${m.meta.usage.calls} appel(s) Amazon Bedrock` : ""}</div>}
            </div>
          </div>
        ))}
        {running && <div className="max-w-md rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"><AgentSteps steps={job?.steps || []} /></div>}
        <ErrorBox error={error} />
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 border-t border-slate-100 p-4">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Écrivez votre question…" className={inputCls} data-testid="chat-input" />
        <Button type="submit" disabled={running || !input.trim()} aria-label="Envoyer"><Send className="h-4 w-4" /></Button>
      </form>
    </Card>
  );
}

function Debate({ portfolioId, personaId }: { portfolioId: string; personaId: string }) {
  const assets = useApi<any>("/assets");
  const [params] = useSearchParams();
  const [question, setQuestion] = useState("");
  const [asset, setAsset] = useState(params.get("asset") || "");
  const [amount, setAmount] = useState(params.get("amount") || "2000");
  const [d, setD] = useState<any>(null);
  const { job, running, error, start } = useJob();
  const run = async () => {
    setD(null);
    const j = await start("/agents/debate", { portfolio_id: portfolioId, persona_id: personaId, question: question || null, asset_id: asset || null, amount_cad: asset ? +amount : null, rounds: 2 });
    if (j?.status === "done" && j.result_ref) setD(await api.get(`/agents/debate/${j.result_ref}`));
  };
  const checks: Record<string, any> = {};
  if (d) for (const r of ["round1", "round2"]) for (const c of d.verification?.[r]?.checked_claims || []) checks[c.claim_id] = c;
  const dec = d?.decision;

  return (
    <div className="space-y-5">
      <Card title="Comment ça marche" subtitle="Deux IA indépendantes reçoivent exactement les mêmes chiffres. L'une cherche les opportunités, l'autre les risques; elles se répondent (2 tours). Un agent vérificateur contrôle chaque chiffre cité, puis un Superviseur rédige la conclusion — sur l'analyse, jamais un ordre d'achat.">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_130px]">
          <input className={inputCls} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Votre question (facultatif) — ex. mon portefeuille est-il trop concentré ?" />
          <select className={inputCls} value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Placement à évaluer">
            <option value="">Mon portefeuille seulement</option>
            {(assets.data?.assets || []).map((a: any) => <option key={a.asset_id} value={a.asset_id}>Ajouter {a.asset_id} – {a.name}</option>)}
          </select>
          {asset && <div className="flex items-center gap-1.5"><input type="number" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Montant" /><span className="text-sm text-slate-500">$</span></div>}
        </div>
        <Button className="mt-4" onClick={run} disabled={running}><Scale className="h-4 w-4" /> {running ? "Débat en cours…" : "Lancer le débat"}</Button>
        {(running || (job && !d)) && <div className="mt-5 rounded-xl bg-slate-50 p-4"><AgentSteps steps={job?.steps || []} /></div>}
        <div className="mt-3"><ErrorBox error={error} /></div>
      </Card>

      {d && (
        <div className="space-y-5" data-testid="debate-result">
          <Card>
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700"><Gavel className="h-4 w-4" /> Conclusion du Superviseur</div>
            <div className="mt-2 flex flex-wrap items-center gap-2"><Badge tone={dec.final_assessment.status === "insufficient-data" ? "neutral" : dec.final_assessment.status.includes("conflict") ? "bad" : "info"}>{STATUS_FR[dec.final_assessment.status] || dec.final_assessment.status}</Badge></div>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">{dec.final_assessment.headline}</h3>
            {dec.final_assessment.conclusion && <p className="mt-2 text-[15px] leading-relaxed text-slate-700">{dec.final_assessment.conclusion}</p>}
            {dec.findings?.length > 0 && <ul className="mt-3 space-y-1 text-sm text-slate-700">{dec.findings.map((f: any, i: number) => <li key={i}>• {f.text}</li>)}</ul>}
            {dec.persona_summary && <p className="mt-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900"><b>Votre profil :</b> {dec.persona_summary}</p>}
            {dec.next_step && <p className="mt-3 text-sm text-slate-600"><b>Prochaine étape suggérée :</b> {dec.next_step}</p>}
            <Explain label="Limites et sources">{(dec.limitations || []).join(" · ")} — Question évaluée : « {d.question} ». Données au {d.data_as_of}. {d.llm_usage?.llm_calls} appels Amazon Bedrock ({(d.llm_usage?.models || []).join(", ")}).</Explain>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Side title="L'IA Opportunités" icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} r1={d.arguments.round1.opp} r2={d.arguments.round2.opp} checks={checks} />
            <Side title="L'IA Risques" icon={<ShieldAlert className="h-4 w-4 text-rose-600" />} r1={d.arguments.round1.risk} r2={d.arguments.round2.risk} checks={checks} />
          </div>
          {dec.rejected_or_unverified_claims?.length > 0 && (
            <Card title="Affirmations écartées par la vérification" subtitle="Ce qui ne pouvait pas être relié à un calcul ou une source">
              <ul className="space-y-2 text-sm">{dec.rejected_or_unverified_claims.map((r: any) => <li key={r.claim_id} className="text-slate-700"><span className="line-through decoration-rose-400">{r.text}</span> <span className="text-xs text-rose-600">— {r.reasons.join(" · ")}</span></li>)}</ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Side({ title, icon, r1, r2, checks }: { title: string; icon: React.ReactNode; r1: any; r2: any; checks: Record<string, any> }) {
  const [round, setRound] = useState<1 | 2>(r2 ? 2 : 1);
  const a = round === 2 && r2 ? r2 : r1;
  return (
    <Card title={<span className="flex items-center gap-2">{icon}{title}</span>}
      action={<div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">{[1, 2].map((n) => <button key={n} disabled={n === 2 && !r2} onClick={() => setRound(n as 1 | 2)} className={clsx("rounded-md px-2.5 py-1", round === n ? "bg-white shadow-card" : "text-slate-500 disabled:opacity-40")}>{n === 1 ? "Ouverture" : "Réponse"}</button>)}</div>}>
      {!a ? <p className="text-sm text-slate-500">Argument indisponible (l'appel au modèle a échoué).</p> : (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-700">{a.position}</p>
          <ul className="space-y-2">
            {a.claims.map((c: any) => {
              const ck = checks[c.claim_id];
              return (
                <li key={c.claim_id} className={clsx("rounded-xl p-3 text-sm", ck?.accepted === false ? "bg-rose-50" : "bg-slate-50")}>
                  <div className="flex items-start gap-2">
                    {ck ? (ck.accepted ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />) : null}
                    <span className={clsx("text-slate-800", ck?.accepted === false && "line-through decoration-rose-400")}>{c.text}</span>
                  </div>
                  {ck?.accepted === false && <div className="mt-1 pl-6 text-xs text-rose-700">{ck.reasons.join(" · ")}</div>}
                </li>
              );
            })}
          </ul>
          {a.counterarguments?.length > 0 && <p className="text-xs text-slate-500"><b>Contre-arguments reconnus :</b> {a.counterarguments.join(" · ")}</p>}
        </div>
      )}
    </Card>
  );
}
