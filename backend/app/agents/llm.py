"""Amazon Bedrock Converse client with token budgets, timeouts, usage accounting and structured-output parsing."""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from typing import Any, Protocol

from ..config import get_settings

log = logging.getLogger("aegis.llm")


class LLMError(RuntimeError):
    pass


class LLMClient(Protocol):
    def converse(self, *, system: str, messages: list[dict], model_id: str, max_tokens: int, temperature: float = 0.2,
                 tool_config: dict | None = None, agent_id: str = "") -> dict: ...


class BedrockLLM:
    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        s = get_settings()
        self._client = boto3.client("bedrock-runtime", region_name=s.bedrock_region,
                                    config=Config(read_timeout=s.llm_timeout_s, connect_timeout=10,
                                                  retries={"max_attempts": 3, "mode": "adaptive"}))
        self.calls: list[dict] = []
        self._lock = threading.Lock()

    def converse(self, *, system: str, messages: list[dict], model_id: str, max_tokens: int, temperature: float = 0.2,
                 tool_config: dict | None = None, agent_id: str = "") -> dict:
        kwargs: dict[str, Any] = {"modelId": model_id, "system": [{"text": system}], "messages": messages,
                                  "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature}}
        if tool_config:
            kwargs["toolConfig"] = tool_config
        t0 = time.time()
        try:
            resp = self._client.converse(**kwargs)
        except Exception as exc:  # noqa: BLE001
            raise LLMError(f"Bedrock converse failed ({model_id}): {exc.__class__.__name__}: {str(exc)[:200]}") from exc
        latency = int((time.time() - t0) * 1000)
        usage = resp.get("usage", {})
        content = resp["output"]["message"]["content"]
        text = "".join(c.get("text", "") for c in content if "text" in c)
        rec = {"agent_id": agent_id, "model_id": model_id, "input_tokens": usage.get("inputTokens", 0),
               "output_tokens": usage.get("outputTokens", 0), "latency_ms": latency, "stop_reason": resp.get("stopReason")}
        with self._lock:
            self.calls.append(rec)
        # CloudWatch Embedded Metric Format: token usage and latency per agent
        log.info(json.dumps({"_aws": {"Timestamp": int(time.time() * 1000), "CloudWatchMetrics": [{
            "Namespace": "AEGIS/Agents", "Dimensions": [["agent_id"]],
            "Metrics": [{"Name": "InputTokens", "Unit": "Count"}, {"Name": "OutputTokens", "Unit": "Count"},
                        {"Name": "LatencyMs", "Unit": "Milliseconds"}]}]},
            "agent_id": agent_id or "unknown", "InputTokens": rec["input_tokens"], "OutputTokens": rec["output_tokens"],
            "LatencyMs": latency, "model_id": model_id}))
        return {"text": text, "content": content, "usage": rec, "stop_reason": resp.get("stopReason"),
                "message": resp["output"]["message"]}


_llm: LLMClient | None = None


def get_llm() -> LLMClient | None:
    global _llm
    if not get_settings().llm_enabled:
        return None
    if _llm is None:
        _llm = BedrockLLM()
    return _llm


def set_llm(client: LLMClient | None) -> None:
    """Test hook: inject a clearly labeled stub client."""
    global _llm
    _llm = client


def parse_json(text: str) -> dict:
    t = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", t, re.DOTALL)
    if fence:
        t = fence.group(1)
    start = t.find("{")
    if start < 0:
        raise LLMError("no JSON object in model output")
    depth, in_str, esc = 0, False, False
    for i in range(start, len(t)):
        ch = t[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(t[start:i + 1])
    raise LLMError("unterminated JSON object in model output")


def json_call(llm: LLMClient, *, system: str, user: str, model_id: str, max_tokens: int, agent_id: str,
              temperature: float = 0.2) -> tuple[dict, dict]:
    """One structured call with a single bounded repair attempt on malformed JSON."""
    msgs = [{"role": "user", "content": [{"text": user}]}]
    r = llm.converse(system=system, messages=msgs, model_id=model_id, max_tokens=max_tokens, temperature=temperature, agent_id=agent_id)
    try:
        return parse_json(r["text"]), r["usage"]
    except (LLMError, json.JSONDecodeError) as exc:
        truncated = r.get("stop_reason") == "max_tokens"
        hint = ("Ta réponse a été tronquée (limite de longueur). Renvoie le MÊME objet JSON, beaucoup plus court: phrases brèves, "
                "listes réduites de moitié." if truncated else f"Ta réponse n'était pas un JSON valide ({exc}). Renvoie UNIQUEMENT l'objet JSON complet.")
        msgs = [{"role": "user", "content": [{"text": user + "\n\n" + hint}]}]
        r2 = llm.converse(system=system, messages=msgs, model_id=model_id, max_tokens=max_tokens, temperature=0.0, agent_id=agent_id)
        usage = {k: r["usage"].get(k, 0) + r2["usage"].get(k, 0) if isinstance(r["usage"].get(k), int) else r2["usage"].get(k)
                 for k in r2["usage"]}
        return parse_json(r2["text"]), usage
