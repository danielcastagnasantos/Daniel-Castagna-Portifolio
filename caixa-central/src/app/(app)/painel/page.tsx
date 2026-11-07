import Link from "next/link";
import { Banknote, CalendarClock, CheckCircle2, CircleAlert, FileSpreadsheet, FileText, ShieldAlert, TrendingUp, Wallet } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Alert, Badge, Card, CardBody, CardHeader, Empty, LinkButton, PageHeader, Stat } from "@/components/ui/primitives";
import { SalesChart } from "@/components/charts/SalesChart";
import { cn } from "@/components/ui/cn";
import { formatDateBR, presetRange, todayISO, type PeriodPreset } from "@/lib/dates";
import { formatBRL, sumCents } from "@/lib/money";
import { methodLabel } from "@/lib/labels";

export const metadata = { title: "Resumos" };

const PERIODS: Array<[string, string, PeriodPreset]> = [["hoje", "Hoje", "today"], ["semana", "Semana", "week"], ["mes", "Mês", "month"], ["mes-passado", "Mês passado", "last-month"], ["ano", "Ano", "year"]];

interface Summary {
  period_sales_cents: number; period_expenses_cents: number; period_cash_diff_cents: number; cash_balance_cents: number;
  payables_open_cents: number; payables_open_count: number; payables_overdue_cents: number; payables_overdue_count: number;
  payables_due_7d_cents: number; payables_due_today_cents: number; shifts_with_diff_period: number; pending_shift_reviews: number;
  open_shifts: Array<{ id: string; employee: string; opened_at: string }>;
}

export default async function Resumos({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireAuth("painel");
  const period = PERIODS.find((p) => p[0] === sp.periodo) ?? PERIODS[2];
  const today = todayISO();
  const { from, to } = presetRange(period[2], today);
  const bucket = period[2] === "year" ? "month" : "day";

  await ctx.supabase.rpc("refresh_notifications");
  const [sum, series, byMethod, paid, upcoming] = await Promise.all([
    ctx.supabase.rpc("dashboard_summary", { p_from: from, p_to: to }),
    ctx.supabase.rpc("dashboard_series", { p_from: from, p_to: to, p_bucket: bucket }),
    ctx.supabase.rpc("report_data", { p_report: "sales_by_method", p_from: from, p_to: to, p_employee: null, p_kind: null }),
    ctx.supabase.rpc("report_data", { p_report: "bills", p_from: from, p_to: to, p_employee: null, p_kind: "paid" }),
    ctx.supabase.from("bills").select("id, description, due_date, amount_cents, paid_cents, suppliers(name)").in("status", ["open", "partial"]).order("due_date").limit(6),
  ]);
  const s = sum.data as Summary | null;
  if (!s) return <Alert tone="danger" title="Não foi possível carregar os resumos">{sum.error?.message ?? "Tente novamente em instantes."}</Alert>;

  const points = ((series.data ?? []) as Array<{ bucket: string; sales: number; expenses: number }>);
  const chart = points.map((p) => ({ label: bucket === "month" ? `${p.bucket.slice(5, 7)}/${p.bucket.slice(2, 4)}` : formatDateBR(p.bucket).slice(0, 5), sales: Number(p.sales), expenses: Number(p.expenses) }));
  const methods = (byMethod.data ?? []) as Array<{ method: string; total_cents: number; sales_count: number }>;
  const maxMethod = Math.max(1, ...methods.map((m) => Number(m.total_cents)));
  const paidRows = (paid.data ?? []) as Array<{ paid_cents: number }>;
  const bills = (upcoming.data ?? []) as unknown as Array<{ id: string; description: string; due_date: string; amount_cents: number; paid_cents: number; suppliers: { name: string } | null }>;

  return (
    <>
      <PageHeader title="Resumos" description={`${formatDateBR(from)}${from !== to ? ` a ${formatDateBR(to)}` : ""}`}
        actions={<div role="tablist" aria-label="Período" className="flex max-w-full overflow-x-auto rounded-xl border border-border bg-surface p-0.5">
          {PERIODS.map(([k, label]) => <Link key={k} href={`/painel?periodo=${k}`} role="tab" aria-selected={k === period[0]} className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium", k === period[0] ? "bg-primary text-on-primary" : "text-muted hover:text-text")}>{label}</Link>)}
        </div>} />

      {(s.payables_overdue_count > 0 || s.payables_due_today_cents > 0) && (
        <Link href="/boletos" className="mb-4 block">
          <Alert tone={s.payables_overdue_count ? "danger" : "warning"} title={s.payables_overdue_count ? `${s.payables_overdue_count} boleto(s) vencido(s): ${formatBRL(s.payables_overdue_cents)}` : `Vence hoje: ${formatBRL(s.payables_due_today_cents)}`}>
            {s.payables_due_today_cents > 0 && s.payables_overdue_count > 0 ? `Mais ${formatBRL(s.payables_due_today_cents)} vencem hoje. ` : ""}Toque para ver os boletos.
          </Alert>
        </Link>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Vendido no período" icon={TrendingUp} tone="primary" value={formatBRL(s.period_sales_cents)} hint={`Despesas em dinheiro e taxas: ${formatBRL(s.period_expenses_cents)}`} />
        <Stat label="Boletos pagos no período" icon={CheckCircle2} tone="success" value={formatBRL(sumCents(paidRows.map((r) => r.paid_cents)))} hint={`${paidRows.length} boleto(s)`} />
        <Stat label="Boletos a pagar (em aberto)" icon={Wallet} tone="warning" value={formatBRL(s.payables_open_cents)} hint={`${s.payables_open_count} boleto(s) · ${formatBRL(s.payables_due_7d_cents)} nos próximos 7 dias`} />
        <Stat label="Boletos vencidos" icon={CircleAlert} tone={s.payables_overdue_count ? "danger" : "success"} value={formatBRL(s.payables_overdue_cents)} hint={`${s.payables_overdue_count} em atraso`} />
        <Stat label="Dinheiro guardado (cofre + gaveta)" icon={Banknote} value={formatBRL(s.cash_balance_cents)} hint="Segundo os lançamentos" />
        <Stat label="Diferenças de caixa" icon={ShieldAlert} tone={s.period_cash_diff_cents === 0 ? "success" : "warning"} value={formatBRL(s.period_cash_diff_cents, { signed: true })} hint={`${s.shifts_with_diff_period} turno(s) com diferença${s.pending_shift_reviews ? ` · ${s.pending_shift_reviews} a conferir` : ""}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={bucket === "month" ? "Vendas por mês" : "Vendas por dia"} description="Vendido × despesas" />
          <CardBody>{chart.length ? <SalesChart data={chart} /> : <Empty title="Sem dados no período" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Vendas por forma de pagamento" />
          <CardBody className="space-y-3">
            {methods.length === 0 ? <p className="text-sm text-muted">Nenhuma venda no período.</p> : methods.map((m) => (
              <div key={m.method}>
                <div className="mb-1 flex justify-between text-sm"><span>{methodLabel[m.method]}</span><b className="tabular">{formatBRL(m.total_cents)}</b></div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (Number(m.total_cents) / maxMethod) * 100)}%` }} /></div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader icon={CalendarClock} title={bucket === "month" ? "Vendido mês a mês" : "Vendido dia a dia"} />
          {points.length === 0 ? <Empty title="Sem dados" /> : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface text-left text-xs text-muted"><tr><th className="px-4 py-2 font-medium sm:px-5">{bucket === "month" ? "Mês" : "Dia"}</th><th className="px-4 py-2 text-right font-medium">Vendido</th><th className="px-4 py-2 text-right font-medium sm:px-5">Despesas</th></tr></thead>
                <tbody>
                  {[...points].reverse().map((p) => (
                    <tr key={p.bucket} className="border-t border-border/60">
                      <td className="px-4 py-2 sm:px-5">{bucket === "month" ? `${p.bucket.slice(5, 7)}/${p.bucket.slice(0, 4)}` : formatDateBR(p.bucket)}</td>
                      <td className="tabular px-4 py-2 text-right font-medium">{formatBRL(p.sales)}</td>
                      <td className="tabular px-4 py-2 text-right text-muted sm:px-5">{formatBRL(p.expenses)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Próximos boletos" action={<Link href="/boletos" className="text-xs text-primary hover:underline">Ver todos</Link>} />
          {bills.length === 0 ? <Empty title="Nenhum boleto em aberto" /> : (
            <ul className="divide-y divide-border">
              {bills.map((b) => (
                <li key={b.id}><Link href={`/boletos/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/60 sm:px-5">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{b.suppliers?.name}</p><p className="text-xs text-muted">{formatDateBR(b.due_date)}</p></div>
                  <div className="flex items-center gap-2 whitespace-nowrap">{b.due_date < today && <Badge tone="danger">vencido</Badge>}<span className="tabular text-sm font-semibold">{formatBRL(b.amount_cents - b.paid_cents)}</span></div></Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="no-print mt-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Relatório do período:</span>
        <LinkButton href={`/api/reports/monthly_close/export?format=pdf&from=${from}&to=${to}`} prefetch={false} variant="secondary" size="sm"><FileText size={14} aria-hidden /> PDF</LinkButton>
        <LinkButton href={`/api/reports/monthly_close/export?format=xlsx&from=${from}&to=${to}`} prefetch={false} variant="secondary" size="sm"><FileSpreadsheet size={14} aria-hidden /> Excel</LinkButton>
      </div>
      <p className="mt-4 text-xs text-muted">Os valores vêm do que foi lançado no sistema; confira sempre com o extrato do banco.</p>
    </>
  );
}
