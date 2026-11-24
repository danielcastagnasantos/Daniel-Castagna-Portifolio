import type { Brand, GraphicVariant, Scene } from "../../../shared/schemas";

export interface VisualRequest {
  scene: Scene;
  brand: Brand;
  /** Caminho absoluto SEM extensão onde gravar o arquivo gerado (pasta do projeto). */
  outBase: string;
  seed: number;
  /** Já usados nesta execução (evita repetir a mesma imagem da biblioteca). */
  usedLibraryFiles: Set<string>;
  signal?: AbortSignal;
}

export interface VisualResult {
  kind: "image" | "video" | "graphic";
  /** Caminho ABSOLUTO do arquivo (ausente em "graphic"). */
  file?: string;
  graphic?: GraphicVariant;
  provider: string;
  durationSec?: number;
}

export interface VisualProvider {
  readonly id: string;
  resolve(req: VisualRequest): Promise<VisualResult | undefined>;
}
