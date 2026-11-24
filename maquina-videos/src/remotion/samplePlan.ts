/** Plano de exemplo (só gráficos, sem áudio) para abrir a composição no Remotion Studio: `npm run studio`. */
import versaoX from "../../config/brands/versao-x.json";
import { buildRenderPlan } from "../shared/plan";
import { BrandSchema, ScriptSchema, type RenderPlan } from "../shared/schemas";
import { distributeWords } from "../shared/timing";

const brand = BrandSchema.parse(versaoX);
const lines = [
  "Você já parou para pensar por que o tempo parece passar mais rápido com a idade?",
  "Quase tudo depende de uma coisa simples: o quanto o seu cérebro estranha o dia.",
  "Quando tudo é novo, ele grava mais detalhes. Quando tudo é rotina, ele resume.",
  "Por isso uma semana diferente parece longa. E um ano igual passa num piscar de olhos.",
];
const script = ScriptSchema.parse({
  title: "Exemplo",
  hook: lines[0],
  scenes: lines.map((narration, i) => ({
    id: `sc-0${i + 1}`,
    narration,
    onScreenText: ["POR QUÊ?", "NOVIDADE", "ROTINA", "O TEMPO"][i],
    visual: { description: "exemplo", kind: "graphic", motion: "zoom-in" },
    transition: i === 0 ? "cut" : (["fade", "slide", "zoom", "wipe"] as const)[i % 4],
    targetSec: 5,
  })),
  generator: "exemplo",
});
const narrations = Object.fromEntries(
  script.scenes.map((s) => {
    const dur = s.narration.split(" ").length / 2.8;
    return [s.id, { src: "", durationSec: dur, words: distributeWords(s.narration, dur) }];
  }),
);

export const samplePlan: RenderPlan = buildRenderPlan({
  title: script.title,
  brand,
  script,
  narrations,
  visuals: {},
  sfx: {},
}).plan;
