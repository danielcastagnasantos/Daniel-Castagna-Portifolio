/**
 * Contrato entre o Claude e o app. É propositalmente simples (tudo obrigatório, sem
 * limites numéricos) porque a "saída estruturada" da API aceita só um subconjunto de JSON Schema.
 * A validação rigorosa acontece depois, em `toScript` (com o ScriptSchema do app).
 */
import { z } from "zod";
import { AppError } from "../../errors";
import { MotionSchema, ReferenceAnalysisSchema, ScriptSchema, TransitionSchema, type Script } from "../../../shared/schemas";
import { sceneId } from "../../../shared/script";

export const LlmSceneSchema = z.object({
  narration: z.string().describe("Texto exato que o narrador vai falar nesta cena, em português do Brasil, linguagem falada."),
  on_screen_text: z.string().describe("Texto curto (até 5 palavras) que aparece na tela, ou string vazia."),
  visual_description: z.string().describe("Descrição em português do que o espectador vê nesta cena."),
  image_prompt: z
    .string()
    .describe("Prompt em inglês para gerar a imagem/vídeo desta cena, vertical 9:16, sem texto escrito na imagem."),
  motion: MotionSchema.describe("Movimento de câmera sobre a imagem."),
  transition: TransitionSchema.describe("Transição de entrada desta cena (a primeira cena usa 'cut')."),
  duration_hint_sec: z.number().describe("Duração estimada da fala desta cena, em segundos."),
});

export const LlmScriptSchema = z.object({
  title: z.string().describe("Título interno do vídeo (curto)."),
  hook: z.string().describe("A frase de gancho dos primeiros 3 segundos (igual ou muito próxima à narração da cena 1)."),
  scenes: z.array(LlmSceneSchema).describe("Cenas em ordem."),
  cta: z.string().describe("Chamada para ação final, curta (pode repetir a última cena) ou string vazia."),
  post_caption: z.string().describe("Legenda sugerida para a publicação."),
  hashtags: z.array(z.string()).describe("Hashtags sem o símbolo #."),
});
export type LlmScript = z.infer<typeof LlmScriptSchema>;

export const LlmReferenceAnalysisSchema = z.object({
  summary: z.string(),
  hook_patterns: z.array(z.string()),
  structure: z.array(z.string()),
  retention_techniques: z.array(z.string()),
  pacing_notes: z.string(),
  avoid: z.array(z.string()),
});
export type LlmReferenceAnalysis = z.infer<typeof LlmReferenceAnalysisSchema>;

export function toReferenceAnalysis(a: LlmReferenceAnalysis, generator: string) {
  return ReferenceAnalysisSchema.parse({
    summary: a.summary,
    hookPatterns: a.hook_patterns,
    structure: a.structure,
    retentionTechniques: a.retention_techniques,
    pacingNotes: a.pacing_notes,
    avoid: a.avoid,
    generator,
  });
}

/** Converte a resposta do LLM em Script do app (ids, limites e defaults). */
export function toScript(llm: LlmScript, generator: string): Script {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const scenes = llm.scenes
    .map((s) => ({ ...s, narration: clean(s.narration) }))
    .filter((s) => s.narration.length > 0)
    .map((s, i) => ({
      id: sceneId(i),
      narration: s.narration,
      onScreenText: clean(s.on_screen_text).slice(0, 80) || undefined,
      visual: {
        description: clean(s.visual_description) || "Cena ilustrativa",
        prompt: clean(s.image_prompt) || undefined,
        kind: "auto" as const,
        motion: s.motion,
        libraryTags: [],
      },
      transition: i === 0 ? ("cut" as const) : s.transition,
      sfx: [],
      targetSec: Math.min(90, Math.max(0.5, Number.isFinite(s.duration_hint_sec) ? s.duration_hint_sec : 5)),
    }));
  const parsed = ScriptSchema.safeParse({
    title: clean(llm.title) || "Sem título",
    hook: clean(llm.hook) || scenes[0]?.narration || "",
    scenes,
    cta: clean(llm.cta) || undefined,
    postCaption: llm.post_caption.trim(),
    hashtags: llm.hashtags.map((h) => h.replace(/^#/, "").trim()).filter(Boolean).slice(0, 30),
    generator,
  });
  if (!parsed.success) {
    throw new AppError(
      "LLM_BAD_OUTPUT",
      `O roteiro devolvido pela IA não passou na validação: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}

/**
 * Garante que, numa revisão parcial, as cenas NÃO selecionadas continuam idênticas.
 * Se a IA mexeu nelas, restauramos o original (a IA só pode alterar o que foi pedido).
 */
export function enforceUntouchedScenes(original: Script, revised: Script, targetIds: string[]): Script {
  if (targetIds.length === 0) return revised;
  if (revised.scenes.length !== original.scenes.length) {
    throw new AppError(
      "LLM_BAD_OUTPUT",
      `A IA alterou o número de cenas (${original.scenes.length} → ${revised.scenes.length}) numa revisão parcial. Tente descrever o ajuste com mais precisão.`,
    );
  }
  const scenes = revised.scenes.map((s, i) => {
    const orig = original.scenes[i]!;
    return targetIds.includes(orig.id) ? { ...s, id: orig.id } : orig;
  });
  return { ...revised, scenes, title: original.title, hook: targetIds.includes(original.scenes[0]!.id) ? revised.hook : original.hook };
}

export const LlmIdeasSchema = z.object({
  ideas: z.array(
    z.object({
      theme: z.string().describe("Tema do vídeo em uma frase clara, em português do Brasil."),
      hook: z.string().describe("Sugestão de gancho (primeira frase falada)."),
      why: z.string().describe("Por que esse tema funciona para a marca e para a retenção (1 frase)."),
    }),
  ),
});
