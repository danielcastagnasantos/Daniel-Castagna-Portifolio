import type { Brand, ReferenceAnalysis, Reference, Script } from "../../../shared/schemas";

/** Quantas cenas pedir: ~1 ideia a cada 6–8 segundos mantém a retenção alta. */
export function suggestSceneCount(targetSec: number): { min: number; max: number } {
  const mid = Math.round(targetSec / 6.5);
  return { min: Math.max(4, mid - 2), max: Math.max(5, mid + 2) };
}

export function scriptSystemPrompt(brand: Brand): string {
  return [
    `Você é roteirista sênior de vídeos curtos verticais (Reels/TikTok/Shorts) da marca "${brand.name}" — ${brand.tagline}.`,
    "",
    "GUIA DE ESTILO DA MARCA:",
    brand.script.styleGuide,
    "",
    brand.script.forbidden.length ? `PROIBIDO: ${brand.script.forbidden.join("; ")}.` : "",
    "",
    "REGRAS DE FORMATO:",
    "- Idioma: português do Brasil, linguagem falada, frases curtas.",
    "- A narração de cada cena é o texto EXATO que será lido em voz alta: sem emojis, sem hashtags, sem indicações de cena entre colchetes, sem números por extenso confusos (escreva como se fala).",
    "- Cada cena carrega UMA ideia. A cena 1 é o gancho (até ~3 segundos de fala).",
    "- 'image_prompt' em inglês, descreve uma imagem vertical 9:16 SEM texto escrito, sem logotipos e sem pessoas reais identificáveis.",
    "- 'on_screen_text': no máximo 5 palavras, só quando reforça a ideia (senão, string vazia).",
    "- A primeira cena usa transição 'cut'. Varie as demais entre fade, slide, zoom e wipe com bom senso.",
    "- O roteiro precisa ser ORIGINAL. Referências servem só para entender padrões de ritmo e retenção — nunca copie frases.",
    "- Seja factual. Não invente estatísticas, estudos, citações, nomes ou datas.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function scriptUserPrompt(args: {
  theme: string;
  targetSec: number;
  wordsPerSecond: number;
  analysis?: ReferenceAnalysis;
}): string {
  const scenes = suggestSceneCount(args.targetSec);
  const words = Math.round(args.targetSec * args.wordsPerSecond);
  const lines = [
    `TEMA: ${args.theme}`,
    `DURAÇÃO ALVO: ${args.targetSec} segundos de narração.`,
    `Isso equivale a cerca de ${words} palavras no total (≈ ${args.wordsPerSecond} palavras por segundo). Respeite esse volume com margem de ±15%.`,
    `Use entre ${scenes.min} e ${scenes.max} cenas.`,
  ];
  if (args.analysis) {
    lines.push(
      "",
      "PADRÕES OBSERVADOS NAS REFERÊNCIAS (use como inspiração de ritmo, não copie):",
      `- Resumo: ${args.analysis.summary}`,
      ...args.analysis.hookPatterns.map((h) => `- Gancho: ${h}`),
      ...args.analysis.retentionTechniques.map((h) => `- Retenção: ${h}`),
      `- Ritmo: ${args.analysis.pacingNotes}`,
      ...args.analysis.avoid.map((h) => `- Evitar: ${h}`),
    );
  }
  lines.push("", "Escreva o roteiro completo.");
  return lines.join("\n");
}

export function reviseUserPrompt(args: { script: Script; instruction: string; sceneIds: string[]; targetSec: number }): string {
  const compact = {
    title: args.script.title,
    hook: args.script.hook,
    cta: args.script.cta ?? "",
    post_caption: args.script.postCaption,
    hashtags: args.script.hashtags,
    scenes: args.script.scenes.map((s) => ({
      id: s.id,
      narration: s.narration,
      on_screen_text: s.onScreenText ?? "",
      visual_description: s.visual.description,
      image_prompt: s.visual.prompt ?? "",
      motion: s.visual.motion,
      transition: s.transition,
      duration_hint_sec: s.targetSec,
    })),
  };
  const scope = args.sceneIds.length
    ? `Altere SOMENTE as cenas: ${args.sceneIds.join(", ")}. Todas as outras cenas devem voltar IDÊNTICAS, na mesma ordem, e o número de cenas deve continuar o mesmo (${args.script.scenes.length}).`
    : "Você pode ajustar o roteiro inteiro, mantendo a duração perto do alvo.";
  return [
    "ROTEIRO ATUAL (JSON):",
    JSON.stringify(compact, null, 2),
    "",
    `PEDIDO DE ALTERAÇÃO: ${args.instruction}`,
    scope,
    `Duração alvo total: ${args.targetSec}s.`,
    "Devolva o roteiro COMPLETO já com a alteração aplicada.",
  ].join("\n");
}

export function referencesSystemPrompt(brand: Brand): string {
  return [
    `Você analisa vídeos curtos de referência para a marca "${brand.name}".`,
    "O objetivo é extrair PADRÕES (estrutura, tipo de gancho, técnicas de retenção, ritmo) para inspirar um roteiro ORIGINAL.",
    "Nunca reproduza frases das referências nem sugira copiá-las. Descreva o padrão com suas palavras.",
  ].join("\n");
}

export function referencesUserPrompt(theme: string, refs: Reference[]): string {
  return [
    `TEMA DO NOVO VÍDEO: ${theme}`,
    "",
    "REFERÊNCIAS FORNECIDAS PELO USUÁRIO (textos/transcrições autorizados):",
    ...refs.map((r, i) => `--- Referência ${i + 1}${r.title ? ` (${r.title})` : ""} ---\n${r.text}`),
    "",
    "Analise os padrões de narrativa e retenção.",
  ].join("\n");
}

export function ideasUserPrompt(args: { count: number; topic?: string; avoid: string[] }): string {
  return [
    `Sugira ${args.count} ideias de vídeos curtos para a marca.`,
    args.topic ? `Assunto/nicho de interesse: ${args.topic}` : "Escolha assuntos variados dentro do estilo da marca.",
    args.avoid.length ? `NÃO repita nem se aproxime destes temas já produzidos:\n${args.avoid.map((a) => `- ${a}`).join("\n")}` : "",
    "Cada ideia deve ser específica (não genérica), factual e filmável em 30–60 segundos. Não invente fatos nem dados.",
  ]
    .filter(Boolean)
    .join("\n");
}
