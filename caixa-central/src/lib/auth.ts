import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/labels";
import { canAccess, type NavKey } from "@/lib/permissions";

export interface Profile {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  email_notifications: boolean;
}
export interface Organization {
  id: string;
  name: string;
  blind_close: boolean;
  review_threshold_cents: number;
  diff_alert_cents: number;
  shift_max_hours: number;
}

/** Sessão validada no servidor (getUser consulta o Auth) + perfil ativo via RLS. */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name, email, role, active, must_change_password, email_notifications")
    .eq("id", data.user.id)
    .maybeSingle();
  return { supabase, user: data.user, profile: (profile?.active ? profile : null) as Profile | null };
});

export interface AuthContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  profile: Profile;
}

/** Exige login e perfil ativo; opcionalmente uma área do menu. Redireciona se não puder. */
export async function requireAuth(area?: NavKey, opts: { allowPasswordChange?: boolean } = {}): Promise<AuthContext> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.profile) redirect("/login?erro=sem-acesso");
  if (s.profile.must_change_password && !opts.allowPasswordChange) redirect("/definir-senha");
  if (area && !canAccess(area, s.profile.role)) redirect("/caixa");
  return { supabase: s.supabase, profile: s.profile };
}

/** Variante para Server Actions: lança em vez de redirecionar (retorno tratado em withAction). */
export class AuthError extends Error {}
export async function requireActionAuth(area?: NavKey, opts: { allowPasswordChange?: boolean } = {}): Promise<AuthContext> {
  const s = await getSession();
  if (!s?.profile) throw new AuthError("Sua sessão expirou. Entre novamente.");
  if (s.profile.must_change_password && !opts.allowPasswordChange) throw new AuthError("Defina sua nova senha antes de continuar.");
  if (area && !canAccess(area, s.profile.role)) throw new AuthError("Você não tem permissão para esta ação.");
  return { supabase: s.supabase, profile: s.profile };
}

export const getOrganization = cache(async (): Promise<Organization | null> => {
  const s = await getSession();
  if (!s?.profile) return null;
  const { data } = await s.supabase
    .from("organizations")
    .select("id, name, blind_close, review_threshold_cents, diff_alert_cents, shift_max_hours")
    .eq("id", s.profile.organization_id)
    .maybeSingle();
  return (data as Organization | null) ?? null;
});
