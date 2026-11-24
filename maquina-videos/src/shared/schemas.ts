/**
 * Contratos de dados compartilhados entre servidor, interface web e Remotion.
 * Este arquivo NÃO pode importar nada específico de Node (fs, path...) — ele também
 * é empacotado para o navegador (UI) e para o Chromium do Remotion.
 */
import { z } from "zod";

// ─── Formato do vídeo (requisitos obrigatórios do projeto) ────────────────────
export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 60,
  codec: "h264",
  aspect: "9:16",
} as const;

// ─── Etapas do pipeline ───────────────────────────────────────────────────────
export const STEP_IDS = [
  "references",
  "script",
  "narration",
  "visuals",
  "compose",
  "render",
  "verify",
  "preview",
] as const;
export const StepIdSchema = z.enum(STEP_IDS);
export type StepId = z.infer<typeof StepIdSchema>;

export const STEP_LABELS: Record<StepId, string> = {
  references: "Análise de referências",
  script: "Roteiro e cenas",
  narration: "Narração",
  visuals: "Imagens e vídeos",
  compose: "Montagem da timeline",
  render: "Renderização",
  verify: "Verificação",
  preview: "Prévia",
};

/** Etapas que só rodam depois da aprovação do roteiro. */
export const PRODUCTION_STEPS = ["narration", "visuals", "compose", "render", "verify", "preview"] as const satisfies readonly StepId[];
export type ProductionStep = (typeof PRODUCTION_STEPS)[number];

export const StepStatusSchema = z.enum([
  "pending",
  "running",
  "done",
  "failed",
  "skipped",
  "interrupted",
]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const StepStateSchema = z.object({
  status: StepStatusSchema.default("pending"),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  /** 0..1 */
  progress: z.number().min(0).max(1).optional(),
  detail: z.string().optional(),
  attempts: z.number().int().default(0),
  error: z
    .object({ code: z.string(), message: z.string() })
    .optional(),
});
export type StepState = z.infer<typeof StepStateSchema>;

// ─── Roteiro ──────────────────────────────────────────────────────────────────
export const TransitionSchema = z.enum(["cut", "fade", "slide", "zoom", "wipe"]);
export type Transition = z.infer<typeof TransitionSchema>;

export const MotionSchema = z.enum([
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "none",
]);
export type Motion = z.infer<typeof MotionSchema>;

export const VisualKindSchema = z.enum(["auto", "image", "video", "graphic"]);
export type VisualKind = z.infer<typeof VisualKindSchema>;

export const GRAPHIC_VARIANTS = ["orbs", "grid", "rays", "waves", "blocks"] as const;
export const GraphicVariantSchema = z.enum(GRAPHIC_VARIANTS);
export type GraphicVariant = z.infer<typeof GraphicVariantSchema>;

export const SfxCueSchema = z.object({
  /** Nome na biblioteca de efeitos da marca (ex.: "whoosh", "pop", "riser"). */
  name: z.string().min(1),
  /** Deslocamento em segundos desde o início da cena. */
  offsetSec: z.number().min(0).max(60).default(0),
});
export type SfxCue = z.infer<typeof SfxCueSchema>;

export const SceneSchema = z.object({
  id: z.string().min(1),
  /** Texto exato que será lido pela narração (e que gera as legendas). */
  narration: z.string().min(1).max(1200),
  /** Texto curto que aparece na tela (palavra-chave, número, pergunta). Opcional. */
  onScreenText: z.string().max(80).optional(),
  visual: z.object({
    /** Descrição em português do que aparece (para o humano revisar). */
    description: z.string().min(1).max(800),
    /** Prompt (em inglês) para geradores de imagem/vídeo. Opcional. */
    prompt: z.string().max(1000).optional(),
    kind: VisualKindSchema.default("auto"),
    motion: MotionSchema.default("zoom-in"),
    graphic: GraphicVariantSchema.optional(),
    /** Palavras-chave para procurar na biblioteca local. */
    libraryTags: z.array(z.string()).default([]),
  }),
  transition: TransitionSchema.default("fade"),
  sfx: z.array(SfxCueSchema).default([]),
  /** Duração estimada (s) — a real vem da narração gerada. */
  targetSec: z.number().min(0.5).max(90),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ScriptSchema = z.object({
  title: z.string().min(1).max(160),
  hook: z.string().min(1).max(400),
  scenes: z.array(SceneSchema).min(1).max(40),
  cta: z.string().max(300).optional(),
  postCaption: z.string().max(2200).default(""),
  hashtags: z.array(z.string()).max(30).default([]),
  /** Quem gerou: "teste" (sem IA) ou "anthropic:<modelo>". */
  generator: z.string().default("desconhecido"),
});
export type Script = z.infer<typeof ScriptSchema>;

// ─── Narração / legendas ──────────────────────────────────────────────────────
export const WordTimingSchema = z.object({
  text: z.string(),
  /** Segundos desde o início do áudio da cena. */
  start: z.number().min(0),
  end: z.number().min(0),
});
export type WordTiming = z.infer<typeof WordTimingSchema>;

export const NarrationArtifactSchema = z.object({
  inputHash: z.string(),
  /** Caminho relativo à pasta do projeto. */
  file: z.string(),
  durationSec: z.number().positive(),
  words: z.array(WordTimingSchema),
  provider: z.string(),
  characters: z.number().int(),
});
export type NarrationArtifact = z.infer<typeof NarrationArtifactSchema>;

export const VisualArtifactSchema = z.object({
  inputHash: z.string(),
  kind: z.enum(["image", "video", "graphic"]),
  /** Relativo à pasta do projeto (ou "library:..." ) — ausente quando kind = graphic. */
  file: z.string().optional(),
  graphic: GraphicVariantSchema.optional(),
  provider: z.string(),
  /** Duração do clipe de vídeo, quando aplicável. */
  durationSec: z.number().optional(),
});
export type VisualArtifact = z.infer<typeof VisualArtifactSchema>;

// ─── Verificação ──────────────────────────────────────────────────────────────
export const CheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["ok", "warn", "fail"]),
  detail: z.string(),
});
export type Check = z.infer<typeof CheckSchema>;

export const VerificationSchema = z.object({
  at: z.string(),
  ok: z.boolean(),
  checks: z.array(CheckSchema),
});
export type Verification = z.infer<typeof VerificationSchema>;

// ─── Projeto ──────────────────────────────────────────────────────────────────
export const ProjectStatusSchema = z.enum([
  "draft",
  "generating_script",
  "awaiting_script_approval",
  "producing",
  "awaiting_video_approval",
  "approved",
  "failed",
  "cancelled",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/** Como obter os visuais de cada cena. Só os modos "generated-*" geram custo. */
export const VisualModeSchema = z.enum(["graphics", "library", "generated-images", "generated-video"]);
export type VisualMode = z.infer<typeof VisualModeSchema>;

export const ReferenceSchema = z.object({
  id: z.string(),
  title: z.string().max(200).default(""),
  /** Texto/transcrição fornecido (e autorizado) pelo usuário. */
  text: z.string().min(1).max(30_000),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const ReferenceAnalysisSchema = z.object({
  summary: z.string(),
  hookPatterns: z.array(z.string()),
  structure: z.array(z.string()),
  retentionTechniques: z.array(z.string()),
  pacingNotes: z.string(),
  avoid: z.array(z.string()),
  generator: z.string().default("desconhecido"),
});
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>;

export const ChangeRequestSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  sceneIds: z.array(z.string()),
  instruction: z.string(),
  status: z.enum(["pending", "applied", "failed"]),
  error: z.string().optional(),
});
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>;

export const RenderArtifactSchema = z.object({
  inputHash: z.string(),
  /** Relativo à pasta do projeto. */
  file: z.string(),
  durationSec: z.number(),
  sizeBytes: z.number(),
  renderedAt: z.string(),
  renderSeconds: z.number().optional(),
});
export type RenderArtifact = z.infer<typeof RenderArtifactSchema>;

export const PreviewArtifactSchema = z.object({
  inputHash: z.string(),
  file: z.string(),
  poster: z.string().optional(),
  sizeBytes: z.number(),
});
export type PreviewArtifact = z.infer<typeof PreviewArtifactSchema>;

export const ExportRecordSchema = z.object({
  at: z.string(),
  file: z.string(),
  sizeBytes: z.number(),
});
export type ExportRecord = z.infer<typeof ExportRecordSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  schemaVersion: z.literal(1).default(1),
  brandId: z.string(),
  theme: z.string().min(1).max(1000),
  targetDurationSec: z.number().min(10).max(180),
  language: z.string().default("pt-BR"),
  /** true = nenhuma API paga é chamada neste projeto. */
  testMode: z.boolean(),
  visualMode: VisualModeSchema.default("graphics"),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: ProjectStatusSchema.default("draft"),
  references: z.array(ReferenceSchema).default([]),
  referenceAnalysis: ReferenceAnalysisSchema.optional(),
  script: ScriptSchema.optional(),
  /** Hash do roteiro no momento da aprovação — editar depois invalida a aprovação. */
  scriptApprovedHash: z.string().optional(),
  steps: z.partialRecord(StepIdSchema, StepStateSchema).default({}),
  artifacts: z
    .object({
      scenes: z
        .record(
          z.string(),
          z.object({
            narration: NarrationArtifactSchema.optional(),
            visual: VisualArtifactSchema.optional(),
          }),
        )
        .default({}),
      planHash: z.string().optional(),
      render: RenderArtifactSchema.optional(),
      preview: PreviewArtifactSchema.optional(),
      verification: VerificationSchema.optional(),
    })
    .default({ scenes: {} }),
  changeRequests: z.array(ChangeRequestSchema).default([]),
  exports: z.array(ExportRecordSchema).default([]),
  videoApprovedAt: z.string().optional(),
  lastError: z.object({ code: z.string(), message: z.string(), at: z.string() }).optional(),
  /** Reservado para o modo Hipótese X (episódio, bíblia da série, enquetes). */
  series: z
    .object({
      seriesId: z.string(),
      episodeNumber: z.number().int().min(1),
    })
    .optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

// ─── Marca (identidade visual + voz + estilo de roteiro) ──────────────────────
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "use cor no formato #RRGGBB");

export const BrandSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  tagline: z.string().default(""),
  /** Modo de produção: define o tipo de roteiro e as regras de série. */
  mode: z.enum(["versao-x", "hipotese-x"]),
  /** Ainda não implementado no MVP: a UI mostra como "em breve". */
  implemented: z.boolean().default(true),
  palette: z.object({
    background: hex,
    backgroundAlt: hex,
    primary: hex,
    accent: hex,
    text: hex,
    textMuted: hex,
  }),
  fonts: z.object({
    /** Nome da família CSS. */
    family: z.string(),
    /** Arquivos .woff2 dentro de public/fonts, por peso. */
    files: z.record(z.string(), z.string()),
  }),
  captions: z.object({
    fontSize: z.number().default(78),
    weight: z.number().default(900),
    maxWordsPerPage: z.number().int().min(1).max(8).default(4),
    maxCharsPerPage: z.number().int().min(8).max(60).default(26),
    uppercase: z.boolean().default(true),
    /** Posição vertical do bloco de legenda, em % da altura (0 = topo). */
    positionPercent: z.number().min(10).max(90).default(64),
    activeColor: hex,
    inactiveColor: hex,
    strokeColor: hex,
    strokeWidth: z.number().default(10),
  }),
  watermark: z.string().default(""),
  outro: z.object({
    enabled: z.boolean().default(true),
    text: z.string().default(""),
    seconds: z.number().min(0.5).max(6).default(2),
  }),
  voice: z.object({
    /** Se vazio, usa ELEVENLABS_VOICE_ID do ambiente. */
    voiceId: z.string().default(""),
    modelId: z.string().default(""),
    stability: z.number().min(0).max(1).default(0.45),
    similarityBoost: z.number().min(0).max(1).default(0.8),
    style: z.number().min(0).max(1).default(0.25),
    speed: z.number().min(0.7).max(1.2).default(1),
    useSpeakerBoost: z.boolean().default(true),
  }),
  music: z.object({
    /** Caminho relativo a assets/ (ex.: "library/music/trilha.mp3"). Vazio = sem trilha. */
    file: z.string().default(""),
    volume: z.number().min(0).max(1).default(0.14),
    duckedVolume: z.number().min(0).max(1).default(0.05),
    fadeInSec: z.number().default(1),
    fadeOutSec: z.number().default(1.5),
  }),
  sfx: z.object({
    volume: z.number().min(0).max(1).default(0.5),
    /** Efeito automático em cada transição (nome na biblioteca) ou vazio. */
    onTransition: z.string().default(""),
    /** nome → caminho relativo a assets/. */
    library: z.record(z.string(), z.string()).default({}),
  }),
  script: z.object({
    /** Guia de estilo enviado ao Claude (tom, estrutura, regras). */
    styleGuide: z.string(),
    forbidden: z.array(z.string()).default([]),
    defaultCta: z.string().default(""),
    wordsPerSecond: z.number().min(1.5).max(4).default(2.5),
  }),
});
export type Brand = z.infer<typeof BrandSchema>;

// ─── Plano de renderização (entrada do Remotion) ──────────────────────────────
export const PlanCaptionWordSchema = z.object({
  text: z.string(),
  startFrame: z.number().int(),
  endFrame: z.number().int(),
});
export const PlanCaptionPageSchema = z.object({
  startFrame: z.number().int(),
  endFrame: z.number().int(),
  words: z.array(PlanCaptionWordSchema),
});
export type PlanCaptionPage = z.infer<typeof PlanCaptionPageSchema>;

export const PlanSceneSchema = z.object({
  id: z.string(),
  index: z.number().int(),
  startFrame: z.number().int(),
  durationFrames: z.number().int().positive(),
  /** Frames de entrada (transição) sobrepostos ao fim da cena anterior. */
  transitionFrames: z.number().int().min(0),
  transition: TransitionSchema,
  motion: MotionSchema,
  visual: z.object({
    kind: z.enum(["image", "video", "graphic"]),
    /** Caminho relativo servido pelo servidor de assets (ex.: "projects/<id>/images/sc-01.png"). */
    src: z.string().optional(),
    graphic: GraphicVariantSchema,
    clipFrames: z.number().int().optional(),
  }),
  onScreenText: z.string().optional(),
  narration: z.object({
    src: z.string(),
    startFrame: z.number().int(),
    durationFrames: z.number().int(),
  }),
  /** Semente determinística para animações procedurais. */
  seed: z.number().int(),
});
export type PlanScene = z.infer<typeof PlanSceneSchema>;

export const RenderPlanSchema = z.object({
  fps: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  totalFrames: z.number().int().positive(),
  title: z.string(),
  brand: BrandSchema,
  scenes: z.array(PlanSceneSchema).min(1),
  captions: z.array(PlanCaptionPageSchema),
  outro: z.object({ startFrame: z.number().int(), durationFrames: z.number().int(), text: z.string() }).optional(),
  audio: z.object({
    music: z
      .object({
        src: z.string(),
        volume: z.number(),
        duckedVolume: z.number(),
        fadeInFrames: z.number().int(),
        fadeOutFrames: z.number().int(),
      })
      .optional(),
    /** Intervalos de fala (frames) usados para abaixar a música. */
    speech: z.array(z.object({ startFrame: z.number().int(), endFrame: z.number().int() })),
    sfx: z.array(z.object({ src: z.string(), atFrame: z.number().int(), volume: z.number() })),
  }),
  /** Mapa dos arquivos de fonte → URL; preenchido pelo renderizador. */
  assetBase: z.string().default(""),
});
export type RenderPlan = z.infer<typeof RenderPlanSchema>;
