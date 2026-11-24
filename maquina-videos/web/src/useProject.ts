import { useEffect, useRef, useState } from "react";
import { api, eventsUrl } from "./api";
import type { LogLine, ProjectView } from "./types";

export interface LiveProgress {
  step: string;
  progress: number;
  detail?: string;
}

/** Assina o projeto por SSE (estado, progresso e log em tempo real). */
export function useProject(id: string | null) {
  const [project, setProject] = useState<ProjectView | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [live, setLive] = useState<LiveProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const idRef = useRef(id);
  idRef.current = id;

  useEffect(() => {
    setProject(null);
    setLogs([]);
    setLive(null);
    setError(null);
    if (!id) return;
    let closed = false;
    api<LogLine[]>(`/projects/${id}/logs?tail=300`).then((l) => !closed && setLogs(l)).catch(() => undefined);
    const es = new EventSource(eventsUrl(id));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("project", (e) => {
      const p = JSON.parse((e as MessageEvent).data) as ProjectView;
      setProject(p);
      if (!p.busy) setLive(null);
    });
    es.addEventListener("progress", (e) => setLive(JSON.parse((e as MessageEvent).data) as LiveProgress));
    es.addEventListener("log", (e) => setLogs((prev) => [...prev.slice(-400), JSON.parse((e as MessageEvent).data) as LogLine]));
    return () => {
      closed = true;
      es.close();
      setConnected(false);
    };
  }, [id]);

  return { project, logs, live, error, connected, setError };
}
