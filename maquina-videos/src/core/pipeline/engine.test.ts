import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app";
import { loadConfig } from "../config";
import { addLogSink } from "../logger";
import { Ffmpeg } from "../media/ffmpeg";
import { createProviders, type Providers } from "../providers";
import { FakeRenderer, SpyTts } from "../../testing/fakes";
import type { Project } from "../../shared/schemas";

const ffmpegOk = await new Ffmpeg("ffmpeg", "ffprobe").versions().then((v) => Boolean(v.ffmpeg && v.ffprobe));

async function waitFor<T>(get: () => Promise<T>, ok: (v: T) => boolean, ms = 60_000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await get();
    if (ok(v)) return v;
    if (Date.now() - t0 > ms) throw new Error(`timeout; último estado: ${JSON.stringify((v as Project).status ?? v)}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe.skipIf(!ffmpegOk)("Engine (modo de teste, renderizador substituto)", () => {
  let tmp: string;
  let app: App;
  let renderer: FakeRenderer;
  let tts: SpyTts;

  const status = (id: string) => () => app.store.require(id);

  beforeAll(async () => {
    if (process.env.TEST_LOG) addLogSink((r) => fs.appendFileSync(process.env.TEST_LOG!, `${r.t.slice(11, 23)} ${r.level} ${r.step ?? ""} ${r.msg}\n`));
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mv-engine-"));
    renderer = new FakeRenderer();
    tts = new SpyTts();
    const config = loadConfig({ DATA_DIR: tmp } as NodeJS.ProcessEnv);
    const ffmpeg = new Ffmpeg("ffmpeg", "ffprobe");
    app = await createApp(config, {
      renderer,
      providersFor: (p): Providers => ({ ...createProviders(config, { testMode: p.testMode, visualMode: p.visualMode }, ffmpeg), tts }),
    });
  });
  afterAll(() => { try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows pode segurar arquivos por instantes */ } });

  async function produce(theme = "A lenda do tempo que passa", dur = 10): Promise<Project> {
    const p = await app.engine.createProject({ brandId: "versao-x", theme, targetDurationSec: dur, testMode: true });
    await app.engine.generateScript(p.id);
    await waitFor(status(p.id), (x) => x.status === "awaiting_script_approval");
    await app.engine.approveScript(p.id);
    return waitFor(status(p.id), (x) => x.status === "awaiting_video_approval" || x.status === "failed");
  }

  it("fluxo completo: roteiro → aprovação → narração → visuais → render → verificação → prévia", async () => {
    const done = await produce();
    expect(done.status).toBe("awaiting_video_approval");
    for (const s of ["narration", "visuals", "compose", "render", "verify", "preview"] as const) expect(done.steps[s]?.status).toBe("done");
    expect(done.artifacts.verification?.ok).toBe(true);
    expect(done.artifacts.render?.file).toMatch(/^data\/projects\/.+\/render\/video-/);
    expect(done.artifacts.preview?.poster).toBeTruthy();
    expect(done.script!.generator).toBe("teste");
    // cada cena tem narração com palavras cronometradas
    for (const s of done.script!.scenes) {
      const n = done.artifacts.scenes[s.id]?.narration;
      expect(n?.durationSec).toBeGreaterThan(0.5);
      expect(n?.words.length).toBeGreaterThan(2);
    }
    // arquivos existem de verdade
    for (const f of [done.artifacts.render!.file, done.artifacts.preview!.file, done.artifacts.preview!.poster!]) {
      expect(fs.existsSync(app.assets.toDisk(f)!)).toBe(true);
    }
    // o log do projeto foi gravado em disco? (sinks só no servidor) — o plano sim:
    expect(fs.existsSync(path.join(app.store.projectDir(done.id), "render", "plan.json"))).toBe(true);
  });

  it("aprovar e exportar: copia o MP4 para exports/ com sufixo -TESTE", async () => {
    const done = await produce("Outro tema qualquer");
    const approved = await app.engine.approveVideo(done.id);
    expect(approved.status).toBe("approved");
    const { file } = await app.engine.exportVideo(done.id);
    expect(file).toMatch(/exports.*teste.*\.mp4$/i);
    expect(fs.statSync(file).size).toBeGreaterThan(1000);
  });

  it("editar UMA cena regera só a narração dela e renderiza de novo; o resto é reaproveitado", async () => {
    const done = await produce("Tema para edição de cena", 20);
    const before = tts.texts.length;
    const renders = renderer.calls;
    const script = structuredClone(done.script!);
    script.scenes[1]!.narration = "Esta é a nova fala da segunda cena, bem diferente da anterior.";
    await app.engine.saveScript(done.id, script);
    const mid = await app.store.require(done.id);
    expect(mid.status).toBe("awaiting_script_approval");
    expect(mid.scriptApprovedHash).toBeUndefined(); // editar invalida a aprovação
    await app.engine.approveScript(done.id);
    const after = await waitFor(status(done.id), (x) => x.status === "awaiting_video_approval" || x.status === "failed");
    expect(after.status).toBe("awaiting_video_approval");
    expect(tts.texts.length - before).toBe(1);
    expect(tts.texts.at(-1)).toContain("nova fala da segunda cena");
    expect(renderer.calls).toBe(renders + 1);
    expect(after.artifacts.verification?.ok).toBe(true);
  });

  it("sem nenhuma mudança, reaprovar não gera narração nem renderiza de novo", async () => {
    const done = await produce("Tema estável");
    const t = tts.texts.length;
    const r = renderer.calls;
    await app.engine.approveScript(done.id);
    await waitFor(status(done.id), (x) => x.status === "awaiting_video_approval");
    expect(tts.texts.length).toBe(t);
    expect(renderer.calls).toBe(r);
  });

  it("falha no render: projeto fica 'failed' com o erro; retomar refaz só o render", async () => {
    renderer.failNext = 1;
    const failed = await produce("Tema com falha");
    expect(failed.status).toBe("failed");
    expect(failed.lastError?.code).toBe("RENDER_FAILED");
    expect(failed.steps.render?.status).toBe("failed");
    expect(failed.steps.narration?.status).toBe("done");
    const t = tts.texts.length;
    await app.engine.resume(failed.id);
    const ok = await waitFor(status(failed.id), (x) => x.status === "awaiting_video_approval" || x.status === "failed");
    expect(ok.status).toBe("awaiting_video_approval");
    expect(tts.texts.length).toBe(t); // narração não foi refeita
    expect(ok.lastError).toBeUndefined();
  });

  it("cancelar interrompe a renderização; retomar conclui", async () => {
    renderer.hangUntilAbort = true;
    const p = await app.engine.createProject({ brandId: "versao-x", theme: "Tema cancelável", targetDurationSec: 20, testMode: true });
    await app.engine.generateScript(p.id);
    await waitFor(status(p.id), (x) => x.status === "awaiting_script_approval");
    await app.engine.approveScript(p.id);
    await waitFor(status(p.id), (x) => x.steps.render?.status === "running");
    expect(app.engine.cancel(p.id)).toBe(true);
    const c = await waitFor(status(p.id), (x) => x.status === "cancelled");
    expect(c.steps.render?.status).toBe("interrupted");
    await waitFor(async () => app.engine.isBusy(p.id), (busy) => !busy);
    renderer.hangUntilAbort = false;
    await app.engine.resume(p.id);
    const ok = await waitFor(status(p.id), (x) => x.status === "awaiting_video_approval" || x.status === "failed");
    expect(ok.status).toBe("awaiting_video_approval");
  });

  it("recuperação após reinício: projeto 'producing' sem tarefa ativa é marcado e retomado", async () => {
    const p = await app.engine.createProject({ brandId: "versao-x", theme: "Tema interrompido", targetDurationSec: 20, testMode: true });
    await app.engine.generateScript(p.id);
    await waitFor(status(p.id), (x) => x.status === "awaiting_script_approval");
    const approved = await app.store.require(p.id);
    // simula um crash: estado gravado como "producing" com etapa "running", sem tarefa em memória
    const { scriptHash } = await import("./engine");
    await app.store.update(p.id, (d) => {
      d.status = "producing";
      d.scriptApprovedHash = scriptHash(approved.script!);
      d.steps.narration = { status: "running", attempts: 1 };
    });
    const resumed = await app.engine.recoverInterrupted(true);
    expect(resumed).toContain(p.id);
    const ok = await waitFor(status(p.id), (x) => x.status === "awaiting_video_approval" || x.status === "failed");
    expect(ok.status).toBe("awaiting_video_approval");
  });

  it("modo de teste: pedido de alteração em cena específica reescreve só aquela cena e reproduz", async () => {
    const done = await produce("Tema com pedido de alteração", 20);
    const before = tts.texts.length;
    await app.engine.requestSceneChanges(done.id, [{ sceneId: "sc-02", instruction: "fale mais devagar e use um exemplo" }]);
    const after = await waitFor(status(done.id), (x) => x.status === "awaiting_video_approval" || x.status === "failed");
    expect(after.status).toBe("awaiting_video_approval");
    expect(after.script!.scenes[1]!.narration).toContain("fale mais devagar");
    expect(after.script!.scenes[0]!.narration).toBe(done.script!.scenes[0]!.narration);
    expect(tts.texts.length - before).toBe(1);
    expect(after.changeRequests.at(-1)).toMatchObject({ sceneIds: ["sc-02"], status: "applied" });
  });

  it("revisão do roteiro por IA invalida a aprovação e volta para 'aguardando aprovação'", async () => {
    const done = await produce("Tema para revisão");
    await app.engine.reviseScript(done.id, "deixe a cena 1 mais curta", ["sc-01"]);
    const r = await waitFor(status(done.id), (x) => x.status === "awaiting_script_approval");
    expect(r.scriptApprovedHash).toBeUndefined();
    expect(r.script!.scenes[0]!.narration).toContain("mais curta");
  });

  it("recusa Hipótese X (ainda não implementado), marcas inexistentes e modo ao vivo sem chaves", async () => {
    await expect(app.engine.createProject({ brandId: "hipotese-x", theme: "x", targetDurationSec: 30, testMode: true })).rejects.toThrow(/ainda não foi implementado/);
    await expect(app.engine.createProject({ brandId: "nao-existe", theme: "x", targetDurationSec: 30, testMode: true })).rejects.toThrow(/Marca desconhecida/);
    const live = await createApp(loadConfig({ DATA_DIR: tmp } as NodeJS.ProcessEnv));
    await expect(live.engine.createProject({ brandId: "versao-x", theme: "x", targetDurationSec: 30, testMode: false })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("não permite duas tarefas ao mesmo tempo no mesmo projeto", async () => {
    const p = await app.engine.createProject({ brandId: "versao-x", theme: "Concorrência", targetDurationSec: 20, testMode: true });
    await app.engine.generateScript(p.id);
    await expect(app.engine.generateScript(p.id)).rejects.toThrow(/tarefa em andamento/);
    await waitFor(status(p.id), (x) => x.status === "awaiting_script_approval");
  });

  it("aprovar vídeo exige verificação aprovada", async () => {
    const p = await app.engine.createProject({ brandId: "versao-x", theme: "Sem vídeo", targetDurationSec: 20, testMode: true });
    await expect(app.engine.approveVideo(p.id)).rejects.toThrow(/ainda não está pronto/);
  });
});
