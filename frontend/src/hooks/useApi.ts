import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, Job, pollJob } from "../services/api";

export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<T>(path));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

export function useJob() {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const start = useCallback(async (path: string, body: unknown): Promise<Job | null> => {
    setError(null);
    setRunning(true);
    setJob(null);
    try {
      const j = await api.post<{ job_id: string }>(path, body);
      const final = await pollJob(j.job_id, (u) => alive.current && setJob(u));
      if (final.status === "failed") setError(new ApiError(500, "job_failed", final.error || "La tâche a échoué"));
      return final;
    } catch (e) {
      setError(e as ApiError);
      return null;
    } finally {
      setRunning(false);
    }
  }, []);
  return { job, error, running, start, setJob };
}
