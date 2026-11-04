import "server-only";
import { serverEnv } from "@/lib/env";

export interface EmailMessage { to: string; subject: string; text: string; html: string }
export type SendResult = { status: "sent" } | { status: "skipped"; reason: string } | { status: "failed"; error: string };

/** Provedor configurável por EMAIL_PROVIDER: "resend" ou "none" (padrão: não envia, só registra). */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const provider = serverEnv.emailProvider;
  if (provider === "none") return { status: "skipped", reason: "EMAIL_PROVIDER=none (envio desativado)" };
  if (provider === "resend") {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) return { status: "skipped", reason: "RESEND_API_KEY/EMAIL_FROM não configurados" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { status: "failed", error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
      return { status: "sent" };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { status: "skipped", reason: `Provedor desconhecido: ${provider}` };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function digestEmail(name: string, items: Array<{ title: string; body: string | null; severity: string; link: string | null }>): EmailMessage & { to: "" } {
  const base = serverEnv.appUrl.replace(/\/$/, "");
  const text = [`Olá, ${name}.`, "", "Alertas do Caixa Central:", ...items.map((i) => `- ${i.title}${i.body ? `: ${i.body}` : ""}${i.link ? ` (${base}${i.link})` : ""}`), "", `Abrir: ${base}/notificacoes`].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px"><h2>Caixa Central — alertas</h2><p>Olá, ${esc(name)}.</p><ul>${items
    .map((i) => `<li style="margin-bottom:8px"><strong>${esc(i.title)}</strong>${i.body ? `<br>${esc(i.body)}` : ""}${i.link ? `<br><a href="${base}${esc(i.link)}">Abrir</a>` : ""}</li>`)
    .join("")}</ul><p><a href="${base}/notificacoes">Ver todas as notificações</a></p></div>`;
  return { to: "", subject: `Caixa Central: ${items.length} alerta(s)`, text, html };
}
