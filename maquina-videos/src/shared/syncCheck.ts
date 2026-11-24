/**
 * Mede a sincronia entre o áudio final e as palavras das legendas: compara o envelope de
 * energia do áudio (a cada 10 ms) com uma máscara "há palavra sendo falada" derivada do plano.
 * Se a fala estivesse atrasada/adiantada, o pico da correlação sairia de 0 ms.
 */
export function energyEnvelope(samples: ArrayLike<number>, sampleRate: number, hz = 100): Float64Array {
  const win = Math.max(1, Math.round(sampleRate / hz));
  const n = Math.floor(samples.length / win);
  const env = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < win; j++) {
      const v = (samples[i * win + j] ?? 0) / 32768;
      sum += v * v;
    }
    env[i] = Math.sqrt(sum / win);
  }
  return env;
}

export function speechMask(words: readonly { startFrame: number; endFrame: number }[], fps: number, length: number, hz = 100): Float64Array {
  const mask = new Float64Array(length);
  for (const w of words) {
    const a = Math.max(0, Math.round((w.startFrame / fps) * hz));
    const b = Math.min(length, Math.round((w.endFrame / fps) * hz));
    for (let i = a; i < b; i++) mask[i] = 1;
  }
  return mask;
}

function pearson(a: ArrayLike<number>, b: ArrayLike<number>, shift: number): number {
  // correlação entre a[i] e b[i - shift], na região onde ambos existem
  const start = Math.max(0, shift);
  const end = Math.min(a.length, b.length + shift);
  const n = end - start;
  if (n < 10) return 0;
  let sa = 0, sb = 0;
  for (let i = start; i < end; i++) {
    sa += a[i]!;
    sb += b[i - shift]!;
  }
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = start; i < end; i++) {
    const da = a[i]! - ma, db = b[i - shift]! - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  return va === 0 || vb === 0 ? 0 : cov / Math.sqrt(va * vb);
}

export interface SyncResult {
  /** Deslocamento (ms) com a melhor correlação. Positivo = áudio ATRASADO em relação às legendas. */
  bestLagMs: number;
  corrBest: number;
  corrAtZero: number;
}

export function analyzeSync(env: ArrayLike<number>, mask: ArrayLike<number>, maxLagMs = 300, hz = 100): SyncResult {
  const step = 1000 / hz;
  const maxLag = Math.round(maxLagMs / step);
  let best = { lag: 0, c: -2 };
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const c = pearson(env, mask, lag);
    if (c > best.c) best = { lag, c };
  }
  return { bestLagMs: best.lag * step, corrBest: best.c, corrAtZero: pearson(env, mask, 0) };
}
