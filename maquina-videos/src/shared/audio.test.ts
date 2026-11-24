import { describe, expect, it } from "vitest";
import { musicVolumeAt } from "./audio";

const music = { volume: 0.2, duckedVolume: 0.05, fadeInFrames: 60, fadeOutFrames: 90 };
const speech = [{ startFrame: 300, endFrame: 600 }];

describe("musicVolumeAt", () => {
  it("fica no volume baixo durante a fala e no normal longe dela", () => {
    expect(musicVolumeAt(450, music, speech, 2000)).toBeCloseTo(0.05);
    expect(musicVolumeAt(1000, music, speech, 2000)).toBeCloseTo(0.2);
  });
  it("transição suave (sem saltos) ao entrar e sair da fala", () => {
    let prev = musicVolumeAt(200, music, speech, 2000);
    for (let f = 201; f < 320; f++) {
      const v = musicVolumeAt(f, music, speech, 2000);
      expect(Math.abs(v - prev)).toBeLessThan(0.02);
      prev = v;
    }
  });
  it("fade-in no início e fade-out no fim", () => {
    expect(musicVolumeAt(0, music, speech, 2000)).toBe(0);
    expect(musicVolumeAt(30, music, speech, 2000)).toBeGreaterThan(0);
    expect(musicVolumeAt(2000, music, speech, 2000)).toBe(0);
    expect(musicVolumeAt(1955, music, speech, 2000)).toBeLessThan(musicVolumeAt(1500, music, speech, 2000));
  });
  it("nunca é negativo nem passa do volume configurado", () => {
    for (let f = 0; f <= 2000; f += 7) {
      const v = musicVolumeAt(f, music, speech, 2000);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });
});
