import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRenderPlan } from "./plan";
import { BrandSchema, RenderPlanSchema, ScriptSchema } from "./schemas";
import { lintScript, renumberScenes } from "./script";
import { countWords, distributeWords } from "./timing";

const brand = BrandSchema.parse(JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../config/brands/versao-x.json"), "utf8")));

const script = ScriptSchema.parse({
  title: "Teste",
  hook: "Gancho",
  scenes: [
    { id: "sc-01", narration: "Primeira cena de teste, curta.", visual: { description: "d" }, transition: "cut", targetSec: 3 },
    { id: "sc-02", narration: "Segunda cena um pouco maior para variar o tempo.", visual: { description: "d" }, transition: "slide", targetSec: 4, sfx: [{ name: "pop", offsetSec: 0.5 }] },
    { id: "sc-03", narration: "Terceira.", visual: { description: "d" }, transition: "wipe", targetSec: 2 },
  ],
});
const narrations = Object.fromEntries(
  script.scenes.map((s, i) => {
    const dur = 2 + i * 1.3;
    return [s.id, { src: `data/projects/x/audio/${s.id}.wav`, durationSec: dur, words: distributeWords(s.narration, dur) }];
  }),
);

describe("buildRenderPlan", () => {
  const { plan, warnings } = buildRenderPlan({
    title: "Teste",
    brand: { ...brand, sfx: { ...brand.sfx, onTransition: "whoosh" } },
    script,
    narrations,
    visuals: {},
    music: { src: "assets/m.mp3" },
    sfx: { whoosh: "assets/w.wav" },
  });

  it("gera um plano válido no formato obrigatório (1080×1920 @ 60fps)", () => {
    expect(() => RenderPlanSchema.parse(plan)).not.toThrow();
    expect(plan.width).toBe(1080);
    expect(plan.height).toBe(1920);
    expect(plan.fps).toBe(60);
    expect(plan.totalFrames).toBe(plan.scenes.reduce((n, s) => n + s.durationFrames, 0) - (plan.outro?.durationFrames ?? 0) + (plan.outro?.durationFrames ?? 0));
  });

  it("a soma das cenas é o total do vídeo (sem frames sobrando nem faltando)", () => {
    const sum = plan.scenes.reduce((n, s) => n + s.durationFrames, 0);
    expect(sum).toBe(plan.totalFrames);
    plan.scenes.forEach((s, i) => {
      if (i > 0) expect(s.startFrame).toBe(plan.scenes[i - 1]!.startFrame + plan.scenes[i - 1]!.durationFrames);
    });
  });

  it("cada palavra da narração vira uma palavra de legenda dentro da sua cena", () => {
    const expected = script.scenes.reduce((n, s) => n + countWords(s.narration), 0);
    expect(plan.captions.reduce((n, p) => n + p.words.length, 0)).toBe(expected);
    const byScene = plan.scenes.map((s) => ({ from: s.narration.startFrame, to: s.narration.startFrame + s.narration.durationFrames + 6 }));
    for (const page of plan.captions) {
      for (const w of page.words) expect(byScene.some((r) => w.startFrame >= r.from && w.startFrame <= r.to)).toBe(true);
    }
  });

  it("legendas em ordem e sem sobreposição", () => {
    for (let i = 1; i < plan.captions.length; i++) expect(plan.captions[i]!.startFrame).toBeGreaterThanOrEqual(plan.captions[i - 1]!.endFrame);
  });

  it("falas ficam dentro do vídeo e os intervalos de fala alimentam o ducking", () => {
    expect(plan.audio.speech).toHaveLength(3);
    for (const s of plan.audio.speech) expect(s.endFrame).toBeLessThanOrEqual(plan.totalFrames);
    expect(plan.audio.music?.src).toBe("assets/m.mp3");
  });

  it("efeitos: whoosh nas transições (menos 'cut') e avisa efeito inexistente", () => {
    expect(plan.audio.sfx.filter((e) => e.src === "assets/w.wav")).toHaveLength(2);
    expect(warnings.join(" ")).toContain('"pop"');
  });

  it("é determinístico: mesma entrada, mesmo plano", () => {
    const again = buildRenderPlan({ title: "Teste", brand: { ...brand, sfx: { ...brand.sfx, onTransition: "whoosh" } }, script, narrations, visuals: {}, music: { src: "assets/m.mp3" }, sfx: { whoosh: "assets/w.wav" } }).plan;
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
  });

  it("recusa cena sem narração em vez de gerar vídeo incompleto", () => {
    const partial = { ...narrations };
    delete partial["sc-02"];
    expect(() => buildRenderPlan({ title: "x", brand, script, narrations: partial, visuals: {}, sfx: {} })).toThrow(/sc-02/);
  });
});

describe("script utils", () => {
  it("renumberScenes reatribui ids sequenciais", () => {
    const s = renumberScenes({ ...script, scenes: [script.scenes[2]!, script.scenes[0]!] });
    expect(s.scenes.map((x) => x.id)).toEqual(["sc-01", "sc-02"]);
  });
  it("lintScript avisa quando a duração estimada foge do alvo", () => {
    expect(lintScript(script, 60, 2.6).some((w) => w.level === "warn" && /alvo/.test(w.message))).toBe(true);
  });
});
