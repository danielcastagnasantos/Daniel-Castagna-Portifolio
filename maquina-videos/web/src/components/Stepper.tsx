import { STEP_LABELS } from "@shared/schemas";
import type { StepId } from "../sharedTypes";
import type { LiveProgress } from "../useProject";
import type { ProjectView } from "../types";

const ORDER: StepId[] = ["script", "narration", "visuals", "compose", "render", "verify", "preview"];
const STATUS_TEXT: Record<string, string> = { pending: "aguardando", running: "em andamento", done: "pronto", failed: "falhou", interrupted: "interrompido", skipped: "pulado" };

export function Stepper({ project, live }: { project: ProjectView; live: LiveProgress | null }) {
  return (
    <div className="stepper" aria-label="Etapas da produção">
      {ORDER.map((id, i) => {
        const st = project.steps[id];
        const status = st?.status ?? (id === "script" && project.script ? "done" : "pending");
        const progress = live?.step === id ? live.progress : status === "done" ? 1 : (st?.progress ?? 0);
        const detail = live?.step === id ? live.detail : (st?.error?.message ?? st?.detail);
        return (
          <div key={id} className={`step ${status}`} title={st?.error?.message}>
            <div className="n"><span>{i + 1}</span><span>{STATUS_TEXT[status] ?? status}</span></div>
            <div className="l">{STEP_LABELS[id]}</div>
            <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <div className="d">{detail ?? " "}</div>
          </div>
        );
      })}
    </div>
  );
}
