/**
 * Utilidades puras sobre o roteiro: numeração de cenas, avisos de qualidade e normalização.
 * (Hash/crypto ficam em src/core, pois este arquivo também roda no navegador.)
 */
import { estimateSpeechSeconds } from "./timing";
import type { Script } from "./schemas";

export const sceneId = (index: number): string => `sc-${String(index + 1).padStart(2, "0")}`;

/** Reatribui ids sequenciais (sc-01, sc-02...). Mantém a ordem. */
export function renumberScenes(script: Script): Script {
  return { ...script, scenes: script.scenes.map((s, i) => ({ ...s, id: sceneId(i) })) };
}

export interface ScriptWarning {
  level: "info" | "warn";
  sceneId?: string;
  message: string;
}

export function estimateScriptSeconds(script: Script, wordsPerSecond: number): number {
  return script.scenes.reduce((sum, s) => sum + estimateSpeechSeconds(s.narration, wordsPerSecond) + 0.4, 0);
}

/** Checagens leves (não bloqueiam) mostradas na UI antes de aprovar. */
export function lintScript(script: Script, targetSec: number, wordsPerSecond: number): ScriptWarning[] {
  const out: ScriptWarning[] = [];
  const est = estimateScriptSeconds(script, wordsPerSecond);
  const diff = (est - targetSec) / targetSec;
  if (Math.abs(diff) > 0.25) {
    out.push({
      level: "warn",
      message: `Duração estimada ${est.toFixed(0)}s, longe do alvo de ${targetSec}s (${diff > 0 ? "+" : ""}${Math.round(diff * 100)}%).`,
    });
  } else {
    out.push({ level: "info", message: `Duração estimada: ${est.toFixed(0)}s (alvo ${targetSec}s).` });
  }
  const first = script.scenes[0];
  if (first && estimateSpeechSeconds(first.narration, wordsPerSecond) > 6) {
    out.push({ level: "warn", sceneId: first.id, message: "O gancho passa de ~6s: considere encurtar a primeira cena." });
  }
  for (const s of script.scenes) {
    const sec = estimateSpeechSeconds(s.narration, wordsPerSecond);
    if (sec > 14) out.push({ level: "warn", sceneId: s.id, message: `Cena longa (~${sec.toFixed(0)}s). Dividir mantém a retenção.` });
    if (s.onScreenText && s.onScreenText.length > 40) out.push({ level: "warn", sceneId: s.id, message: "Texto na tela muito longo." });
  }
  if (!script.cta) out.push({ level: "info", message: "Sem chamada para ação (CTA) definida." });
  return out;
}
