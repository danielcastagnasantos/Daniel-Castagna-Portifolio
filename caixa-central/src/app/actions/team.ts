"use server";

import { revalidatePath } from "next/cache";
import { action, callRpc, fail, ok } from "@/lib/action";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { activeSchema, inviteSchema, roleSchema, userIdSchema, uuid } from "@/lib/schemas";
import { generateTempPassword } from "@/lib/password";
import { z } from "zod";

const refresh = () => revalidatePath("/equipe");

/**
 * Cria um acesso. A PERMISSÃO é decidida pelo banco (invite_user): só então o servidor usa a chave
 * privilegiada para criar o login. O gatilho de auth.users cria o perfil a partir do convite.
 */
export const inviteUserAction = action({ area: "equipe", schema: inviteSchema }, async (i, ctx) => {
  const inv = await callRpc<string>(ctx, "invite_user", { p_email: i.email, p_full_name: i.full_name, p_role: i.role, p_must_change: true });
  if (inv.state) return inv.state;

  const admin = createAdminClient();
  if (i.mode === "email_invite") {
    const { error } = await admin.auth.admin.inviteUserByEmail(i.email, { redirectTo: `${serverEnv.appUrl.replace(/\/$/, "")}/auth/confirm?next=/definir-senha` });
    if (error) {
      await callRpc(ctx, "cancel_invitation", { p_invitation_id: inv.data });
      return fail(`Não foi possível enviar o convite: ${error.message}. Verifique o e-mail do Supabase (SMTP) ou use a senha provisória.`);
    }
    refresh();
    return ok(`Convite enviado para ${i.email}.`);
  }
  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.createUser({ email: i.email, password: tempPassword, email_confirm: true });
  if (error) {
    await callRpc(ctx, "cancel_invitation", { p_invitation_id: inv.data });
    return fail(/already|registered|exists/i.test(error.message) ? "Este e-mail já tem uma conta de acesso." : `Não foi possível criar o acesso: ${error.message}`);
  }
  refresh();
  return ok(`Acesso criado para ${i.full_name}.`, { data: { tempPassword, email: i.email, name: i.full_name } });
});

export const cancelInvitationAction = action({ area: "equipe", schema: userIdSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "cancel_invitation", { p_invitation_id: i.id });
  if (r.state) return r.state;
  refresh();
  return ok("Convite cancelado.");
});

export const setUserRoleAction = action({ area: "equipe", schema: roleSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "set_user_role", { p_user_id: i.id, p_role: i.role });
  if (r.state) return r.state;
  refresh();
  return ok("Perfil de acesso alterado.");
});

export const setUserActiveAction = action({ area: "equipe", schema: activeSchema }, async (i, ctx) => {
  const r = await callRpc(ctx, "set_user_active", { p_user_id: i.id, p_active: i.active });
  if (r.state) return r.state;
  // Além do bloqueio no banco (imediato), impede novos logins no Auth.
  const { error } = await createAdminClient().auth.admin.updateUserById(i.id, { ban_duration: i.active ? "none" : "876000h" });
  refresh();
  if (error) return ok(i.active ? "Usuário reativado." : "Usuário desativado no sistema. (Aviso: não consegui bloquear o login no Auth; o acesso a dados já está bloqueado.)");
  return ok(i.active ? "Usuário reativado." : "Usuário desativado. Ele não consegue mais entrar.");
});

export const resetPasswordAction = action({ area: "equipe", schema: userIdSchema }, async (i, ctx) => {
  const can = await callRpc(ctx, "assert_can_manage_user", { p_user_id: i.id });
  if (can.state) return can.state;
  const tempPassword = generateTempPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(i.id, { password: tempPassword });
  if (error) return fail("Não foi possível gerar a nova senha. Tente novamente.");
  await admin.from("profiles").update({ must_change_password: true }).eq("id", i.id);
  refresh();
  return ok("Senha provisória gerada. A pessoa deverá trocá-la no próximo acesso.", { data: { tempPassword } });
});

export const updateUserNameAction = action({ area: "equipe", schema: z.object({ id: uuid(), full_name: z.string().trim().min(2, "Nome muito curto").max(120) }) }, async (i, ctx) => {
  const r = await callRpc(ctx, "update_user_name", { p_user_id: i.id, p_full_name: i.full_name });
  if (r.state) return r.state;
  refresh();
  return ok("Nome atualizado.");
});
