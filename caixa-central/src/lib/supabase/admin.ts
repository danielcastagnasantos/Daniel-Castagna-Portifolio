import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Cliente com a service role: ignora o RLS. Uso restrito a: cadastro inicial,
 * criação/bloqueio de logins e rotinas agendadas. NUNCA decide permissões sozinho:
 * quem o chama antes passa por uma função do banco que valida o usuário.
 */
export function createAdminClient() {
  return createClient(publicEnv.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
