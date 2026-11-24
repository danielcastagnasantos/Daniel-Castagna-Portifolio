import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ElevenLabsTts } from "./elevenlabs";
import type { VoiceConfig } from "./types";

const voice: VoiceConfig = { voiceId: "voz123", modelId: "eleven_multilingual_v2", stability: 0.4, similarityBoost: 0.8, style: 0.2, speed: 1, useSpeakerBoost: true };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "el-"));

function apiResponse(text: string) {
  const chars = [...text];
  return {
    audio_base64: Buffer.from("FAKE-MP3-BYTES-0123456789").toString("base64"),
    alignment: {
      characters: chars,
      character_start_times_seconds: chars.map((_, i) => i * 0.06),
      character_end_times_seconds: chars.map((_, i) => (i + 1) * 0.06),
    },
    normalized_alignment: null,
  };
}

describe("ElevenLabsTts (contra um servidor falso — NÃO é a API real)", () => {
  it("chama o endpoint with-timestamps com chave no header xi-api-key e converte o alinhamento em palavras", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(apiResponse("Olá mundo bonito")), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const tts = new ElevenLabsTts({ apiKey: "segredo-123456", fetch: fakeFetch });
    const out = path.join(tmp(), "cena");
    const res = await tts.synthesize({ text: "Olá mundo bonito", voice, previousText: "Antes.", nextText: "Depois.", outBase: out, seed: 1 });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voz123/with-timestamps?output_format=mp3_44100_128");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("segredo-123456");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toMatchObject({
      text: "Olá mundo bonito",
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed: 1 },
      previous_text: "Antes.",
      next_text: "Depois.",
    });
    expect(res.file).toBe(`${out}.mp3`);
    expect(fs.readFileSync(res.file).toString()).toBe("FAKE-MP3-BYTES-0123456789");
    expect(res.words.map((w) => w.text)).toEqual(["Olá", "mundo", "bonito"]);
    expect(res.words[1]!.start).toBeCloseTo(0.24);
    expect(res.durationSec).toBeCloseTo(16 * 0.06);
  });

  it("erro 401 vira mensagem clara e NÃO repete a chamada nem vaza a chave", async () => {
    let n = 0;
    const fakeFetch = (async () => {
      n++;
      return new Response(JSON.stringify({ detail: { status: "invalid_api_key", message: "bad key" } }), { status: 401 });
    }) as unknown as typeof fetch;
    const tts = new ElevenLabsTts({ apiKey: "segredo-123456", fetch: fakeFetch });
    const err = await tts.synthesize({ text: "x", voice, outBase: path.join(tmp(), "a"), seed: 1 }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/401/);
    expect((err as Error).message).toMatch(/chave inválida/);
    expect((err as Error).message).not.toContain("segredo-123456");
    expect(n).toBe(1);
  });

  it("429 é repetido respeitando Retry-After e depois funciona", async () => {
    let n = 0;
    const fakeFetch = (async () => {
      n++;
      if (n < 3) return new Response("{}", { status: 429, headers: { "retry-after": "0" } });
      return new Response(JSON.stringify(apiResponse("ok")), { status: 200 });
    }) as unknown as typeof fetch;
    const tts = new ElevenLabsTts({ apiKey: "k-123456", fetch: fakeFetch });
    const res = await tts.synthesize({ text: "ok", voice, outBase: path.join(tmp(), "b"), seed: 1 });
    expect(n).toBe(3);
    expect(res.words).toHaveLength(1);
  });

  it("exige voz configurada", async () => {
    const tts = new ElevenLabsTts({ apiKey: "k-123456", fetch: (async () => new Response("{}")) as unknown as typeof fetch });
    await expect(tts.synthesize({ text: "x", voice: { ...voice, voiceId: "" }, outBase: path.join(tmp(), "c"), seed: 1 })).rejects.toThrow(/ELEVENLABS_VOICE_ID/);
  });

  it("resposta sem alinhamento cai em distribuição proporcional (e ainda gera palavras)", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ audio_base64: Buffer.from("0123456789abc").toString("base64") }), { status: 200 })) as unknown as typeof fetch;
    const tts = new ElevenLabsTts({ apiKey: "k-123456", fetch: fakeFetch });
    const res = await tts.synthesize({ text: "uma frase curta", voice, outBase: path.join(tmp(), "d"), seed: 1 });
    expect(res.words.map((w) => w.text)).toEqual(["uma", "frase", "curta"]);
  });
});
