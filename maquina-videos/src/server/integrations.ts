import type { App } from "../core/app";
import { TelegramBot } from "../core/integrations/telegramBot";
import { TelegramClient } from "../core/integrations/telegramClient";
import { WebhookNotifier } from "../core/integrations/webhook";
import { toErrorInfo } from "../core/errors";
import { createLogger } from "../core/logger";

/** Liga as integrações opcionais conforme as variáveis de ambiente. Falha numa não derruba o servidor. */
export async function startIntegrations(app: App): Promise<() => void> {
  const log = createLogger();
  const stops: (() => void)[] = [];
  const { telegram, webhook } = app.config;

  if (telegram.botToken && telegram.chatId) {
    try {
      const bot = new TelegramBot(app, telegram.chatId, new TelegramClient(telegram.botToken));
      await bot.start();
      stops.push(() => bot.stop());
    } catch (e) {
      log.error(`Telegram desativado: ${toErrorInfo(e).message}`);
    }
  } else if (telegram.botToken && !telegram.chatId) {
    log.warn("TELEGRAM_BOT_TOKEN definido, mas falta TELEGRAM_CHAT_ID. Mande /start ao bot para descobrir o seu chat_id (rode `npm run doctor`).");
  }

  if (webhook.url) {
    const w = new WebhookNotifier(app, webhook.url, webhook.secret);
    w.start();
    stops.push(() => w.stop());
  }
  return () => stops.forEach((s) => s());
}
