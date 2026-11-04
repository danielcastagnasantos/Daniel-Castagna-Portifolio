"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Banknote, Bell, CalendarClock, FileText, Landmark, LayoutDashboard, LogOut, MoreHorizontal,
  Receipt, ScrollText, Settings, Users, X, ArrowLeftRight, type LucideIcon,
} from "lucide-react";
import { canAccess, type NavKey } from "@/lib/permissions";
import { roleLabel, type Role } from "@/lib/labels";
import { cn } from "@/components/ui/cn";
import { Brand } from "./AuthShell";
import { ThemeToggle } from "./ThemeToggle";
import { signOutAction } from "@/app/actions/auth";

interface Item { key: NavKey; href: string; label: string; icon: LucideIcon; primary?: boolean }

const ITEMS: Item[] = [
  { key: "painel", href: "/painel", label: "Painel", icon: LayoutDashboard, primary: true },
  { key: "caixa", href: "/caixa", label: "Caixa", icon: Banknote, primary: true },
  { key: "boletos", href: "/boletos", label: "Boletos", icon: FileText, primary: true },
  { key: "contas", href: "/contas", label: "Contas e saldos", icon: Landmark },
  { key: "conciliacao", href: "/conciliacao", label: "Conciliação", icon: ArrowLeftRight },
  { key: "receber", href: "/receber", label: "A receber", icon: Receipt },
  { key: "relatorios", href: "/relatorios", label: "Relatórios", icon: CalendarClock, primary: true },
  { key: "notificacoes", href: "/notificacoes", label: "Notificações", icon: Bell },
  { key: "equipe", href: "/equipe", label: "Equipe", icon: Users },
  { key: "configuracoes", href: "/configuracoes", label: "Configurações", icon: Settings },
  { key: "auditoria", href: "/auditoria", label: "Auditoria", icon: ScrollText },
];

export function AppShell({ children, role, name, orgName, unread }: { children: ReactNode; role: Role; name: string; orgName: string; unread: number }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const items = ITEMS.filter((i) => canAccess(i.key, role));
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  const bottom = role === "cashier" ? items : items.filter((i) => i.primary);

  const NavLink = ({ item, onClick }: { item: Item; onClick?: () => void }) => (
    <Link
      href={item.href} onClick={onClick} aria-current={active(item.href) ? "page" : undefined}
      className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition", active(item.href) ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-text")}
    >
      <item.icon size={18} aria-hidden />
      <span className="flex-1">{item.label}</span>
      {item.key === "notificacoes" && unread > 0 && <span className="rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface p-4 lg:flex">
        <div className="px-2 pb-5 pt-1"><Brand /><p className="mt-2 truncate text-xs text-muted">{orgName}</p></div>
        <nav aria-label="Principal" className="flex-1 space-y-1 overflow-y-auto">
          {items.map((i) => <NavLink key={i.key} item={i} />)}
        </nav>
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-3 px-2">
            <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{name.charAt(0).toUpperCase()}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name}</p><p className="text-xs text-muted">{roleLabel[role]}</p></div>
            <ThemeToggle className="rounded-lg p-2 text-muted hover:bg-surface-2" />
          </div>
          <form action={signOutAction}><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text"><LogOut size={18} aria-hidden /> Sair</button></form>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Barra superior (celular/tablet) */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
          <Brand size={30} />
          <div className="flex items-center gap-1">
            {role !== "cashier" && (
              <Link href="/notificacoes" aria-label={`Notificações${unread ? `, ${unread} não lidas` : ""}`} className="relative rounded-xl p-2 text-muted hover:bg-surface-2">
                <Bell size={19} aria-hidden />
                {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
              </Link>
            )}
            <ThemeToggle className="rounded-xl p-2 text-muted hover:bg-surface-2" />
            {role === "cashier" && (
              <form action={signOutAction}><button aria-label="Sair" className="rounded-xl p-2 text-muted hover:bg-surface-2"><LogOut size={19} aria-hidden /></button></form>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* Navegação inferior (celular) */}
      <nav aria-label="Principal" className="no-print safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        <ul className="mx-auto flex max-w-xl items-stretch justify-around">
          {bottom.map((i) => (
            <li key={i.key} className="flex-1">
              <Link href={i.href} aria-current={active(i.href) ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active(i.href) ? "text-primary" : "text-muted")}>
                <i.icon size={21} aria-hidden />{i.label.split(" ")[0]}
              </Link>
            </li>
          ))}
          {role !== "cashier" && (
            <li className="flex-1">
              <button type="button" onClick={() => setMore(true)} className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
                <MoreHorizontal size={21} aria-hidden />Mais
              </button>
            </li>
          )}
        </ul>
      </nav>

      {more && (
        <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Mais opções">
          <button className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={() => setMore(false)} />
          <div className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-surface p-4 shadow-2xl fade-in">
            <div className="mb-3 flex items-center justify-between">
              <div><p className="text-sm font-semibold">{name}</p><p className="text-xs text-muted">{roleLabel[role]} · {orgName}</p></div>
              <button type="button" onClick={() => setMore(false)} aria-label="Fechar" className="rounded-xl p-2 hover:bg-surface-2"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {items.filter((i) => !i.primary).map((i) => <NavLink key={i.key} item={i} onClick={() => setMore(false)} />)}
            </div>
            <form action={signOutAction} className="mt-3 border-t border-border pt-3">
              <button className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-danger hover:bg-danger-soft"><LogOut size={17} aria-hidden /> Sair da conta</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
