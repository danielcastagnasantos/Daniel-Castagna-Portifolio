import { describe, expect, it } from "vitest";
import {
  buildCaptionPages,
  buildTimeline,
  defaultCaptionOptions,
  distributeWords,
  estimateSpeechSeconds,
  rng,
  wordsFromCharAlignment,
  type FrameWord,
} from "./timing";

const align = (text: string, perChar = 0.05) => {
  const chars = [...text];
  return {
    chars,
    starts: chars.map((_, i) => i * perChar),
    ends: chars.map((_, i) => (i + 1) * perChar),
  };
};

describe("wordsFromCharAlignment (formato da ElevenLabs)", () => {
  it("agrupa caracteres em palavras com início do 1º e fim do último caractere", () => {
    const a = align("Olá mundo");
    const words = wordsFromCharAlignment(a.chars, a.starts, a.ends);
    expect(words.map((w) => w.text)).toEqual(["Olá", "mundo"]);
    expect(words[0]!.text).toBe("Olá");
    expect(words[0]!.start).toBe(0);
    expect(words[0]!.end).toBeCloseTo(0.15);
    expect(words[1]!.start).toBeCloseTo(0.2);
    expect(words[1]!.end).toBeCloseTo(0.45);
  });

  it("ignora espaços duplos, quebras de linha e pontas, e mantém a pontuação na palavra", () => {
    const a = align("  Sim,  isso\nfunciona! ");
    const words = wordsFromCharAlignment(a.chars, a.starts, a.ends);
    expect(words.map((w) => w.text)).toEqual(["Sim,", "isso", "funciona!"]);
  });

  it("nunca devolve tempos decrescentes, mesmo com dados ruins", () => {
    const words = wordsFromCharAlignment(["a", " ", "b"], [1, 0.5, 0.2], [0.9, 0.6, 0.3]);
    expect(words[1]!.start).toBeGreaterThanOrEqual(words[0]!.start);
    for (const w of words) expect(w.end).toBeGreaterThanOrEqual(w.start);
  });

  it("lida com tamanhos de array diferentes sem estourar", () => {
    expect(wordsFromCharAlignment(["a", "b", " ", "c"], [0, 0.1], [0.1, 0.2]).map((w) => w.text)).toEqual(["ab"]);
  });
});

describe("distributeWords (modo de teste)", () => {
  it("cobre toda a duração em ordem crescente", () => {
    const w = distributeWords("Uma frase de teste, com pausas. E outra frase!", 6);
    expect(w).toHaveLength(9);
    for (let i = 1; i < w.length; i++) expect(w[i]!.start).toBeGreaterThanOrEqual(w[i - 1]!.end);
    expect(w.at(-1)!.end).toBeLessThanOrEqual(6);
    expect(w.at(-1)!.end).toBeGreaterThan(5);
  });
  it("texto vazio → sem palavras", () => expect(distributeWords("   ", 3)).toEqual([]));
});

describe("estimateSpeechSeconds", () => {
  it("cresce com o texto e considera pausas", () => {
    expect(estimateSpeechSeconds("um dois três quatro cinco", 2.5)).toBeCloseTo(2);
    expect(estimateSpeechSeconds("um. dois. três.", 2.5)).toBeGreaterThan(estimateSpeechSeconds("um dois três", 2.5));
    expect(estimateSpeechSeconds("")).toBe(0);
  });
});

function randomWords(seed: number, n: number, fps = 60): FrameWord[] {
  const r = rng(seed);
  let f = 5;
  const out: FrameWord[] = [];
  for (let i = 0; i < n; i++) {
    const len = 6 + Math.floor(r() * 22);
    const text = "x".repeat(1 + Math.floor(r() * 9)) + (r() < 0.12 ? "." : r() < 0.15 ? "," : "");
    out.push({ text, startFrame: f, endFrame: f + len });
    f += len + Math.floor(r() * (r() < 0.1 ? fps : 6));
  }
  return out;
}

describe("buildCaptionPages — invariantes (testadas com 200 entradas aleatórias)", () => {
  const opts = defaultCaptionOptions(60, 4, 24);
  it("toda palavra aparece exatamente uma vez, em ordem", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const words = randomWords(seed, 5 + (seed % 40));
      const pages = buildCaptionPages(words, opts);
      const flat = pages.flatMap((p) => p.words);
      expect(flat.map((w) => `${w.text}@${w.startFrame}`)).toEqual(words.map((w) => `${w.text}@${w.startFrame}`));
    }
  });
  it("páginas em ordem, sem sobreposição e com duração positiva", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pages = buildCaptionPages(randomWords(seed, 5 + (seed % 40)), opts);
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]!;
        expect(p.endFrame).toBeGreaterThan(p.startFrame);
        if (i > 0) expect(p.startFrame).toBeGreaterThanOrEqual(pages[i - 1]!.endFrame);
      }
    }
  });
  it("respeita o máximo de palavras e de caracteres por página", () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const p of buildCaptionPages(randomWords(seed, 30), opts)) {
        expect(p.words.length).toBeLessThanOrEqual(4);
        expect(p.words.map((w) => w.text).join(" ").length).toBeLessThanOrEqual(24);
      }
    }
  });
  it("quebra a página no fim de frase e em pausas longas", () => {
    const w: FrameWord[] = [
      { text: "Oi.", startFrame: 10, endFrame: 20 },
      { text: "Tudo", startFrame: 22, endFrame: 30 },
      { text: "bem", startFrame: 90, endFrame: 100 },
    ];
    const pages = buildCaptionPages(w, opts);
    expect(pages.map((p) => p.words.map((x) => x.text))).toEqual([["Oi."], ["Tudo"], ["bem"]]);
  });
});

describe("buildTimeline", () => {
  const scenes = [
    { id: "a", narrationSec: 3.2, transition: "cut" as const },
    { id: "b", narrationSec: 4.7, transition: "fade" as const },
    { id: "c", narrationSec: 0.5, transition: "slide" as const },
  ];
  it("posiciona cenas em sequência, sem buracos, e a fala sempre cabe na cena", () => {
    const t = buildTimeline({ fps: 60, scenes, outroSec: 2 });
    let cursor = 0;
    for (const s of t.scenes.slice(0, -1)) {
      expect(s.startFrame).toBe(cursor);
      cursor += s.durationFrames;
      expect(s.narrationStartFrame + s.narrationFrames).toBeLessThanOrEqual(s.startFrame + s.durationFrames);
    }
    const last = t.scenes.at(-1)!;
    expect(last.startFrame).toBe(cursor);
    expect(last.startFrame + last.durationFrames).toBe(t.totalFrames);
    expect(last.narrationStartFrame + last.narrationFrames).toBeLessThanOrEqual(last.startFrame + last.durationFrames - 120);
  });
  it("duração da fala em frames confere com o áudio (±1 frame)", () => {
    const t = buildTimeline({ fps: 60, scenes });
    expect(Math.abs(t.scenes[0]!.narrationFrames - 3.2 * 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(t.scenes[1]!.narrationFrames - 4.7 * 60)).toBeLessThanOrEqual(1);
  });
  it("transição: zero para 'cut' e na 1ª cena; nunca passa da metade da cena anterior", () => {
    const t = buildTimeline({ fps: 60, scenes, minSceneSec: 0.2, gapSec: 0, narrationDelaySec: 0 });
    expect(t.scenes[0]!.transitionFrames).toBe(0);
    expect(t.scenes[1]!.transitionFrames).toBeGreaterThan(0);
    for (let i = 1; i < t.scenes.length; i++) {
      expect(t.scenes[i]!.transitionFrames).toBeLessThanOrEqual(Math.floor(t.scenes[i - 1]!.durationFrames / 2));
    }
  });
  it("o cartão final soma ao total", () => {
    const a = buildTimeline({ fps: 60, scenes });
    const b = buildTimeline({ fps: 60, scenes, outroSec: 2 });
    expect(b.totalFrames - a.totalFrames).toBe(120);
    expect(b.outro).toEqual({ startFrame: a.totalFrames, durationFrames: 120 });
  });
});
