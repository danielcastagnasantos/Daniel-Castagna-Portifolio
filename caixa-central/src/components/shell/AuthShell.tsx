import { ShieldCheck, Smartphone, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

export function Brand({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="grid place-items-center rounded-xl bg-primary text-on-primary" style={{ width: size, height: size }}><WalletCards size={size * 0.55} aria-hidden /></span>
      Caixa Central
    </span>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#1e1b4b] p-10 text-white lg:flex">
        <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(900px 500px at 10% -10%, #6366f1 0%, transparent 60%), radial-gradient(700px 400px at 100% 110%, #0ea5e9 0%, transparent 55%)" }} />
        <div className="relative"><Brand /></div>
        <div className="relative max-w-md space-y-4">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">O caixa da distribuidora, conferido e à vista de quem importa.</h2>
          <ul className="space-y-3 text-sm text-white/80">
            <li className="flex items-center gap-3"><ShieldCheck size={18} aria-hidden /> Acesso individual para cada funcionário</li>
            <li className="flex items-center gap-3"><WalletCards size={18} aria-hidden /> Turnos, sangrias, boletos e conciliação rastreáveis</li>
            <li className="flex items-center gap-3"><Smartphone size={18} aria-hidden /> Painel do proprietário no celular, de qualquer lugar</li>
          </ul>
        </div>
        <p className="relative text-xs text-white/50">Ferramenta de gestão interna — não substitui sistema fiscal homologado.</p>
      </aside>
      <main className="relative grid place-items-center p-5 sm:p-8">
        <ThemeToggle className="absolute right-4 top-4 rounded-xl p-2 text-muted hover:bg-surface-2" />
        <div className="w-full max-w-sm fade-in">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
