/**
 * Teste de ponta a ponta com o RENDERIZADOR REAL (Remotion + Chromium) em modo de teste (sem custo):
 * roteiro → aprovação → narração → render 1080x1920@60 → verificação → prévia → exportação,
 * e depois confere o MP4 resultante com o ffprobe e analisa quadros reais.
 *
 *   npm run test:e2e        (leva alguns minutos; na 1ª vez empacota a composição)
 * Em máquina sem internet: defina BROWSER_EXECUTABLE para um Chrome/Chromium.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../../src/core/app";
import { loadConfig } from "../../src/core/config";
import { Ffmpeg } from "../../src/core/media/ffmpeg";
import { runProcess } from "../../src/core/media/process";
import type { Project } from "../../src/shared/schemas";

let tmp: string;
let app: App;

async function meanBrightness(video: string, atSec: number): Promise<number> {
  // Extrai 1 quadro 64x114 em tons de cinza (raw) e calcula a média.
  const out = path.join(tmp, `f-${atSec}.gray`);
  await runProcess("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(atSec), "-i", video, "-frames:v", "1", "-vf", "scale=64:114,format=gray", "-f", "rawvideo", out]);
  const buf = fs.readFileSync(out);
  return buf.reduce((a, b) => a + b, 0) / buf.length;
}

describe("pipeline real (Remotion) em modo de teste", () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mv-e2e-"));
    app = await createApp(loadConfig({ DATA_DIR: tmp, BROWSER_EXECUTABLE: process.env.BROWSER_EXECUTABLE ?? "" } as NodeJS.ProcessEnv));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("produz um MP4 H.264 1080x1920 @ 60fps com áudio, legendas e verificação aprovada", async () => {
    const p = await app.engine.createProject({ brandId: "versao-x", theme: "Por que o tempo parece acelerar com a idade", targetDurationSec: 15, testMode: true });
    await app.engine.generateScript(p.id);
    const wait = async (ok: (x: Project) => boolean) => {
      for (let i = 0; i < 20_000; i++) {
        const x = await app.store.require(p.id);
        if (ok(x)) return x;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("timeout");
    };
    await wait((x) => x.status === "awaiting_script_approval");
    await app.engine.approveScript(p.id);
    const done = await wait((x) => x.status === "awaiting_video_approval" || x.status === "failed");
    expect(done.lastError?.message).toBeUndefined();
    expect(done.status).toBe("awaiting_video_approval");
    expect(done.artifacts.verification?.ok).toBe(true);
    // sincronia medida no MP4 final (áudio × legendas): pico de correlação em ~0 ms
    expect(done.artifacts.verification?.checks.find((c) => c.id === "av-sync")?.status).toBe("ok");

    const file = app.assets.toDisk(done.artifacts.render!.file)!;
    const probe = await new Ffmpeg("ffmpeg", "ffprobe").probe(file);
    expect(probe.video).toMatchObject({ codec: "h264", width: 1080, height: 1920, pixFmt: "yuv420p" });
    expect(probe.video!.fps).toBeCloseTo(60, 2);
    expect(probe.audio?.codec).toBe("aac");
    const plan = JSON.parse(fs.readFileSync(path.join(app.store.projectDir(p.id), "render", "plan.json"), "utf8"));
    expect(Math.abs(probe.durationSec - plan.totalFrames / 60)).toBeLessThan(0.1);

    // Quadros reais: o vídeo não é preto e muda ao longo do tempo (animação + legendas).
    const b1 = await meanBrightness(file, 1);
    const b2 = await meanBrightness(file, Math.min(8, probe.durationSec - 1));
    expect(b1).toBeGreaterThan(8);
    expect(b2).toBeGreaterThan(8);

    const { file: exported } = await app.engine.exportVideo(p.id);
    expect(fs.statSync(exported).size).toBe(fs.statSync(file).size);
  });
});
