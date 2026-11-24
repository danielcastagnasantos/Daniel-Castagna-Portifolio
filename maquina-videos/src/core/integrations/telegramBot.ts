/**
 * Bot de aprovação no Telegram. Recebe por long polling (getUpdates) — não precisa de URL pública.
 * SEGURANÇA: só o chat configurado em TELEGRAM_CHAT_ID pode aprovar/alterar. Qualquer outro chat
 * só recebe resposta ao /start (mostrando o próprio chat_id, para você configurar o .env).
 */
import type { App } from "../app";
import { toErrorInfo } from "../errors";
import { createLogger } from "../logger";
import { sleep } from "../util/fs";
import type { MilestoneEvent } from "../events";
import type { Project } from "../../shared/schemas";
import { TELEGRAM_MAX_UPLOAD_BYTES, TelegramClient, type TgReplyMarkup, type TgUpdate } from "./telegramClient";

const log = createLogger();

/** "cena 3: mais curta" / "scene 2 - troque o exemplo" → pedidos por cena. Texto sem prefixo = pedido geral. */
export function parseSceneInstructions(text: string, validIds: string[]): { changes: { sceneId: string; instruction: string }[]; general: string } {
  const changes: { sceneId: string; instruction: string }[] = [];
  const general: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(?:cena|scene|sc)[\s-]*0*(\d+)\s*[:\-–—]\s*(.+)$/i.exec(line);
    if (m) {
      const id = `sc-${String(Number(m[1])).padStart(2, "0")}`;
      if (validIds.includes(id)) {
        changes.push({ sceneId: id, instruction: m[2]!.trim() });
        continue;
      }
    }
    general.push(line);
  }
  return { changes, general: general.join(" ") };
}

export function formatScriptMessage(p: Project): string {
  const s = p.script;
  if (!s) return `Projeto ${p.id}: sem roteiro.`;
  const head = `📝 Roteiro pronto${p.testMode ? " (MODO DE TESTE)" : ""}\n${s.title}\n${s.scenes.length} cenas · alvo ${p.targetDurationSec}s\n`;
  const body = s.scenes.map((sc, i) => `${i + 1}. ${sc.narration}`).join("\n\n");
  const full = `${head}\n${body}`;
  return full.length > 3900 ? `${full.slice(0, 3850)}\n… (texto cortado; veja o roteiro completo na interface web)` : full;
}

interface Pending {
  projectId: string;
  kind: "script" | "video";
}

export class TelegramBot {
  private client: TelegramClient;
  private offset = 0;
  private stopped = false;
  private ctrl = new AbortController();
  /** message_id do pedido "responda esta mensagem" → o que fazer com a resposta. */
  private pending = new Map<number, Pending>();
  private onMilestone = (e: MilestoneEvent) => void this.notify(e).catch((err) => log.warn(`Telegram: falha ao notificar: ${toErrorInfo(err).message}`));

  constructor(
    private app: App,
    private chatId: string,
    client: TelegramClient,
  ) {
    this.client = client;
  }

  async start(): Promise<void> {
    const me = await this.client.getMe();
    log.info(`Telegram conectado como @${me.username ?? me.id}. Aprovações chegam no chat ${this.chatId}.`);
    this.app.bus.on("milestone", this.onMilestone);
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    this.ctrl.abort();
    this.app.bus.off("milestone", this.onMilestone);
  }

  private async loop(): Promise<void> {
    let backoff = 1000;
    while (!this.stopped) {
      try {
        const updates = await this.client.getUpdates(this.offset, 25, this.ctrl.signal);
        backoff = 1000;
        for (const u of updates) {
          this.offset = Math.max(this.offset, u.update_id + 1);
          await this.handle(u).catch((e) => log.error(`Telegram: erro ao tratar atualização: ${toErrorInfo(e).message}`));
        }
      } catch (e) {
        if (this.stopped) return;
        const msg = toErrorInfo(e).message;
        log.warn(`Telegram: falha no polling (${msg}); nova tentativa em ${Math.round(backoff / 1000)}s`);
        if (/409|webhook/i.test(msg)) log.warn("Telegram: este bot tem um webhook ativo; getUpdates não funciona com webhook. Use outro bot ou remova o webhook.");
        await sleep(backoff, this.ctrl.signal).catch(() => undefined);
        backoff = Math.min(backoff * 2, 60_000);
      }
    }
  }

  private authorized(chatId: number | string | undefined): boolean {
    return chatId !== undefined && String(chatId) === this.chatId;
  }

  async handle(u: TgUpdate): Promise<void> {
    if (u.callback_query) return this.handleCallback(u.callback_query);
    const m = u.message;
    if (!m?.text) return;
    const text = m.text.trim();
    if (!this.authorized(m.chat.id)) {
      if (/^\/(start|chatid)\b/.test(text)) {
        await this.client.sendMessage(m.chat.id, `Seu chat_id é ${m.chat.id}.\nColoque TELEGRAM_CHAT_ID=${m.chat.id} no arquivo .env da Máquina de Vídeos e reinicie.`);
      } else log.warn(`Telegram: mensagem de chat NÃO autorizado (${m.chat.id}) ignorada.`);
      return;
    }
    if (/^\/status\b/.test(text)) {
      const list = (await this.app.store.list()).slice(0, 8);
      await this.client.sendMessage(m.chat.id, list.length ? list.map((p) => `• ${p.title ?? p.theme} — ${p.status}${p.testMode ? " (teste)" : ""}`).join("\n") : "Nenhum projeto ainda.");
      return;
    }
    if (/^\/(start|ajuda|help)\b/.test(text)) {
      await this.client.sendMessage(m.chat.id, "Eu aviso quando um roteiro ou vídeo estiver pronto e você aprova por aqui.\n/status — últimos projetos");
      return;
    }
    const replyTo = m.reply_to_message?.message_id;
    const pending = replyTo !== undefined ? this.pending.get(replyTo) : undefined;
    if (!pending) {
      await this.client.sendMessage(m.chat.id, "Para pedir alterações, responda (reply) à mensagem do roteiro/vídeo usando o botão ✏️.");
      return;
    }
    this.pending.delete(replyTo!);
    await this.applyChangeRequest(m.chat.id, pending, text);
  }

  private async applyChangeRequest(chatId: number, pending: Pending, text: string): Promise<void> {
    const { engine, store } = this.app;
    const project = await store.require(pending.projectId);
    const ids = project.script?.scenes.map((s) => s.id) ?? [];
    const { changes, general } = parseSceneInstructions(text, ids);
    try {
      if (pending.kind === "video" && changes.length > 0 && !general) {
        await engine.requestSceneChanges(project.id, changes);
        await this.client.sendMessage(chatId, `🔧 Aplicando ${changes.length} alteração(ões) e renderizando de novo. Aviso quando estiver pronto.`);
      } else {
        const instruction = [general, ...changes.map((c) => `cena ${c.sceneId}: ${c.instruction}`)].filter(Boolean).join(". ");
        await engine.reviseScript(project.id, instruction, changes.map((c) => c.sceneId));
        await this.client.sendMessage(chatId, "🔧 Ajustando o roteiro. Mando o novo texto para você aprovar.");
      }
    } catch (e) {
      await this.client.sendMessage(chatId, `⚠️ Não consegui aplicar: ${toErrorInfo(e).message}`);
    }
  }

  private async handleCallback(q: NonNullable<TgUpdate["callback_query"]>): Promise<void> {
    const chatId = q.message?.chat.id;
    if (!this.authorized(chatId)) {
      log.warn(`Telegram: botão de chat NÃO autorizado (${chatId}) ignorado.`);
      await this.client.answerCallbackQuery(q.id, "Chat não autorizado.").catch(() => undefined);
      return;
    }
    const [action, projectId] = (q.data ?? "").split(":", 2);
    if (!action || !projectId) return;
    const { engine } = this.app;
    const done = async (text: string) => {
      await this.client.answerCallbackQuery(q.id, text).catch(() => undefined);
      if (q.message) await this.client.editMessageReplyMarkup(q.message.chat.id, q.message.message_id).catch(() => undefined);
    };
    try {
      switch (action) {
        case "sa": // aprovar roteiro
          await engine.approveScript(projectId);
          await done("Roteiro aprovado. Produzindo…");
          await this.client.sendMessage(chatId!, "✅ Roteiro aprovado. Estou produzindo — aviso quando o vídeo estiver pronto.");
          break;
        case "va": // aprovar vídeo
          await engine.approveVideo(projectId);
          await done("Vídeo aprovado!");
          await this.client.sendMessage(chatId!, "🎉 Vídeo aprovado. Exporte o MP4 final pela interface web (botão “Baixar MP4 final”).");
          break;
        case "sr":
        case "vr": {
          await done("Responda à mensagem abaixo.");
          const ask = await this.client.sendMessage(
            chatId!,
            "✏️ Responda a ESTA mensagem com o que mudar.\nPara cenas específicas escreva uma por linha, ex.:\ncena 3: deixe mais curta\ncena 5: troque o exemplo",
            { force_reply: true, input_field_placeholder: "cena 3: ..." },
          );
          this.pending.set(ask.message_id, { projectId, kind: action === "sr" ? "script" : "video" });
          break;
        }
        case "rs":
          await engine.resume(projectId);
          await done("Retomando…");
          break;
        default:
          await done("Ação desconhecida.");
      }
    } catch (e) {
      await this.client.answerCallbackQuery(q.id, "Não foi possível.").catch(() => undefined);
      await this.client.sendMessage(chatId!, `⚠️ ${toErrorInfo(e).message}`).catch(() => undefined);
    }
  }

  async notify(e: MilestoneEvent): Promise<void> {
    const { store, assets } = this.app;
    const kb = (rows: [string, string][][]): TgReplyMarkup => ({ inline_keyboard: rows.map((r) => r.map(([text, callback_data]) => ({ text, callback_data }))) });
    switch (e.type) {
      case "script_ready": {
        const p = await store.require(e.projectId);
        await this.client.sendMessage(this.chatId, formatScriptMessage(p), kb([[["✅ Aprovar roteiro", `sa:${p.id}`]], [["✏️ Pedir ajuste", `sr:${p.id}`]]]));
        break;
      }
      case "video_ready": {
        const p = await store.require(e.projectId);
        const preview = p.artifacts.preview ? assets.toDisk(p.artifacts.preview.file) : null;
        const warns = p.artifacts.verification?.checks.filter((c) => c.status === "warn").length ?? 0;
        const caption = `🎬 Vídeo pronto${p.testMode ? " (TESTE)" : ""}: ${p.script?.title ?? p.theme}\n${(p.artifacts.render?.durationSec ?? 0).toFixed(0)}s · verificação ${p.artifacts.verification?.ok ? "OK" : "FALHOU"}${warns ? ` (${warns} aviso${warns > 1 ? "s" : ""})` : ""}`;
        const markup = kb([[["✅ Aprovar vídeo", `va:${p.id}`]], [["✏️ Pedir alterações", `vr:${p.id}`]]]);
        if (preview && p.artifacts.preview && p.artifacts.preview.sizeBytes <= TELEGRAM_MAX_UPLOAD_BYTES) {
          await this.client.sendVideo(this.chatId, preview, { caption, width: 540, height: 960, duration: p.artifacts.render?.durationSec, replyMarkup: markup });
        } else {
          await this.client.sendMessage(this.chatId, `${caption}\n(prévia grande demais para o Telegram — veja na interface web)`, markup);
        }
        break;
      }
      case "failed":
        await this.client.sendMessage(this.chatId, `❌ Falhou (${e.projectId}):\n${e.message}`, kb([[["↻ Retomar", `rs:${e.projectId}`]]]));
        break;
      case "approved":
      case "exported":
        break;
    }
  }
}
