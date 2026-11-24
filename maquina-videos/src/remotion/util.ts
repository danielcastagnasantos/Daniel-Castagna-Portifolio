import { staticFile } from "remotion";
import type { RenderPlan } from "../shared/schemas";

export const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha)})`;
}

/** URL de um arquivo do plano: servidor de assets durante o render, pasta public no Studio. */
export function assetUrl(plan: RenderPlan, path: string): string {
  return plan.assetBase ? `${plan.assetBase.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}` : staticFile(path);
}

export const easeOutCubic = (t: number) => 1 - (1 - clamp(t)) ** 3;
export const easeInOut = (t: number) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
