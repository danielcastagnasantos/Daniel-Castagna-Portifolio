import type { Brand, Reference, ReferenceAnalysis, Script } from "../../../shared/schemas";

export interface LlmContext {
  signal?: AbortSignal;
}

export interface LlmProvider {
  /** "teste" ou "anthropic:<modelo>" — gravado no roteiro para rastreabilidade. */
  readonly id: string;
  analyzeReferences(
    req: { brand: Brand; theme: string; references: Reference[] },
    ctx?: LlmContext,
  ): Promise<ReferenceAnalysis>;
  generateScript(
    req: { brand: Brand; theme: string; targetDurationSec: number; language: string; analysis?: ReferenceAnalysis },
    ctx?: LlmContext,
  ): Promise<Script>;
  /**
   * Reescreve o roteiro (ou só as cenas indicadas) seguindo uma instrução do usuário.
   * Cenas não indicadas DEVEM permanecer idênticas.
   */
  reviseScript(
    req: { brand: Brand; script: Script; instruction: string; sceneIds: string[]; targetDurationSec: number; language: string },
    ctx?: LlmContext,
  ): Promise<Script>;
}
