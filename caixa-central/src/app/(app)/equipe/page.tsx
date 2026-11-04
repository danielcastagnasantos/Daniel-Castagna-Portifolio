import { Users } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { manageableRoles } from "@/lib/permissions";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { CancelInvitationButton, ChangeRoleButton, InviteUserButton, RenameButton, ResetPasswordButton, ToggleActiveButton } from "@/components/team/TeamForms";
import { roleLabel, type Role } from "@/lib/labels";
import { formatDateBR } from "@/lib/dates";

export const metadata = { title: "Equipe" };

export default async function TeamPage() {
  const ctx = await requireAuth("equipe");
  const me = ctx.profile;
  const [people, invites] = await Promise.all([
    ctx.supabase.from("profiles").select("id, full_name, email, role, active, must_change_password, created_at").order("active", { ascending: false }).order("full_name"),
    ctx.supabase.from("invitations").select("id, full_name, email, role, created_at").is("accepted_at", null).order("created_at", { ascending: false }),
  ]);
  const roles = manageableRoles(me.role);
  const canManage = (target: Role) => roles.includes(target);
  return (
    <>
      <PageHeader title="Equipe" description="Cada funcionário entra com login e senha próprios. Ninguém altera o próprio nível de acesso."
        actions={<InviteUserButton roles={roles} />} />
      {me.role === "manager" && <div className="mb-4"><Alert tone="info">Como gerente, você cria e gerencia operadores de caixa. Apenas o proprietário altera perfis e gerencia gerentes.</Alert></div>}
      <Card className="mb-5">
        <CardHeader icon={Users} title="Pessoas com acesso" description={`${(people.data ?? []).filter((p) => p.active).length} ativa(s)`} />
        <ul className="divide-y divide-border">
          {(people.data ?? []).map((p) => {
            const self = p.id === me.id;
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{p.full_name.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">{p.full_name}{self && <Badge tone="primary">você</Badge>}<Badge tone={p.role === "owner" ? "warning" : p.role === "manager" ? "info" : "neutral"}>{roleLabel[p.role as Role]}</Badge>{!p.active && <Badge tone="danger">desativado</Badge>}{p.must_change_password && <Badge>aguardando 1º acesso</Badge>}</p>
                    <p className="truncate text-xs text-muted">{p.email} · desde {formatDateBR(p.created_at)}</p>
                  </div>
                </div>
                {!self && canManage(p.role as Role) && (
                  <div className="flex flex-wrap items-center gap-1">
                    <RenameButton id={p.id} name={p.full_name} />
                    {me.role === "owner" && <ChangeRoleButton id={p.id} role={p.role as Role} name={p.full_name} />}
                    {p.active && <ResetPasswordButton id={p.id} name={p.full_name} />}
                    <ToggleActiveButton id={p.id} active={p.active} name={p.full_name} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      {(invites.data ?? []).length > 0 && (
        <Card>
          <CardHeader title="Convites pendentes" description="Enviados por e-mail e ainda não aceitos." />
          <ul className="divide-y divide-border">
            {(invites.data ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5"><div><p className="font-medium">{i.full_name} <Badge>{roleLabel[i.role as Role]}</Badge></p><p className="text-xs text-muted">{i.email}</p></div><CancelInvitationButton id={i.id} /></li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
