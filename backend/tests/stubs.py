"""TEST-ONLY scripted LLM stub. Never used outside pytest; it lets CI exercise orchestration and governance
without calling Amazon Bedrock. Its outputs copy numbers from the evidence packet it receives, like a compliant agent would."""
from __future__ import annotations

import json
import re
import threading


class ScriptedLLM:
    LABEL = "TEST STUB – NOT A REAL MODEL"

    def __init__(self, supervisor_first_bad: bool = True, fail_agents: set[str] | None = None):
        self.calls: list[dict] = []
        self.supervisor_first_bad = supervisor_first_bad
        self.fail_agents = fail_agents or set()
        self._lock = threading.Lock()

    @staticmethod
    def _metrics(text: str) -> dict[str, str]:
        out = {}
        for line in text.splitlines():
            m = re.match(r"^((?:pf|persona|asset|hyp|alt|bench|test)\.[^ |]+) \| [^|]+ \| ([^\[]+?)(?: \[|$)", line.strip())
            if m:
                out[m.group(1)] = m.group(2).strip()
        return out

    def converse(self, *, system, messages, model_id, max_tokens, temperature=0.2, tool_config=None, agent_id=""):
        user = "".join(c.get("text", "") for m in messages for c in m["content"] if isinstance(c, dict) and "text" in c)
        with self._lock:
            self.calls.append({"agent_id": agent_id, "system": system[:60], "user": user, "model_id": model_id})
            n_sup = sum(1 for c in self.calls if c["agent_id"].startswith("supervisor"))
        if any(agent_id.startswith(a) for a in self.fail_agents):
            raise RuntimeError("stub failure")
        m = self._metrics(user)
        weights = {k: v for k, v in m.items() if k.startswith("pf.weight.")}
        top = max(weights, key=lambda k: float(weights[k].replace(" %", "").replace(",", ".").replace(" ", ""))) if weights else None
        if agent_id.startswith(("opportunity_agent", "risk_agent")):
            claims = []
            if top:
                claims.append({"text": f"{top.split('.')[-1]} représente {weights[top]} du portefeuille.", "claim_type": "fact", "metric_ids": [top]})
            if "pf.vol" in m:
                claims.append({"text": f"La volatilité historique est de {m['pf.vol']}.", "claim_type": "fact", "metric_ids": ["pf.vol"]})
            claims.append({"text": "Une exposition concentrée peut amplifier les pertes lors d'un choc sectoriel.", "claim_type": "interpretation"})
            data = {"position": ("Thèse positive étayée" if agent_id.startswith("opportunity") else "Risque de concentration étayé"),
                    "claims": claims, "assumptions": ["costs omitted"], "counterarguments": [], "uncertainties": ["corrélations instables"],
                    "proposed_followup_tests": [{"test": "stress_shock", "params": {"preset": "tech_crash_30"}, "why": "test"}]}
        elif agent_id.startswith("persona_agent"):
            data = {"narrative": "Le profil impose des plafonds.", "opportunity_fit": "partiel", "risk_fit": "cohérent",
                    "incompatible_assumptions": [], "uncertainties": [], "metric_ids": []}
        elif agent_id.startswith("supervisor"):
            allowed = re.search(r"STATUTS PERMIS \(règle déterministe 8A.9\): \[([^\]]*)\]", user)
            statuses = [x.strip(" '\"") for x in allowed.group(1).split(",")] if allowed else ["research-inconclusive"]
            bad = self.supervisor_first_bad and n_sup == 1
            vf = [{"text": f"Poids principal : {weights[top]}.", "metric_ids": [top]}] if top else []
            data = {"headline": "Concentration étayée" + (" et le titre va monter" if bad else ""),
                    "verified_findings": vf + ([{"text": "Rendement de 900 % sur la période.", "metric_ids": ["pf.fake"]}] if bad else []),
                    "opportunity_summary": "o", "risk_summary": "r", "persona_summary": "p", "accepted_claim_ids": [], "rejected_claim_ids": [],
                    "conflicts": [], "status": ("research-supported" if bad else statuses[0]), "conclusion": "Conclusion analytique.",
                    "status_reason": "règle", "scenario_options": [{"title": "Choc tech", "description": "d", "preset": "tech_crash_30"}],
                    "limitations": ["l"], "next_step": "Comparer les alternatives.", "hype_attention_assessment": None, "persona_hype_fit": None}
        elif agent_id.startswith("market_intelligence"):
            data = {"claims": []}
        else:
            text = "Réponse de test."
            return {"text": text, "content": [{"text": text}], "usage": {"input_tokens": 1, "output_tokens": 1, "model_id": model_id},
                    "stop_reason": "end_turn", "message": {"role": "assistant", "content": [{"text": text}]}}
        text = json.dumps(data, ensure_ascii=False)
        return {"text": text, "content": [{"text": text}], "usage": {"input_tokens": len(user) // 4, "output_tokens": len(text) // 4,
                                                                      "model_id": model_id, "agent_id": agent_id},
                "stop_reason": "end_turn", "message": {"role": "assistant", "content": [{"text": text}]}}
