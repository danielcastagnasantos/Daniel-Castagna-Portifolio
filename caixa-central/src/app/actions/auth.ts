"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { action, callRpc, fail, ok, publicAction } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { loginSchema, newPasswordSchema, setupSchema } from "@/lib/schemas";

const GENERIC_LOGIN_ERROR = "E-mail ou senha incorretos.";

export const loginAction = publicAction(loginSchema, async ({ email, password }) => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error && /fetch failed|network|timeout/i.test(error.message)) return fail("Sem conexão com o servidor. Tente novamente.");
    return fail(GENERIC_LOGIN_ERROR); // mesma mensagem para e-mail inexistente ou senha errada
  }
  const { data: profile } = await supabase.from("profiles").select("active, must_change_password").eq("id", data.user.id).maybeSingle();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return fail("Seu acesso não está ativo. Fale com o administrador.");
  }
  return ok("Bem-vindo!", { redirectTo: profile.must_change_password ? "/definir-senha" : "/" });
});

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export const forgotPasswordAction = publicAction(z.object({ email: z.string().trim().toLowerCase().email("E-mail inválido") }), async ({ email }) => {
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${serverEnv.appUrl.replace(/\/$/, "")}/auth/confirm?next=/definir-senha` });
  // Resposta idêntica exista ou não o e-mail (evita descobrir quem tem conta).
  return ok("Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.");
});

/** Troca de senha (inclusive a obrigatória do primeiro acesso). */
export const newPasswordAction = action({ schema: newPasswordSchema, allowPasswordChange: true }, async ({ password }, ctx) => {
  const { error } = await ctx.supabase.auth.updateUser({ password });
  if (error) {
    if (/same|different/i.test(error.message)) return fail("A nova senha precisa ser diferente da atual.");
    if (/weak|short|characters/i.test(error.message)) return fail("Senha fraca. Use ao menos 10 caracteres, misturando letras e números.");
    return fail("Não foi possível alterar a senha. Tente novamente.");
  }
  const r = await callRpc(ctx, "clear_must_change_password", {});
  if (r.state) return r.state;
  return ok("Senha definida com sucesso.", { redirectTo: "/" });
});

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Cadastro inicial: cria a empresa e o proprietário. Só funciona UMA vez (enquanto não existir
 * nenhum perfil) e, em produção, exige o SETUP_TOKEN configurado no servidor.
 */
export const setupAction = publicAction(setupSchema, async (input) => {
  const token = serverEnv.setupToken;
  if (process.env.NODE_ENV === "production" && !token) {
    return fail("Defina a variável SETUP_TOKEN no servidor antes de fazer o cadastro inicial (veja o README).");
  }
  if (token && !same(input.token ?? "", token)) return fail("Código de instalação incorreto.", { fieldErrors: { token: "Código incorreto" } });

  const admin = createAdminClient();
  const status = await admin.rpc("svc_setup_status");
  if (status.error) return fail("Não foi possível falar com o banco. Confira as variáveis do Supabase e se as migrations foram aplicadas.");
  if (!(status.data as { needs_setup: boolean }).needs_setup) return fail("A empresa já foi configurada. Entre com seu e-mail e senha.");

  const boot = await admin.rpc("svc_bootstrap_organization", { p_org_name: input.org_name, p_owner_email: input.email, p_owner_name: input.owner_name });
  if (boot.error) return fail(boot.error.message);

  const created = await admin.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true });
  if (created.error) {
    await admin.rpc("svc_discard_invitation", { p_email: input.email });
    return fail(`Não foi possível criar o login: ${created.error.message}`);
  }
  const supabase = await createClient();
  const signed = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  return ok("Empresa criada! Você é o proprietário.", { redirectTo: signed.error ? "/login" : "/" });
});
