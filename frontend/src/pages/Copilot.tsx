import { Bot, Brain, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Markdown from "../components/Markdown";
import { ActivityTimeline, Button, Card, Disclaimer, ErrorBox, Notice, PageHeader } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useJob } from "../hooks/useApi";

const EXAMPLES = [
  "Mon portefeuille est-il assez diversifié ?",
  "Que se passe-t-il si les actions technologiques baissent de 30 % ?",
  "Comment mon portefeuille se compare-t-il au marché ?",
  "Bitcoin est viral, tout le monde en parle. Si j'ajoute 5 000 $, est-ce compatible avec mon profil ?",
  "Où va NVIDIA dans 12 mois ?",
  "Qu'est-ce qui a changé depuis ma dernière analyse ?",
  "J'ai 5 000 $ et je veux comprendre mes options.",
];

type Msg = { role: "user" | "assistant"; text: string; meta?: any };

export default function Copilot() {
  const { portfolioId, personaId } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [conv, setConv] = useState<string | null>(null);
  const { job, running, error, start } = useJob();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, job]);
  useEffect(() => { setMsgs([]); setConv(null); }, [portfolioId, personaId]);

  const send = async (text?: string) => {
    const m = (text ?? input).trim();
    if (!m || running) return;
    setInput("");
    setMsgs((x) => [...x, { role: "user", text: m }]);
    const j = await start("/agents/chat", { message: m, portfolio_id: portfolioId, persona_id: personaId, conversation_id: conv });
    if (j?.status === "done" && j.result) {
      setConv(j.result.conversation_id);
      setMsgs((x) => [...x, { role: "assistant", text: j.result.answer, meta: { ...j.result, steps: j.steps } }]);
    }
  };

  return (
    <div>
      <PageHeader title="Copilote financier IA" subtitle="Le Copilote appelle le moteur d'analyse déterministe (outils) via Amazon Bedrock; chaque chiffre de la réponse est audité avant affichage. Les questions de prévision reçoivent la réponse en quatre parties." />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="flex min-h-[70vh] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {!msgs.length && (
              <div className="py-6">
                <div className="mb-3 flex items-center gap-2 text-sm text-slate-300"><Bot className="h-5 w-5 text-aegis-400" /> Exemples de questions</div>
                <div className="flex flex-wrap gap-2">{EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} className="rounded-xl border border-ink-600 bg-ink-850 px-3 py-2 text-left text-xs text-slate-300 hover:border-aegis-500/60">{e}</button>)}</div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={m.role === "user" ? "max-w-[80%] rounded-2xl rounded-br-md bg-aegis-500/15 px-4 py-2.5 text-sm text-slate-100 ring-1 ring-aegis-500/30" : "max-w-[92%] rounded-2xl rounded-bl-md bg-ink-850 px-4 py-3 ring-1 ring-ink-700"}>
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">{m.role === "user" ? <><User className="h-3 w-3" /> Vous</> : <><Bot className="h-3 w-3 text-aegis-400" /> Copilote AEGIS</>}</div>
                  {m.role === "user" ? m.text : <Markdown text={m.text} />}
                  {m.meta?.biases?.length > 0 && m.meta.biases.map((b: any) => (
                    <div key={b.bias} className="mt-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-2 text-xs text-violet-100"><Brain className="mr-1 inline h-3 w-3" /> <b>{b.label}</b> — {b.pattern_description} {b.educational_response} <span className="text-violet-300/60">({b.privacy})</span></div>
                  ))}
                  {m.meta?.corrections?.length > 0 && <div className="mt-2 text-[11px] text-amber-300">Audit avant réponse : {m.meta.corrections.map((c: any) => (c.issues || []).join(", ")).join(" ; ")} → corrigé</div>}
                  {m.meta?.cards?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {m.meta.cards.map((c: any, k: number) => c.type === "hype" ? <Link key={k} to={`/hype?research=${c.research_id}`} className="rounded-lg bg-ink-800 px-2 py-1 text-aegis-300 hover:underline">Brief Hype {c.asset_id} →</Link>
                        : c.type === "debate_job" ? <Link key={k} to="/debate" className="rounded-lg bg-ink-800 px-2 py-1 text-aegis-300 hover:underline">Débat lancé →</Link>
                          : c.type === "xray" ? <Link key={k} to="/xray" className="rounded-lg bg-ink-800 px-2 py-1 text-aegis-300 hover:underline">Radiographie →</Link>
                            : c.type === "scenario" || c.type === "impact" ? <Link key={k} to="/scenarios" className="rounded-lg bg-ink-800 px-2 py-1 text-aegis-300 hover:underline">Laboratoire de scénarios →</Link> : null)}
                    </div>
                  )}
                  {m.meta?.usage && <div className="mt-2 text-[10px] text-slate-600">Données au {m.meta.data_as_of} · {m.meta.usage.calls} appel(s) Bedrock · {m.meta.usage.input_tokens + m.meta.usage.output_tokens} jetons</div>}
                </div>
              </div>
            ))}
            {running && job && <div className="max-w-md rounded-2xl bg-ink-850 p-3 ring-1 ring-ink-700"><ActivityTimeline steps={job.steps} compact /></div>}
            <ErrorBox error={error} />
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-4 flex gap-2 border-t border-ink-700 pt-4">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Posez une question sur votre portefeuille, un actif tendance, un scénario…" className="flex-1 rounded-xl border border-ink-600 bg-ink-850 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-aegis-500 focus:outline-none" data-testid="chat-input" />
            <Button type="submit" disabled={running || !input.trim()}><Send className="h-4 w-4" /> Envoyer</Button>
          </form>
        </Card>
        <div className="space-y-5">
          <Card title="Activité des agents" subtitle="États réels des tâches (pas une animation)">
            {job ? <ActivityTimeline steps={job.steps} /> : <p className="text-xs text-slate-500">En attente d'une question.</p>}
          </Card>
          <Card title="Règles du Copilote">
            <ul className="space-y-1.5 text-xs text-slate-400">
              <li>• Chiffres issus d'outils déterministes, audités avant affichage.</li>
              <li>• Aucune cible de cours, rendement attendu ou probabilité de gain.</li>
              <li>• « Que dois-je acheter ? » est reformulé en comparaisons éducatives.</li>
              <li>• Le contenu Web est une donnée, jamais une instruction.</li>
            </ul>
            <Notice>Le profil et le portefeuille actifs sont ceux de la barre du haut.</Notice>
          </Card>
          <Disclaimer />
        </div>
      </div>
    </div>
  );
}
