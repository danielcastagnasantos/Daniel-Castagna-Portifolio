import "server-only";
import type { AuthContext } from "@/lib/auth";
import { addDaysISO, todayISO } from "@/lib/dates";

export interface BillRow {
  id: string; supplier_id: string; supplier: string; description: string; category_id: string | null; category: string | null;
  amount_cents: number; paid_cents: number; remaining_cents: number; due_date: string; paid_on: string | null; status: string;
  situation: "open" | "partial" | "paid" | "cancelled" | "overdue"; barcode: string | null; notes: string | null;
  installment_no: number; installments_total: number; series_kind: string;
}

export function situationOf(status: string, due: string, today = todayISO()): BillRow["situation"] {
  if (status === "open" || status === "partial") return due < today ? "overdue" : (status as "open" | "partial");
  return status as BillRow["situation"];
}

type Raw = Omit<BillRow, "supplier" | "category" | "remaining_cents" | "situation"> & {
  suppliers: { name: string } | null; expense_categories: { name: string } | null;
};
const COLS = "id, supplier_id, description, category_id, amount_cents, paid_cents, due_date, paid_on, status, barcode, notes, installment_no, installments_total, series_kind, suppliers(name), expense_categories(name)";

function shape(r: Raw): BillRow {
  return {
    ...r, supplier: r.suppliers?.name ?? "—", category: r.expense_categories?.name ?? null,
    remaining_cents: r.status === "cancelled" ? 0 : r.amount_cents - r.paid_cents, situation: situationOf(r.status, r.due_date),
  };
}

/** Boletos em aberto + os dos últimos 12 meses (limite de segurança de 2.000 linhas). */
export async function loadBills(ctx: AuthContext): Promise<BillRow[]> {
  const since = addDaysISO(todayISO(), -365);
  const { data } = await ctx.supabase.from("bills").select(COLS)
    .or(`status.in.(open,partial),due_date.gte.${since}`).order("due_date", { ascending: true }).limit(2000);
  return ((data ?? []) as unknown as Raw[]).map(shape);
}

export async function loadBill(ctx: AuthContext, id: string): Promise<BillRow | null> {
  const { data } = await ctx.supabase.from("bills").select(COLS).eq("id", id).maybeSingle();
  return data ? shape(data as unknown as Raw) : null;
}

export async function loadBillLookups(ctx: AuthContext) {
  const [sup, cat, acc] = await Promise.all([
    ctx.supabase.from("suppliers").select("id, name, document, phone, email, notes, active").order("name"),
    ctx.supabase.from("expense_categories").select("id, name").eq("kind", "expense").eq("active", true).order("name"),
    ctx.supabase.from("accounts").select("id, name, type").eq("active", true).neq("type", "card_receivable").order("name"),
  ]);
  return {
    suppliers: (sup.data ?? []) as Array<{ id: string; name: string; document: string | null; phone: string | null; email: string | null; notes: string | null; active: boolean }>,
    categories: (cat.data ?? []) as Array<{ id: string; name: string }>,
    accounts: (acc.data ?? []) as Array<{ id: string; name: string; type: string }>,
  };
}
