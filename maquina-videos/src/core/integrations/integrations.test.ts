import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../app";
import { loadConfig } from "../config";
import { Ffmpeg } from "../media/ffmpeg";
import { createProviders } from "../providers";
import { FakeRenderer } from "../../testing/fakes";
import type { Project } from "../../shared/schemas";
import { TelegramBot, formatScriptMessage, parseSceneInstructions } from "./telegramBot";
import { TelegramClient } from "./telegramClient";
import { WebhookNotifier, signBody } from "./webhook";
import { createHmac } from "node:crypto";

const ffmpegOk = await new Ffmpeg("ffmpeg", "ffprobe").versions().then((v) => Boolean(v.ffmpeg && v.ffprobe));

interface Call {
  method: string;
  body: Record<string, unknown> | FormData;
}

function fakeTelegram() {
  const calls: Call[] = [];
  let nextId = 100;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = String(url).split("/").pop()!;
    expect(String(url)).toMatch(/^https:\/\/api\.telegram\.org\/botTOKEN123456:[A-Za-z]+\/|^https:\/\/api\.telegram\.org\/botTOKEN123456\//);
    const body = init?.body instanceof FormData ? init.body : (JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    calls.push({ method, body });
    const result = method === "getMe" ? { id: 1, username: "bot_teste" } : method === "answerCallbackQuery" || method === "editMessageReplyMarkup" ? true : { message_id: nextId++ };
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl, of: (m: string) => calls.filter((c) => c.method === m) };
}

describe("parseSceneInstructions", () => {
  const ids = ["sc-01", "sc-02", "sc-03"];
  it("separa pedidos por cena do pedido geral", () => {
    const r = parseSceneInstructions("cena 2: deixe mais curta\nCena 3 - troque o exemplo\ncomece com uma pergunta", ids);
    expect(r.changes).toEqual([{ sceneId: "sc-02", instruction: "deixe mais curta" }, { sceneId: "sc-03", instruction: "troque o exemplo" }]);
    expect(r.general).toBe("comece com uma pergunta");
  });
  it("cena inexistente vira pedido geral (não é perdido)", () => {
    const r = parseSceneInstructions("cena 9: algo", ids);
    expect(r.changes).toEqual([]);
    expect(r.general).toContain("cena 9");
  });
});

describe.skipIf(!ffmpegOk)("Telegram + webhook (servidores falsos — NÃO são as APIs reais)", () => {
  let tmp: string;
  let app: App;
  const wait = async (cond: () => Promise<boolean>, ms = 60_000) => {
    const t0 = Date.now();
    while (!(await cond())) {
      if (Date.now() - t0 > ms) throw new Error("timeout");
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const status = (id: string) => async () => (await app.store.require(id)).status;

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mv-tg-"));
    const config = loadConfig({ DATA_DIR: tmp } as NodeJS.ProcessEnv);
    const ffmpeg = new Ffmpeg("ffmpeg", "ffprobe");
    app = await createApp(config, { renderer: new FakeRenderer(), providersFor: (p) => createProviders(config, { testMode: p.testMode, visualMode: p.visualMode }, ffmpeg) });
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  async function newScripted(): Promise<Project> {
    const p = await app.engine.createProject({ brandId: "versao-x", theme: "Tema Telegram", targetDurationSec: 20, testMode: true });
    await app.engine.generateScript(p.id);
    await wait(async () => (await status(p.id)()) === "awaiting_script_approval");
    return app.store.require(p.id);
  }

  it("fluxo: roteiro com botões → aprovar pelo Telegram → vídeo enviado com botões → aprovar vídeo", async () => {
    const tg = fakeTelegram();
    const bot = new TelegramBot(app, "555", new TelegramClient("TOKEN123456:abc", { fetch: tg.fetchImpl }));
    const p = await newScripted();

    await bot.notify({ type: "script_ready", projectId: p.id });
    const sent = tg.of("sendMessage")[0]!.body as Record<string, any>;
    expect(sent.chat_id).toBe("555");
    expect(sent.text).toContain("Roteiro pronto");
    expect(sent.text).toContain("MODO DE TESTE");
    expect(sent.reply_markup.inline_keyboard.flat().map((b: any) => b.callback_data)).toEqual([`sa:${p.id}`, `sr:${p.id}`]);

    // clique de um chat NÃO autorizado é ignorado
    await bot.handle({ update_id: 1, callback_query: { id: "cb0", data: `sa:${p.id}`, from: { id: 999 }, message: { message_id: 7, chat: { id: 999 } } } });
    expect((await app.store.require(p.id)).status).toBe("awaiting_script_approval");
    expect(tg.of("answerCallbackQuery")[0]!.body).toMatchObject({ text: "Chat não autorizado." });

    // clique do chat autorizado aprova e inicia a produção
    await bot.handle({ update_id: 2, callback_query: { id: "cb1", data: `sa:${p.id}`, from: { id: 555 }, message: { message_id: 8, chat: { id: 555 } } } });
    expect(["producing", "awaiting_video_approval"]).toContain((await app.store.require(p.id)).status);
    expect(tg.of("editMessageReplyMarkup")).toHaveLength(1); // botões removidos após o uso
    await wait(async () => (await status(p.id)()) === "awaiting_video_approval");

    await bot.notify({ type: "video_ready", projectId: p.id });
    const video = tg.of("sendVideo")[0]!.body as FormData;
    expect(video.get("chat_id")).toBe("555");
    expect(video.get("video")).toBeInstanceOf(Blob);
    expect(String(video.get("caption"))).toContain("Vídeo pronto");
    expect(JSON.parse(String(video.get("reply_markup"))).inline_keyboard.flat().map((b: any) => b.callback_data)).toEqual([`va:${p.id}`, `vr:${p.id}`]);

    await bot.handle({ update_id: 3, callback_query: { id: "cb2", data: `va:${p.id}`, from: { id: 555 }, message: { message_id: 9, chat: { id: 555 } } } });
    expect((await app.store.require(p.id)).status).toBe("approved");
  });

  it("pedir alterações: botão ✏️ → resposta 'cena 2: ...' → regera só aquela cena", async () => {
    const tg = fakeTelegram();
    const bot = new TelegramBot(app, "555", new TelegramClient("TOKEN123456:abc", { fetch: tg.fetchImpl }));
    const p = await newScripted();
    await app.engine.approveScript(p.id);
    await wait(async () => (await status(p.id)()) === "awaiting_video_approval");

    await bot.handle({ update_id: 1, callback_query: { id: "c", data: `vr:${p.id}`, from: { id: 555 }, message: { message_id: 1, chat: { id: 555 } } } });
    const ask = tg.of("sendMessage").at(-1)!.body as Record<string, any>;
    expect(ask.reply_markup.force_reply).toBe(true);
    const askId = 100; // message_id devolvido pelo servidor falso ao primeiro sendMessage
    await bot.handle({ update_id: 2, message: { message_id: 50, chat: { id: 555 }, text: "cena 2: fale de outro jeito", reply_to_message: { message_id: askId } } });
    await wait(async () => (await status(p.id)()) === "awaiting_video_approval" && (await app.store.require(p.id)).changeRequests.length === 1);
    const after = await app.store.require(p.id);
    expect(after.script!.scenes[1]!.narration).toContain("fale de outro jeito");
    expect(after.changeRequests[0]).toMatchObject({ sceneIds: ["sc-02"], status: "applied" });
  });

  it("/start de chat desconhecido mostra o chat_id; outras mensagens dele são ignoradas", async () => {
    const tg = fakeTelegram();
    const bot = new TelegramBot(app, "555", new TelegramClient("TOKEN123456:abc", { fetch: tg.fetchImpl }));
    await bot.handle({ update_id: 1, message: { message_id: 1, chat: { id: 777 }, text: "/start" } });
    expect((tg.of("sendMessage")[0]!.body as any).text).toContain("TELEGRAM_CHAT_ID=777");
    await bot.handle({ update_id: 2, message: { message_id: 2, chat: { id: 777 }, text: "/status" } });
    expect(tg.of("sendMessage")).toHaveLength(1);
  });

  it("formatScriptMessage nunca passa do limite do Telegram", async () => {
    const p = await newScripted();
    const huge = structuredClone(p);
    huge.script!.scenes = Array.from({ length: 40 }, (_, i) => ({ ...p.script!.scenes[0]!, id: `sc-${i}`, narration: "palavra ".repeat(60) }));
    expect(formatScriptMessage(huge).length).toBeLessThan(4096);
  });

  it("webhook de saída: POST com assinatura HMAC válida e payload útil", async () => {
    const seen: { url: string; headers: Headers; body: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), headers: new Headers(init?.headers), body: String(init?.body) });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const p = await newScripted();
    const w = new WebhookNotifier(app, "https://n8n.example.test/webhook/abc", "segredo-do-webhook", fetchImpl);
    await w.send({ type: "script_ready", projectId: p.id });
    expect(seen).toHaveLength(1);
    const { headers, body } = seen[0]!;
    expect(headers.get("x-signature")).toBe(`sha256=${createHmac("sha256", "segredo-do-webhook").update(body).digest("hex")}`);
    expect(headers.get("x-signature")).toBe(signBody("segredo-do-webhook", body));
    const payload = JSON.parse(body);
    expect(payload).toMatchObject({ event: "script_ready", projectId: p.id, status: "awaiting_script_approval", testMode: true });
    expect(payload.links.ui).toContain(`#/p/${p.id}`);
  });

  it("webhook repete em erro 5xx e desiste em 4xx", async () => {
    let n = 0;
    const flaky = (async () => (++n < 3 ? new Response("x", { status: 503 }) : new Response("ok", { status: 200 }))) as unknown as typeof fetch;
    const p = await newScripted();
    await new WebhookNotifier(app, "https://x.test/h", undefined, flaky).send({ type: "approved", projectId: p.id });
    expect(n).toBe(3);
    let m = 0;
    const bad = (async () => (++m, new Response("no", { status: 404 }))) as unknown as typeof fetch;
    await expect(new WebhookNotifier(app, "https://x.test/h", undefined, bad).send({ type: "approved", projectId: p.id })).rejects.toThrow();
    expect(m).toBe(1);
  }, 30_000);
});
