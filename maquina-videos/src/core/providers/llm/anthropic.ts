/**
 * Roteirista real: Claude via SDK oficial (@anthropic-ai/sdk), com saída estruturada
 * (`output_config.format` + schema Zod), então a resposta já vem validada.
 * Regras do modelo atual respeitadas: sem prefill, sem tool_choice forçado, sem budget_tokens.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { AppError, ExternalApiError } from "../../errors";
import { createLogger } from "../../logger";
import type { Brand, Reference, ReferenceAnalysis, Script } from "../../../shared/schemas";
import {
  LlmIdeasSchema,
  LlmReferenceAnalysisSchema,
  LlmScriptSchema,
  enforceUntouchedScenes,
  toReferenceAnalysis,
  toScript,
} from "./contract";
import { ideasUserPrompt, referencesSystemPrompt, referencesUserPrompt, reviseUserPrompt, scriptSystemPrompt, scriptUserPrompt } from "./prompts";
import type { Idea, LlmContext, LlmProvider } from "./types";

const log = createLogger();

export interface AnthropicLlmOptions {
  apiKey: string;
  model: string;
  /** Pede ao servidor um modelo de reserva em caso de recusa de segurança (beta server-side-fallback). */
  fallbacks: boolean;
  /** Injeção para testes (fetch falso). */
  fetch?: typeof fetch;
  baseURL?: string;
}

export class AnthropicLlm implements LlmProvider {
  readonly id: string;
  private client: Anthropic;

  constructor(private opts: AnthropicLlmOptions) {
    this.id = `anthropic:${opts.model}`;
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      maxRetries: 3,
      timeout: 5 * 60_000,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
  }

  private async structured<S extends z.ZodType>(
    schema: S,
    system: string,
    user: string,
    ctx?: LlmContext,
    maxTokens = 16_000,
  ): Promise<z.infer<S>> {
    const params = {
      model: this.opts.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user" as const, content: user }],
      output_config: { effort: "high" as const, format: zodOutputFormat(schema) },
    };
    try {
      const res = this.opts.fallbacks
        ? await this.client.beta.messages.parse(
            { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" },
            { signal: ctx?.signal },
          )
        : await this.client.messages.parse(params, { signal: ctx?.signal });

      if (res.stop_reason === "refusal") {
        const d = res.stop_details;
        throw new ExternalApiError(
          "Anthropic",
          `O modelo recusou a solicitação${d?.category ? ` (categoria: ${d.category})` : ""}. ${d?.explanation ?? "Reformule o tema."}`,
        );
      }
      if (res.stop_reason === "max_tokens") {
        throw new ExternalApiError("Anthropic", "A resposta foi cortada por limite de tokens. Reduza a duração ou o tema.");
      }
      const out = res.parsed_output as z.infer<S> | null;
      if (!out) throw new AppError("LLM_BAD_OUTPUT", "A IA não devolveu um roteiro no formato esperado.", { retryable: true });
      const usage = res.usage;
      log.info("Claude respondeu", { model: res.model, in: usage.input_tokens, out: usage.output_tokens });
      return out;
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof Anthropic.AuthenticationError) {
        throw new ExternalApiError("Anthropic", "Chave inválida (ANTHROPIC_API_KEY). Confira o arquivo .env.", { status: 401 });
      }
      if (e instanceof Anthropic.RateLimitError) {
        throw new ExternalApiError("Anthropic", "Limite de uso atingido (429). Aguarde alguns minutos.", { status: 429, retryable: true });
      }
      if (e instanceof Anthropic.APIError) {
        throw new ExternalApiError("Anthropic", `HTTP ${e.status ?? "?"}: ${e.message}`, {
          status: e.status,
          retryable: (e.status ?? 0) >= 500,
          cause: e,
        });
      }
      throw e;
    }
  }

  async suggestIdeas(req: { brand: Brand; count: number; topic?: string; avoid: string[]; language: string }, ctx?: LlmContext): Promise<Idea[]> {
    const out = await this.structured(LlmIdeasSchema, scriptSystemPrompt(req.brand), ideasUserPrompt(req), ctx, 8_000);
    return out.ideas.slice(0, req.count).map((i) => ({ theme: i.theme.trim(), hook: i.hook.trim(), why: i.why.trim() }));
  }

  async analyzeReferences(req: { brand: Brand; theme: string; references: Reference[] }, ctx?: LlmContext): Promise<ReferenceAnalysis> {
    const out = await this.structured(
      LlmReferenceAnalysisSchema,
      referencesSystemPrompt(req.brand),
      referencesUserPrompt(req.theme, req.references),
      ctx,
      8_000,
    );
    return toReferenceAnalysis(out, this.id);
  }

  async generateScript(
    req: { brand: Brand; theme: string; targetDurationSec: number; language: string; analysis?: ReferenceAnalysis },
    ctx?: LlmContext,
  ): Promise<Script> {
    const out = await this.structured(
      LlmScriptSchema,
      scriptSystemPrompt(req.brand),
      scriptUserPrompt({
        theme: req.theme,
        targetSec: req.targetDurationSec,
        wordsPerSecond: req.brand.script.wordsPerSecond,
        analysis: req.analysis,
      }),
      ctx,
    );
    return toScript(out, this.id);
  }

  async reviseScript(
    req: { brand: Brand; script: Script; instruction: string; sceneIds: string[]; targetDurationSec: number; language: string },
    ctx?: LlmContext,
  ): Promise<Script> {
    const out = await this.structured(
      LlmScriptSchema,
      scriptSystemPrompt(req.brand),
      reviseUserPrompt({ script: req.script, instruction: req.instruction, sceneIds: req.sceneIds, targetSec: req.targetDurationSec }),
      ctx,
    );
    const revised = toScript(out, this.id);
    return enforceUntouchedScenes(req.script, revised, req.sceneIds);
  }
}
