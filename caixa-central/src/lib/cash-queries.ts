import "server-only";
import type { AuthContext } from "@/lib/auth";
import type { MovementRow } from "@/components/cash/MovementList";

export interface ShiftSummary {
  shift_id: string; status: "open" | "closed"; opening_cents: number; blind: boolean;
  expected_cents: number | null; counted_cents: number | null; difference_cents: number | null;
  sales_by_method: Record<string, number>;
  totals: { sales: number; other_in: number; supply: number; withdrawal: number; expense: number; refund: number; cash_in: number; cash_out: number; count: number };
}

export async function loadSummary(ctx: AuthContext, shiftId: string) {
  const { data } = await ctx.supabase.rpc("shift_summary", { p_shift_id: shiftId });
  return (data as ShiftSummary | null) ?? null;
}

export async function loadMovements(ctx: AuthContext, shiftId: string): Promise<MovementRow[]> {
  const { data } = await ctx.supabase
    .from("cash_movements")
    .select("id, kind, direction, payment_method, amount_cents, description, status, review_status, created_at, created_by, cancel_reason, expense_categories(name)")
    .eq("shift_id", shiftId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((m) => ({
    ...(m as unknown as MovementRow),
    category: (m as unknown as { expense_categories: { name: string } | null }).expense_categories?.name ?? null,
  }));
}

export async function loadFormLookups(ctx: AuthContext, admin: boolean) {
  const [cats, counters, closed] = await Promise.all([
    ctx.supabase.from("expense_categories").select("id, name").eq("kind", "expense").eq("active", true).order("name"),
    ctx.supabase.rpc("cash_counter_accounts"),
    admin
      ? ctx.supabase.from("cash_shifts").select("id, opened_at, profiles!cash_shifts_employee_id_fkey(full_name)").eq("status", "closed").order("closed_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  return {
    categories: (cats.data ?? []) as Array<{ id: string; name: string }>,
    counterAccounts: ((counters.data ?? []) as Array<{ id: string; name: string }>),
    closedShifts: ((closed.data ?? []) as unknown as Array<{ id: string; opened_at: string; profiles: { full_name: string } | null }>),
  };
}

export async function loadNames(ctx: AuthContext): Promise<Record<string, string>> {
  const { data } = await ctx.supabase.from("profiles").select("id, full_name");
  return Object.fromEntries((data ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
}
