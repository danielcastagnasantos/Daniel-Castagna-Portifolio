/**
 * API HTTP local (Hono). Pensada para a interface web E para automação (n8n etc.).
 *
 * Segurança (é uma API que grava arquivos e pode gastar dinheiro):
 *  - escuta só em 127.0.0.1 por padrão; fora disso exige API_TOKEN (validado em loadConfig);
 *  - rejeita Host que não seja local (defesa contra DNS rebinding);
 *  - métodos que alteram estado exigem Content-Type: application/json (um site malicioso não
 *    consegue enviar isso sem pré-verificação CORS, que não habilitamos);
 *  - se API_TOKEN estiver definido, tudo em /api exige "Authorization: Bearer <token>".
 */
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { App } from "../core/app";
import { providerAvailability } from "../core/config";
import { AppError, NotFoundError, ValidationError, toErrorInfo } from "../core/errors";
import { readLogTail } from "../core/logging";
import { createAssetApp } from "../core/render/assetApp";
import { scriptHash } from "../core/pipeline/engine";
import { VIDEO, VisualModeSchema, ReferenceSchema, type Project } from "../shared/schemas";
import { lintScript } from "../shared/script";

const CreateSchema = z.object({
  brandId: z.string(),
  theme: z.string().min(3, "Descreva o tema com pelo menos 3 caracteres").max(1000),
  targetDurationSec: z.number().min(10).max(180),
  testMode: z.boolean().optional(),
  visualMode: VisualModeSchema.optional(),
  references: z.array(ReferenceSchema.omit({ id: true })).max(10).optional(),
});
const IdeasSchema = z.object({ brandId: z.string(), count: z.number().int().min(1).max(10).default(5), topic: z.string().max(200).optional(), testMode: z.boolean().optional() });
const ReviseSchema = z.object({ instruction: z.string().min(3), sceneIds: z.array(z.string()).optional() });
const ChangesSchema = z.object({ changes: z.array(z.object({ sceneId: z.string(), instruction: z.string().min(3) })).min(1).max(40) });

const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

/** Visão do projeto para a UI: projeto + dados derivados (marca, avisos, URLs dos arquivos). */
export function projectView(app: App, p: Project, busy: boolean) {
  const brand = app.brands.get(p.brandId);
  const warnings = p.script && brand ? lintScript(p.script, p.targetDurationSec, brand.script.wordsPerSecond) : [];
  const url = (f?: string) => (f ? `/${f}` : undefined);
  return {
    ...p,
    busy,
    scriptApproved: Boolean(p.script && p.scriptApprovedHash === scriptHash(p.script)),
    warnings,
    urls: {
      video: url(p.artifacts.render?.file),
      preview: url(p.artifacts.preview?.file),
      poster: url(p.artifacts.preview?.poster),
      narration: Object.fromEntries(Object.entries(p.artifacts.scenes).flatMap(([id, a]) => (a.narration ? [[id, url(a.narration.file)]] : []))),
    },
  };
}

export function createServerApp(app: App): Hono {
  const { config, engine, store } = app;
  const api = new Hono();

  api.use("*", async (c, next) => {
    if (config.server.apiToken) {
      const got = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? c.req.query("token") ?? "";
      if (!safeEqual(got, config.server.apiToken)) return c.json({ error: { code: "UNAUTHORIZED", message: "Token inválido." } }, 401);
    }
    // Escritas só com JSON: um formulário de outro site não consegue enviar isso sem pré-verificação CORS (que não habilitamos).
    if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method) && !(c.req.header("content-type") ?? "").includes("application/json")) {
      return c.json({ error: { code: "UNSUPPORTED_MEDIA", message: "Use Content-Type: application/json (mesmo sem corpo)." } }, 415);
    }
    await next();
  });

  api.onError((err, c) => {
    const info = toErrorInfo(err);
    const status = err instanceof AppError ? err.httpStatus : err instanceof z.ZodError ? 400 : 500;
    if (status >= 500) console.error(err);
    const message = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : info.message;
    return c.json({ error: { code: err instanceof z.ZodError ? "VALIDATION" : info.code, message } }, status as 400);
  });

  const body = async <S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new ValidationError("Corpo JSON inválido.");
    }
    return schema.parse(raw);
  };
  const view = async (id: string) => projectView(app, await store.require(id), engine.isBusy(id));

  api.get("/health", async (c) => {
    const v = await app.ffmpeg.versions();
    return c.json({
      ok: true,
      version: "0.1.0",
      defaultTestMode: config.defaultTestMode,
      video: VIDEO,
      providers: providerAvailability(config),
      anthropicModel: config.anthropic.model,
      tools: { ffmpeg: v.ffmpeg ?? null, ffprobe: v.ffprobe ?? null, problems: v.errors },
    });
  });

  api.get("/brands", (c) => c.json(app.brands.list().map((b) => ({ id: b.id, name: b.name, tagline: b.tagline, implemented: b.implemented, palette: b.palette, mode: b.mode }))));

  /** Ideias de tema (Claude no modo ao vivo; exemplos fixos no modo de teste). Gera custo só no modo ao vivo. */
  api.post("/ideas", async (c) => {
    const b = await body(c, IdeasSchema);
    const brand = app.brands.get(b.brandId);
    if (!brand) throw new ValidationError(`Marca desconhecida: ${b.brandId}`);
    const testMode = b.testMode ?? config.defaultTestMode;
    const providers = app.deps.providersFor({ testMode, visualMode: "graphics" } as Project);
    const done = (await store.list()).map((p) => p.theme).slice(0, 30);
    const ideas = await providers.llm.suggestIdeas({ brand, count: b.count, topic: b.topic, avoid: done, language: "pt-BR" });
    return c.json({ testMode, generator: providers.llm.id, ideas });
  });

  api.get("/projects", async (c) => c.json(await store.list()));
  api.post("/projects", async (c) => {
    const input = await body(c, CreateSchema);
    const p = await engine.createProject({
      brandId: input.brandId,
      theme: input.theme,
      targetDurationSec: input.targetDurationSec,
      testMode: input.testMode ?? config.defaultTestMode,
      visualMode: input.visualMode,
      references: input.references?.map((r, i) => ({ ...r, id: `ref-${i + 1}` })),
    });
    return c.json(projectView(app, p, false), 201);
  });
  api.get("/projects/:id", async (c) => c.json(await view(c.req.param("id"))));
  api.delete("/projects/:id", async (c) => {
    await engine.deleteProject(c.req.param("id"));
    return c.json({ ok: true });
  });
  api.get("/projects/:id/logs", async (c) => c.json(await readLogTail(config.dataDir, c.req.param("id"), Math.min(1000, Number(c.req.query("tail") ?? 200)))));

  // Roteiro
  api.post("/projects/:id/generate-script", async (c) => {
    await engine.generateScript(c.req.param("id"));
    return c.json(await view(c.req.param("id")), 202);
  });
  api.put("/projects/:id/script", async (c) => {
    const raw = await c.req.json().catch(() => {
      throw new ValidationError("Corpo JSON inválido.");
    });
    await engine.saveScript(c.req.param("id"), raw);
    return c.json(await view(c.req.param("id")));
  });
  api.post("/projects/:id/revise-script", async (c) => {
    const b = await body(c, ReviseSchema);
    await engine.reviseScript(c.req.param("id"), b.instruction, b.sceneIds ?? []);
    return c.json(await view(c.req.param("id")), 202);
  });
  api.post("/projects/:id/approve-script", async (c) => {
    await engine.approveScript(c.req.param("id"));
    return c.json(await view(c.req.param("id")), 202);
  });

  // Produção
  api.post("/projects/:id/resume", async (c) => {
    await engine.resume(c.req.param("id"));
    return c.json(await view(c.req.param("id")), 202);
  });
  api.post("/projects/:id/cancel", async (c) => {
    const cancelled = engine.cancel(c.req.param("id"));
    return c.json({ cancelled });
  });
  api.post("/projects/:id/scene-changes", async (c) => {
    const b = await body(c, ChangesSchema);
    await engine.requestSceneChanges(c.req.param("id"), b.changes);
    return c.json(await view(c.req.param("id")), 202);
  });

  // Aprovação / exportação
  api.post("/projects/:id/approve-video", async (c) => {
    await engine.approveVideo(c.req.param("id"));
    return c.json(await view(c.req.param("id")));
  });
  api.post("/projects/:id/export", async (c) => {
    const { file } = await engine.exportVideo(c.req.param("id"));
    return c.json({ file, project: await view(c.req.param("id")) });
  });
  /** Download do MP4 final pelo navegador. */
  api.get("/projects/:id/download", async (c) => {
    const p = await store.require(c.req.param("id"));
    const r = p.artifacts.render;
    const disk = r ? app.assets.toDisk(r.file) : null;
    if (!r || !disk || !fs.existsSync(disk)) throw new NotFoundError("Vídeo");
    const base = (p.script?.title ?? p.theme).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "video";
    const name = `${base}${p.testMode && !/teste/i.test(base) ? "_TESTE" : ""}.mp4`;
    return new Response(Readable.toWeb(fs.createReadStream(disk)) as ReadableStream, {
      headers: { "Content-Type": "video/mp4", "Content-Length": String(fs.statSync(disk).size), "Content-Disposition": `attachment; filename="${name}"` },
    });
  });

  // Eventos em tempo real (SSE)
  api.get("/projects/:id/events", (c) => {
    const id = c.req.param("id");
    return streamSSE(c, async (stream) => {
      let closed = false;
      stream.onAbort(() => {
        closed = true;
      });
      let pending = false;
      const sendProject = async () => {
        if (pending || closed) return;
        pending = true;
        setTimeout(async () => {
          pending = false;
          try {
            await stream.writeSSE({ event: "project", data: JSON.stringify(await view(id)) });
          } catch {
            /* projeto removido ou conexão fechada */
          }
        }, 150);
      };
      const onProject = (p: Project) => {
        if (p.id === id) void sendProject();
      };
      const onProgress = (e: { projectId: string; step: string; progress: number; detail?: string }) => {
        if (e.projectId === id && !closed) void stream.writeSSE({ event: "progress", data: JSON.stringify(e) }).catch(() => undefined);
      };
      const onLog = (r: { projectId?: string }) => {
        if (r.projectId === id && !closed) void stream.writeSSE({ event: "log", data: JSON.stringify(r) }).catch(() => undefined);
      };
      app.bus.on("project", onProject);
      app.bus.on("progress", onProgress);
      app.bus.on("log", onLog);
      try {
        await stream.writeSSE({ event: "project", data: JSON.stringify(await view(id)) });
        while (!closed) {
          await stream.sleep(15_000);
          if (!closed) await stream.writeSSE({ event: "ping", data: "{}" });
        }
      } finally {
        app.bus.off("project", onProject);
        app.bus.off("progress", onProgress);
        app.bus.off("log", onLog);
      }
    });
  });

  // ─── Montagem final ─────────────────────────────────────────────────────────
  const root = new Hono();
  root.use("*", async (c, next) => {
    const host = (c.req.header("host") ?? "").split(":")[0]?.replace(/^\[|\]$/g, "") ?? "";
    const loopback = ["localhost", "127.0.0.1", "::1", ""].includes(host);
    if (!loopback && !config.server.apiToken) return c.text("Host não permitido.", 403);
    await next();
  });
  root.route("/api", api);
  // arquivos (áudio, vídeo, imagens) para o player da UI — mesmo servidor usado no render
  root.route("/", createAssetApp(app.assets));

  // Interface web compilada (npm run build:web)
  const dist = config.webDistDir;
  root.get("/*", async (c) => {
    if (!fs.existsSync(path.join(dist, "index.html"))) {
      return c.html(
        "<h1>Interface web ainda não compilada</h1><p>Rode <code>npm run build:web</code> e recarregue, ou use <code>npm run dev</code> (abre em outra porta).</p>",
        503,
      );
    }
    const reqPath = decodeURIComponent(new URL(c.req.url).pathname);
    const file = path.join(dist, reqPath === "/" ? "index.html" : reqPath);
    const inside = path.resolve(file).startsWith(path.resolve(dist) + path.sep);
    if (inside && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file);
      const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2" };
      return new Response(fs.readFileSync(file), { headers: { "Content-Type": types[ext] ?? "application/octet-stream" } });
    }
    return c.html(fs.readFileSync(path.join(dist, "index.html"), "utf8"));
  });
  return root;
}
