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

type Role = "hook" | "context" | "point" | "twist" | "closer";
const POOL: Record<Role, string[]> = {
  hook: ["Você já parou para pensar em {t}?", "A resposta pode mudar tudo."],
  context: ["Quase todo mundo vê {t} do jeito óbvio.", "É aí que a gente se engana.", "Mas existe outro ângulo."],
  point: [
    "Existe um detalhe sobre {t} que quase ninguém percebe.",
    "Na prática, {t} depende mais do contexto do que da intenção.",
    "Imagine uma situação simples do dia a dia: é aí que isso aparece.",
    "E repare como o padrão se repete sempre que {t} entra em cena.",
    "Por isso tanta gente erra: trata {t} como algo fixo, e não como processo.",
  ],
  twist: ["Agora a virada: e se o problema nunca foi {t}?", "E sim a pergunta que você faz sobre isso."],
  closer: ["No fim, a pergunta não é o que {t} é.", "É o que você faz com isso."],
};
const LABEL: Record<Role, string> = { hook: "E SE…?", context: "O ÓBVIO", point: "PONTO", twist: "A VIRADA", closer: "E VOCÊ?" };

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
    const budget = req.targetDurationSec * wps;
    const n = Math.min(14, Math.max(3, Math.round(req.targetDurationSec / 6)));
    const middle: Role[] = n === 3 ? ["point"] : n === 4 ? ["context", "twist"] : ["context", ...Array.from({ length: n - 4 }, () => "point" as const), "twist"];
    const roles: Role[] = ["hook", ...middle, "closer"];
    const perScene = budget / roles.length;

    let pointNo = 0;
    const scenes = roles.map((role, i) => {
      const pool = POOL[role];
      const target = role === "hook" ? Math.min(perScene, 13) : perScene;
      const base = role === "point" ? i : 0; // varia as frases de cada ponto
      let text = pool[base % pool.length]!;
      for (let k = 1; k < pool.length * 2; k++) {
        const next = pool[(base + k) % pool.length]!;
        if (countWords(text) + countWords(next) > target * 1.05) break;
        text += " " + next;
      }
      if (role === "closer" && req.brand.script.defaultCta && countWords(text) + countWords(req.brand.script.defaultCta) <= target * 1.3) text += " " + req.brand.script.defaultCta;
      text = text.replaceAll("{t}", t);
      const label = role === "point" ? `${LABEL.point} ${++pointNo}` : LABEL[role];
      return { role, text, label };
    });

    return ScriptSchema.parse({
      title: `[TESTE] ${full.slice(0, 80)}`,
      hook: scenes[0]!.text,
      scenes: scenes.map((sc, i) => ({
        id: sceneId(i),
        narration: sc.text,
        onScreenText: sc.label,
        visual: {
          description: `Cena ${i + 1} (teste): fundo gráfico animado com a palavra-chave "${sc.label}".`,
          prompt: `Abstract cinematic vertical background about "${t}", minimal, no text`,
          kind: "auto",
          motion: MotionSchema.parse(MOTIONS[i % MOTIONS.length]),
          libraryTags: [],
        },
        transition: i === 0 ? "cut" : TRANSITIONS[i % TRANSITIONS.length],
        sfx: [],
        targetSec: Math.max(1, Math.round((countWords(sc.text) / wps) * 10) / 10),
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
