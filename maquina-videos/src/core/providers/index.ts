import type { AppConfig } from "../config";
import { MissingConfigError } from "../errors";
import type { Ffmpeg } from "../media/ffmpeg";
import type { Brand, VisualMode } from "../../shared/schemas";
import { pickGraphic } from "../../shared/plan";
import { AnthropicLlm } from "./llm/anthropic";
import { MockLlm } from "./llm/mock";
import type { LlmProvider } from "./llm/types";
import { ElevenLabsTts } from "./tts/elevenlabs";
import { MockTts } from "./tts/mock";
import type { TtsProvider, VoiceConfig } from "./tts/types";
import { LibraryVisuals } from "./visual/library";
import { MockVisuals } from "./visual/mock";
import { RunwayVisuals } from "./visual/runway";
import type { VisualProvider, VisualRequest, VisualResult } from "./visual/types";
import path from "node:path";

/** Decide de onde vem o visual de cada cena, respeitando o modo escolhido no projeto. */
export class VisualResolver {
  constructor(
    private mode: VisualMode,
    private library: LibraryVisuals,
    private generator?: VisualProvider,
  ) {}

  /** Identificador estável para o hash de cache. */
  get id(): string {
    return `${this.mode}:${this.generator?.id ?? "-"}`;
  }

  async resolve(req: VisualRequest): Promise<VisualResult> {
    const graphic = (): VisualResult => ({
      kind: "graphic",
      graphic: req.scene.visual.graphic ?? pickGraphic(req.seed),
      provider: "procedural",
    });
    if (req.scene.visual.kind === "graphic" || this.mode === "graphics") return graphic();

    // Biblioteca (grátis): sempre tentada no modo "library"; nos modos de geração, só se a cena pedir tags.
    if (this.mode === "library" || req.scene.visual.libraryTags.length > 0) {
      const hit = await this.library.resolve(req);
      if (hit) return hit;
      if (this.mode === "library") return graphic();
    }
    if (this.generator) {
      const scene =
        this.mode === "generated-video" && this.generator instanceof MockVisuals
          ? { ...req.scene, visual: { ...req.scene.visual, kind: "video" as const } }
          : req.scene;
      const out = await this.generator.resolve({ ...req, scene });
      if (out) return out;
    }
    return graphic();
  }
}

export interface Providers {
  testMode: boolean;
  llm: LlmProvider;
  tts: TtsProvider;
  visuals: VisualResolver;
  voiceFor(brand: Brand): VoiceConfig;
}

export interface ProviderOptions {
  testMode: boolean;
  visualMode: VisualMode;
}

export function createProviders(config: AppConfig, opts: ProviderOptions, ffmpeg: Ffmpeg): Providers {
  const library = new LibraryVisuals(path.join(config.assetsDir, "library"));
  let llm: LlmProvider;
  let tts: TtsProvider;
  let generator: VisualProvider | undefined;

  if (opts.testMode) {
    llm = new MockLlm();
    tts = new MockTts();
    if (opts.visualMode === "generated-images" || opts.visualMode === "generated-video") generator = new MockVisuals(ffmpeg);
  } else {
    if (!config.anthropic.apiKey) {
      throw new MissingConfigError("ANTHROPIC_API_KEY", "Preencha a chave no arquivo .env (veja .env.example) ou crie o projeto em modo de teste.");
    }
    if (!config.elevenlabs.apiKey) {
      throw new MissingConfigError("ELEVENLABS_API_KEY", "Preencha a chave no arquivo .env (veja .env.example) ou crie o projeto em modo de teste.");
    }
    llm = new AnthropicLlm({ apiKey: config.anthropic.apiKey, model: config.anthropic.model, fallbacks: config.anthropic.fallbacks });
    tts = new ElevenLabsTts({ apiKey: config.elevenlabs.apiKey });
    if (opts.visualMode === "generated-images" || opts.visualMode === "generated-video") {
      if (!config.runway.apiKey) {
        throw new MissingConfigError("RUNWAYML_API_SECRET", "Preencha a chave da Runway no .env, ou escolha 'Gráficos' / 'Biblioteca' como fonte dos visuais.");
      }
      generator = new RunwayVisuals({
        apiKey: config.runway.apiKey,
        imageModel: config.runway.imageModel,
        videoModel: config.runway.videoModel,
        mode: opts.visualMode === "generated-video" ? "video" : "images",
      });
    }
  }

  return {
    testMode: opts.testMode,
    llm,
    tts,
    visuals: new VisualResolver(opts.visualMode, library, generator),
    voiceFor: (brand) => ({
      voiceId: brand.voice.voiceId || config.elevenlabs.voiceId || (opts.testMode ? "teste" : ""),
      modelId: brand.voice.modelId || config.elevenlabs.modelId,
      stability: brand.voice.stability,
      similarityBoost: brand.voice.similarityBoost,
      style: brand.voice.style,
      speed: brand.voice.speed,
      useSpeakerBoost: brand.voice.useSpeakerBoost,
    }),
  };
}
