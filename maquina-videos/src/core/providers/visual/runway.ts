/**
 * Geração de imagens e vídeos pela Runway (API de desenvolvedor).
 *
 * Endpoints (verificados no SDK oficial @runwayml/sdk 4.x):
 *   POST https://api.dev.runwayml.com/v1/text_to_image   { model, promptText, ratio }       → { id }
 *   POST https://api.dev.runwayml.com/v1/image_to_video  { model, promptImage, promptText, ratio, duration } → { id }
 *   GET  https://api.dev.runwayml.com/v1/tasks/{id}      → { status: PENDING|THROTTLED|RUNNING|SUCCEEDED|FAILED|CANCELLED,
 *                                                            output?: string[], failure?: string }
 *   headers: Authorization: Bearer <chave>, X-Runway-Version: 2024-11-06
 * A documentação pede para não consultar a tarefa mais que 1x a cada 5 segundos.
 *
 * ⚠ ESTE ARQUIVO NÃO FOI TESTADO CONTRA A API REAL (sem chave durante o desenvolvimento);
 *   foi testado contra um servidor falso local que imita o formato acima.
 */
import fs from "node:fs/promises";
import { z } from "zod";
import { AppError, ExternalApiError } from "../../errors";
import { createLogger } from "../../logger";
import { atomicWrite, sleep } from "../../util/fs";
import { HttpStatusError, request, wrapHttpError, type FetchLike } from "../../util/http";
import { withRetry } from "../../util/retry";
import type { VisualProvider, VisualRequest, VisualResult } from "./types";

const log = createLogger();

const CreateSchema = z.object({ id: z.string() });
const TaskSchema = z.object({
  id: z.string(),
  status: z.string(),
  output: z.array(z.string()).optional(),
  failure: z.string().optional(),
  failureCode: z.string().optional(),
  progress: z.number().optional(),
});

export interface RunwayOptions {
  apiKey: string;
  imageModel: string;
  videoModel: string;
  /** "images" = só imagem; "video" = imagem + animação (image_to_video). */
  mode: "images" | "video";
  baseUrl?: string;
  version?: string;
  fetch?: FetchLike;
  pollIntervalMs?: number;
  taskTimeoutMs?: number;
}

export class RunwayVisuals implements VisualProvider {
  readonly id = "runway";
  private base: string;
  private fetchImpl: FetchLike;

  constructor(private opts: RunwayOptions) {
    this.base = (opts.baseUrl ?? "https://api.dev.runwayml.com").replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.opts.apiKey}`,
      "x-runway-version": this.opts.version ?? "2024-11-06",
      "content-type": "application/json",
    };
  }

  private async post(pathname: string, body: unknown, signal?: AbortSignal): Promise<{ id: string }> {
    return withRetry(
      async () => {
        try {
          const res = await request(this.fetchImpl, `${this.base}${pathname}`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(body),
            timeoutMs: 60_000,
            signal,
          });
          return CreateSchema.parse(await res.json());
        } catch (e) {
          if (e instanceof HttpStatusError) wrapHttpError("Runway", e);
          throw e;
        }
      },
      { retries: 2, signal, shouldRetry: (e) => e instanceof ExternalApiError && e.retryable },
    );
  }

  private async waitTask(id: string, signal?: AbortSignal): Promise<string[]> {
    const started = Date.now();
    const interval = this.opts.pollIntervalMs ?? 5_000;
    const timeout = this.opts.taskTimeoutMs ?? 10 * 60_000;
    for (;;) {
      if (Date.now() - started > timeout) throw new ExternalApiError("Runway", `Tarefa ${id} não terminou em ${Math.round(timeout / 60000)} min.`);
      let task: z.infer<typeof TaskSchema>;
      try {
        const res = await request(this.fetchImpl, `${this.base}/v1/tasks/${encodeURIComponent(id)}`, {
          headers: this.headers(),
          timeoutMs: 30_000,
          signal,
        });
        task = TaskSchema.parse(await res.json());
      } catch (e) {
        if (e instanceof HttpStatusError && e.status !== 429 && e.status < 500) wrapHttpError("Runway", e);
        log.warn(`Runway: falha ao consultar tarefa ${id}, tentando de novo`, { error: (e as Error).message });
        await sleep(interval, signal);
        continue;
      }
      if (task.status === "SUCCEEDED") {
        if (!task.output?.length) throw new ExternalApiError("Runway", "Tarefa concluída sem arquivo de saída.");
        return task.output;
      }
      if (task.status === "FAILED") throw new ExternalApiError("Runway", `Geração falhou: ${task.failure ?? task.failureCode ?? "sem detalhe"}`);
      if (task.status === "CANCELLED") throw new ExternalApiError("Runway", "Tarefa cancelada.");
      await sleep(interval, signal);
    }
  }

  private async download(url: string, file: string, signal?: AbortSignal): Promise<void> {
    const res = await request(this.fetchImpl, url, { timeoutMs: 5 * 60_000, signal });
    await atomicWrite(file, Buffer.from(await res.arrayBuffer()));
  }

  async resolve(req: VisualRequest): Promise<VisualResult | undefined> {
    const prompt = (req.scene.visual.prompt ?? req.scene.visual.description).slice(0, 950);
    if (!prompt) return undefined;
    log.info(`Runway: gerando imagem da cena ${req.scene.id}`);
    const img = await this.post(
      "/v1/text_to_image",
      { model: this.opts.imageModel, promptText: prompt, ratio: "1080:1920" },
      req.signal,
    );
    const [imageUrl] = await this.waitTask(img.id, req.signal);
    if (!imageUrl) throw new AppError("RUNWAY_NO_OUTPUT", "Runway não devolveu a imagem.");

    if (this.opts.mode === "images") {
      const file = `${req.outBase}.png`;
      await this.download(imageUrl, file, req.signal);
      return { kind: "image", file, provider: this.id };
    }

    log.info(`Runway: animando a cena ${req.scene.id} (image_to_video)`);
    const vid = await this.post(
      "/v1/image_to_video",
      {
        model: this.opts.videoModel,
        promptImage: imageUrl,
        promptText: `${prompt}. Subtle cinematic camera motion.`.slice(0, 950),
        ratio: "720:1280",
        duration: 5,
      },
      req.signal,
    );
    const [videoUrl] = await this.waitTask(vid.id, req.signal);
    if (!videoUrl) throw new AppError("RUNWAY_NO_OUTPUT", "Runway não devolveu o vídeo.");
    const file = `${req.outBase}.mp4`;
    await this.download(videoUrl, file, req.signal);
    const size = (await fs.stat(file)).size;
    if (size < 1000) throw new ExternalApiError("Runway", "Vídeo baixado está vazio.");
    return { kind: "video", file, provider: this.id, durationSec: 5 };
  }
}
