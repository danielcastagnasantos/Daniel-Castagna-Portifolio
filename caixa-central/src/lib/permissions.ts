import type { Role } from "@/lib/labels";

export const isAdmin = (role: Role | null | undefined) => role === "owner" || role === "manager";

/** Páginas por perfil (a barreira real continua sendo o RLS do banco). */
export const NAV_ACCESS = {
  painel: ["owner", "manager"],
  caixa: ["owner", "manager", "cashier"],
  boletos: ["owner", "manager"],
  contas: ["owner", "manager"],
  conciliacao: ["owner", "manager"],
  receber: ["owner", "manager"],
  relatorios: ["owner", "manager"],
  notificacoes: ["owner", "manager"],
  equipe: ["owner", "manager"],
  configuracoes: ["owner", "manager"],
  auditoria: ["owner", "manager"],
} as const satisfies Record<string, readonly Role[]>;

export type NavKey = keyof typeof NAV_ACCESS;
export const canAccess = (key: NavKey, role: Role) => (NAV_ACCESS[key] as readonly Role[]).includes(role);

/** O que cada perfil pode criar/alterar na equipe (espelha private.can_manage_role no banco). */
export function manageableRoles(actor: Role): Role[] {
  if (actor === "owner") return ["owner", "manager", "cashier"];
  if (actor === "manager") return ["cashier"];
  return [];
}
