import { describe, expect, it } from "vitest";
import { configForProgress } from "./sceneConfig";

describe("configForProgress", () => {
  it("shows the notebook at the top and hides it once scrolling starts", () => {
    // Quebra que este teste pega: o notebook do hero sumindo de cara, ou
    // persistindo sobre as seções de texto e poluindo a leitura.
    expect(configForProgress(0).notebookOpacity).toBe(1);
    expect(configForProgress(0.5).notebookOpacity).toBe(0);
  });

  it("shows the neural network only around the technologies band", () => {
    expect(configForProgress(0.38).neuralOpacity).toBe(1);
    expect(configForProgress(0).neuralOpacity).toBe(0);
  });

  it("shows the grid around the process band", () => {
    expect(configForProgress(0.82).gridOpacity).toBe(1);
    expect(configForProgress(0.2).gridOpacity).toBe(0);
  });

  it("clamps out-of-range progress instead of extrapolating", () => {
    // Quebra que este teste pega: extrapolação linear geraria opacidade
    // negativa e câmera atrás do horizonte no bounce de scroll do iOS, que
    // reporta progresso fora de [0, 1].
    const belowRange = configForProgress(-3);
    const aboveRange = configForProgress(7);

    expect(belowRange).toEqual(configForProgress(0));
    expect(aboveRange).toEqual(configForProgress(1));
  });

  it("survives a non-finite progress value", () => {
    // Quebra que este teste pega: divisão por zero em `scrollHeight -
    // innerHeight` numa página curta produz NaN, e NaN na posição da câmera
    // apaga a cena inteira sem erro no console.
    expect(configForProgress(Number.NaN)).toEqual(configForProgress(0));
  });

  it("keeps every opacity within the renderable range across the whole scroll", () => {
    for (let progress = 0; progress <= 1; progress += 0.01) {
      const config = configForProgress(progress);

      for (const value of [
        config.particleOpacity,
        config.notebookOpacity,
        config.neuralOpacity,
        config.gridOpacity,
        config.objectsOpacity,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }

      expect(config.cameraZ).toBeGreaterThan(0);
      expect(config.bloomIntensity).toBeGreaterThanOrEqual(0);
    }
  });

  it("moves continuously, with no jump between neighbouring frames", () => {
    // Quebra que este teste pega: um keyframe fora de ordem faria a câmera
    // saltar visivelmente no meio da rolagem.
    let previous = configForProgress(0).cameraZ;

    for (let progress = 0.005; progress <= 1; progress += 0.005) {
      const current = configForProgress(progress).cameraZ;
      expect(Math.abs(current - previous)).toBeLessThan(0.5);
      previous = current;
    }
  });
});
