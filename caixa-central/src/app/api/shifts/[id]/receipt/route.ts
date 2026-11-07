import { NextResponse } from "next/server";
import { getOrganization, getSession } from "@/lib/auth";
import { loadSummary } from "@/lib/cash-queries";
import { Pdf } from "@/lib/export/pdf";
import { formatBRL } from "@/lib/money";
import { formatDateTimeBR } from "@/lib/dates";
import { kindLabel, methodLabel, reviewLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

/** Comprovante e relatório de fechamento do turno (PDF). O acesso segue o RLS: operador só baixa o próprio. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Não encontrado", { status: 404 });
  const s = await getSession();
  if (!s?.profile) return new NextResponse("Não autorizado", { status: 401 });
  const ctx = { supabase: s.supabase, profile: s.profile };
  const { data: shift } = await ctx.supabase.from("cash_shifts").select("*").eq("id", id).maybeSingle();
  if (!shift) return new NextResponse("Não encontrado", { status: 404 });
  if (shift.status !== "closed") return new NextResponse("O turno ainda está aberto", { status: 409 });

  const [org, summary, reg, emp, closer, movs] = await Promise.all([
    getOrganization(), loadSummary(ctx, id),
    ctx.supabase.from("registers").select("name").eq("id", shift.register_id).maybeSingle(),
    ctx.supabase.from("profiles").select("full_name").eq("id", shift.employee_id).maybeSingle(),
    ctx.supabase.from("profiles").select("full_name").eq("id", shift.closed_by).maybeSingle(),
    ctx.supabase.from("cash_movements").select("kind, direction, payment_method, amount_cents, description, status, created_at").eq("shift_id", id).order("created_at"),
  ]);

  const pdf = await Pdf.create({ footer: `${org?.name ?? ""} — Comprovante de fechamento — emitido em ${formatDateTimeBR(new Date())}` });
  pdf.title("Comprovante de fechamento de caixa", `${org?.name ?? ""}  •  ${reg.data?.name ?? ""}`);
  const L = pdf.left, W = 240, R = L + 280;
  pdf.heading("Turno");
  pdf.kv("Responsável", emp.data?.full_name ?? "—", L, W); pdf.kv("Fechado por", closer.data?.full_name ?? "—", R, W); pdf.y -= 14;
  pdf.kv("Abertura", formatDateTimeBR(shift.opened_at), L, W); pdf.kv("Fechamento", formatDateTimeBR(shift.closed_at), R, W); pdf.y -= 14;
  pdf.kv("Conferência da gerência", reviewLabel[shift.review_status] ?? "—", L, W); pdf.y -= 8;

  pdf.heading("Conferência do dinheiro");
  pdf.kv("Saldo de abertura", formatBRL(shift.opening_cents), L, W); pdf.kv("Dinheiro esperado", formatBRL(shift.expected_cents), R, W); pdf.y -= 14;
  pdf.kv("Dinheiro contado", formatBRL(shift.counted_cents), L, W);
  pdf.kv("Diferença", formatBRL(shift.difference_cents, { signed: true }), R, W); pdf.y -= 14;
  if (shift.close_justification) { pdf.text(`Justificativa: ${shift.close_justification}`, L, 9, { maxW: pdf.contentWidth }); pdf.y -= 12; }
  if (shift.handoff_difference_cents) { pdf.text(`Passagem de turno: diferença de ${formatBRL(shift.handoff_difference_cents, { signed: true })} na abertura. ${shift.handoff_note ?? ""}`, L, 9, { maxW: pdf.contentWidth }); pdf.y -= 12; }

  pdf.heading("Resumo por forma de pagamento");
  const rows = Object.entries(summary?.sales_by_method ?? {}).map(([m, v]) => [`Vendas — ${methodLabel[m] ?? m}`, formatBRL(v)]);
  rows.push(["Suprimentos", formatBRL(summary?.totals.supply)], ["Sangrias", formatBRL(summary?.totals.withdrawal)],
    ["Despesas e boletos em dinheiro", formatBRL(summary?.totals.expense)], ["Estornos", formatBRL(summary?.totals.refund)]);
  pdf.table([{ label: "Item", weight: 3 }, { label: "Valor", align: "right", weight: 1.2 }], rows);

  pdf.heading("Movimentações");
  const list = (movs.data ?? []).map((m) => [
    formatDateTimeBR(m.created_at), `${kindLabel[m.kind] ?? m.kind}${m.status === "cancelled" ? " (cancelada)" : ""}`, methodLabel[m.payment_method] ?? m.payment_method,
    m.description ?? "", formatBRL(m.direction === "in" ? m.amount_cents : -m.amount_cents),
  ]);
  if (list.length) pdf.table([{ label: "Data/hora", weight: 1.4 }, { label: "Tipo", weight: 1.6 }, { label: "Forma", weight: 1.3 }, { label: "Descrição", weight: 2.4 }, { label: "Valor", align: "right", weight: 1.2 }], list);
  else pdf.text("Sem movimentações.", L, 9);

  pdf.ensure(80); pdf.y -= 40;
  pdf.text("______________________________", L, 9); pdf.text("______________________________", R, 9); pdf.y -= 12;
  pdf.text("Responsável pelo caixa", L, 8, { color: undefined }); pdf.text("Conferência (gerência)", R, 8);

  const bytes = await pdf.finish();
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="fechamento-${id.slice(0, 8)}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
