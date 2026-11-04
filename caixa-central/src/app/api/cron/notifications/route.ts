import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { digestEmail, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

interface DigestRow { user_id: string; email: string; full_name: string; notification_id: string; title: string; body: string | null; severity: string; link: string | null }

/**
 * Rotina agendada (Vercel Cron): gera alertas por tempo (vencimentos, caixa aberto) e envia
 * o resumo por e-mail a quem optou. Protegida por CRON_SECRET (header Authorization: Bearer ...).
 */
export async function GET(req: NextRequest) {
  const secret = serverEnv.cronSecret;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const gen = await admin.rpc("svc_generate_all_notifications");
  if (gen.error) return NextResponse.json({ error: gen.error.message }, { status: 500 });

  const pending = await admin.rpc("svc_pending_email_digest");
  if (pending.error) return NextResponse.json({ error: pending.error.message }, { status: 500 });
  const byUser = new Map<string, DigestRow[]>();
  for (const r of (pending.data ?? []) as DigestRow[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  let sent = 0, failed = 0, skipped = 0;
  for (const [userId, items] of byUser) {
    const msg = digestEmail(items[0].full_name, items);
    const res = await sendEmail({ ...msg, to: items[0].email });
    if (res.status === "skipped") { skipped++; continue; } // sem provedor: não registra entrega (tentará de novo quando configurar)
    for (const it of items) {
      await admin.rpc("svc_record_delivery", { p_notification_id: it.notification_id, p_user_id: userId, p_status: res.status, p_error: res.status === "failed" ? res.error : null });
    }
    if (res.status === "sent") sent++; else failed++;
  }
  return NextResponse.json({ generated: gen.data, recipients: byUser.size, sent, failed, skipped, emailProvider: serverEnv.emailProvider });
}
