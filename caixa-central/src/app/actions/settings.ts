"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, callRpc, ok } from "@/lib/action";
import { accountActiveSchema, categorySchema, changeFundSchema, registerNameSchema, routeSchema, settingsSchema } from "@/lib/schemas";

const refresh = () => { revalidatePath("/configuracoes"); revalidatePath("/caixa", "layout"); };

export const updateSettingsAction = action({ area: "configuracoes", schema: settingsSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "update_org_settings", {
    p_name: i.name, p_blind_close: i.blind_close, p_review_threshold_cents: i.review_threshold, p_diff_alert_cents: i.diff_alert, p_shift_max_hours: i.shift_max_hours,
  });
  if (r.state) return r.state;
  refresh();
  return ok("Configurações salvas.");
});

export const createRegisterAction = action({ area: "configuracoes", schema: registerNameSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "create_register", { p_name: i.name });
  if (r.state) return r.state;
  refresh();
  return ok("Caixa criado.");
});

export const setRegisterActiveAction = action({ area: "configuracoes", schema: accountActiveSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "set_register_active", { p_register_id: i.id, p_active: i.active });
  if (r.state) return r.state;
  refresh();
  return ok(i.active ? "Caixa reativado." : "Caixa desativado.");
});

export const setRouteAction = action({ area: "configuracoes", schema: routeSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "set_payment_route", { p_method: i.method, p_account_id: i.account_id });
  if (r.state) return r.state;
  refresh();
  return ok("Conta da forma de pagamento atualizada.");
});

export const upsertCategoryAction = action({ area: "configuracoes", schema: categorySchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "upsert_category", { p_id: i.id, p_name: i.name, p_kind: i.kind, p_active: i.active });
  if (r.state) return r.state;
  refresh();
  return ok(i.id ? "Categoria atualizada." : "Categoria criada.");
});

export const setEmailNotificationsAction = action({ area: "configuracoes", schema: z.object({ enabled: z.enum(["true", "false"]).transform((v) => v === "true") }) }, async (i, ctx) => {
  const r = await callRpc(ctx, "set_email_notifications", { p_enabled: i.enabled });
  if (r.state) return r.state;
  refresh();
  return ok(i.enabled ? "Você receberá alertas por e-mail." : "Alertas por e-mail desativados.");
});

export const markNotificationsReadAction = action({ area: "notificacoes", schema: z.object({ id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null) }) }, async (i, ctx) => {
  const r = await callRpc(ctx, "mark_notifications_read", { p_ids: i.id ? [i.id] : null });
  if (r.state) return r.state;
  revalidatePath("/notificacoes");
  revalidatePath("/", "layout");
  return ok(i.id ? "Marcada como lida." : "Todas marcadas como lidas.");
});

export const setChangeFundAction = action({ area: "configuracoes", schema: changeFundSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "set_change_fund", { p_cents: i.amount });
  if (r.state) return r.state;
  refresh();
  revalidatePath("/painel");
  return ok("Valor do troco atualizado.");
});
