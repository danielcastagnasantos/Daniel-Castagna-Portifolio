/**
 * Roteirista do MODO DE TESTE. Não usa IA nem rede: monta um roteiro de exemplo a partir do
 * tema, com a estrutura certa (gancho → contexto → pontos → virada → fechamento), para
 * exercitar o pipeline inteiro sem custo. O texto é genérico de propósito.
 */
import { MotionSchema, ScriptSchema, type Brand, type Motion, type Reference, type ReferenceAnalysis, type Script, type Transition } from "../../../shared/schemas";
import { sceneId } from "../../../shared/script";
import { countWords, tokenize } from "../../../shared/timing";
import type { LlmProvider } from "./types";

const MOTIONS: Motion[] = ["zoom-in", "pan-left", "zoom-out", "pan-right", "pan-up", "pan-down"];
const TRANSITIONS: Transition[] = ["fade", "slide", "zoom", "wipe", "fade"];

const POINT_SENTENCES = [
  "Existe um detalhe sobre {t} que quase ninguém percebe, e ele muda tudo.",
  "Quando você olha de perto, {t} funciona de um jeito bem diferente do que parece.",
  "O mais curioso é que, na prática, {t} depende muito mais do contexto do que da intenção.",
  "Imagine uma situação simples do dia a dia: é aí que {t} aparece com mais clareza.",
  "E repare como isso se repete: sempre que {t} entra em cena, o resultado muda.",
  "Por isso a maioria das pessoas erra: elas tratam {t} como algo fixo, e não como um processo.",
];
const CLOSERS = [
  "No fim, a pergunta não é o que {t} é, e sim o que você faz com isso.",
  "Talvez a versão mais útil de {t} seja justamente a que você ainda não tentou.",
];

export class MockLlm implements LlmProvider {
  readonly id = "teste";

  async analyzeReferences(req: { brand: Brand; theme: string; references: Reference[] }): Promise<ReferenceAnalysis> {
    // Heurística real sobre o texto fornecido (não é IA): mede o que dá para medir.
    const texts = req.references.map((r) => r.text);
    const sentences = texts.flatMap((t) => t.split(/(?<=[.!?…])\s+/)).filter(Boolean);
    const avgWords = sentences.length ? sentences.reduce((n, s) => n + countWords(s), 0) / sentences.length : 0;
    const questions = sentences.filter((s) => s.trim().endsWith("?")).length;
    const hooks = texts.map((t) => tokenize(t).slice(0, 12).join(" ")).filter(Boolean);
    return {
      summary: `Análise local (modo de teste, sem IA): ${req.references.length} referência(s), ${sentences.length} frases, média de ${avgWords.toFixed(1)} palavras por frase, ${questions} pergunta(s).`,
      hookPatterns: hooks.map((h) => `Abertura observada: "${h}…"`),
      structure: ["(teste) A estrutura real só é inferida pela IA no modo ao vivo."],
      retentionTechniques: [
        avgWords <= 14 ? "Frases curtas (média ≤ 14 palavras)." : "Frases longas — considere encurtar.",
        questions > 0 ? "Uso de perguntas para abrir ciclos de curiosidade." : "Poucas perguntas — oportunidade de abrir ciclos.",
      ],
      pacingNotes: `Ritmo estimado a partir do tamanho médio das frases (${avgWords.toFixed(1)} palavras).`,
      avoid: ["Copiar frases das referências: o roteiro deve ser original."],
      generator: this.id,
    };
  }

  async generateScript(req: { brand: Brand; theme: string; targetDurationSec: number; language: string }): Promise<Script> {
    const full = req.theme.trim().replace(/[.!?]+$/, "");
    // Frases de teste com o tema inteiro ficam longas demais: usa só as primeiras palavras.
    const t = tokenize(full).length > 6 ? tokenize(full).slice(0, 6).join(" ") : full;
    const wps = req.brand.script.wordsPerSecond;
    const budget = Math.round(req.targetDurationSec * wps);
    const sceneCount = Math.min(14, Math.max(4, Math.round(req.targetDurationSec / 7)));
    const pointCount = sceneCount - 4;

    // Cada cena é uma lista de frases; cortamos frases do fim até caber no orçamento de palavras.
    const sentences: string[][] = [];
    sentences.push([`Você já parou para pensar em ${t}?`, "A resposta pode mudar tudo."]);
    sentences.push([`Quase todo mundo vê ${t} do jeito óbvio.`, "É aí que a gente se engana."]);
    for (let i = 0; i < pointCount; i++) {
      sentences.push([
        `Ponto ${i + 1}. ${POINT_SENTENCES[i % POINT_SENTENCES.length]!.replaceAll("{t}", t)}`,
        POINT_SENTENCES[(i + 2) % POINT_SENTENCES.length]!.replaceAll("{t}", t),
      ]);
    }
    sentences.push([`Agora a virada: e se o problema nunca foi ${t}?`, "E sim a pergunta que você faz sobre isso."]);
    sentences.push([CLOSERS[0]!.replaceAll("{t}", t), req.brand.script.defaultCta].filter(Boolean));

    const total = () => sentences.reduce((n, sc) => n + sc.reduce((m, s) => m + countWords(s), 0), 0);
    for (let guard = 0; total() > budget && guard < 200; guard++) {
      // remove a última frase da cena mais longa que ainda tem mais de uma frase
      const candidates = sentences.map((sc, i) => ({ i, w: sc.reduce((m, s) => m + countWords(s), 0), n: sc.length })).filter((c) => c.n > 1);
      if (candidates.length === 0) break;
      candidates.sort((a, b) => b.w - a.w);
      sentences[candidates[0]!.i]!.pop();
    }
    const narrations = sentences.map((sc) => sc.join(" "));
    const onScreen = ["E SE…?", "O ÓBVIO", ...Array.from({ length: pointCount }, (_, i) => `PONTO ${i + 1}`), "A VIRADA", "E VOCÊ?"];
    return ScriptSchema.parse({
      title: `[TESTE] ${full.slice(0, 80)}`,
      hook: narrations[0],
      scenes: narrations.map((narration, i) => ({
        id: sceneId(i),
        narration,
        onScreenText: onScreen[i],
        visual: {
          description: `Cena ${i + 1} (teste): fundo gráfico animado com a palavra-chave "${onScreen[i] ?? ""}".`,
          prompt: `Abstract cinematic vertical background about "${t}", minimal, no text`,
          kind: "auto",
          motion: MotionSchema.parse(MOTIONS[i % MOTIONS.length]),
          libraryTags: [],
        },
        transition: i === 0 ? "cut" : TRANSITIONS[i % TRANSITIONS.length],
        sfx: [],
        targetSec: Math.max(1, Math.round((countWords(narration) / wps) * 10) / 10),
      })),
      cta: req.brand.script.defaultCta || undefined,
      postCaption: `[TESTE] ${full}`,
      hashtags: ["teste", req.brand.id.replace(/-/g, "")],
      generator: this.id,
    });
  }

  async reviseScript(req: { brand: Brand; script: Script; instruction: string; sceneIds: string[] }): Promise<Script> {
    // Modo de teste: a IA NÃO reescreve. Trocamos a fala das cenas pedidas por um texto de
    // exemplo que cita o pedido — suficiente para testar o fluxo de "alterar cena → regerar → renderizar".
    const targets = req.sceneIds.length ? new Set(req.sceneIds) : new Set(req.script.scenes.map((s) => s.id));
    const ask = req.instruction.trim().replace(/[.!?]+$/, "");
    return {
      ...req.script,
      generator: this.id,
      scenes: req.script.scenes.map((s) =>
        targets.has(s.id)
          ? { ...s, narration: `Versão ajustada desta cena, conforme o pedido: ${ask}. Esta é uma resposta de teste, sem IA.` }
          : s,
      ),
    };
  }
}
