import { useCallback, useState } from "react";
import { api } from "../api";
import { LogPanel } from "../components/LogPanel";
import { ResultPanel } from "../components/ResultPanel";
import { ScriptEditor } from "../components/ScriptEditor";
import { Stepper } from "../components/Stepper";
import { StatusPill, Toast } from "../components/bits";
import type { Script } from "../sharedTypes";
import { useProject } from "../useProject";

export function ProjectScreen({ id, onChanged, onDeleted }: { id: string; onChanged: () => void; onDeleted: () => void }) {
  const { project, logs, live } = useProject(id);
  const [toast, setToast] = useState<{ msg: string; kind: "err" | "ok" } | null>(null);
  const [instruction, setInstruction] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [exported, setExported] = useState<string>();

  const run = useCallback(
    async (fn: () => Promise<unknown>, okMsg?: string) => {
      setPending(true);
      try {
        await fn();
        if (okMsg) setToast({ msg: okMsg, kind: "ok" });
        onChanged();
      } catch (e) {
        setToast({ msg: (e as Error).message, kind: "err" });
      } finally {
        setPending(false);
      }
    },
    [onChanged],
  );

  if (!project) return <div className="empty">Carregando projeto…</div>;
  const p = project;
  const busy = p.busy || p.status === "generating_script" || p.status === "producing";
  const locked = busy || pending;
  const post = (path: string, body: unknown = {}) => api(`/projects/${id}${path}`, { method: "POST", body });
  const brandWps = 2.6;
  const failed = p.status === "failed" || p.status === "cancelled";

  return (
    <div className="container">
      <div className="card">
        <div className="row between">
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <StatusPill status={p.status} />
              {p.testMode ? <span className="pill test">MODO DE TESTE</span> : <span className="pill live">AO VIVO</span>}
              <span className="pill">{p.brandId === "versao-x" ? "Versão X" : "Hipótese X"}</span>
              <span className="pill">{p.targetDurationSec}s alvo</span>
            </div>
            <h1 style={{ fontSize: 24, margin: "10px 0 2px" }}>{p.script?.title ?? p.theme}</h1>
            <small className="muted">Tema: {p.theme}</small>
          </div>
          <div className="row">
            {busy && <button className="btn danger" onClick={() => run(() => post("/cancel"))}>Cancelar</button>}
            {failed && <button className="btn primary" disabled={pending} onClick={() => run(() => post("/resume"), "Retomando de onde parou…")}>↻ Retomar</button>}
            {!busy && <button className="btn ghost danger" onClick={() => window.confirm("Arquivar este projeto? Os arquivos vão para data/archive (não são apagados).") && run(async () => { await api(`/projects/${id}`, { method: "DELETE" }); onDeleted(); })}>Arquivar</button>}
          </div>
        </div>
      </div>

      {p.testMode && (
        <div className="banner test"><b>Modo de teste</b>Nenhuma API paga é chamada. O texto e a voz são sintéticos; a renderização (1080×1920 · 60 fps) é real.</div>
      )}
      {failed && p.lastError && (
        <div className="banner err"><b>{p.status === "cancelled" ? "Cancelado" : "Falhou"}: {p.lastError.code}</b>{p.lastError.message}<br /><small className="muted">O que já foi gerado fica salvo; “Retomar” continua de onde parou.</small></div>
      )}
      {!failed && p.lastError && p.status === "awaiting_script_approval" && (
        <div className="banner err"><b>A última tentativa falhou</b>{p.lastError.message}</div>
      )}

      {p.status !== "draft" && <Stepper project={p} live={live} />}

      {p.status === "draft" && (
        <div className="card"><h2>Roteiro ainda não gerado</h2><p>O projeto foi criado, mas o roteiro não foi gerado.</p>
          <div style={{ marginTop: 12 }}><button className="btn primary" disabled={locked} onClick={() => run(() => post("/generate-script"))}>Gerar roteiro</button></div></div>
      )}
      {p.status === "generating_script" && !p.script && <div className="card"><h2>Escrevendo o roteiro…</h2><p>{p.testMode ? "Montando um roteiro de teste." : "O Claude está escrevendo. Costuma levar de 20 a 90 segundos."}</p></div>}
      {p.status === "failed" && !p.script && (
        <div className="card"><button className="btn primary" disabled={locked} onClick={() => run(() => post("/generate-script"))}>Tentar gerar o roteiro de novo</button></div>
      )}

      <ResultPanel
        project={p}
        disabled={locked}
        exportedPath={exported}
        onApprove={() => run(() => post("/approve-video"), "Vídeo aprovado.")}
        onExport={() => run(async () => { const r = await api<{ file: string }>(`/projects/${id}/export`, { method: "POST" }); setExported(r.file); }, "Exportado para a pasta data/exports.")}
      />

      {p.script && (
        <ScriptEditor
          project={p}
          wordsPerSecond={brandWps}
          disabled={locked}
          onDirty={setDirty}
          onSave={(s: Script) => run(async () => { await api(`/projects/${id}/script`, { method: "PUT", body: s }); }, "Roteiro salvo. Aprove para regerar só o que mudou.")}
          onRequestChange={(sceneId, text) => run(() => post("/scene-changes", { changes: [{ sceneId, instruction: text }] }), "Alteração enviada.")}
        />
      )}

      {p.script && (p.status === "awaiting_script_approval" || p.status === "awaiting_video_approval" || p.status === "approved" || failed) && (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h2>{p.scriptApproved ? "Roteiro aprovado" : "Aprovar o roteiro"}</h2>
          <label>Pedir à IA um ajuste no roteiro inteiro (opcional)
            <textarea rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex.: deixe o gancho mais provocativo e corte a cena 4" disabled={locked} />
          </label>
          <div className="row">
            <button className="btn blue" disabled={locked || instruction.trim().length < 3 || dirty} onClick={() => run(async () => { await post("/revise-script", { instruction }); setInstruction(""); })}>Pedir ajuste à IA</button>
            <button className="btn primary" disabled={locked || dirty || (p.scriptApproved && p.status !== "failed" && p.status !== "cancelled")} onClick={() => run(() => post("/approve-script"))}>
              {p.scriptApproved ? "Roteiro já aprovado" : "✓ Aprovar roteiro e produzir"}
            </button>
            {dirty && <small className="muted">Salve as edições antes de aprovar.</small>}
            {!p.testMode && !p.scriptApproved && <small className="muted">Ao aprovar, a narração (ElevenLabs){p.visualMode.startsWith("generated") ? " e os visuais (Runway)" : ""} será gerada — isso gera custo.</small>}
          </div>
        </div>
      )}

      <LogPanel logs={logs} open={busy || failed} />
      {toast && <Toast message={toast.msg} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  );
}
