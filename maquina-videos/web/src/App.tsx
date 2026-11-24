import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { NewProject } from "./views/NewProject";
import { ProjectScreen } from "./views/ProjectScreen";
import { StatusPill } from "./components/bits";
import type { BrandInfo, Health, ProjectSummary } from "./types";

function useHash(): [string, (h: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, "") || "/novo");
  useEffect(() => {
    const on = () => setHash(window.location.hash.replace(/^#/, "") || "/novo");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [hash, (h) => (window.location.hash = h)];
}

export function App() {
  const [hash, go] = useHash();
  const [health, setHealth] = useState<Health | null>(null);
  const [brands, setBrands] = useState<BrandInfo[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([api<ProjectSummary[]>("/projects"), api<Health>("/health")]);
      setProjects(p);
      setHealth(h);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    api<BrandInfo[]>("/brands").then(setBrands).catch(() => undefined);
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const projectId = hash.startsWith("/p/") ? hash.slice(3) : null;
  const dot = (ok: boolean | undefined) => <span className={`dot ${ok ? "ok" : "off"}`} />;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">
            <svg width="18" height="18" viewBox="0 0 32 32"><path d="M9 6l16 10-16 10z" fill="#ffc83d" /></svg>
          </div>
          <div>
            <b>Máquina de Vídeos</b>
            <div className="muted" style={{ fontSize: 12 }}>Versão X · Hipótese X</div>
          </div>
        </div>
        <div className="actions">
          <button className="btn primary block" onClick={() => go("/novo")}>＋ Novo vídeo</button>
        </div>
        <div className="plist">
          {projects.length === 0 && <div className="muted" style={{ padding: 12, fontSize: 13 }}>Nenhum projeto ainda.</div>}
          {projects.map((p) => (
            <button key={p.id} className={`pitem ${projectId === p.id ? "active" : ""}`} onClick={() => go(`/p/${p.id}`)}>
              <span className="t">{p.title ?? p.theme}</span>
              <span className="s">
                <StatusPill status={p.status} />
                {p.testMode && <span className="pill test">teste</span>}
                <span>{brands.find((b) => b.id === p.brandId)?.name ?? p.brandId}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="sysbar">
          {offline ? (
            <span><span className="dot err" />Servidor offline — rode <code>npm start</code></span>
          ) : (
            <>
              <span>{dot(Boolean(health?.tools.ffmpeg && health?.tools.ffprobe))}FFmpeg {health?.tools.ffmpeg ? "ok" : "não encontrado"}</span>
              <span>{dot(health?.providers.anthropic)}Claude · {dot(health?.providers.elevenlabs)}ElevenLabs</span>
              <span>{dot(health?.providers.runway)}Runway · {dot(health?.providers.telegram)}Telegram · {dot(health?.providers.webhook)}n8n</span>
              <span className="muted">{health?.video.width}×{health?.video.height} · {health?.video.fps} fps · H.264</span>
            </>
          )}
        </div>
      </aside>
      <main>
        {hash.startsWith("/p/") && projectId ? (
          <ProjectScreen key={projectId} id={projectId} onChanged={refresh} onDeleted={() => { void refresh(); go("/novo"); }} />
        ) : (
          <NewProject brands={brands} health={health} onCreated={(id) => { void refresh(); go(`/p/${id}`); }} />
        )}
      </main>
    </div>
  );
}
