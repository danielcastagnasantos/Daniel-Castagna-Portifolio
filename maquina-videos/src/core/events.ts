import { EventEmitter } from "node:events";
import type { LogRecord } from "./logger";
import type { Project, StepId } from "../shared/schemas";

export interface ProgressEvent {
  projectId: string;
  step: StepId;
  progress: number;
  detail?: string;
}

/** Barramento interno: alimenta o SSE da interface, o Telegram e os webhooks. */
export type BusEvents = {
  project: [Project];
  progress: [ProgressEvent];
  log: [LogRecord];
  /** Marcos importantes (roteiro pronto, vídeo pronto, falha...) para notificações. */
  milestone: [MilestoneEvent];
};

export type MilestoneEvent =
  | { type: "script_ready"; projectId: string }
  | { type: "video_ready"; projectId: string }
  | { type: "failed"; projectId: string; message: string }
  | { type: "approved"; projectId: string }
  | { type: "exported"; projectId: string; file: string };

export class EventBus extends EventEmitter<BusEvents> {}
