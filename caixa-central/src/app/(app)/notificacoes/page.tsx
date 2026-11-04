import Link from "next/link";
import { BellRing, CheckCheck } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Badge, Card, CardHeader, Empty, PageHeader } from "@/components/ui/primitives";
import { ActionForm } from "@/components/forms/ActionForm";
import { markNotificationsReadAction } from "@/app/actions/settings";
import { severityTone } from "@/components/ui/tones";
import { formatDateTimeBR } from "@/lib/dates";
import { cn } from "@/components/ui/cn";

export const metadata = { title: "Notificações" };

interface N { id: string; kind: string; severity: string; title: string; body: string | null; link: string | null; created_at: string; resolved_at: string | null; is_read: boolean }
const KIND: Record<string, string> = { bill_due_soon: "Vencimento", bill_overdue: "Atrasado", cash_difference: "Diferença de caixa", handoff_mismatch: "Passagem de turno", shift_open_long: "Caixa aberto", movement_review: "Aprovação" };

export default async function NotificationsPage() {
  const ctx = await requireAuth("notificacoes");
  await ctx.supabase.rpc("refresh_notifications");
  const { data } = await ctx.supabase.from("notification_feed").select("id, kind, severity, title, body, link, created_at, resolved_at, is_read").order("created_at", { ascending: false }).limit(150);
  const all = (data ?? []) as N[];
  const active = all.filter((n) => !n.resolved_at);
  const resolved = all.filter((n) => n.resolved_at);
  return (
    <>
      <PageHeader title="Notificações" description="Vencimentos, atrasos, diferenças de caixa, caixa aberto por muito tempo e movimentações a conferir."
        actions={active.some((n) => !n.is_read) ? <ActionForm action={markNotificationsReadAction} submit={<><CheckCheck size={16} aria-hidden /> Marcar todas como lidas</>} variant="secondary"><input type="hidden" name="id" value="" /></ActionForm> : undefined} />
      <Card className="mb-5">
        <CardHeader icon={BellRing} title="Ativas" description={`${active.length} alerta(s) pendente(s)`} />
        {active.length === 0 ? <Empty icon={CheckCheck} title="Tudo em dia" description="Nenhum alerta pendente no momento." /> : (
          <ul className="divide-y divide-border">
            {active.map((n) => (
              <li key={n.id} className={cn("flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5", !n.is_read && "bg-primary-soft/40")}>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">{!n.is_read && <span className="size-2 rounded-full bg-primary" aria-label="não lida" />}{n.title}<Badge tone={severityTone[n.severity]}>{KIND[n.kind] ?? n.kind}</Badge></p>
                  {n.body && <p className="text-xs text-muted">{n.body}</p>}
                  <p className="text-xs text-muted">{formatDateTimeBR(n.created_at)}</p>
                </div>
                {n.link && <Link href={n.link} className="shrink-0 text-sm font-medium text-primary hover:underline">Abrir</Link>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {resolved.length > 0 && (
        <Card>
          <CardHeader title="Resolvidas" description="Boletos pagos/cancelados e turnos já fechados." />
          <ul className="divide-y divide-border">{resolved.slice(0, 30).map((n) => <li key={n.id} className="px-4 py-2.5 text-sm text-muted sm:px-5">{n.title} · {formatDateTimeBR(n.created_at)}</li>)}</ul>
        </Card>
      )}
    </>
  );
}
