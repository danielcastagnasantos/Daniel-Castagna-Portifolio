import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Sem tipos gerados do banco: o formato das linhas é validado em src/lib/data.ts e no próprio banco.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: SupabaseClient<any, "public", any> | null = null;

/** Cliente do navegador: usa só a chave PUBLICÁVEL; quem decide o que cada pessoa vê é o banco (RLS). */
export function supabase() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return client;
}
