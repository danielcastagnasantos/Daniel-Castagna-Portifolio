import { requireAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { Card, PageHeader } from "@/components/ui/primitives";
import { DataTable, type TableRow } from "@/components/ui/DataTable";
import { reviewTone, shiftTone } from "@/components/ui/tones";
import { reviewLabel } from "@/lib/labels";

export const metadata = { title: "Turnos" };

export default async function ShiftsPage() {
  const ctx = await requireAuth("caixa");
  const admin = isAdmin(ctx.profile.role);
  const { data } = await ctx.supabase
    .from("cash_shifts")
    .select("id, opened_at, closed_at, status, opening_cents, counted_cents, expected_cents, difference_cents, review_status, employee_id, profiles!cash_shifts_employee_id_fkey(full_name)")
    .order("opened_at", { ascending: false })
    .limit(500);
  const rows: TableRow[] = (data ?? []).map((s) => {
    const x = s as unknown as { id: string; opened_at: string; closed_at: string | null; status: string; opening_cents: number; counted_cents: number | null; expected_cents: number | null; difference_cents: number | null; review_status: string; profiles: { full_name: string } | null };
    return {
      _href: `/caixa/turnos/${x.id}`, opened_at: x.opened_at, employee: x.profiles?.full_name ?? "—", status: x.status,
      opening_cents: x.opening_cents, counted_cents: x.counted_cents, expected_cents: x.expected_cents, difference_cents: x.difference_cents,
      review_status: x.status === "closed" ? x.review_status : null,
    };
  });
  const employees = [...new Set(rows.map((r) => String(r.employee)))].sort().map((n) => [n, n] as [string, string]);
  return (
    <>
      <PageHeader title={admin ? "Turnos de caixa" : "Meus turnos"} description="Histórico de aberturas, fechamentos e diferenças. Turnos fechados não podem ser alterados." />
      <Card>
        <DataTable
          rows={rows} searchKeys={["employee"]} initialSort={{ key: "opened_at", dir: "desc" }} empty="Nenhum turno registrado ainda."
          filters={[{ key: "status", label: "Situação", options: [["open", "Aberto"], ["closed", "Fechado"]] },
            ...(admin ? [{ key: "employee", label: "Funcionário", options: employees }, { key: "review_status", label: "Conferência", options: Object.entries(reviewLabel).filter(([k]) => ["pending", "approved", "flagged"].includes(k)) as [string, string][] }] : [])]}
          columns={[
            { key: "opened_at", label: "Abertura", type: "datetime", sub: "employee" },
            { key: "status", label: "Situação", type: "badge", labels: { open: "Aberto", closed: "Fechado" }, tones: shiftTone },
            { key: "opening_cents", label: "Abertura (R$)", type: "money", hideOnMobile: true },
            { key: "expected_cents", label: "Esperado", type: "money" },
            { key: "counted_cents", label: "Contado", type: "money" },
            { key: "difference_cents", label: "Diferença", type: "money", signed: true },
            ...(admin ? [{ key: "review_status", label: "Conferência", type: "badge" as const, labels: reviewLabel, tones: reviewTone }] : []),
          ]}
        />
      </Card>
    </>
  );
}
