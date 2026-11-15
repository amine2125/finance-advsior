/* Thin API client. Same routes locally (FastAPI) and on AWS (Lambda function URL behind CloudFront). */
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; params?: Record<string, string | undefined> }): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(init?.params ?? {})) if (v) q.set(k, v);
  const url = `/api${path}${q.toString() ? `?${q}` : ""}`;
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (init?.body !== undefined) {
    body = JSON.stringify(init.body);
    headers["content-type"] = "application/json";
    headers["x-amz-content-sha256"] = await sha256Hex(body); // required by CloudFront OAC for POST to a Lambda URL
  }
  const r = await fetch(url, { method: init?.method ?? (body ? "POST" : "GET"), headers, body });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, (data as { erreur?: string }).erreur ?? `Erreur ${r.status}`);
  return data as T;
}
