import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BrandSchema, ScriptSchema } from "../../../shared/schemas";
import { AnthropicLlm } from "./anthropic";
import { MockLlm } from "./mock";

const brand = BrandSchema.parse(JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../../config/brands/versao-x.json"), "utf8")));

const llmScript = {
  title: "Por que o tempo acelera",
  hook: "Você já notou que os anos passam mais rápido?",
  scenes: [
    { narration: "Você já notou que os anos passam mais rápido?", on_screen_text: "POR QUÊ?", visual_description: "Relógio girando", image_prompt: "A clock spinning, vertical", motion: "zoom-in", transition: "fade", duration_hint_sec: 3 },
    { narration: "Quando tudo é novo, o cérebro grava mais detalhes.", on_screen_text: "", visual_description: "Cérebro luminoso", image_prompt: "Glowing brain", motion: "pan-left", transition: "slide", duration_hint_sec: 4 },
  ],
  cta: "Compartilhe.",
  post_caption: "Legenda",
  hashtags: ["#tempo", "mente"],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function message(text: string, extra: Record<string, unknown> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 200 },
    ...extra,
  };
}

describe("AnthropicLlm (SDK oficial + servidor falso — NÃO é a API real)", () => {
  it("pede saída estruturada, sem parâmetros removidos, e converte o JSON em Script válido", async () => {
    const seen: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return json(message(JSON.stringify(llmScript)));
    }) as unknown as typeof fetch;
    const llm = new AnthropicLlm({ apiKey: "sk-ant-test-123456", model: "claude-opus-5-5", fallbacks: false, fetch: fakeFetch, baseURL: "https://fake.anthropic.test" });
    const script = await llm.generateScript({ brand, theme: "tempo e idade", targetDurationSec: 30, language: "pt-BR" });

    expect(seen).toHaveLength(1);
    const { url, headers, body } = seen[0]!;
    expect(url).toContain("/v1/messages");
    expect(headers.get("authorization")).toBe("Bearer sk-ant-test-123456"); // o SDK 1.x autentica assim
    expect(body.model).toBe("claude-opus-5-5");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("tool_choice");
    const oc = body.output_config as { effort: string; format: { type: string; schema: { properties: Record<string, unknown> } } };
    expect(oc.effort).toBe("high");
    expect(oc.format.type).toBe("json_schema");
    expect(Object.keys(oc.format.schema.properties)).toContain("scenes");
    // a última mensagem é do usuário (sem prefill) e o tema chega ao modelo
    const msgs = body.messages as { role: string; content: string }[];
    expect(msgs.at(-1)!.role).toBe("user");
    expect(msgs.at(-1)!.content).toContain("tempo e idade");
    expect(String(body.system)).toContain("Versão X");

    expect(() => ScriptSchema.parse(script)).not.toThrow();
    expect(script.generator).toBe("anthropic:claude-opus-5-5");
    expect(script.scenes.map((s) => s.id)).toEqual(["sc-01", "sc-02"]);
    expect(script.scenes[0]!.transition).toBe("cut"); // a 1ª cena é sempre corte
    expect(script.scenes[1]!.onScreenText).toBeUndefined();
    expect(script.hashtags).toEqual(["tempo", "mente"]);
  });

  it("com fallbacks ligado usa o beta server-side-fallback e fallbacks:'default'", async () => {
    let body: Record<string, unknown> = {};
    let betaHeader = "";
    const fakeFetch = (async (_u: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      betaHeader = new Headers(init?.headers).get("anthropic-beta") ?? "";
      return json(message(JSON.stringify(llmScript)));
    }) as unknown as typeof fetch;
    const llm = new AnthropicLlm({ apiKey: "sk-ant-test-123456", model: "claude-opus-5-5", fallbacks: true, fetch: fakeFetch, baseURL: "https://fake.anthropic.test" });
    await llm.generateScript({ brand, theme: "x", targetDurationSec: 30, language: "pt-BR" });
    expect(body.fallbacks).toBe("default");
    expect(betaHeader).toContain("server-side-fallback-2026-07-01");
  });

  it("recusa de segurança (stop_reason=refusal) vira erro claro, não roteiro vazio", async () => {
    const fakeFetch = (async () =>
      json(message("", { content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms", explanation: "não posso" } }))) as unknown as typeof fetch;
    const llm = new AnthropicLlm({ apiKey: "sk-ant-test-123456", model: "claude-opus-5-5", fallbacks: false, fetch: fakeFetch, baseURL: "https://fake.anthropic.test" });
    await expect(llm.generateScript({ brand, theme: "x", targetDurationSec: 30, language: "pt-BR" })).rejects.toThrow(/recusou/);
  });

  it("401 vira 'chave inválida' sem repetir nem vazar a chave", async () => {
    let n = 0;
    const fakeFetch = (async () => {
      n++;
      return json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401);
    }) as unknown as typeof fetch;
    const llm = new AnthropicLlm({ apiKey: "sk-ant-test-123456", model: "claude-opus-5-5", fallbacks: false, fetch: fakeFetch, baseURL: "https://fake.anthropic.test" });
    const err = await llm.generateScript({ brand, theme: "x", targetDurationSec: 30, language: "pt-BR" }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/ANTHROPIC_API_KEY/);
    expect((err as Error).message).not.toContain("sk-ant-test-123456");
    expect(n).toBe(1);
  });

  it("revisão parcial: cenas não selecionadas voltam idênticas mesmo que a IA as altere", async () => {
    const original = ScriptSchema.parse(await new MockLlm().generateScript({ brand, theme: "tema qualquer", targetDurationSec: 30, language: "pt-BR" }));
    const tampered = {
      ...llmScript,
      scenes: original.scenes.map((s, i) => ({
        narration: i === 1 ? "NOVA fala da cena dois." : "A IA mexeu aqui sem permissão.",
        on_screen_text: "",
        visual_description: "x",
        image_prompt: "x",
        motion: "none",
        transition: "fade",
        duration_hint_sec: 3,
      })),
    };
    const fakeFetch = (async () => json(message(JSON.stringify(tampered)))) as unknown as typeof fetch;
    const llm = new AnthropicLlm({ apiKey: "sk-ant-test-123456", model: "claude-opus-5-5", fallbacks: false, fetch: fakeFetch, baseURL: "https://fake.anthropic.test" });
    const out = await llm.reviseScript({ brand, script: original, instruction: "mude a cena 2", sceneIds: ["sc-02"], targetDurationSec: 30, language: "pt-BR" });
    expect(out.scenes[1]!.narration).toBe("NOVA fala da cena dois.");
    for (const i of [0, 2, 3]) expect(out.scenes[i]).toEqual(original.scenes[i]);
    expect(out.title).toBe(original.title);
  });

  it("revisão parcial que muda o número de cenas é rejeitada", async () => {
    const original = ScriptSchema.parse(await new MockLlm().generateScript({ brand, theme: "tema qualquer", targetDurationSec: 30, language: "pt-BR" }));
    const fakeFetch = (async () => json(message(JSON.stringify(llmScript)))) as unknown as typeof fetch;
    const llm = new AnthropicLlm({ apiKey: "sk-ant-test-123456", model: "claude-opus-5-5", fallbacks: false, fetch: fakeFetch, baseURL: "https://fake.anthropic.test" });
    await expect(llm.reviseScript({ brand, script: original, instruction: "x", sceneIds: ["sc-01"], targetDurationSec: 30, language: "pt-BR" })).rejects.toThrow(/número de cenas/);
  });

  it("sugere ideias com saída estruturada e respeita a quantidade pedida", async () => {
    let user = "";
    const fakeFetch = (async (_u: string | URL | Request, init?: RequestInit) => {
      user = (JSON.parse(String(init?.body)).messages as { content: string }[]).at(-1)!.content;
      return json(message(JSON.stringify({ ideas: [1, 2, 3, 4].map((n) => ({ theme: `Tema ${n}`, hook: `Gancho ${n}`, why: "porque sim" })) })));
    }) as unknown as typeof fetch;
    const llm = new AnthropicLlm({ apiKey: "sk-ant-test-123456", model: "claude-opus-5-5", fallbacks: false, fetch: fakeFetch, baseURL: "https://fake.anthropic.test" });
    const ideas = await llm.suggestIdeas({ brand, count: 2, topic: "sono", avoid: ["Tema velho"], language: "pt-BR" });
    expect(ideas.map((i) => i.theme)).toEqual(["Tema 1", "Tema 2"]);
    expect(user).toContain("sono");
    expect(user).toContain("Tema velho");
  });
});
