/**
 * Monta o "plano de renderização" (entrada do Remotion) a partir do roteiro aprovado,
 * da narração (com tempo de cada palavra) e dos visuais. Função pura e determinística:
 * a mesma entrada gera sempre o mesmo plano (e, portanto, o mesmo hash).
 */
import {
  GRAPHIC_VARIANTS,
  VIDEO,
  type Brand,
  type GraphicVariant,
  type RenderPlan,
  type Script,
  type WordTiming,
} from "./schemas";
import {
  buildCaptionPages,
  buildTimeline,
  defaultCaptionOptions,
  rng,
  secToFrames,
  seedFromString,
  type FrameWord,
} from "./timing";

export interface PlanNarration {
  /** Caminho servido pelo servidor de assets (relativo, sem barra inicial). */
  src: string;
  durationSec: number;
  words: WordTiming[];
}

export interface PlanVisual {
  kind: "image" | "video" | "graphic";
  src?: string;
  graphic?: GraphicVariant;
  durationSec?: number;
}

export interface PlanInput {
  title: string;
  brand: Brand;
  script: Script;
  narrations: Record<string, PlanNarration>;
  visuals: Record<string, PlanVisual>;
  music?: { src: string };
  /** nome do efeito → caminho servido. */
  sfx: Record<string, string>;
  fps?: number;
}

export interface PlanResult {
  plan: RenderPlan;
  warnings: string[];
}

export function pickGraphic(seed: number): GraphicVariant {
  const idx = Math.floor(rng(seed)() * GRAPHIC_VARIANTS.length);
  return GRAPHIC_VARIANTS[idx] ?? "orbs";
}

export function buildRenderPlan(input: PlanInput): PlanResult {
  const fps = input.fps ?? VIDEO.fps;
  const { brand, script } = input;
  const warnings: string[] = [];

  const missing = script.scenes.filter((s) => !input.narrations[s.id]).map((s) => s.id);
  if (missing.length) throw new Error(`Narração ausente para as cenas: ${missing.join(", ")}`);

  const outroSec = brand.outro.enabled ? brand.outro.seconds : 0;
  const timeline = buildTimeline({
    fps,
    outroSec,
    scenes: script.scenes.map((s) => ({
      id: s.id,
      narrationSec: input.narrations[s.id]!.durationSec,
      transition: s.transition,
    })),
  });

  const captionOpts = defaultCaptionOptions(fps, brand.captions.maxWordsPerPage, brand.captions.maxCharsPerPage);
  const pages: RenderPlan["captions"] = [];
  const speech: RenderPlan["audio"]["speech"] = [];
  const sfx: RenderPlan["audio"]["sfx"] = [];

  const scenes = script.scenes.map((s, i): RenderPlan["scenes"][number] => {
    const tl = timeline.scenes[i]!;
    const nar = input.narrations[s.id]!;
    const vis = input.visuals[s.id];
    const seed = seedFromString(`${s.id}:${script.title}`);

    // Palavras → frames globais (relativos ao início do vídeo).
    const words: FrameWord[] = nar.words.map((w) => ({
      text: w.text,
      startFrame: tl.narrationStartFrame + secToFrames(w.start, fps),
      endFrame: tl.narrationStartFrame + Math.max(secToFrames(w.end, fps), secToFrames(w.start, fps) + 1),
    }));
    pages.push(...buildCaptionPages(words, captionOpts));
    speech.push({ startFrame: tl.narrationStartFrame, endFrame: tl.narrationStartFrame + tl.narrationFrames });

    const transitionStart = tl.startFrame - tl.transitionFrames;
    if (i > 0 && s.transition !== "cut" && brand.sfx.onTransition) {
      const src = input.sfx[brand.sfx.onTransition];
      if (src) sfx.push({ src, atFrame: Math.max(0, transitionStart), volume: brand.sfx.volume });
      else warnings.push(`Efeito de transição "${brand.sfx.onTransition}" não encontrado na biblioteca da marca.`);
    }
    for (const cue of s.sfx) {
      const src = input.sfx[cue.name];
      if (!src) {
        warnings.push(`Cena ${s.id}: efeito sonoro "${cue.name}" não existe na biblioteca da marca (ignorado).`);
        continue;
      }
      sfx.push({ src, atFrame: tl.startFrame + secToFrames(cue.offsetSec, fps), volume: brand.sfx.volume });
    }

    const kind = vis?.kind ?? "graphic";
    const clipFrames = kind === "video" && vis?.durationSec ? Math.max(1, secToFrames(vis.durationSec, fps)) : undefined;
    return {
      id: s.id,
      index: i,
      startFrame: tl.startFrame,
      durationFrames: tl.durationFrames,
      transitionFrames: tl.transitionFrames,
      transition: s.transition,
      motion: s.visual.motion,
      visual: {
        kind,
        src: vis?.src,
        graphic: vis?.graphic ?? s.visual.graphic ?? pickGraphic(seed),
        clipFrames,
      },
      onScreenText: s.onScreenText,
      narration: { src: nar.src, startFrame: tl.narrationStartFrame, durationFrames: tl.narrationFrames },
      seed,
    };
  });

  // Páginas em ordem, sem sobreposição entre cenas.
  pages.sort((a, b) => a.startFrame - b.startFrame);
  for (let i = 0; i < pages.length; i++) {
    const cur = pages[i]!;
    const next = pages[i + 1];
    if (next && cur.endFrame > next.startFrame) cur.endFrame = Math.max(cur.startFrame + 1, next.startFrame);
  }

  const total = timeline.totalFrames;
  const fadeIn = secToFrames(brand.music.fadeInSec, fps);
  const fadeOut = secToFrames(brand.music.fadeOutSec, fps);

  const plan: RenderPlan = {
    fps,
    width: VIDEO.width,
    height: VIDEO.height,
    totalFrames: total,
    title: input.title,
    brand,
    scenes,
    captions: pages,
    outro: timeline.outro ? { ...timeline.outro, text: brand.outro.text } : undefined,
    audio: {
      music: input.music
        ? {
            src: input.music.src,
            volume: brand.music.volume,
            duckedVolume: brand.music.duckedVolume,
            fadeInFrames: fadeIn,
            fadeOutFrames: fadeOut,
          }
        : undefined,
      speech,
      sfx: sfx.filter((e) => e.atFrame < total),
    },
    assetBase: "",
  };
  return { plan, warnings };
}
