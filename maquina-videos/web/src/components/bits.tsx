import { useEffect, useRef } from "react";
import type { ProjectStatus } from "../sharedTypes";

const LABEL: Record<ProjectStatus, [string, string]> = {
  draft: ["Rascunho", ""],
  generating_script: ["Gerando roteiro…", "run"],
  awaiting_script_approval: ["Aprovar roteiro", "warn"],
  producing: ["Produzindo…", "run"],
  awaiting_video_approval: ["Aprovar vídeo", "warn"],
  approved: ["Aprovado", "ok"],
  failed: ["Falhou", "err"],
  cancelled: ["Cancelado", "warn"],
};

export const StatusPill = ({ status }: { status: ProjectStatus }) => {
  const [text, kind] = LABEL[status] ?? [status, ""];
  return <span className={`pill ${kind}`}>{text}</span>;
};

export const fmtDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
export const fmtMB = (b: number) => `${(b / 1e6).toFixed(1)} MB`;

export function Toast({ message, kind = "err", onClose }: { message: string; kind?: "err" | "ok"; onClose: () => void }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (kind !== "ok") return;
    const t = setTimeout(() => close.current(), 5000);
    return () => clearTimeout(t);
  }, [kind, message]);
  return (
    <div className="toast">
      <div className={`banner ${kind}`} role="alert">
        <div className="row between">
          <b>{kind === "err" ? "Algo deu errado" : "Pronto"}</b>
          <button className="btn sm ghost" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {message}
      </div>
    </div>
  );
}
