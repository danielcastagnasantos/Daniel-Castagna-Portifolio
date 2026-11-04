"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, callRpc, fail, ok } from "@/lib/action";
import { requireActionAuth } from "@/lib/auth";
import {
  accountActiveSchema, accountSchema, adjustmentSchema, cancelSchema, receivableSchema, receiveSchema, statementLineSchema,
  transferSchema, uuid,
} from "@/lib/schemas";
import { parseStatementFile } from "@/lib/statements/parse";
import { formatBRL } from "@/lib/money";

const refresh = () => { revalidatePath("/contas", "layout"); revalidatePath("/conciliacao"); revalidatePath("/painel"); revalidatePath("/receber"); };

export const createAccountAction = action({ area: "contas", schema: accountSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "create_account", { p_name: i.name, p_type: i.type, p_opening_cents: i.opening, p_bank_name: i.bank_name, p_opening_date: i.opening_date });
  if (r.state) return r.state;
  refresh();
  return ok("Conta criada.");
});

export const setAccountActiveAction = action({ area: "contas", schema: accountActiveSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "set_account_active", { p_account_id: i.id, p_active: i.active });
  if (r.state) return r.state;
  refresh();
  return ok(i.active ? "Conta reativada." : "Conta desativada.");
});

export const transferAction = action({ area: "contas", schema: transferSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "transfer_between_accounts", {
    p_from: i.from, p_to: i.to, p_amount_cents: i.amount, p_note: i.note, p_occurred_on: i.occurred_on, p_request_id: i.request_id,
    p_kind: i.kind, p_fee_cents: i.kind === "card_settlement" ? i.fee : 0,
  });
  if (r.state) return r.state;
  refresh();
  return ok(i.kind === "card_settlement" ? `Liquidação de ${formatBRL(i.amount)} registrada (não é nova receita).` : `Transferência de ${formatBRL(i.amount)} registrada (não é receita nem despesa).`);
});

export const cancelTransferAction = action({ area: "contas", schema: cancelSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "cancel_account_transfer", { p_transfer_id: i.id, p_reason: i.reason });
  if (r.state) return r.state;
  refresh();
  return ok("Transferência cancelada e estornada.");
});

export const adjustmentAction = action({ area: "contas", schema: adjustmentSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "post_account_adjustment", { p_account_id: i.account_id, p_amount_cents: i.amount, p_reason: i.reason, p_request_id: i.request_id });
  if (r.state) return r.state;
  refresh();
  return ok("Ajuste lançado. Ele fica no histórico com o motivo.");
});

export const createReceivableAction = action({ area: "receber", schema: receivableSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "create_receivable", { p_customer: i.customer, p_description: i.description, p_amount_cents: i.amount, p_due_date: i.due_date, p_request_id: i.request_id });
  if (r.state) return r.state;
  refresh();
  return ok("Conta a receber cadastrada.");
});

export const receiveReceivableAction = action({ area: "receber", schema: receiveSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "receive_receivable", { p_id: i.id, p_account_id: i.account_id, p_received_on: i.received_on, p_request_id: i.request_id });
  if (r.state) return r.state;
  refresh();
  return ok("Recebimento registrado.");
});

export const cancelReceivableAction = action({ area: "receber", schema: cancelSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "cancel_receivable", { p_id: i.id, p_reason: i.reason });
  if (r.state) return r.state;
  refresh();
  return ok("Conta a receber cancelada.");
});

/* ---------------- Extratos ---------------- */

/** 1ª etapa: lê o arquivo e aponta linhas que parecem duplicadas. Não grava nada. */
export const previewStatementAction = action({ area: "conciliacao", schema: z.object({ account_id: uuid("Conta") }) }, async (i, ctx, formData) => {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Escolha o arquivo do extrato (CSV ou OFX).", { fieldErrors: { file: "Arquivo obrigatório" } });
  let parsed;
  try {
    parsed = parseStatementFile(file.name, new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Não consegui ler o arquivo.");
  }
  const keys = parsed.lines.map((l) => l.key);
  const r = await callRpc<string[]>(ctx, "statement_existing_keys", { p_account_id: i.account_id, p_keys: keys });
  if (r.state) return r.state;
  const existing = new Set(r.data);
  return ok(`${parsed.lines.length} lançamento(s) lidos${existing.size ? `, ${existing.size} possível(is) duplicidade(s)` : ""}. Revise e confirme.`, {
    data: {
      accountId: i.account_id, filename: file.name, format: parsed.format, fileHash: parsed.fileHash,
      lines: parsed.lines.map((l) => ({ ...l, duplicate: existing.has(l.key) })), skipped: parsed.skipped,
    },
  });
});

const importSchema = z.object({ account_id: uuid("Conta"), filename: z.string().max(200), format: z.enum(["csv", "ofx"]), file_hash: z.string().length(64), payload: z.string().max(3_000_000) });

/** 2ª etapa: grava as linhas confirmadas (duplicadas só entram se a pessoa marcou "incluir"). */
export const importStatementAction = action({ area: "conciliacao", schema: importSchema }, async (i, ctx) => {
  let lines;
  try { lines = z.array(statementLineSchema).min(1).max(5000).parse(JSON.parse(i.payload)); } catch { return fail("Dados do extrato inválidos. Envie o arquivo novamente."); }
  const r = await callRpc<{ imported: number; duplicates: number }>(ctx, "import_bank_statement", {
    p_account_id: i.account_id, p_filename: i.filename, p_format: i.format, p_file_hash: i.file_hash, p_lines: JSON.stringify(lines),
  });
  if (r.state) return r.state;
  refresh();
  return ok(`Extrato importado: ${r.data.imported} linha(s) nova(s)${r.data.duplicates ? `, ${r.data.duplicates} ignorada(s) por duplicidade` : ""}.`, { redirectTo: `/conciliacao?conta=${i.account_id}` });
});

export async function reconciliationCandidates(lineId: string) {
  try {
    const ctx = await requireActionAuth("conciliacao");
    const id = z.string().uuid().parse(lineId);
    const { data, error } = await ctx.supabase.rpc("reconciliation_candidates", { p_line_id: id });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, rows: (data ?? []) as Array<{ entry_id: number; occurred_on: string; amount_cents: number; description: string | null; nature: string; day_distance: number }> };
  } catch {
    return { ok: false as const, error: "Não foi possível buscar sugestões agora." };
  }
}

export const reconcileAction = action({ area: "conciliacao", schema: z.object({ line_id: uuid(), entry_id: z.coerce.number().int().positive("Escolha um lançamento") }) }, async (i, ctx) => {
  const r = await callRpc(ctx, "reconcile_statement_line", { p_line_id: i.line_id, p_entry_id: i.entry_id });
  if (r.state) return r.state;
  refresh();
  return ok("Linha conciliada com o lançamento.");
});
export const unreconcileAction = action({ area: "conciliacao", schema: z.object({ id: uuid(), reason: z.string().trim().min(4, "Informe o motivo").max(250) }) }, async (i, ctx) => {
  const r = await callRpc(ctx, "unreconcile_statement_line", { p_line_id: i.id, p_reason: i.reason });
  if (r.state) return r.state;
  refresh();
  return ok("Conciliação desfeita.");
});
export const ignoreLineAction = action({ area: "conciliacao", schema: z.object({ id: uuid(), reason: z.string().trim().min(4, "Informe o motivo").max(250) }) }, async (i, ctx) => {
  const r = await callRpc(ctx, "ignore_statement_line", { p_line_id: i.id, p_reason: i.reason });
  if (r.state) return r.state;
  refresh();
  return ok("Linha ignorada.");
});
export const entryFromLineAction = action({ area: "conciliacao", schema: z.object({
  line_id: uuid(), nature: z.enum(["expense", "fee", "other_income", "adjustment"]), category_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  description: z.string().trim().max(250).optional().transform((v) => v || null),
}) }, async (i, ctx) => {
  const r = await callRpc(ctx, "create_entry_from_statement_line", { p_line_id: i.line_id, p_nature: i.nature, p_category_id: i.category_id, p_description: i.description });
  if (r.state) return r.state;
  refresh();
  return ok("Lançamento criado a partir do extrato.");
});
