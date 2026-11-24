import type { App } from "../core/app";

/** Integrações opcionais (Telegram, webhooks). Preenchido na fase 2. */
export async function startIntegrations(_app: App): Promise<() => void> {
  return () => undefined;
}
