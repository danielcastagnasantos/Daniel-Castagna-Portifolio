/**
 * Cliente mínimo da Telegram Bot API (https://core.telegram.org/bots/api).
 * Métodos usados (nomes e parâmetros conferidos nos tipos oficiais do grammY, @grammyjs/types):
 *   sendMessage, sendVideo (multipart), getUpdates (long polling), answerCallbackQuery,
 *   editMessageReplyMarkup, getMe.
 * URL: https://api.telegram.org/bot<TOKEN>/<método>. Resposta: { ok, result | description, parameters.retry_after }.
 *
 * ⚠ Não testado contra a API real (sem token durante o desenvolvimento): os testes usam um servidor falso.
 */
import fs from "node:fs";
import { ExternalApiError } from "../errors";
import { sleep } from "../util/fs";
import type { FetchLike } from "../util/http";

export interface TgButton {
  text: string;
  callback_data: string;
}
export interface TgReplyMarkup {
  inline_keyboard?: TgButton[][];
  force_reply?: boolean;
  input_field_placeholder?: string;
}
export interface TgUpdate {
  update_id: number;
  message?: { message_id: number; chat: { id: number }; from?: { id: number }; text?: string; reply_to_message?: { message_id: number } };
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { message_id: number; chat: { id: number } } };
}

/** Limite do envio por bots (Bot API em nuvem): 50 MB por arquivo. */
export const TELEGRAM_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export class TelegramClient {
  private fetchImpl: FetchLike;
  private base: string;

  constructor(
    private token: string,
    opts: { fetch?: FetchLike; baseUrl?: string } = {},
  ) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.base = (opts.baseUrl ?? "https://api.telegram.org").replace(/\/+$/, "");
  }

  private async call<T>(method: string, body: unknown, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
    const isForm = body instanceof FormData;
    for (let attempt = 1; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
      const onAbort = () => ctrl.abort();
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const res = await this.fetchImpl(`${this.base}/bot${this.token}/${method}`, {
          method: "POST",
          headers: isForm ? undefined : { "content-type": "application/json" },
          body: isForm ? (body as FormData) : JSON.stringify(body),
          signal: ctrl.signal,
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };
        if (json.ok) return json.result as T;
        if (json.error_code === 429 && attempt <= 3) {
          await sleep(((json.parameters?.retry_after ?? 1) + 0.2) * 1000, opts.signal);
          continue;
        }
        throw new ExternalApiError("Telegram", `${method}: ${json.description ?? `HTTP ${res.status}`}`, {
          status: json.error_code ?? res.status,
          retryable: (json.error_code ?? res.status) >= 500,
        });
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
      }
    }
  }

  getMe() {
    return this.call<{ id: number; username?: string }>("getMe", {});
  }

  sendMessage(chatId: number | string, text: string, replyMarkup?: TgReplyMarkup) {
    return this.call<{ message_id: number }>("sendMessage", { chat_id: chatId, text: text.slice(0, 4000), reply_markup: replyMarkup });
  }

  /** Envia um vídeo (multipart). Respeita o limite de 50 MB — acima disso, lance erro claro. */
  async sendVideo(
    chatId: number | string,
    file: string,
    opts: { caption?: string; width?: number; height?: number; duration?: number; replyMarkup?: TgReplyMarkup } = {},
  ) {
    const size = (await fs.promises.stat(file)).size;
    if (size > TELEGRAM_MAX_UPLOAD_BYTES) {
      throw new ExternalApiError("Telegram", `Vídeo de ${(size / 1e6).toFixed(0)} MB excede o limite de 50 MB para bots.`);
    }
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("video", await fs.openAsBlob(file, { type: "video/mp4" }), "previa.mp4");
    form.set("supports_streaming", "true");
    if (opts.caption) form.set("caption", opts.caption.slice(0, 1000));
    if (opts.width) form.set("width", String(opts.width));
    if (opts.height) form.set("height", String(opts.height));
    if (opts.duration) form.set("duration", String(Math.round(opts.duration)));
    if (opts.replyMarkup) form.set("reply_markup", JSON.stringify(opts.replyMarkup));
    return this.call<{ message_id: number }>("sendVideo", form, { timeoutMs: 5 * 60_000 });
  }

  getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal) {
    return this.call<TgUpdate[]>(
      "getUpdates",
      { offset, timeout: timeoutSec, allowed_updates: ["message", "callback_query"] },
      { signal, timeoutMs: (timeoutSec + 15) * 1000 },
    );
  }

  answerCallbackQuery(id: string, text?: string) {
    return this.call<boolean>("answerCallbackQuery", { callback_query_id: id, text });
  }

  /** Remove os botões depois de usados (evita clicar duas vezes). */
  editMessageReplyMarkup(chatId: number | string, messageId: number, replyMarkup: TgReplyMarkup = { inline_keyboard: [] }) {
    return this.call<unknown>("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: replyMarkup });
  }
}
