export type {
  Project,
  Script,
  Scene,
  StepId,
  StepState,
  Check,
  Transition,
  Motion,
  VisualMode,
  ProjectStatus,
} from "@shared/schemas";
export interface ScriptWarningLike {
  level: "info" | "warn";
  sceneId?: string;
  message: string;
}
