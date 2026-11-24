/**
 * Síntese de áudio e imagem 100% local, usada SOMENTE no modo de teste:
 * a "voz" de teste é uma sequência de sílabas sintéticas (uma rajada por palavra) que
 * permite ouvir e verificar a sincronia sem gastar nenhuma API. Não é fala de verdade.
 */
import zlib from "node:zlib";
import { rng } from "../../shared/timing";
import type { WordTiming } from "../../shared/schemas";

export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

const TAU = Math.PI * 2;

/** "Voz" de teste: uma rajada vozeada por palavra, com altura e brilho variando. */
export function synthBabble(words: readonly WordTiming[], durationSec: number, seed: number, sampleRate = 24000): Float32Array {
  const n = Math.max(1, Math.round(durationSec * sampleRate));
  const out = new Float32Array(n);
  const rand = rng(seed);
  for (const w of words) {
    const s0 = Math.floor(w.start * sampleRate);
    const s1 = Math.min(n, Math.ceil(Math.max(w.end, w.start + 0.06) * sampleRate));
    const len = s1 - s0;
    if (len <= 0) continue;
    const f0 = 105 + rand() * 70;
    const glide = (rand() - 0.5) * 40;
    const bright = 2 + Math.floor(rand() * 3);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const p = i / len;
      const env = Math.min(1, p * 14) * Math.min(1, (1 - p) * 10) * (0.75 + 0.25 * Math.sin(p * Math.PI * 3));
      const f = f0 + glide * p;
      phase += (TAU * f) / sampleRate;
      let v = 0;
      for (let h = 1; h <= bright + 3; h++) v += Math.sin(phase * h) / h ** 1.15;
      const idx = s0 + i;
      if (idx < n) out[idx] = (out[idx] ?? 0) + v * env * 0.22;
    }
  }
  return out;
}

/** Trilha de teste: pad suave em Lá menor (loop de ~16s, pontas em silêncio para repetir sem estalo). */
export function synthMusic(sampleRate = 24000): Float32Array {
  const chords: number[][] = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [196, 246.94, 293.66],
    [196, 246.94, 392],
  ];
  const chordSec = 4;
  const n = chords.length * chordSec * sampleRate;
  const out = new Float32Array(n);
  chords.forEach((notes, ci) => {
    const s0 = ci * chordSec * sampleRate;
    for (let i = 0; i < chordSec * sampleRate; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, t / 0.8) * Math.min(1, (chordSec - t) / 0.8);
      let v = 0;
      for (const f of notes) {
        v += Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2 * t + 0.4) + 0.2 * Math.sin(TAU * (f / 2) * t);
      }
      const pulse = 0.82 + 0.18 * Math.sin(TAU * 0.5 * (s0 + i) / sampleRate);
      const idx = s0 + i;
      out[idx] = (v / notes.length) * env * pulse * 0.4;
    }
  });
  return out;
}

export function synthWhoosh(sampleRate = 24000): Float32Array {
  const dur = 0.7;
  const n = Math.round(dur * sampleRate);
  const out = new Float32Array(n);
  const rand = rng(7);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const cutoff = 0.02 + 0.5 * Math.sin(p * Math.PI) ** 2;
    lp += cutoff * ((rand() * 2 - 1) - lp);
    const env = Math.sin(p * Math.PI) ** 1.6;
    out[i] = lp * env * 0.9;
  }
  return out;
}

export function synthPop(sampleRate = 24000): Float32Array {
  const dur = 0.18;
  const n = Math.round(dur * sampleRate);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const f = 760 - 460 * p;
    phase += (TAU * f) / sampleRate;
    out[i] = Math.sin(phase) * Math.exp(-p * 7) * 0.8;
  }
  return out;
}

// ─── PNG (sem dependências) ───────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const hexToRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** Imagem de teste: gradiente diagonal com faixas e círculos suaves (determinística). */
export function gradientImage(width: number, height: number, c1: string, c2: string, seed: number): Buffer {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const rand = rng(seed);
  const circles = Array.from({ length: 5 }, () => ({
    x: rand() * width,
    y: rand() * height,
    r: (0.12 + rand() * 0.25) * width,
  }));
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      let r = a[0] + (b[0] - a[0]) * t;
      let g = a[1] + (b[1] - a[1]) * t;
      let bl = a[2] + (b[2] - a[2]) * t;
      for (const c of circles) {
        const d = Math.hypot(x - c.x, y - c.y) / c.r;
        if (d < 1) {
          const k = (1 - d) ** 2 * 0.22;
          r += (255 - r) * k;
          g += (255 - g) * k;
          bl += (255 - bl) * k;
        }
      }
      const i = (y * width + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = bl;
    }
  }
  return encodePng(width, height, rgb);
}
