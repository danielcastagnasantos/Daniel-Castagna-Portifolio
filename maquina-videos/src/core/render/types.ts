import type { RenderPlan } from "../../shared/schemas";

export interface RenderRequest {
  plan: RenderPlan;
  /** Caminho absoluto do MP4 de saída. */
  outFile: string;
  signal: AbortSignal;
  onProgress: (fraction: number, detail?: string) => void;
}

/** Contrato do renderizador (o real usa Remotion; testes podem injetar outro). */
export interface Renderer {
  render(req: RenderRequest): Promise<{ renderSeconds: number }>;
}
