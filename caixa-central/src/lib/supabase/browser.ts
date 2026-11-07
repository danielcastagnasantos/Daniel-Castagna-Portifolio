"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Somente chave publicável. Usado apenas para enviar anexos ao Storage (protegido por RLS). */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );
}
