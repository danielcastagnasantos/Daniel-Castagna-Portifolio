import Link from "next/link";
import { Banknote, CreditCard, Landmark, PiggyBank } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Badge, Card, CardHeader, Empty, PageHeader, Stat } from "@/components/ui/primitives";
import { AdjustmentButton, CancelTransferButton, NewAccountButton, TransferButton } from "@/components/finance/FinanceForms";
import { accountTypeLabel } from "@/lib/labels";
import { formatBRL, sumCents } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";

export const metadata = { title: "Contas e saldos" };

interface Bal { account_id: string; name: string; type: string; bank_name: string | null; active: boolean; balance_cents: number; entries_count: number }

export default async function AccountsPage() {
  const ctx = await requireAuth("contas");
  const [bal, tr] = await Promise.all([
    ctx.supabase.from("account_balances").select("account_id, name, type, bank_name, active, balance_cents, entries_count").order("type").order("name"),
    ctx.supabase.from("account_transfers").select("id, from_account_id, to_account_id, amount_cents, kind, fee_cents, note, occurred_on, status, cancel_reason").order("created_at", { ascending: false }).limit(15),
  ]);
  const accounts = (bal.data ?? []) as Bal[];
  const nameOf = Object.fromEntries(accounts.map((a) => [a.account_id, a.name]));
  const sum = (types: string[]) => sumCents(accounts.filter((a) => types.includes(a.type) && a.active).map((a) => a.balance_cents));
  const opts = accounts.filter((a) => a.active).map((a) => ({ id: a.account_id, name: a.name, type: a.type }));
  const transfers = (tr.data ?? []) as Array<{ id: string; from_account_id: string; to_account_id: string; amount_cents: number; kind: string; fee_cents: number; note: string | null; occurred_on: string; status: string; cancel_reason: string | null }>;

  return (
    <>
      <PageHeader title="Contas e saldos" description="Cada conta tem seu próprio saldo. Faturamento, dinheiro disponível e cartão a receber nunca se misturam."
        actions={<><NewAccountButton /><TransferButton accounts={opts} /><TransferButton accounts={opts} settlement /><AdjustmentButton accounts={opts} /></>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Dinheiro em espécie" icon={Banknote} tone="success" value={formatBRL(sum(["cash_drawer", "safe"]))} hint="Gaveta + cofre" />
        <Stat label="Saldo bancário registrado" icon={Landmark} tone="primary" value={formatBRL(sum(["bank", "pix"]))} hint="Conta bancária + Pix" />
        <Stat label="Cartão a receber" icon={CreditCard} tone="warning" value={formatBRL(sum(["card_receivable"]))} hint="Vendido, ainda não caiu no banco" />
      </div>
      <Card className="mb-5">
        <CardHeader icon={PiggyBank} title="Contas" description="O saldo é a soma do livro-razão (imutável). Abra uma conta para ver os lançamentos." />
        <ul className="divide-y divide-border">
          {accounts.map((a) => (
            <li key={a.account_id}>
              <Link href={`/contas/${a.account_id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-2/60 sm:px-5">
                <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-medium">{a.name}{!a.active && <Badge>Inativa</Badge>}</p><p className="text-xs text-muted">{accountTypeLabel[a.type]}{a.bank_name ? ` · ${a.bank_name}` : ""} · {a.entries_count} lançamento(s)</p></div>
                <span className={`tabular text-sm font-semibold ${a.balance_cents < 0 ? "text-danger" : ""}`}>{formatBRL(a.balance_cents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Últimas transferências e liquidações" />
        {transfers.length === 0 ? <Empty title="Nenhuma transferência ainda" /> : (
          <ul className="divide-y divide-border">
            {transfers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
                <div className="min-w-0">
                  <p className={t.status === "cancelled" ? "line-through opacity-60" : ""}>{nameOf[t.from_account_id]} → {nameOf[t.to_account_id]} {t.kind === "card_settlement" && <Badge tone="info">liquidação</Badge>} {t.status === "cancelled" && <Badge tone="danger">cancelada</Badge>}</p>
                  <p className="text-xs text-muted">{formatDateBR(t.occurred_on)}{t.note ? ` · ${t.note}` : ""}{t.fee_cents ? ` · taxa ${formatBRL(t.fee_cents)}` : ""}{t.cancel_reason ? ` · motivo: ${t.cancel_reason}` : ""}</p>
                </div>
                <div className="flex items-center gap-2"><span className="tabular font-semibold">{formatBRL(t.amount_cents)}</span>{t.status === "posted" && <CancelTransferButton id={t.id} />}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
