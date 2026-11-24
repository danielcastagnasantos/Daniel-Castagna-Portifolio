import type { AppConfig } from "../config";
import type { BrandRegistry } from "../brands";
import type { AssetPaths } from "../assets";
import type { EventBus } from "../events";
import { CancelledError } from "../errors";
import type { Logger } from "../logger";
import type { Ffmpeg } from "../media/ffmpeg";
import type { Providers } from "../providers";
import type { Renderer } from "../render/types";
import type { ProjectStore } from "../store/projectStore";
import type { Brand, Project } from "../../shared/schemas";

export interface PipelineDeps {
  config: AppConfig;
  store: ProjectStore;
  brands: BrandRegistry;
  assets: AssetPaths;
  ffmpeg: Ffmpeg;
  bus: EventBus;
  renderer: Renderer;
  /** Fábrica de provedores (injetável nos testes). */
  providersFor(project: Project): Providers;
}

export interface StepContext {
  deps: PipelineDeps;
  projectId: string;
  projectDir: string;
  brand: Brand;
  providers: Providers;
  signal: AbortSignal;
  log: Logger;
  progress(fraction: number, detail?: string): void;
}

export function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new CancelledError();
}
