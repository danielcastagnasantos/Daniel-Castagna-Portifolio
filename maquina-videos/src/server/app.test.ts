import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../core/app";
import { loadConfig } from "../core/config";
import { Ffmpeg } from "../core/media/ffmpeg";
import { createProviders } from "../core/providers";
import { FakeRenderer } from "../testing/fakes";
import { createServerApp } from "./app";

const ffmpegOk = await new Ffmpeg("ffmpeg", "ffprobe").versions().then((v) => Boolean(v.ffmpeg && v.ffprobe));

const J = { "content-type": "application/json" };
const H = { host: "localhost:8787" };

describe.skipIf(!ffmpegOk)("API HTTP (em processo, sem rede)", () => {
  let tmp: string;
  let app: App;
  let server: ReturnType<typeof createServerApp>;
  const get = (url: string, headers: Record<string, string> = {}) => server.request(url, { headers: { ...H, ...headers } });
  const post = (url: string, body: unknown = {}, headers: Record<string, string> = {}) =>
    server.request(url, { method: "POST", headers: { ...H, ...J, ...headers }, body: JSON.stringify(body) });
  const poll = async (id: string, ok: (p: { status: string }) => boolean) => {
    for (let i = 0; i < 2400; i++) {
      const p = (await (await get(`/api/projects/${id}`)).json()) as { status: string };
      if (ok(p)) return p as never as Record<string, any>;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("timeout");
  };

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mv-api-"));
    const config = loadConfig({ DATA_DIR: tmp } as NodeJS.ProcessEnv);
    const ffmpeg = new Ffmpeg("ffmpeg", "ffprobe");
    app = await createApp(config, { renderer: new FakeRenderer(), providersFor: (p) => createProviders(config, { testMode: p.testMode, visualMode: p.visualMode }, ffmpeg) });
    server = createServerApp(app);
  });
  afterAll(() => { try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows pode segurar arquivos por instantes */ } });

  it("health e marcas", async () => {
    const h = (await (await get("/api/health")).json()) as Record<string, any>;
    expect(h.ok).toBe(true);
    expect(h.video).toMatchObject({ width: 1080, height: 1920, fps: 60 });
    expect(h.tools.ffmpeg).toMatch(/ffmpeg/);
    expect(h.providers).toEqual({ anthropic: false, elevenlabs: false, runway: false, telegram: false, webhook: false });
    const brands = (await (await get("/api/brands")).json()) as { id: string; implemented: boolean }[];
    expect(brands.map((b) => [b.id, b.implemented])).toEqual(expect.arrayContaining([["versao-x", true], ["hipotese-x", false]]));
  });

  it("segurança: rejeita Host estranho, escrita sem JSON e token errado", async () => {
    expect((await server.request("/api/health", { headers: { host: "evil.example.com" } })).status).toBe(403);
    expect((await server.request("/api/projects", { method: "POST", headers: { ...H, "content-type": "text/plain" }, body: "x" })).status).toBe(415);
    expect((await server.request("/api/projects/x/approve-script", { method: "POST", headers: H })).status).toBe(415);

    const cfg = loadConfig({ DATA_DIR: tmp, API_TOKEN: "token-secreto-123" } as NodeJS.ProcessEnv);
    const guarded = createServerApp({ ...app, config: cfg });
    expect((await guarded.request("/api/health", { headers: H })).status).toBe(401);
    expect((await guarded.request("/api/health", { headers: { ...H, authorization: "Bearer errado" } })).status).toBe(401);
    expect((await guarded.request("/api/health", { headers: { ...H, authorization: "Bearer token-secreto-123" } })).status).toBe(200);
  });

  it("validação e erros em português", async () => {
    const r = await post("/api/projects", { brandId: "versao-x", theme: "ab", targetDurationSec: 30 });
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).error.message).toMatch(/pelo menos 3/);
    const h = await post("/api/projects", { brandId: "hipotese-x", theme: "tema", targetDurationSec: 30 });
    expect(h.status).toBe(400);
    expect(((await h.json()) as any).error.message).toMatch(/ainda não foi implementado/);
    const live = await post("/api/projects", { brandId: "versao-x", theme: "tema", targetDurationSec: 30, testMode: false });
    expect(live.status).toBe(412);
    expect(((await live.json()) as any).error.message).toMatch(/ANTHROPIC_API_KEY/);
    expect((await get("/api/projects/nao-existe")).status).toBe(404);
  });

  it("fluxo completo pela API, incluindo edição do roteiro, Range no vídeo e download", async () => {
    const created = await post("/api/projects", { brandId: "versao-x", theme: "Tema da API", targetDurationSec: 20, testMode: true });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await post(`/api/projects/${id}/generate-script`)).status).toBe(202);
    const scripted = await poll(id, (p) => p.status === "awaiting_script_approval");
    expect(scripted.warnings.length).toBeGreaterThan(0);

    // edita a fala da cena 1
    const edited = structuredClone(scripted.script);
    edited.scenes[0].narration = "Fala editada pelo usuário na primeira cena.";
    const put = await server.request(`/api/projects/${id}/script`, { method: "PUT", headers: { ...H, ...J }, body: JSON.stringify(edited) });
    expect(put.status).toBe(200);
    expect(((await put.json()) as any).script.scenes[0].narration).toContain("editada pelo usuário");

    expect((await post(`/api/projects/${id}/approve-script`)).status).toBe(202);
    const ready = await poll(id, (p) => ["awaiting_video_approval", "failed"].includes(p.status));
    expect(ready.status).toBe("awaiting_video_approval");
    expect(ready.scriptApproved).toBe(true);
    expect(ready.artifacts.verification.ok).toBe(true);

    // arquivos servidos com suporte a Range (o player precisa para "pular" no vídeo)
    const full = await get(ready.urls.preview);
    expect(full.status).toBe(200);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    const total = Number(full.headers.get("content-length"));
    const part = await get(ready.urls.preview, { range: "bytes=0-99" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-99/${total}`);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
    expect((await get(ready.urls.preview, { range: "bytes=999999999-" })).status).toBe(416);
    expect((await get(ready.urls.narration["sc-01"])).headers.get("content-type")).toBe("audio/wav");

    // aprovar e baixar
    expect((await post(`/api/projects/${id}/approve-video`)).status).toBe(200);
    const dl = await get(`/api/projects/${id}/download`);
    expect(dl.headers.get("content-disposition")).toMatch(/attachment; filename=".*TESTE.*\.mp4"/i);
    expect((await dl.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    const exp = (await (await post(`/api/projects/${id}/export`)).json()) as { file: string };
    expect(fs.existsSync(exp.file)).toBe(true);

    // logs do projeto e listagem
    const list = (await (await get("/api/projects")).json()) as { id: string }[];
    expect(list.some((p) => p.id === id)).toBe(true);
  });

  it("servidor de arquivos bloqueia path traversal e pastas sensíveis", async () => {
    for (const bad of ["/data/../.env", "/data/%2e%2e/package.json", "/data/logs/app.log", "/data/projects/../logs/app.log", "/assets/../package.json", "/assets/%2e%2e/.env"]) {
      const r = await get(bad);
      const text = await r.text();
      // o navegador normaliza "/data/../x" para "/x" (cai na interface web); o que importa é não vazar arquivos
      expect(text).not.toContain('"dependencies"');
      expect(text).not.toContain("ANTHROPIC_API_KEY=");
      expect(text).not.toContain('"level"');
    }
  });

  it("ideias de tema: modo de teste devolve exemplos rotulados; marca inválida é rejeitada", async () => {
    const r = await post("/api/ideas", { brandId: "versao-x", count: 3, topic: "economia doméstica", testMode: true });
    const j = (await r.json()) as { testMode: boolean; generator: string; ideas: { theme: string }[] };
    expect(j.testMode).toBe(true);
    expect(j.generator).toBe("teste");
    expect(j.ideas).toHaveLength(3);
    expect(j.ideas[0]!.theme).toContain("[TESTE]");
    expect((await post("/api/ideas", { brandId: "x", count: 3, testMode: true })).status).toBe(400);
    expect((await post("/api/ideas", { brandId: "versao-x", count: 3, testMode: false })).status).toBe(412);
  });

  it("SSE entrega o estado atual do projeto ao conectar", async () => {
    const { id } = (await (await post("/api/projects", { brandId: "versao-x", theme: "Tema SSE", targetDurationSec: 20, testMode: true })).json()) as { id: string };
    const res = await get(`/api/projects/${id}/events`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: project");
    expect(text).toContain(id);
    await reader.cancel();
  });
});
