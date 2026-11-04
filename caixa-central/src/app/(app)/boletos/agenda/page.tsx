import Link from "next/link";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { loadBills } from "@/lib/bills-queries";
import { Badge, Card, CardHeader, Empty, PageHeader, Stat } from "@/components/ui/primitives";
import { addDaysISO, formatDateBR, todayISO } from "@/lib/dates";
import { formatBRL, sumCents } from "@/lib/money";
import { cn } from "@/components/ui/cn";

export const metadata = { title: "Agenda financeira" };
const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const sp = await searchParams;
  const days = [7, 15, 30].includes(Number(sp.dias)) ? Number(sp.dias) : 7;
  const ctx = await requireAuth("boletos");
  const bills = await loadBills(ctx);
  const today = todayISO();
  const limit = addDaysISO(today, days);
  const open = bills.filter((b) => b.situation === "open" || b.situation === "partial" || b.situation === "overdue");
  const overdue = open.filter((b) => b.due_date < today);
  const upcoming = open.filter((b) => b.due_date >= today && b.due_date <= limit);
  const byDay = new Map<string, typeof upcoming>();
  upcoming.forEach((b) => byDay.set(b.due_date, [...(byDay.get(b.due_date) ?? []), b]));

  return (
    <>
      <div className="mb-3"><Link href="/boletos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft size={15} aria-hidden /> Boletos</Link></div>
      <PageHeader title="Agenda financeira" description="O que vence nos próximos dias, dia a dia."
        actions={<div role="tablist" aria-label="Período" className="flex rounded-xl border border-border bg-surface p-0.5">
          {[7, 15, 30].map((d) => <Link key={d} href={`/boletos/agenda?dias=${d}`} role="tab" aria-selected={days === d} className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium", days === d ? "bg-primary text-on-primary" : "text-muted hover:text-text")}>{d} dias</Link>)}
        </div>} />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label={`A pagar em ${days} dias`} icon={CalendarClock} tone="primary" value={formatBRL(sumCents(upcoming.map((b) => b.remaining_cents)))} hint={`${upcoming.length} boleto(s)`} />
        <Stat label="Já vencidos (em aberto)" tone={overdue.length ? "danger" : "success"} value={formatBRL(sumCents(overdue.map((b) => b.remaining_cents)))} hint={`${overdue.length} boleto(s)`} />
      </div>
      {overdue.length > 0 && (
        <Card className="mb-5 border-danger/40">
          <CardHeader title="Vencidos" description="Confira no banco e registre o pagamento ou negocie." />
          <BillList rows={overdue} today={today} />
        </Card>
      )}
      {byDay.size === 0 ? <Card><Empty icon={CalendarClock} title={`Nada vence nos próximos ${days} dias`} /></Card> : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([date, list]) => (
            <Card key={date}>
              <CardHeader title={<span className="capitalize">{WEEKDAY.format(new Date(`${date}T00:00:00Z`))}, {formatDateBR(date)}{date === today && " · hoje"}</span>}
                action={<span className="tabular text-sm font-semibold">{formatBRL(sumCents(list.map((b) => b.remaining_cents)))}</span>} />
              <BillList rows={list} today={today} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function BillList({ rows, today }: { rows: Awaited<ReturnType<typeof loadBills>>; today: string }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((b) => (
        <li key={b.id}>
          <Link href={`/boletos/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/60 sm:px-5">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{b.supplier}</p><p className="truncate text-xs text-muted">{b.description}{b.due_date < today ? ` · venceu em ${formatDateBR(b.due_date)}` : ""}</p></div>
            <div className="flex items-center gap-2"><span className="tabular text-sm font-semibold">{formatBRL(b.remaining_cents)}</span>{b.situation === "partial" && <Badge tone="warning">parcial</Badge>}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
