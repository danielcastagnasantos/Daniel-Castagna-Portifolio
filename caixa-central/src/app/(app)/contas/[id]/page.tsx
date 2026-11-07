import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Card, PageHeader, Stat } from "@/components/ui/primitives";
import { DataTable, type TableRow } from "@/components/ui/DataTable";
import { accountTypeLabel, natureLabel } from "@/lib/labels";
import { formatBRL } from "@/lib/money";

export const metadata = { title: "Conta" };

export default async function AccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireAuth("contas");
  const { data: acc } = await ctx.supabase.from("account_balances").select("account_id, name, type, bank_name, balance_cents, entries_count").eq("account_id", id).maybeSingle();
  if (!acc) notFound();
  const { data } = await ctx.supabase.from("ledger_entries")
    .select("id, occurred_at, occurred_on, amount_cents, nature, description, is_reversal, source_type, expense_categories(name)")
    .eq("account_id", id).order("id", { ascending: false }).limit(1000);
  const entries = (data ?? []) as unknown as Array<{ id: number; occurred_at: string; occurred_on: string; amount_cents: number; nature: string; description: string | null; is_reversal: boolean; source_type: string; expense_categories: { name: string } | null }>;
  const ids = entries.map((e) => e.id);
  const { data: recon } = ids.length ? await ctx.supabase.from("bank_statement_lines").select("matched_entry_id").eq("account_id", id).in("matched_entry_id", ids) : { data: [] };
  const reconciled = new Set((recon ?? []).map((r: { matched_entry_id: number }) => r.matched_entry_id));

  // Saldo após cada lançamento (do mais novo para o mais antigo), sem variável mutável.
  const balanceAfter = entries.map((_, i) => Number(acc.balance_cents) - entries.slice(0, i).reduce((a, e) => a + e.amount_cents, 0));
  const rows: TableRow[] = entries.map((e, i) => ({
    occurred_at: e.occurred_at, nature: e.nature, description: `${e.is_reversal ? "↩ " : ""}${e.description ?? ""}`.trim() || natureLabel[e.nature],
    category: e.expense_categories?.name ?? "", amount_cents: e.amount_cents, balance_cents: balanceAfter[i], recon: reconciled.has(e.id) ? "yes" : (acc.type === "bank" || acc.type === "pix") ? "no" : "",
  }));
  return (
    <>
      <div className="mb-3"><Link href="/contas" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft size={15} aria-hidden /> Contas</Link></div>
      <PageHeader title={acc.name} description={`${accountTypeLabel[acc.type]}${acc.bank_name ? ` · ${acc.bank_name}` : ""} — lançamentos do livro-razão (imutável; correções entram como estorno).`} />
      <div className="mb-5 grid grid-cols-2 gap-3"><Stat label="Saldo atual" value={formatBRL(acc.balance_cents)} tone={acc.balance_cents < 0 ? "danger" : "primary"} /><Stat label="Lançamentos" value={acc.entries_count} /></div>
      <Card>
        <DataTable rows={rows} searchKeys={["description", "category"]} pageSize={25} empty="Esta conta ainda não tem lançamentos."
          filters={[{ key: "nature", label: "Tipo", options: Object.entries(natureLabel) as [string, string][] }]}
          columns={[
            { key: "occurred_at", label: "Data", type: "datetime", sub: "category" },
            { key: "nature", label: "Tipo", type: "badge", labels: natureLabel },
            { key: "description", label: "Descrição" },
            { key: "amount_cents", label: "Valor", type: "money", signed: true },
            { key: "balance_cents", label: "Saldo após", type: "money", hideOnMobile: true },
            ...((acc.type === "bank" || acc.type === "pix") ? [{ key: "recon", label: "Conciliado", type: "badge" as const, labels: { yes: "Sim", no: "Não" }, tones: { yes: "success" as const, no: "neutral" as const } }] : []),
          ]} />
      </Card>
    </>
  );
}
