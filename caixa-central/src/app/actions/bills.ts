"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, callRpc, fail, ok, type ActionState } from "@/lib/action";
import { requireActionAuth, type AuthContext } from "@/lib/auth";
import {
  billSchema, billUpdateSchema, cancelSchema, payBillSchema, registerFileSchema,
} from "@/lib/schemas";
import { formatBRL } from "@/lib/money";

/** Acha o "quem cobra" pelo nome (sem diferenciar maiúsculas) ou cadastra na hora. */
async function resolveSupplier(ctx: AuthContext, name: string): Promise<{ id: string } | { state: NonNullable<ActionState> }> {
  const clean = name.trim();
  const escaped = clean.replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data } = await ctx.supabase.from("suppliers").select("id, active").ilike("name", escaped).limit(1);
  const found = (data ?? [])[0] as { id: string; active: boolean } | undefined;
  const r = await callRpc<string>(ctx, "upsert_supplier", {
    p_id: found?.id ?? null, p_name: clean, p_document: null, p_phone: null, p_email: null, p_notes: null, p_active: true,
  });
  if (r.state) return { state: r.state };
  return { id: r.data };
}

export const createBillsAction = action({ area: "boletos", schema: billSchema }, async (i, ctx) => {
  const sup = await resolveSupplier(ctx, i.supplier_name);
  if ("state" in sup) return sup.state;
  const r = await callRpc<string[]>(ctx, "create_bills", {
    p_supplier_id: sup.id, p_description: i.description, p_category_id: i.category_id, p_amount_cents: i.amount,
    p_first_due: i.first_due, p_mode: i.mode, p_count: i.mode === "single" ? 1 : i.count, p_interval: i.interval,
    p_barcode: i.barcode, p_notes: i.notes, p_request_id: i.request_id,
  });
  if (r.state) return r.state;
  revalidatePath("/boletos", "layout");
  const n = r.data.length;
  return ok(n === 1 ? "Boleto cadastrado." : `${n} boletos cadastrados.`, { data: { ids: r.data } });
});

export const updateBillAction = action({ area: "boletos", schema: billUpdateSchema }, async (i, ctx) => {
  const sup = await resolveSupplier(ctx, i.supplier_name);
  if ("state" in sup) return sup.state;
  const r = await callRpc(ctx, "update_bill", {
    p_bill_id: i.id, p_supplier_id: sup.id, p_description: i.description, p_category_id: i.category_id,
    p_amount_cents: i.amount, p_due_date: i.due_date, p_barcode: i.barcode, p_notes: i.notes,
  });
  if (r.state) return r.state;
  revalidatePath("/boletos", "layout");
  return ok("Boleto atualizado. A alteração ficou registrada no histórico.");
});

export const cancelBillAction = action({ area: "boletos", schema: cancelSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "cancel_bill", { p_bill_id: i.id, p_reason: i.reason });
  if (r.state) return r.state;
  revalidatePath("/boletos", "layout");
  return ok("Boleto cancelado.", { redirectTo: "/boletos" });
});

export const payBillAction = action({ area: "boletos", schema: payBillSchema }, async (i, ctx) => {
  if (!i.confirmed) return fail("Marque a confirmação de que o pagamento foi realizado e conferido no banco.", { fieldErrors: { confirmed: "Confirmação obrigatória" } });
  const r = await callRpc<string>(ctx, "pay_bill", {
    p_bill_id: i.bill_id, p_amount_cents: i.amount, p_paid_on: i.paid_on, p_account_id: i.account_id, p_method: i.method,
    p_note: i.note, p_confirmed: true, p_request_id: i.request_id,
  });
  if (r.state) return r.state;
  revalidatePath("/boletos", "layout");
  revalidatePath("/contas", "layout");
  revalidatePath("/painel");
  return ok(`Pagamento de ${formatBRL(i.amount)} registrado.`, { data: { paymentId: r.data } });
});

export const cancelPaymentAction = action({ area: "boletos", schema: cancelSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "cancel_bill_payment", { p_payment_id: i.id, p_reason: i.reason });
  if (r.state) return r.state;
  revalidatePath("/boletos", "layout");
  revalidatePath("/contas", "layout");
  return ok("Pagamento cancelado e estornado no razão.");
});

/** Chamada depois que o navegador enviou o arquivo ao Storage: o banco confere se o objeto existe. */
export const registerFileAction = action({ area: "boletos", schema: registerFileSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "register_bill_file", {
    p_bill_id: i.bill_id, p_payment_id: i.payment_id, p_kind: i.kind, p_path: i.path, p_filename: i.filename,
  });
  if (r.state) return r.state;
  revalidatePath(`/boletos/${i.bill_id}`);
  return ok(i.kind === "boleto" ? "Boleto anexado." : "Comprovante anexado.");
});

/** Link temporário (120 s) para abrir um anexo privado. A leitura é protegida por RLS do Storage. */
export async function signedFileUrl(fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const id = z.string().uuid().parse(fileId);
    const ctx = await requireActionAuth("boletos");
    const { data: f } = await ctx.supabase.from("bill_files").select("path, kind").eq("id", id).maybeSingle();
    if (!f) return { ok: false, error: "Anexo não encontrado." };
    const bucket = f.kind === "boleto" ? "boletos" : "comprovantes";
    const { data, error } = await ctx.supabase.storage.from(bucket).createSignedUrl(f.path, 120);
    if (error || !data?.signedUrl) return { ok: false, error: "Não foi possível gerar o link do arquivo." };
    return { ok: true, url: data.signedUrl };
  } catch {
    return { ok: false, error: "Não foi possível abrir o arquivo agora. Verifique a conexão." };
  }
}

export type { ActionState };
