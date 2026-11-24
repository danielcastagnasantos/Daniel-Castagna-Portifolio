import { createHash } from "node:crypto";

/** JSON com chaves ordenadas: o mesmo conteúdo gera sempre o mesmo texto. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

export const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");

/** Hash curto (16 hex) do conteúdo de qualquer valor serializável. */
export const hashOf = (value: unknown): string => sha256(stableStringify(value)).slice(0, 16);
