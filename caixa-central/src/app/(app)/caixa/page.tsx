import Link from "next/link";
import { AlertTriangle, Clock, History, Lock, Wallet } from "lucide-react";
import { requireAuth, getOrganization } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { loadFormLookups, loadMovements, loadNames, loadSummary } from "@/lib/cash-queries";
import { Alert, Badge, Card, CardBody, CardHeader, LinkButton, PageHeader, Stat } from "@/components/ui/primitives";
import { MovementList } from "@/components/cash/MovementList";
import { CloseShiftButton, MovementForm, OpenShiftForm } from "@/components/cash/CashForms";
import { formatBRL } from "@/lib/money";
import { formatDateTimeBR } from "@/lib/dates";
import { methodLabel } from "@/lib/labels";

export const metadata = { title: "Caixa" };

interface RegStatus { register_id: string; register_name: string; shift_id: string | null; employee_name: string | null; opened_at: string | null; is_mine: boolean }

export default async function CaixaPage() {
  const ctx = await requireAuth("caixa");
  const admin = isAdmin(ctx.profile.role);
  const org = await getOrganization();
  const [{ data: statusData }, { data: mine }] = await Promise.all([
    ctx.supabase.rpc("register_status"),
    ctx.supabase.from("cash_shifts").select("id, register_id, opened_at, opening_cents").eq("employee_id", ctx.profile.id).eq("status", "open").maybeSingle(),
  ]);
  const registers = (statusData ?? []) as RegStatus[];
  const others = registers.filter((r) => r.shift_id && !r.is_mine);

  if (!mine) {
    const free = registers.filter((r) => !r.shift_id);
    return (
      <>
        <PageHeader title="Caixa" description="Abra o seu turno para começar a registrar vendas." actions={<LinkButton href="/caixa/turnos" variant="ghost"><History size={16} aria-hidden /> {admin ? "Todos os turnos" : "Meus turnos"}</LinkButton>} />
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader icon={Wallet} title="Abrir turno" description="Conte o dinheiro da gaveta antes de digitar o valor." />
            <CardBody>
              {free.length ? <OpenShiftForm registers={free.map((r) => ({ id: r.register_id, name: r.register_name }))} /> : (
                <Alert tone="warning" title="Nenhuma gaveta livre">Todas as gavetas estão em uso. Peça para o responsável fechar o turno antes de abrir o seu.</Alert>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={Clock} title="Situação das gavetas" />
            <ul className="divide-y divide-border">
              {registers.map((r) => (
                <li key={r.register_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <div><p className="font-medium">{r.register_name}</p>{r.shift_id && <p className="text-xs text-muted">{r.employee_name} · desde {formatDateTimeBR(r.opened_at)}</p>}</div>
                  <Badge tone={r.shift_id ? "warning" : "success"}>{r.shift_id ? "Em uso" : "Livre"}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        {admin && others.length > 0 && <OpenShiftsCard rows={others} />}
      </>
    );
  }

  const [summary, movements, lookups, names] = await Promise.all([
    loadSummary(ctx, mine.id), loadMovements(ctx, mine.id), loadFormLookups(ctx, admin), admin ? loadNames(ctx) : Promise.resolve({}),
  ]);
  const regName = registers.find((r) => r.register_id === mine.register_id)?.register_name ?? "Caixa";
  const blind = !!summary?.blind;
  return (
    <>
      <PageHeader
        title="Meu turno"
        description={<>{regName} · aberto desde {formatDateTimeBR(mine.opened_at)}</>}
        actions={<>
          <LinkButton href={`/caixa/turnos/${mine.id}`} variant="ghost">Resumo e comprovante</LinkButton>
          <CloseShiftButton shiftId={mine.id} expectedCents={summary?.expected_cents ?? null} blind={blind} />
        </>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Dinheiro esperado na gaveta" icon={Wallet} tone="primary"
          value={blind ? <span className="inline-flex items-center gap-1.5 text-base text-muted"><Lock size={16} aria-hidden /> Fechamento cego</span> : formatBRL(summary?.expected_cents)}
          hint={blind ? "Conte a gaveta ao fechar" : `Abertura ${formatBRL(summary?.opening_cents)}`} />
        <Stat label="Vendas do turno" value={formatBRL(summary?.totals.sales)} hint={`${summary?.totals.count ?? 0} lançamento(s)`} />
        <Stat label="Em dinheiro" value={formatBRL(summary?.sales_by_method.dinheiro ?? 0)} hint="Entra na gaveta" />
        <Stat label="Pix e cartão" value={formatBRL((summary?.totals.sales ?? 0) - (summary?.sales_by_method.dinheiro ?? 0))}
          hint={Object.keys(summary?.sales_by_method ?? {}).filter((k) => k !== "dinheiro").map((k) => methodLabel[k]).join(", ") || "Não entra na gaveta"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
        <Card className="self-start">
          <CardHeader title="Novo lançamento" description="Cada toque em “Registrar” só vale depois que o servidor confirma." />
          <CardBody><MovementForm shiftId={mine.id} isAdmin={admin} categories={lookups.categories} counterAccounts={lookups.counterAccounts}
            closedShifts={lookups.closedShifts.map((s) => ({ id: s.id, label: `${formatDateTimeBR(s.opened_at)} · ${s.profiles?.full_name ?? ""}` }))} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Movimentações do turno" description={org?.blind_close ? "Fechamento cego ativo nesta empresa." : undefined} />
          <MovementList rows={movements} isAdmin={admin} canCancel={admin} names={names} me={ctx.profile.id} />
        </Card>
      </div>
      {admin && others.length > 0 && <OpenShiftsCard rows={others} />}
    </>
  );
}

function OpenShiftsCard({ rows }: { rows: RegStatus[] }) {
  return (
    <Card className="mt-5">
      <CardHeader icon={AlertTriangle} title="Outros turnos abertos agora" description="Você pode abrir o turno para lançar correções ou fechá-lo, se necessário." />
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.register_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
            <div><p className="font-medium">{r.employee_name}</p><p className="text-xs text-muted">{r.register_name} · desde {formatDateTimeBR(r.opened_at)}</p></div>
            <Link href={`/caixa/turnos/${r.shift_id}`} className="text-sm font-medium text-primary hover:underline">Abrir</Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
