// API client. Same-origin "/api" (Vite proxy locally, CloudFront behaviour on AWS). No credentials live in the browser.
const BASE = (import.meta as any).env?.VITE_API_BASE || "";

export function userId(): string {
  let id = localStorage.getItem("aegis.user");
  if (!id) {
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    id = `u-${rnd}`;
    localStorage.setItem("aegis.user", id);
  }
  return id;
}

/** "Recommencer": a fresh sandbox id, so the next visit starts the onboarding from scratch. */
export function resetUser(): void {
  localStorage.removeItem("aegis.user");
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: any;
  constructor(status: number, code: string, message: string, details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-AEGIS-User": userId() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "Impossible de joindre le serveur. Vérifiez que le backend est démarré.");
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = data?.error || data?.detail || {};
    const msg = e.message || (res.status >= 500 || res.status === 0 ? "Le serveur ne répond pas. Vérifiez que le backend est démarré." : `Erreur HTTP ${res.status}`);
    throw new ApiError(res.status, e.code || "http_error", msg, e);
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>("GET", p),
  post: <T = any>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  put: <T = any>(p: string, b?: unknown) => request<T>("PUT", p, b ?? {}),
  del: <T = any>(p: string) => request<T>("DELETE", p),
};

export type JobStep = {
  step_id: string;
  agent_id: string;
  label: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  detail?: string | null;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  model_id?: string | null;
};
export type Job = { job_id: string; kind: string; status: "queued" | "running" | "done" | "failed"; steps: JobStep[]; result?: any; result_ref?: string | null; error?: string | null };

export async function pollJob(jobId: string, onUpdate: (j: Job) => void, intervalMs = 1200, timeoutMs = 600000): Promise<Job> {
  const t0 = Date.now();
  for (;;) {
    const j = await api.get<Job>(`/jobs/${jobId}`);
    onUpdate(j);
    if (j.status === "done" || j.status === "failed") return j;
    if (Date.now() - t0 > timeoutMs) throw new ApiError(408, "timeout", "Délai dépassé pour la tâche");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
