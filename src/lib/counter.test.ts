import { describe, expect, it } from "vitest";
import { counterValue, easeOutExpo } from "./counter";

describe("easeOutExpo", () => {
  it("returns exactly 1 at the end", () => {
    // Quebra que este teste pega: remover o tratamento de t >= 1 faz a função
    // devolver 0.999023, e todo contador para uma unidade antes do alvo.
    expect(easeOutExpo(1)).toBe(1);
  });

  it("returns exactly 0 at the start", () => {
    expect(easeOutExpo(0)).toBe(0);
  });

  it("clamps beyond the boundaries", () => {
    expect(easeOutExpo(1.5)).toBe(1);
    expect(easeOutExpo(-0.5)).toBe(0);
  });
});

describe("counterValue", () => {
  it("lands exactly on the target when the animation completes", () => {
    // Quebra que este teste pega: o card de tecnologias exibiria 11 em vez
    // de 12 para sempre — visível ao visitante e silencioso no build.
    expect(counterValue(1600, 1600, 12)).toBe(12);
    expect(counterValue(1600, 1600, 100)).toBe(100);
    expect(counterValue(1600, 1600, 9)).toBe(9);
  });

  it("starts at zero", () => {
    expect(counterValue(0, 1600, 12)).toBe(0);
  });

  it("stays on target after the duration is exceeded", () => {
    expect(counterValue(9999, 1600, 12)).toBe(12);
  });

  it("returns the target immediately when the duration is zero", () => {
    // Quebra que este teste pega: divisão por zero produziria NaN na tela.
    expect(counterValue(0, 0, 12)).toBe(12);
  });

  it("never overshoots the target mid-animation", () => {
    for (let elapsed = 0; elapsed <= 1600; elapsed += 100) {
      const value = counterValue(elapsed, 1600, 12);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(12);
    }
  });
});
