import type { Project, ScriptWarningLike } from "./sharedTypes";

export type { Project };
export interface ProjectView extends Project {
  busy: boolean;
  scriptApproved: boolean;
  warnings: ScriptWarningLike[];
  urls: { video?: string; preview?: string; poster?: string; narration: Record<string, string> };
}

export interface Health {
  ok: boolean;
  version: string;
  defaultTestMode: boolean;
  video: { width: number; height: number; fps: number };
  providers: { anthropic: boolean; elevenlabs: boolean; runway: boolean; telegram: boolean; webhook: boolean };
  anthropicModel: string;
  tools: { ffmpeg: string | null; ffprobe: string | null; problems: string[] };
}

export interface BrandInfo {
  id: string;
  name: string;
  tagline: string;
  implemented: boolean;
  mode: string;
  palette: { background: string; primary: string; accent: string; text: string };
}

export interface ProjectSummary {
  id: string;
  theme: string;
  brandId: string;
  status: Project["status"];
  testMode: boolean;
  targetDurationSec: number;
  createdAt: string;
  updatedAt: string;
  title?: string;
  hasVideo: boolean;
}

export interface LogLine {
  t: string;
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  step?: string;
}
