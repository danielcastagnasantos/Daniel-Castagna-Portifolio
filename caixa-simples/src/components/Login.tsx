"use client";

import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { humaniza } from "@/lib/data";

export function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErro("");
    try {
      const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) setErro(/fetch|network|failed/i.test(error.message) ? humaniza(error) : "E-mail ou senha incorretos.");
    } catch (x) {
      setErro(humaniza(x as Error));
    } finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4">
        <div className="mb-2 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary text-on-primary"><Wallet size={22} aria-hidden /></span>
          <div><h1 className="text-2xl font-bold tracking-tight">Caixa</h1><p className="text-base text-muted">Entre para ver e lançar o dinheiro.</p></div>
        </div>
        <label className="block text-base font-semibold">E-mail
          <input type="email" required autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-lg" />
        </label>
        <label className="block text-base font-semibold">Senha
          <input type="password" required autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)}
            className="mt-1 h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-lg" />
        </label>
        {erro && <p role="alert" className="rounded-xl bg-out-soft px-3 py-2 text-sm text-out">{erro}</p>}
        <button disabled={busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-xl font-bold text-on-primary disabled:opacity-60">
          {busy && <Loader2 size={18} className="animate-spin" aria-hidden />} Entrar
        </button>
      </form>
    </main>
  );
}
