import { HandCoins } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Badge, Card, CardHeader, Empty, PageHeader, Stat } from "@/components/ui/primitives";
import { CancelReceivableButton, NewReceivableButton, ReceiveButton } from "@/components/finance/FinanceForms";
import { formatBRL, sumCents } from "@/lib/money";
import { formatDateBR, todayISO } from "@/lib/dates";

export const metadata = { title: "A receber" };

interface Rec { id: string; customer: string; description: string | null; amount_cents: number; due_date: string; status: string; received_on: string | null }

export default async function ReceivablesPage() {
  const ctx = await requireAuth("receber");
  const [rec, acc, card] = await Promise.all([
    ctx.supabase.from("receivables").select("id, customer, description, amount_cents, due_date, status, received_on").order("due_date").limit(500),
    ctx.supabase.from("accounts").select("id, name, type").eq("active", true),
    ctx.supabase.from("account_balances").select("balance_cents").eq("type", "card_receivable"),
  ]);
  const rows = (rec.data ?? []) as Rec[];
  const today = todayISO();
  const open = rows.filter((r) => r.status === "open");
  const overdue = open.filter((r) => r.due_date < today);
  const cardTotal = sumCents((card.data ?? []).map((c: { balance_cents: number }) => c.balance_cents));
  return (
    <>
      <PageHeader title="Contas a receber" description="Valores que clientes ainda vão pagar. O cartão a receber aparece separado, em Contas e saldos." actions={<NewReceivableButton />} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="A receber de clientes" icon={HandCoins} tone="primary" value={formatBRL(sumCents(open.map((r) => r.amount_cents)))} hint={`${open.length} título(s)`} />
        <Stat label="Em atraso" tone={overdue.length ? "danger" : "success"} value={formatBRL(sumCents(overdue.map((r) => r.amount_cents)))} hint={`${overdue.length} título(s)`} />
        <Stat label="Cartão a receber" tone="warning" value={formatBRL(cardTotal)} hint="Vendas no cartão ainda não liquidadas" />
      </div>
      <Card>
        <CardHeader title="Títulos" />
        {rows.length === 0 ? <Empty title="Nenhuma conta a receber" /> : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium">{r.customer} {r.status === "received" && <Badge tone="success">recebido {formatDateBR(r.received_on)}</Badge>}{r.status === "cancelled" && <Badge>cancelado</Badge>}{r.status === "open" && r.due_date < today && <Badge tone="danger">vencido</Badge>}</p>
                  <p className="text-xs text-muted">Vence {formatDateBR(r.due_date)}{r.description ? ` · ${r.description}` : ""}</p>
                </div>
                <div className="flex items-center gap-2"><span className="tabular font-semibold">{formatBRL(r.amount_cents)}</span>
                  {r.status === "open" && <><ReceiveButton id={r.id} accounts={(acc.data ?? []) as Array<{ id: string; name: string; type: string }>} /><CancelReceivableButton id={r.id} /></>}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
