import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BrandSchema, SceneSchema } from "../../../shared/schemas";
import { RunwayVisuals } from "./runway";

const brand = BrandSchema.parse(JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../../config/brands/versao-x.json"), "utf8")));
const scene = SceneSchema.parse({ id: "sc-01", narration: "x", visual: { description: "desc", prompt: "a calm lake at dawn" }, targetSec: 3 });

function fakeRunway(opts: { failImage?: boolean } = {}) {
  const log: string[] = [];
  let polls = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    log.push(`${method} ${u.pathname}`);
    const h = (init?.headers ?? {}) as Record<string, string>;
    if (u.host === "api.dev.runwayml.com") {
      expect(h.authorization).toBe("Bearer rw-key-123456");
      expect(h["x-runway-version"]).toBe("2024-11-06");
    }
    if (method === "POST" && u.pathname === "/v1/text_to_image") {
      const b = JSON.parse(init!.body as string);
      expect(b).toMatchObject({ model: "gen4_image", promptText: "a calm lake at dawn", ratio: "1080:1920" });
      return new Response(JSON.stringify({ id: "task-img" }), { status: 200 });
    }
    if (method === "POST" && u.pathname === "/v1/image_to_video") {
      const b = JSON.parse(init!.body as string);
      expect(b).toMatchObject({ model: "gen4_turbo", promptImage: "https://cdn.test/img.png", ratio: "720:1280", duration: 5 });
      return new Response(JSON.stringify({ id: "task-vid" }), { status: 200 });
    }
    if (method === "GET" && u.pathname === "/v1/tasks/task-img") {
      polls++;
      if (opts.failImage) return new Response(JSON.stringify({ id: "task-img", status: "FAILED", failure: "moderation" }), { status: 200 });
      if (polls < 3) return new Response(JSON.stringify({ id: "task-img", status: polls === 1 ? "PENDING" : "RUNNING", progress: 0.4 }), { status: 200 });
      return new Response(JSON.stringify({ id: "task-img", status: "SUCCEEDED", output: ["https://cdn.test/img.png"] }), { status: 200 });
    }
    if (method === "GET" && u.pathname === "/v1/tasks/task-vid") return new Response(JSON.stringify({ id: "task-vid", status: "SUCCEEDED", output: ["https://cdn.test/vid.mp4"] }), { status: 200 });
    if (u.host === "cdn.test") return new Response(Buffer.alloc(4000, 7), { status: 200 });
    return new Response("nope", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, log };
}

const base = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rw-")), "v-1");

describe("RunwayVisuals (servidor falso que imita o formato documentado — NÃO é a API real)", () => {
  it("modo imagens: text_to_image → consulta a tarefa até SUCCEEDED → baixa o arquivo", async () => {
    const { fetchImpl, log } = fakeRunway();
    const r = new RunwayVisuals({ apiKey: "rw-key-123456", imageModel: "gen4_image", videoModel: "gen4_turbo", mode: "images", fetch: fetchImpl, pollIntervalMs: 1 });
    const out = await r.resolve({ scene, brand, outBase: base(), seed: 1, usedLibraryFiles: new Set() });
    expect(out?.kind).toBe("image");
    expect(fs.statSync(out!.file!).size).toBe(4000);
    expect(log.filter((l) => l.includes("/v1/tasks/task-img"))).toHaveLength(3);
    expect(log.some((l) => l.includes("image_to_video"))).toBe(false);
  });

  it("modo vídeo: imagem e depois image_to_video com a imagem gerada", async () => {
    const { fetchImpl, log } = fakeRunway();
    const r = new RunwayVisuals({ apiKey: "rw-key-123456", imageModel: "gen4_image", videoModel: "gen4_turbo", mode: "video", fetch: fetchImpl, pollIntervalMs: 1 });
    const out = await r.resolve({ scene, brand, outBase: base(), seed: 1, usedLibraryFiles: new Set() });
    expect(out?.kind).toBe("video");
    expect(out?.file).toMatch(/\.mp4$/);
    expect(log.some((l) => l === "POST /v1/image_to_video")).toBe(true);
  });

  it("tarefa FAILED vira erro legível", async () => {
    const { fetchImpl } = fakeRunway({ failImage: true });
    const r = new RunwayVisuals({ apiKey: "rw-key-123456", imageModel: "gen4_image", videoModel: "gen4_turbo", mode: "images", fetch: fetchImpl, pollIntervalMs: 1 });
    await expect(r.resolve({ scene, brand, outBase: base(), seed: 1, usedLibraryFiles: new Set() })).rejects.toThrow(/moderation/);
  });
});
