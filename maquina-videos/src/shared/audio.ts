/** Lógica pura do mix de áudio (usada pelo Remotion e testada à parte). */

export interface MusicConfig {
  volume: number;
  duckedVolume: number;
  fadeInFrames: number;
  fadeOutFrames: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Volume da trilha em cada frame: abaixa suavemente enquanto há fala ("ducking"),
 * com fade-in no começo e fade-out no fim.
 */
export function musicVolumeAt(
  frame: number,
  music: MusicConfig,
  speech: readonly { startFrame: number; endFrame: number }[],
  totalFrames: number,
  rampFrames = 14,
): number {
  // Distância (em frames) até o intervalo de fala mais próximo (0 = dentro da fala).
  let dist = Number.POSITIVE_INFINITY;
  for (const s of speech) {
    const d = frame < s.startFrame ? s.startFrame - frame : frame > s.endFrame ? frame - s.endFrame : 0;
    if (d < dist) dist = d;
    if (d === 0) break;
  }
  const duck = 1 - smooth(clamp01(dist / rampFrames)); // 1 = totalmente abaixado
  const base = music.volume + (music.duckedVolume - music.volume) * duck;
  const fin = music.fadeInFrames > 0 ? clamp01(frame / music.fadeInFrames) : 1;
  const fout = music.fadeOutFrames > 0 ? clamp01((totalFrames - frame) / music.fadeOutFrames) : 1;
  return Math.max(0, base * fin * fout);
}
