/**
 * Configuração a partir de variáveis de ambiente (.env opcional na pasta maquina-videos).
 * Nenhuma chave vive no código. Os valores secretos são registrados no logger para
 * serem mascarados caso apareçam em alguma mensagem de erro.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { registerSecret } from "./logger";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, "..", "..");

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? def : ["1", "true", "yes", "sim", "on"].includes(v.trim().toLowerCase())));
const optStr = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));
const optInt = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? Number.parseInt(v, 10) : undefined))
  .refine((v) => v === undefined || Number.isFinite(v), "precisa ser um número inteiro");

const EnvSchema = z.object({
  PORT: optInt,
  HOST: optStr,
  API_TOKEN: optStr,
  DEFAULT_TEST_MODE: bool(true),
  ANTHROPIC_API_KEY: optStr,
  ANTHROPIC_MODEL: optStr,
  ANTHROPIC_FALLBACKS: optStr,
  ELEVENLABS_API_KEY: optStr,
  ELEVENLABS_VOICE_ID: optStr,
  ELEVENLABS_MODEL_ID: optStr,
  RUNWAYML_API_SECRET: optStr,
  RUNWAY_IMAGE_MODEL: optStr,
  RUNWAY_VIDEO_MODEL: optStr,
  TELEGRAM_BOT_TOKEN: optStr,
  TELEGRAM_CHAT_ID: optStr,
  WEBHOOK_URL: optStr,
  WEBHOOK_SECRET: optStr,
  FFMPEG_PATH: optStr,
  FFPROBE_PATH: optStr,
  BROWSER_EXECUTABLE: optStr,
  RENDER_CONCURRENCY: optInt,
  RENDER_CRF: optInt,
  DATA_DIR: optStr,
});

export interface AppConfig {
  rootDir: string;
  dataDir: string;
  assetsDir: string;
  configDir: string;
  publicDir: string;
  webDistDir: string;
  server: { port: number; host: string; apiToken?: string };
  defaultTestMode: boolean;
  anthropic: { apiKey?: string; model: string; fallbacks: boolean };
  elevenlabs: { apiKey?: string; voiceId?: string; modelId: string };
  runway: { apiKey?: string; imageModel: string; videoModel: string };
  telegram: { botToken?: string; chatId?: string };
  webhook: { url?: string; secret?: string };
  ffmpegPath: string;
  ffprobePath: string;
  browserExecutable?: string;
  render: { concurrency?: number; crf: number };
}

export function loadEnvFile(file = path.join(ROOT_DIR, ".env")): void {
  if (!fs.existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (e) {
    throw new Error(`Não foi possível ler ${file}: ${(e as Error).message}`);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Variáveis de ambiente inválidas — ${msg}`);
  }
  const e = parsed.data;
  const dataDir = path.resolve(ROOT_DIR, e.DATA_DIR ?? "data");
  const host = e.HOST ?? "127.0.0.1";
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(host);
  if (!loopback && !e.API_TOKEN) {
    throw new Error("HOST diferente de 127.0.0.1 exige API_TOKEN (a API gasta dinheiro e grava arquivos).");
  }
  for (const s of [e.ANTHROPIC_API_KEY, e.ELEVENLABS_API_KEY, e.RUNWAYML_API_SECRET, e.TELEGRAM_BOT_TOKEN, e.API_TOKEN, e.WEBHOOK_SECRET]) {
    if (s) registerSecret(s);
  }
  return {
    rootDir: ROOT_DIR,
    dataDir,
    assetsDir: path.join(ROOT_DIR, "assets"),
    configDir: path.join(ROOT_DIR, "config"),
    publicDir: path.join(ROOT_DIR, "public"),
    webDistDir: path.join(ROOT_DIR, "web", "dist"),
    server: { port: e.PORT ?? 8787, host, apiToken: e.API_TOKEN },
    defaultTestMode: e.DEFAULT_TEST_MODE,
    anthropic: {
      apiKey: e.ANTHROPIC_API_KEY,
      model: e.ANTHROPIC_MODEL ?? "claude-opus-5-5",
      fallbacks: (e.ANTHROPIC_FALLBACKS ?? "default").toLowerCase() !== "off",
    },
    elevenlabs: { apiKey: e.ELEVENLABS_API_KEY, voiceId: e.ELEVENLABS_VOICE_ID, modelId: e.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2" },
    runway: { apiKey: e.RUNWAYML_API_SECRET, imageModel: e.RUNWAY_IMAGE_MODEL ?? "gen4_image", videoModel: e.RUNWAY_VIDEO_MODEL ?? "gen4_turbo" },
    telegram: { botToken: e.TELEGRAM_BOT_TOKEN, chatId: e.TELEGRAM_CHAT_ID },
    webhook: { url: e.WEBHOOK_URL, secret: e.WEBHOOK_SECRET },
    ffmpegPath: e.FFMPEG_PATH ?? "ffmpeg",
    ffprobePath: e.FFPROBE_PATH ?? "ffprobe",
    browserExecutable: e.BROWSER_EXECUTABLE,
    render: { concurrency: e.RENDER_CONCURRENCY, crf: e.RENDER_CRF ?? 18 },
  };
}

/** Resumo seguro (sem valores) do que está configurado — para a UI e o `doctor`. */
export function providerAvailability(c: AppConfig) {
  return {
    anthropic: Boolean(c.anthropic.apiKey),
    elevenlabs: Boolean(c.elevenlabs.apiKey),
    runway: Boolean(c.runway.apiKey),
    telegram: Boolean(c.telegram.botToken && c.telegram.chatId),
    webhook: Boolean(c.webhook.url),
  };
}
