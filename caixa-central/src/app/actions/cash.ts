"use server";

import { revalidatePath } from "next/cache";
import { action, callRpc, ok } from "@/lib/action";
import {
  cancelSchema, closeShiftSchema, closeSimpleSchema, movementSchema, openShiftSchema, reviewMovementSchema, reviewShiftSchema,
} from "@/lib/schemas";
import { formatBRL } from "@/lib/money";
import { kindLabel } from "@/lib/labels";

export const openShiftAction = action({ schema: openShiftSchema }, async (i, ctx) => {
  const r = await callRpc<string>(ctx, "open_cash_shift", {
    p_register_id: i.register_id, p_opening_cents: i.opening, p_note: i.note, p_request_id: i.request_id,
  });
  if (r.state) return r.state;
  revalidatePath("/caixa");
  return ok("Turno aberto. Bom trabalho!", { data: { shiftId: r.data } });
});

export const movementAction = action({ schema: movementSchema }, async (i, ctx) => {
  const r = await callRpc<string>(ctx, "create_cash_movement", {
    p_shift_id: i.shift_id, p_kind: i.kind, p_method: i.kind === "sale" || i.kind === "other_in" || i.kind === "refund" ? i.method : "dinheiro",
    p_amount_cents: i.amount, p_description: i.description, p_category_id: i.category_id,
    p_counter_account_id: i.counter_account_id, p_request_id: i.request_id, p_corrects_shift_id: i.corrects_shift_id,
  });
  if (r.state) return r.state;
  revalidatePath("/caixa", "layout");
  return ok(`${kindLabel[i.kind]} de ${formatBRL(i.amount)} registrada.`);
});

export const closeShiftAction = action({ schema: closeShiftSchema }, async (i, ctx) => {
  const r = await callRpc<{ expected_cents: number; counted_cents: number; difference_cents: number }>(ctx, "close_cash_shift", {
    p_shift_id: i.shift_id, p_counted_cents: i.counted, p_justification: i.justification, p_request_id: i.request_id,
  });
  if (r.state) return r.state;
  revalidatePath("/caixa", "layout");
  const d = r.data.difference_cents;
  return ok(d === 0 ? "Turno fechado. O caixa bateu certinho!" : `Turno fechado com diferença de ${formatBRL(d, { signed: true })}.`, {
    redirectTo: `/caixa/turnos/${i.shift_id}`,
  });
});

export const cancelMovementAction = action({ area: "painel", schema: cancelSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "cancel_cash_movement", { p_movement_id: i.id, p_reason: i.reason });
  if (r.state) return r.state;
  revalidatePath("/caixa", "layout");
  return ok("Movimentação cancelada. O estorno ficou registrado.");
});

export const reviewMovementAction = action({ area: "painel", schema: reviewMovementSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "review_cash_movement", { p_movement_id: i.id, p_approve: i.decision === "approve", p_note: i.note });
  if (r.state) return r.state;
  revalidatePath("/caixa", "layout");
  return ok(i.decision === "approve" ? "Movimentação aprovada." : "Movimentação recusada e sinalizada.");
});

export const reviewShiftAction = action({ area: "painel", schema: reviewShiftSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "review_cash_shift", { p_shift_id: i.id, p_status: i.status, p_note: i.note });
  if (r.state) return r.state;
  revalidatePath("/caixa", "layout");
  return ok(i.status === "approved" ? "Turno conferido." : "Turno marcado com problema.");
});

/** Fechamento simples: lança vendas, despesa e retirada e fecha o turno numa única transação. */
export const closeSimpleAction = action({ schema: closeSimpleSchema }, async (i, ctx) => {
  const r = await callRpc<{ difference_cents: number; withdrawn_cents: number; change_fund_cents: number }>(ctx, "close_shift_simple", {
    p_shift_id: i.shift_id, p_cash_sales: i.cash_sales, p_pix: i.pix, p_debit: i.debit, p_credit: i.credit, p_transfer: i.transfer,
    p_expense_cents: i.expense, p_expense_note: i.expense_note, p_counted_cents: i.counted, p_justification: i.justification,
    p_request_id: i.request_id,
  });
  if (r.state) return r.state;
  revalidatePath("/caixa", "layout");
  revalidatePath("/painel");
  const d = r.data.difference_cents;
  const keep = formatBRL(r.data.change_fund_cents);
  const msg = d === 0
    ? `Turno fechado. Caixa bateu! Retire ${formatBRL(r.data.withdrawn_cents)} e deixe ${keep} de troco na gaveta.`
    : `Turno fechado com diferença de ${formatBRL(d, { signed: true })}. Retire ${formatBRL(r.data.withdrawn_cents)} e deixe ${keep} de troco.`;
  return ok(msg, { redirectTo: `/caixa/turnos/${i.shift_id}` });
});
