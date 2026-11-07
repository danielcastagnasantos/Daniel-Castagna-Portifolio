import Link from "next/link";
import { CalendarDays, CheckCircle2, CircleAlert, FileText, Timer } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { loadBillLookups, loadBills } from "@/lib/bills-queries";
import { Card, LinkButton, PageHeader, Stat } from "@/components/ui/primitives";
import { DataTable, type TableRow } from "@/components/ui/DataTable";
import { NewBillButton } from "@/components/bills/BillForms";
import { billTone } from "@/components/ui/tones";
import { billStatusLabel } from "@/lib/labels";
import { addDaysISO, startOfMonthISO, todayISO } from "@/lib/dates";
import { formatBRL, sumCents } from "@/lib/money";

export const metadata = { title: "Boletos" };

export default async function BillsPage() {
  const ctx = await requireAuth("boletos");
  const [bills, lookups] = await Promise.all([loadBills(ctx), loadBillLookups(ctx)]);
  const today = todayISO();
  const open = bills.filter((b) => b.situation === "open" || b.situation === "partial" || b.situation === "overdue");
  const overdue = bills.filter((b) => b.situation === "overdue");
  const in7 = open.filter((b) => b.due_date >= today && b.due_date <= addDaysISO(today, 7));
  const paidMonth = bills.filter((b) => b.status === "paid" && (b.paid_on ?? "") >= startOfMonthISO(today));

  const rows: TableRow[] = bills.filter((b) => b.status !== "cancelled" || true).map((b) => ({
    _href: `/boletos/${b.id}`, due_date: b.due_date, supplier: b.supplier, description: b.installments_total > 1 ? `${b.description} (${b.installment_no}/${b.installments_total})` : b.description,
    amount_cents: b.amount_cents, remaining_cents: b.remaining_cents, situation: b.situation, month: b.due_date.slice(0, 7), category: b.category ?? "",
  }));
  const months = [...new Set(rows.map((r) => String(r.month)))].sort().reverse().map((m) => [m, `${m.slice(5)}/${m.slice(0, 4)}`] as [string, string]);
  const suppliers = [...new Set(rows.map((r) => String(r.supplier)))].sort().map((s) => [s, s] as [string, string]);

  return (
    <>
      <PageHeader title="Boletos e contas a pagar" description="Cadastre, acompanhe vencimentos e registre pagamentos após conferir no banco."
        actions={<><LinkButton href="/boletos/agenda" variant="secondary"><CalendarDays size={16} aria-hidden /> Agenda</LinkButton>
          <LinkButton href="/boletos/fornecedores" variant="secondary">Fornecedores</LinkButton>
          <NewBillButton orgId={ctx.profile.organization_id} suppliers={lookups.suppliers.filter((s) => s.active)} categories={lookups.categories} /></>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Em aberto" icon={FileText} tone="primary" value={formatBRL(sumCents(open.map((b) => b.remaining_cents)))} hint={`${open.length} boleto(s)`} />
        <Stat label="Vencidos" icon={CircleAlert} tone={overdue.length ? "danger" : "success"} value={formatBRL(sumCents(overdue.map((b) => b.remaining_cents)))} hint={`${overdue.length} boleto(s) em atraso`} />
        <Stat label="Vencem em 7 dias" icon={Timer} tone="warning" value={formatBRL(sumCents(in7.map((b) => b.remaining_cents)))} hint={`${in7.length} boleto(s)`} />
        <Stat label="Pagos neste mês" icon={CheckCircle2} tone="success" value={formatBRL(sumCents(paidMonth.map((b) => b.amount_cents)))} hint={`${paidMonth.length} boleto(s)`} />
      </div>
      <Card>
        <DataTable rows={rows} searchKeys={["supplier", "description", "category"]} initialSort={{ key: "due_date", dir: "asc" }} rangeKey="amount_cents" rangeLabel="Valor"
          empty="Nenhum boleto cadastrado. Use “Novo boleto”."
          filters={[{ key: "situation", label: "Situação", options: Object.entries(billStatusLabel) as [string, string][] }, { key: "supplier", label: "Fornecedor", options: suppliers }, { key: "month", label: "Mês", options: months }]}
          columns={[
            { key: "due_date", label: "Vencimento", type: "date", sub: "supplier" },
            { key: "description", label: "Descrição" },
            { key: "amount_cents", label: "Valor", type: "money" },
            { key: "remaining_cents", label: "Em aberto", type: "money" },
            { key: "situation", label: "Situação", type: "badge", labels: billStatusLabel, tones: billTone },
          ]} />
      </Card>
      <p className="mt-3 text-xs text-muted">Mostrando boletos em aberto e os dos últimos 12 meses. Para períodos anteriores use o relatório “Boletos”. <Link href="/relatorios/bills" className="text-primary hover:underline">Abrir relatório</Link></p>
    </>
  );
}
