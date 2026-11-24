import { downloadUrl } from "../api";
import type { ProjectView } from "../types";
import { fmtDuration, fmtMB } from "./bits";

export function VerificationList({ project }: { project: ProjectView }) {
  const v = project.artifacts.verification;
  if (!v) return null;
  return (
    <ul className="checks" aria-label="Verificação automática">
      {v.checks.map((c) => (
        <li key={c.id} className={c.status}>
          <span className="ic">{c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✕"}</span>
          <span>{c.label}<small className="muted">{c.detail}</small></span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  project: ProjectView;
  disabled: boolean;
  onApprove: () => void;
  onExport: () => void;
  exportedPath?: string;
}

export function ResultPanel({ project, disabled, onApprove, onExport, exportedPath }: Props) {
  const r = project.artifacts.render;
  if (!project.urls.preview || !r) return null;
  const ok = project.artifacts.verification?.ok === true;
  return (
    <div className="card" style={{ display: "grid", gap: 16 }}>
      <div className="row between">
        <div>
          <h2>Resultado</h2>
          <p>Prévia em baixa resolução. O arquivo final é 1080×1920 · 60 fps · H.264 + AAC.</p>
        </div>
        {project.status === "approved" ? <span className="pill ok">Vídeo aprovado</span> : null}
      </div>
      <div className="player">
        <video key={project.urls.preview} controls playsInline preload="metadata" poster={project.urls.poster} src={project.urls.preview} />
        <div style={{ display: "grid", gap: 14 }}>
          <dl className="kv">
            <dt>Duração</dt><dd>{fmtDuration(r.durationSec)} ({r.durationSec.toFixed(1)}s)</dd>
            <dt>Arquivo final</dt><dd>{fmtMB(r.sizeBytes)}</dd>
            <dt>Renderização</dt><dd>{r.renderSeconds ? `${r.renderSeconds.toFixed(0)}s` : "—"}</dd>
            <dt>Cenas</dt><dd>{project.script?.scenes.length ?? "—"}</dd>
            <dt>Modo</dt><dd>{project.testMode ? "Teste (conteúdo de exemplo)" : "Ao vivo"}</dd>
          </dl>
          {project.testMode && <div className="banner test"><b>Vídeo de teste</b>Voz, roteiro e imagens de teste: serve para validar o fluxo, não para publicar.</div>}
          <VerificationList project={project} />
          <div className="row">
            <button className="btn primary" disabled={disabled || !ok || project.status === "approved"} onClick={onApprove}>✓ Aprovar vídeo</button>
            <a className={`btn blue ${!ok ? "disabled" : ""}`} href={downloadUrl(project.id)} aria-disabled={!ok} download>⬇ Baixar MP4 final</a>
            <button className="btn" disabled={disabled || !ok} onClick={onExport}>Salvar em exports/</button>
          </div>
          {(exportedPath || project.exports.length > 0) && (
            <small className="muted">Última exportação: <code>{exportedPath ?? project.exports.at(-1)?.file}</code></small>
          )}
        </div>
      </div>
    </div>
  );
}
