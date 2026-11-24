/**
 * Lógica pura de tempo: palavras, páginas de legenda e linha do tempo.
 * É aqui que mora a sincronização áudio ↔ cena ↔ legenda, por isso é testada a fundo.
 */
import type { PlanCaptionPage, WordTiming } from "./schemas";

export const secToFrames = (sec: number, fps: number): number => Math.round(sec * fps);
export const framesToSec = (frames: number, fps: number): number => frames / fps;

/** Tokens de fala (palavras separadas por espaço). */
export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

export function countWords(text: string): number {
  return tokenize(text).length;
}

/** Estimativa de duração de fala (usada só no planejamento; a real vem do áudio). */
export function estimateSpeechSeconds(text: string, wordsPerSecond = 2.5): number {
  const words = countWords(text);
  if (words === 0) return 0;
  const pauses = (text.match(/[.!?…]/g)?.length ?? 0) * 0.28 + (text.match(/[,;:]/g)?.length ?? 0) * 0.12;
  return words / wordsPerSecond + pauses;
}

/**
 * Converte o alinhamento por caractere (formato do endpoint
 * `/v1/text-to-speech/{voice_id}/with-timestamps` da ElevenLabs) em palavras.
 * Uma palavra = sequência de caracteres sem espaço em branco.
 */
export function wordsFromCharAlignment(
  characters: readonly string[],
  startTimes: readonly number[],
  endTimes: readonly number[],
): WordTiming[] {
  const n = Math.min(characters.length, startTimes.length, endTimes.length);
  const words: WordTiming[] = [];
  let text = "";
  let start = 0;
  let end = 0;
  const flush = () => {
    if (text.length > 0) {
      words.push({ text, start, end: Math.max(end, start) });
      text = "";
    }
  };
  for (let i = 0; i < n; i++) {
    const ch = characters[i] ?? "";
    if (ch.trim() === "") {
      flush();
      continue;
    }
    if (text === "") start = startTimes[i] ?? 0;
    text += ch;
    end = endTimes[i] ?? end;
  }
  flush();
  return monotonic(words);
}

/** Garante que nenhuma palavra comece antes do fim da anterior e que end >= start. */
export function monotonic(words: WordTiming[]): WordTiming[] {
  let cursor = 0;
  return words.map((w) => {
    const start = Math.max(w.start, cursor);
    const end = Math.max(w.end, start);
    cursor = start;
    return { text: w.text, start, end };
  });
}

/**
 * Distribui as palavras de um texto ao longo de uma duração conhecida,
 * proporcionalmente ao comprimento (com pausas após pontuação).
 * Usado no modo de teste e como reserva — nunca como "alinhamento real".
 */
export function distributeWords(text: string, durationSec: number, tailSec = 0.08): WordTiming[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];
  const usable = Math.max(0.1, durationSec - tailSec);
  const weights = tokens.map((t) => Math.max(2, t.replace(/[^\p{L}\p{N}]/gu, "").length) + 1);
  const pauses: number[] = tokens.map((t) => (/[.!?…]$/.test(t) ? 3 : /[,;:]$/.test(t) ? 1.4 : 0));
  const total = weights.reduce((a, b) => a + b, 0) + pauses.reduce((a, b) => a + b, 0);
  let t = 0;
  const out: WordTiming[] = [];
  tokens.forEach((token, i) => {
    const w = ((weights[i] ?? 1) / total) * usable;
    const p = ((pauses[i] ?? 0) / total) * usable;
    out.push({ text: token, start: round3(t), end: round3(t + w) });
    t += w + p;
  });
  return out;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// ─── Páginas de legenda ───────────────────────────────────────────────────────
export interface FrameWord {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface CaptionOptions {
  maxWords: number;
  maxChars: number;
  /** Pausa (em frames) entre palavras que força nova página. */
  gapBreakFrames: number;
  /** A página aparece um pouco antes da primeira palavra. */
  leadFrames: number;
  /** A página permanece um pouco depois da última palavra. */
  holdFrames: number;
}

export function defaultCaptionOptions(fps: number, maxWords = 4, maxChars = 26): CaptionOptions {
  return {
    maxWords,
    maxChars,
    gapBreakFrames: Math.round(fps * 0.45),
    leadFrames: Math.round(fps * 0.04),
    holdFrames: Math.round(fps * 0.12),
  };
}

const SENTENCE_END = /[.!?…]["')\]»”]*$/;

/**
 * Agrupa palavras em "páginas" estilo Reels/TikTok (poucas palavras por vez).
 * Garantias (testadas): páginas em ordem, sem sobreposição, cada palavra em
 * exatamente uma página, e endFrame > startFrame.
 */
export function buildCaptionPages(words: readonly FrameWord[], opts: CaptionOptions): PlanCaptionPage[] {
  const groups: FrameWord[][] = [];
  let current: FrameWord[] = [];
  let chars = 0;
  for (const w of words) {
    const prev = current[current.length - 1];
    const wouldChars = chars + (current.length ? 1 : 0) + w.text.length;
    const breakNow =
      current.length > 0 &&
      (current.length >= opts.maxWords ||
        wouldChars > opts.maxChars ||
        w.startFrame - (prev?.endFrame ?? 0) > opts.gapBreakFrames ||
        (prev !== undefined && SENTENCE_END.test(prev.text)));
    if (breakNow) {
      groups.push(current);
      current = [];
      chars = 0;
    }
    chars += (current.length ? 1 : 0) + w.text.length;
    current.push(w);
  }
  if (current.length) groups.push(current);

  const pages: PlanCaptionPage[] = [];
  groups.forEach((g, i) => {
    const first = g[0]!;
    const last = g[g.length - 1]!;
    const prevEnd = pages[i - 1]?.endFrame ?? 0;
    const nextStart = groups[i + 1]?.[0]?.startFrame ?? Number.POSITIVE_INFINITY;
    const startFrame = Math.max(prevEnd, first.startFrame - opts.leadFrames);
    let endFrame = Math.min(last.endFrame + opts.holdFrames, nextStart);
    endFrame = Math.max(endFrame, startFrame + 1);
    pages.push({
      startFrame,
      endFrame,
      words: g.map((w) => ({
        text: w.text,
        startFrame: w.startFrame,
        endFrame: Math.max(w.endFrame, w.startFrame + 1),
      })),
    });
  });
  return pages;
}

// ─── Linha do tempo ───────────────────────────────────────────────────────────
export interface TimelineInput {
  fps: number;
  scenes: { id: string; narrationSec: number; transition: "cut" | "fade" | "slide" | "zoom" | "wipe"; videoSec?: number }[];
  /** Silêncio antes da primeira fala (tempo para o gancho visual entrar). */
  leadInSec?: number;
  /** Respiro entre o fim da fala e o fim da cena. */
  gapSec?: number;
  /** Pequeno atraso da fala em relação ao início da cena (a transição entra primeiro). */
  narrationDelaySec?: number;
  minSceneSec?: number;
  transitionSec?: number;
  outroSec?: number;
}

export interface TimelineScene {
  id: string;
  startFrame: number;
  durationFrames: number;
  transitionFrames: number;
  narrationStartFrame: number;
  narrationFrames: number;
}

export interface Timeline {
  scenes: TimelineScene[];
  totalFrames: number;
  outro?: { startFrame: number; durationFrames: number };
}

export function buildTimeline(input: TimelineInput): Timeline {
  const { fps } = input;
  const leadIn = secToFrames(input.leadInSec ?? 0.4, fps);
  const gap = secToFrames(input.gapSec ?? 0.3, fps);
  const delay = secToFrames(input.narrationDelaySec ?? 0.12, fps);
  const minScene = secToFrames(input.minSceneSec ?? 1.6, fps);
  const transitionBase = secToFrames(input.transitionSec ?? 0.35, fps);
  const outro = secToFrames(input.outroSec ?? 0, fps);

  const scenes: TimelineScene[] = [];
  let cursor = 0;
  input.scenes.forEach((s, i) => {
    const narrationFrames = Math.max(1, secToFrames(s.narrationSec, fps));
    const lead = i === 0 ? leadIn : delay;
    let durationFrames = Math.max(lead + narrationFrames + gap, minScene);
    if (s.videoSec !== undefined) durationFrames = Math.max(durationFrames, 1); // vídeo é recortado/loop; nunca estica a cena
    const prev = scenes[i - 1];
    let transitionFrames = i === 0 || s.transition === "cut" ? 0 : transitionBase;
    if (prev) transitionFrames = Math.min(transitionFrames, Math.floor(prev.durationFrames / 2), Math.floor(durationFrames / 2));
    scenes.push({
      id: s.id,
      startFrame: cursor,
      durationFrames,
      transitionFrames,
      narrationStartFrame: cursor + lead,
      narrationFrames,
    });
    cursor += durationFrames;
  });

  const last = scenes[scenes.length - 1];
  let outroInfo: Timeline["outro"];
  if (last && outro > 0) {
    outroInfo = { startFrame: cursor, durationFrames: outro };
    last.durationFrames += outro;
    cursor += outro;
  }
  return { scenes, totalFrames: cursor, outro: outroInfo };
}

/** Hash numérico estável e pequeno (para sementes de animação). Não é criptográfico. */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
