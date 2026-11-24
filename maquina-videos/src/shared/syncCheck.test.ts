import { describe, expect, it } from "vitest";
import { analyzeSync, energyEnvelope, speechMask } from "./syncCheck";

/** Áudio sintético: rajadas de 0,25 s a cada 0,5 s (às vezes deslocadas). */
function burstsAudio(offsetSec: number, seconds = 20, sr = 16000): Int16Array {
  const out = new Int16Array(seconds * sr);
  for (let t = 1; t < seconds - 1; t += 0.5) {
    const a = Math.round((t + offsetSec) * sr);
    for (let i = 0; i < sr * 0.25; i++) out[a + i] = Math.round(Math.sin(i * 0.3) * 12000);
  }
  return out;
}
const words = Array.from({ length: 36 }, (_, k) => ({ startFrame: Math.round((1 + k * 0.5) * 60), endFrame: Math.round((1.25 + k * 0.5) * 60) }));

describe("analyzeSync", () => {
  it("áudio alinhado → pico em ~0 ms", () => {
    const env = energyEnvelope(burstsAudio(0), 16000);
    const r = analyzeSync(env, speechMask(words, 60, env.length));
    expect(Math.abs(r.bestLagMs)).toBeLessThanOrEqual(10);
    expect(r.corrBest).toBeGreaterThan(0.9);
  });
  it("áudio atrasado 120 ms → detecta o deslocamento", () => {
    const env = energyEnvelope(burstsAudio(0.12), 16000);
    const r = analyzeSync(env, speechMask(words, 60, env.length));
    expect(r.bestLagMs).toBeGreaterThanOrEqual(100);
    expect(r.bestLagMs).toBeLessThanOrEqual(140);
  });
  it("áudio adiantado 80 ms → deslocamento negativo", () => {
    const env = energyEnvelope(burstsAudio(-0.08), 16000);
    const r = analyzeSync(env, speechMask(words, 60, env.length));
    expect(r.bestLagMs).toBeLessThanOrEqual(-60);
  });
});
