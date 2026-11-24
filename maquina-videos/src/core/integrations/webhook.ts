/**
 * Webhook de saída: a cada marco importante faz POST em WEBHOOK_URL (ex.: nó "Webhook" do n8n).
 * Corpo JSON: { event, projectId, at, status, title, testMode, message?, links }.
 * Assinatura opcional: se WEBHOOK_SECRET existir, header "X-Signature: sha256=<HMAC-SHA256 do corpo>".
 */
import { createHmac } from "node:crypto";
import type { App } from "../app";
import type { MilestoneEvent } from "../events";
import { toErrorInfo } from "../errors";
import { createLogger } from "../logger";
import { request, type FetchLike } from "../util/http";
import { withRetry } from "../util/retry";

const log = createLogger();

export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export class WebhookNotifier {
  private handler = (e: MilestoneEvent) => void this.send(e).catch((err) => log.warn(`Webhook: falha ao enviar "${e.type}": ${toErrorInfo(err).message}`));

  constructor(
    private app: App,
    private url: string,
    private secret?: string,
    private fetchImpl: FetchLike = fetch,
  ) {}

  start(): void {
    this.app.bus.on("milestone", this.handler);
    log.info("Webhook de saída ativo.");
  }
  stop(): void {
    this.app.bus.off("milestone", this.handler);
  }

  async send(e: MilestoneEvent): Promise<void> {
    const p = await this.app.store.get(e.projectId);
    const base = `http://${this.app.config.server.host === "0.0.0.0" ? "localhost" : this.app.config.server.host}:${this.app.config.server.port}`;
    const payload = {
      event: e.type,
      projectId: e.projectId,
      at: new Date().toISOString(),
      status: p?.status,
      title: p?.script?.title ?? p?.theme,
      testMode: p?.testMode,
      message: e.type === "failed" ? e.message : undefined,
      links: {
        project: `${base}/api/projects/${e.projectId}`,
        download: p?.artifacts.render ? `${base}/api/projects/${e.projectId}/download` : undefined,
        ui: `${base}/#/p/${e.projectId}`,
      },
    };
    const body = JSON.stringify(payload);
    await withRetry(
      () =>
        request(this.fetchImpl, this.url, {
          method: "POST",
          headers: { "content-type": "application/json", ...(this.secret ? { "x-signature": signBody(this.secret, body) } : {}) },
          body,
          timeoutMs: 10_000,
        }),
      { retries: 3, baseMs: 1000, shouldRetry: (err) => !(err instanceof Error && /HTTP 4(?!08|29)\d\d/.test(err.message)) },
    );
  }
}
