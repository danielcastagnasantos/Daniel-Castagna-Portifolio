/**
 * Servidor de arquivos (Hono) para /data/* e /assets/* com suporte a Range (necessário para
 * o navegador buscar posições em áudio/vídeo) e CORS aberto — usado tanto pela interface web
 * quanto pelo Chromium do Remotion durante a renderização.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import type { AssetPaths } from "../assets";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".opus": "audio/ogg",
  ".m4a": "audio/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

/** Só estas pastas de DATA_DIR são servidas (nunca logs ou o .env). */
const DATA_ALLOWED = ["projects/", "cache/test-assets/", "exports/"];

function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "" && m[2] !== "") {
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || start > end || start >= size) return "invalid";
  return { start, end };
}

export function createAssetApp(assets: AssetPaths): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("Access-Control-Allow-Origin", "*");
    c.res.headers.set("Accept-Ranges", "bytes");
    c.res.headers.set("Cache-Control", "no-cache");
  });

  const handler = async (c: import("hono").Context) => {
    let urlPath: string;
    try {
      urlPath = decodeURIComponent(c.req.path).replace(/^\/+/, "");
    } catch {
      return c.text("Caminho inválido", 400);
    }
    if (urlPath.includes("\0")) return c.text("Caminho inválido", 400);
    if (urlPath.startsWith("data/") && !DATA_ALLOWED.some((p) => urlPath.startsWith(`data/${p}`))) return c.text("Não encontrado", 404);
    const abs = assets.toDisk(urlPath);
    if (!abs) return c.text("Não encontrado", 404);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(abs);
      if (!stat.isFile()) return c.text("Não encontrado", 404);
    } catch {
      return c.text("Não encontrado", 404);
    }
    const type = TYPES[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
    const range = parseRange(c.req.header("range") ?? null, stat.size);
    if (range === "invalid") return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    const headers: Record<string, string> = { "Content-Type": type };
    if (c.req.method === "HEAD") {
      headers["Content-Length"] = String(stat.size);
      return new Response(null, { status: 200, headers });
    }
    if (range) {
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${stat.size}`;
      headers["Content-Length"] = String(range.end - range.start + 1);
      const body = Readable.toWeb(fs.createReadStream(abs, { start: range.start, end: range.end })) as ReadableStream;
      return new Response(body, { status: 206, headers });
    }
    headers["Content-Length"] = String(stat.size);
    return new Response(Readable.toWeb(fs.createReadStream(abs)) as ReadableStream, { status: 200, headers });
  };

  app.on(["GET", "HEAD"], "/data/*", handler);
  app.on(["GET", "HEAD"], "/assets/*", handler);
  app.options("*", (c) => new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "range" } }));
  return app;
}
