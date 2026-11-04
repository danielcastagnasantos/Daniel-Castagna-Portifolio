import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Banknote, Bell, CalendarClock, CircleAlert, CreditCard, Landmark, ReceiptText, ShieldAlert, TrendingUp, Wallet } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Alert, Badge, Card, CardBody, CardHeader, Empty, PageHeader, Stat } from "@/components/ui/primitives";
import { SalesChart } from "@/components/charts/SalesChart";
import { cn } from "@/components/ui/cn";
import { formatDateBR, formatDateTimeBR, presetRange, todayISO, type PeriodPreset } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { kindLabel, methodLabel } from "@/lib/labels";
import { severityTone } from "@/components/ui/tones";

export const metadata = { title: "Painel" };

const PERIODS: Array<[string, string, PeriodPreset]> = [["hoje", "Hoje", "today"], ["7d", "7 dias", "7d"], ["mes", "Este mês", "month"], ["30d", "30 dias", "30d"], ["mes-passado", "Mês passado", "last-month"]];
const BUCKETS: Array<[string, string]> = [["day", "Dia"], ["week", "Semana"], ["month", "Mês"]];

interface Summary {
  today: string; today_in_cents: number; today_out_cents: number; today_sales_cents: number; period_sales_cents: number; period_refunds_cents: number;
  period_expenses_cents: number; period_other_in_cents: number; period_cash_diff_cents: number; cash_balance_cents: number; bank_balance_cents: number;
  card_receivable_cents: number; payables_open_cents: number; payables_open_count: number; payables_overdue_cents: number; payables_overdue_count: number;
  payables_due_7d_cents: number; payables_due_today_cents: number; receivables_open_cents: number; receivables_overdue_cents: number;
  open_shifts: Array<{ id: string; employee: string; register: string; opened_at: string; expected_cents: number }>;
  pending_movement_reviews: number; pending_shift_reviews: number; shifts_with_diff_period: number;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ periodo?: string; agrupar?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireAuth("painel");
  const period = PERIODS.find((p) => p[0] === sp.periodo) ?? PERIODS[2];
  const bucket = BUCKETS.find((b) => b[0] === sp.agrupar)?.[0] ?? (period[2] === "today" || period[2] === "7d" || period[2] === "month" || period[2] === "30d" || period[2] === "last-month" ? "day" : "week");
  const today = todayISO();
  const { from, to } = presetRange(period[2], today);

  await ctx.supabase.rpc("refresh_notifications");
  const [sum, series, byMethod, recent, upcoming, alerts] = await Promise.all([
    ctx.supabase.rpc("dashboard_summary", { p_from: from, p_to: to }),
    ctx.supabase.rpc("dashboard_series", { p_from: from, p_to: to, p_bucket: bucket }),
    ctx.supabase.rpc("report_data", { p_report: "sales_by_method", p_from: from, p_to: to, p_employee: null, p_kind: null }),
    ctx.supabase.from("cash_movements").select("id, kind, direction, payment_method, amount_cents, description, status, created_at, shift_id").order("created_at", { ascending: false }).limit(8),
    ctx.supabase.from("bills").select("id, description, due_date, amount_cents, paid_cents, suppliers(name)").in("status", ["open", "partial"]).order("due_date").limit(6),
    ctx.supabase.from("notification_feed").select("id, severity, title, body, link").is("resolved_at", null).eq("is_read", false).order("created_at", { ascending: false }).limit(3),
  ]);
  const s = sum.data as Summary | null;
  if (!s) return <Alert tone="danger" title="Não foi possível carregar o painel">{sum.error?.message ?? "Tente novamente em instantes."}</Alert>;

  const points = ((series.data ?? []) as Array<{ bucket: string; sales: number; expenses: number }>).map((p) => ({
    label: bucket === "month" ? `${p.bucket.slice(5, 7)}/${p.bucket.slice(2, 4)}` : formatDateBR(p.bucket).slice(0, 5), sales: Number(p.sales), expenses: Number(p.expenses),
  }));
  const methods = ((byMethod.data ?? []) as Array<{ method: string; total_cents: number }>);
  const maxMethod = Math.max(1, ...methods.map((m) => Number(m.total_cents)));
  const moves = (recent.data ?? []) as Array<{ id: string; kind: string; direction: string; payment_method: string; amount_cents: number; description: string | null; status: string; created_at: string; shift_id: string }>;
  const bills = (upcoming.data ?? []) as unknown as Array<{ id: string; description: string; due_date: string; amount_cents: number; paid_cents: number; suppliers: { name: string } | null }>;
  const alertRows = (alerts.data ?? []) as Array<{ id: string; severity: string; title: string; body: string | null; link: string | null }>;
  const q = (p: Record<string, string>) => `/painel?${new URLSearchParams({ periodo: period[0], agrupar: bucket, ...p })}`;

  return (
    <>
      <PageHeader title="Painel" description={`Situação da empresa · ${formatDateBR(from)}${from !== to ? ` a ${formatDateBR(to)}` : ""}`}
        actions={<div role="tablist" aria-label="Período" className="flex max-w-full overflow-x-auto rounded-xl border border-border bg-surface p-0.5">
          {PERIODS.map(([k, label]) => <Link key={k} href={q({ periodo: k })} role="tab" aria-selected={k === period[0]} className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium", k === period[0] ? "bg-primary text-on-primary" : "text-muted hover:text-text")}>{label}</Link>)}
        </div>} />

      {alertRows.length > 0 && (
        <div className="mb-4 space-y-2">
          {alertRows.map((a) => <Link key={a.id} href={a.link ?? "/notificacoes"} className="block"><Alert tone={severityTone[a.severity]} title={a.title}>{a.body}</Alert></Link>)}
        </div>
      )}

      <section aria-labelledby="h-hoje" className="mb-5">
        <h2 id="h-hoje" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Hoje</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Entradas do dia" icon={ArrowDownRight} tone="success" value={formatBRL(s.today_in_cents)} hint="Vendas + outras entradas" />
          <Stat label="Saídas do dia" icon={ArrowUpRight} tone="warning" value={formatBRL(s.today_out_cents)} hint="Despesas, taxas, boletos e estornos" />
          <Stat label="Vendido hoje" icon={TrendingUp} tone="primary" value={formatBRL(s.today_sales_cents)} hint="Faturamento (não é dinheiro em conta)" />
          <Stat label="Vence hoje" icon={CalendarClock} tone={s.payables_due_today_cents ? "danger" : "neutral"} value={formatBRL(s.payables_due_today_cents)} hint="Boletos em aberto" />
        </div>
      </section>

      <section aria-labelledby="h-pos" className="mb-5">
        <h2 id="h-pos" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Onde está o dinheiro</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Saldo em espécie" icon={Banknote} tone="success" value={formatBRL(s.cash_balance_cents)} hint="Gaveta + cofre" />
          <Stat label="Saldo bancário registrado" icon={Landmark} tone="primary" value={formatBRL(s.bank_balance_cents)} hint="Conta + Pix, conforme lançamentos" />
          <Stat label="Cartão a receber" icon={CreditCard} tone="warning" value={formatBRL(s.card_receivable_cents)} hint="Vendido, ainda não caiu no banco" />
          <Stat label="Contas a receber" icon={ReceiptText} value={formatBRL(s.receivables_open_cents)} hint={s.receivables_overdue_cents ? `${formatBRL(s.receivables_overdue_cents)} em atraso` : "Títulos de clientes"} />
        </div>
      </section>

      <section aria-labelledby="h-comp" className="mb-5">
        <h2 id="h-comp" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Compromissos e indicadores do período</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Contas a pagar (em aberto)" icon={Wallet} tone="primary" value={formatBRL(s.payables_open_cents)} hint={`${s.payables_open_count} boleto(s) · ${formatBRL(s.payables_due_7d_cents)} em 7 dias`} />
          <Stat label="Pagamentos atrasados" icon={CircleAlert} tone={s.payables_overdue_count ? "danger" : "success"} value={formatBRL(s.payables_overdue_cents)} hint={`${s.payables_overdue_count} boleto(s) vencido(s)`} />
          <Stat label="Total vendido no período" icon={TrendingUp} tone="primary" value={formatBRL(s.period_sales_cents)} hint={`Despesas ${formatBRL(s.period_expenses_cents)}`} />
          <Stat label="Diferenças de caixa" icon={ShieldAlert} tone={s.period_cash_diff_cents === 0 ? "success" : "warning"} value={formatBRL(s.period_cash_diff_cents, { signed: true })} hint={`${s.shifts_with_diff_period} turno(s) com diferença`} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Evolução" description="Faturamento × despesas"
            action={<div role="tablist" aria-label="Agrupar" className="flex rounded-lg border border-border p-0.5 text-xs">{BUCKETS.map(([k, l]) => <Link key={k} href={q({ agrupar: k })} role="tab" aria-selected={k === bucket} className={cn("rounded-md px-2.5 py-1 font-medium", k === bucket ? "bg-primary-soft text-primary" : "text-muted")}>{l}</Link>)}</div>} />
          <CardBody>{points.length ? <SalesChart data={points} /> : <Empty title="Sem dados no período" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Vendas por forma de pagamento" description="No período selecionado" />
          <CardBody className="space-y-3">
            {methods.length === 0 ? <p className="text-sm text-muted">Nenhuma venda no período.</p> : methods.map((m) => (
              <div key={m.method}>
                <div className="mb-1 flex justify-between text-sm"><span>{methodLabel[m.method]}</span><b className="tabular">{formatBRL(m.total_cents)}</b></div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (Number(m.total_cents) / maxMethod) * 100)}%` }} /></div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Caixas abertos agora" description={s.pending_shift_reviews || s.pending_movement_reviews ? `${s.pending_shift_reviews} turno(s) e ${s.pending_movement_reviews} lançamento(s) aguardando conferência` : undefined} />
          {s.open_shifts.length === 0 ? <Empty title="Nenhum turno aberto" /> : (
            <ul className="divide-y divide-border">
              {s.open_shifts.map((o) => (
                <li key={o.id}><Link href={`/caixa/turnos/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/60 sm:px-5">
                  <div><p className="text-sm font-medium">{o.employee}</p><p className="text-xs text-muted">{o.register} · desde {formatDateTimeBR(o.opened_at)}</p></div>
                  <span className="tabular text-sm font-semibold">{formatBRL(o.expected_cents)}</span></Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Próximos vencimentos" action={<Link href="/boletos/agenda" className="text-xs text-primary hover:underline">Agenda</Link>} />
          {bills.length === 0 ? <Empty title="Nenhum boleto em aberto" /> : (
            <ul className="divide-y divide-border">
              {bills.map((b) => (
                <li key={b.id}><Link href={`/boletos/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/60 sm:px-5">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{b.suppliers?.name}</p><p className="text-xs text-muted">{b.description} · {formatDateBR(b.due_date)}</p></div>
                  <div className="flex items-center gap-2">{b.due_date < today && <Badge tone="danger">vencido</Badge>}<span className="tabular text-sm font-semibold">{formatBRL(b.amount_cents - b.paid_cents)}</span></div></Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Movimentações recentes" icon={Bell} />
          {moves.length === 0 ? <Empty title="Sem movimentações" /> : (
            <ul className="divide-y divide-border">
              {moves.map((m) => (
                <li key={m.id}><Link href={`/caixa/turnos/${m.shift_id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2/60 sm:px-5">
                  <div className="min-w-0"><p className={cn("text-sm", m.status === "cancelled" && "line-through opacity-60")}>{kindLabel[m.kind]} · {methodLabel[m.payment_method]}</p><p className="truncate text-xs text-muted">{formatDateTimeBR(m.created_at)}{m.description ? ` · ${m.description}` : ""}</p></div>
                  <span className={cn("tabular text-sm font-semibold", m.direction === "in" ? "text-success" : "text-danger")}>{formatBRL(m.direction === "in" ? m.amount_cents : -m.amount_cents, { signed: true })}</span></Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <p className="mt-5 text-xs text-muted">Faturamento, dinheiro disponível, saldo bancário e cartão a receber são mostrados separados de propósito: venda no cartão não é dinheiro na conta até a liquidação. Valores dependem dos lançamentos feitos no sistema; confira sempre com o extrato bancário.</p>
    </>
  );
}
