import Link from "next/link";
import { CalendarDays, CircleAlert, FileText, Timer } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { loadBillLookups, loadBills, type BillRow } from "@/lib/bills-queries";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui/primitives";
import { NewBillButton, PayBillButton } from "@/components/bills/BillForms";
import { billTone } from "@/components/ui/tones";
import { billStatusLabel } from "@/lib/labels";
import { addDaysISO, formatDateBR, todayISO } from "@/lib/dates";
import { formatBRL, sumCents } from "@/lib/money";
import { cn } from "@/components/ui/cn";

export const metadata = { title: "Boletos" };

const TABS: Array<[string, string]> = [["abertos", "A pagar"], ["pagos", "Pagos"], ["todos", "Todos"]];
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (m: string) => { const t = monthFmt.format(new Date(`${m}-01T00:00:00Z`)); return t.charAt(0).toUpperCase() + t.slice(1); };
const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.ver) ? (sp.ver as string) : "abertos";
  const ctx = await requireAuth("boletos");
  const [all, lookups] = await Promise.all([loadBills(ctx), loadBillLookups(ctx)]);
  const today = todayISO();
  const isOpen = (b: BillRow) => b.situation === "open" || b.situation === "partial" || b.situation === "overdue";
  const open = all.filter(isOpen);
  const overdue = open.filter((b) => b.situation === "overdue");
  const todayList = open.filter((b) => b.due_date === today);
  const in7 = open.filter((b) => b.due_date >= today && b.due_date <= addDaysISO(today, 7));

  const shown = all.filter((b) => (tab === "abertos" ? isOpen(b) : tab === "pagos" ? b.status === "paid" : b.status !== "cancelled"))
    .sort((a, b) => (tab === "pagos" ? (b.paid_on ?? "").localeCompare(a.paid_on ?? "") : a.due_date.localeCompare(b.due_date)));
  // agrupa por mês; dentro do mês, a lista já vem em ordem de data
  const groups = new Map<string, BillRow[]>();
  for (const b of shown) {
    const key = (tab === "pagos" ? b.paid_on ?? b.due_date : b.due_date).slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const defaultAcc = lookups.accounts.find((a) => a.type === "bank")?.id ?? lookups.accounts[0]?.id;
  const accountOpts = lookups.accounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <>
      <PageHeader title="Boletos" description="Organizados por data de vencimento. Marque como pago só depois de conferir no banco."
        actions={<><LinkButton href="/boletos/agenda" variant="secondary"><CalendarDays size={16} aria-hidden /> Próximos dias</LinkButton>
          <NewBillButton orgId={ctx.profile.organization_id} supplierNames={lookups.suppliers.map((s) => s.name)} categories={lookups.categories} /></>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="A pagar (total)" icon={FileText} tone="primary" value={formatBRL(sumCents(open.map((b) => b.remaining_cents)))} hint={`${open.length} boleto(s)`} />
        <Stat label="Vencidos" icon={CircleAlert} tone={overdue.length ? "danger" : "success"} value={formatBRL(sumCents(overdue.map((b) => b.remaining_cents)))} hint={`${overdue.length} em atraso`} />
        <Stat label="Vencem hoje" icon={Timer} tone={todayList.length ? "warning" : "neutral"} value={formatBRL(sumCents(todayList.map((b) => b.remaining_cents)))} hint={`${todayList.length} boleto(s)`} />
        <Stat label="Próximos 7 dias" icon={CalendarDays} tone="warning" value={formatBRL(sumCents(in7.map((b) => b.remaining_cents)))} hint={`${in7.length} boleto(s)`} />
      </div>

      <div role="tablist" aria-label="Mostrar" className="mb-4 inline-flex rounded-xl border border-border bg-surface p-0.5">
        {TABS.map(([k, l]) => <Link key={k} href={`/boletos?ver=${k}`} role="tab" aria-selected={k === tab} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium", k === tab ? "bg-primary text-on-primary" : "text-muted hover:text-text")}>{l}</Link>)}
      </div>

      {groups.size === 0 ? <Card><Empty icon={FileText} title={tab === "pagos" ? "Nenhum boleto pago ainda" : "Nenhum boleto por aqui"} description="Use “Novo boleto” para cadastrar." /></Card> : (
        <div className="space-y-5">
          {[...groups.entries()].map(([month, list]) => (
            <Card key={month}>
              <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold">{monthLabel(month)}</h2>
                <span className="tabular text-sm font-semibold">{formatBRL(sumCents(list.map((b) => (tab === "pagos" ? b.paid_cents : b.remaining_cents || b.amount_cents))))}</span>
              </div>
              <ul className="divide-y divide-border">
                {list.map((b) => {
                  const date = tab === "pagos" ? b.paid_on ?? b.due_date : b.due_date;
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                      <div className="w-16 shrink-0 text-center leading-tight">
                        <p className="tabular text-lg font-semibold">{date.slice(8, 10)}</p>
                        <p className="text-[11px] uppercase text-muted">{dayFmt.format(new Date(`${date}T00:00:00Z`)).replace(".", "")}</p>
                      </div>
                      <Link href={`/boletos/${b.id}`} className="min-w-0 flex-1 hover:underline">
                        <p className="truncate text-sm font-medium">{b.supplier}</p>
                        <p className="truncate text-xs text-muted">{b.description}{b.installments_total > 1 ? ` (${b.installment_no}/${b.installments_total})` : ""}</p>
                      </Link>
                      <Badge tone={billTone[b.situation]}>{billStatusLabel[b.situation]}</Badge>
                      <span className="tabular w-28 text-right text-sm font-semibold">{formatBRL(isOpen(b) ? b.remaining_cents : b.amount_cents)}</span>
                      {isOpen(b) && <PayBillButton compact billId={b.id} remainingCents={b.remaining_cents} accounts={accountOpts} defaultAccountId={defaultAcc} />}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Mostrando boletos em aberto e os dos últimos 12 meses. {formatDateBR(today)} é hoje.</p>
    </>
  );
}
