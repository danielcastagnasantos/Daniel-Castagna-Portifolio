/**
 * Renderizador real: Remotion (Chromium headless + FFmpeg embutido).
 * Saída: H.264 (yuv420p) + AAC, 1080×1920 a 60 fps — o formato vem da composição (plan).
 *
 * Fluxo: (1) empacota a composição UMA vez (cache por hash do código), (2) sobe um servidor
 * local temporário com os arquivos do projeto, (3) renderiza com os dados do plano.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";
import type { AppConfig } from "../config";
import type { AssetPaths } from "../assets";
import { AppError, CancelledError } from "../errors";
import { createLogger } from "../logger";
import { ensureDir, exists, renameWithRetry } from "../util/fs";
import { sha256 } from "../util/hash";
import { createAssetApp } from "./assetApp";
import type { RenderRequest, Renderer } from "./types";

const log = createLogger();
const COMPOSITION_ID = "MainVideo";

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out.sort();
}

export class RemotionRenderer implements Renderer {
  private bundlePromise?: Promise<string>;

  constructor(
    private config: AppConfig,
    private assets: AssetPaths,
  ) {}

  /** Hash do código da composição: mudou o código → empacota de novo. */
  private async sourceHash(): Promise<string> {
    const root = this.config.rootDir;
    const dirs = [path.join(root, "src", "remotion"), path.join(root, "src", "shared"), path.join(root, "config", "brands"), this.config.publicDir];
    const parts: string[] = [];
    for (const d of dirs) {
      for (const f of await listFiles(d)) parts.push(`${path.relative(root, f)}:${sha256(await fs.readFile(f))}`);
    }
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };
    parts.push(`remotion:${pkg.dependencies.remotion}`);
    return sha256(parts.join("\n")).slice(0, 16);
  }

  private async getBundle(onProgress: (f: number) => void): Promise<string> {
    if (!this.bundlePromise) {
      this.bundlePromise = (async () => {
        const hash = await this.sourceHash();
        const outDir = path.join(this.config.dataDir, "cache", "bundle", hash);
        if (await exists(path.join(outDir, "index.html"))) {
          log.info("Bundle do Remotion em cache.");
          return outDir;
        }
        log.info("Empacotando a composição do Remotion (primeira vez, ~20–60s)…");
        const tmp = `${outDir}.building`;
        await fs.rm(tmp, { recursive: true, force: true });
        await ensureDir(path.dirname(outDir));
        await bundle({
          entryPoint: path.join(this.config.rootDir, "src", "remotion", "index.ts"),
          outDir: tmp,
          publicDir: this.config.publicDir,
          onProgress: (p) => onProgress(p / 100),
        });
        await renameWithRetry(tmp, outDir);
        // mantém só os 2 bundles mais recentes
        const base = path.dirname(outDir);
        const all = await fs.readdir(base, { withFileTypes: true });
        const stats = await Promise.all(all.filter((d) => d.isDirectory() && !d.name.endsWith(".building")).map(async (d) => ({ d, t: (await fs.stat(path.join(base, d.name))).mtimeMs })));
        for (const old of stats.sort((a, b) => b.t - a.t).slice(2)) await fs.rm(path.join(base, old.d.name), { recursive: true, force: true });
        return outDir;
      })().catch((e) => {
        this.bundlePromise = undefined;
        throw e;
      });
    }
    return this.bundlePromise;
  }

  async render(req: RenderRequest): Promise<{ renderSeconds: number }> {
    const started = Date.now();
    if (req.signal.aborted) throw new CancelledError();
    const serveUrl = await this.getBundle((f) => req.onProgress(f * 0.05, "Empacotando composição"));

    // Servidor temporário com os arquivos (áudio, imagens, vídeos) que o Chromium vai buscar.
    const server = serve({ fetch: createAssetApp(this.assets).fetch, port: 0, hostname: "127.0.0.1" });
    try {
      await new Promise<void>((resolve) => (server.listening ? resolve() : server.once("listening", () => resolve())));
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const plan = { ...req.plan, assetBase: `http://127.0.0.1:${port}` };
      const inputProps = { plan };
      const browserExecutable = this.config.browserExecutable ?? null;
      const common = { serveUrl, browserExecutable, logLevel: "warn" as const };

      const composition = await selectComposition({ ...common, id: COMPOSITION_ID, inputProps });
      if (composition.width !== plan.width || composition.height !== plan.height || composition.fps !== plan.fps || composition.durationInFrames !== plan.totalFrames) {
        throw new AppError("RENDER_CONFIG", `Composição divergente do plano (${composition.width}x${composition.height}@${composition.fps}, ${composition.durationInFrames}f).`);
      }

      const { cancelSignal, cancel } = makeCancelSignal();
      const onAbort = () => cancel();
      req.signal.addEventListener("abort", onAbort, { once: true });
      try {
        await renderMedia({
          ...common,
          composition,
          inputProps,
          codec: "h264",
          outputLocation: req.outFile,
          crf: this.config.render.crf,
          pixelFormat: "yuv420p",
          // bt709 = padrão HD; sem isso o ffmpeg marca "full range" (yuvj420p), que algumas plataformas tratam mal.
          colorSpace: "bt709",
          x264Preset: "medium",
          audioCodec: "aac",
          audioBitrate: "192k",
          enforceAudioTrack: true,
          overwrite: true,
          concurrency: this.config.render.concurrency ?? null,
          cancelSignal,
          timeoutInMilliseconds: 180_000,
          onProgress: (p) => {
            const f = 0.05 + p.progress * 0.95;
            req.onProgress(f, p.encodedFrames < composition.durationInFrames ? `Quadro ${p.renderedFrames}/${composition.durationInFrames}` : "Finalizando arquivo");
          },
        });
      } catch (e) {
        if (req.signal.aborted) throw new CancelledError();
        const msg = (e as Error).message ?? String(e);
        if (/browser|chrom/i.test(msg) && /(not found|download|executable|launch)/i.test(msg)) {
          throw new AppError("RENDER_BROWSER", `Não foi possível abrir o navegador do Remotion: ${msg.slice(0, 300)}. Se estiver sem internet, defina BROWSER_EXECUTABLE no .env.`, { cause: e });
        }
        throw new AppError("RENDER_FAILED", `Falha na renderização: ${msg.slice(0, 600)}`, { cause: e });
      } finally {
        req.signal.removeEventListener("abort", onAbort);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    return { renderSeconds: (Date.now() - started) / 1000 };
  }
}
