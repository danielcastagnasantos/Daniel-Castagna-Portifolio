import Link from "next/link";
import { AlertTriangle, Clock, History, Wallet } from "lucide-react";
import { getOrganization, requireAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { Alert, Badge, Card, CardBody, CardHeader, LinkButton, PageHeader } from "@/components/ui/primitives";
import { OpenShiftForm } from "@/components/cash/CashForms";
import { SimpleCloseForm } from "@/components/cash/SimpleClose";
import { formatBRL } from "@/lib/money";
import { formatDateTimeBR } from "@/lib/dates";

export const metadata = { title: "Caixa" };

interface RegStatus { register_id: string; register_name: string; shift_id: string | null; employee_name: string | null; opened_at: string | null; is_mine: boolean }

export default async function CaixaPage() {
  const ctx = await requireAuth("caixa");
  const admin = isAdmin(ctx.profile.role);
  const org = await getOrganization();
  const fund = org?.change_fund_cents ?? 15000;
  const [{ data: statusData }, { data: mine }] = await Promise.all([
    ctx.supabase.rpc("register_status"),
    ctx.supabase.from("cash_shifts").select("id, register_id, opened_at, opening_cents").eq("employee_id", ctx.profile.id).eq("status", "open").maybeSingle(),
  ]);
  const registers = (statusData ?? []) as RegStatus[];
  const others = registers.filter((r) => r.shift_id && !r.is_mine);
  const history = (
    <LinkButton href="/caixa/turnos" variant="ghost"><History size={16} aria-hidden /> {admin ? "Todos os turnos" : "Meus turnos"}</LinkButton>
  );

  if (!mine) {
    const free = registers.filter((r) => !r.shift_id);
    return (
      <>
        <PageHeader title="Caixa" description={`Todo dia fica ${formatBRL(fund)} de troco na gaveta. Abra o turno conferindo o troco.`} actions={history} />
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader icon={Wallet} title="Abrir meu turno" description="Conte o troco da gaveta antes de começar." />
            <CardBody>
              {free.length ? <OpenShiftForm registers={free.map((r) => ({ id: r.register_id, name: r.register_name }))} changeFundCents={fund} /> : (
                <Alert tone="warning" title="A gaveta está em uso">Peça para quem está com o caixa fechar o turno antes de abrir o seu.</Alert>
              )}
            </CardBody>
          </Card>
          <Card className="self-start">
            <CardHeader icon={Clock} title="Situação do caixa" />
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
        {admin && others.length > 0 && <OpenShifts rows={others} />}
      </>
    );
  }

  const blind = !!org?.blind_close && !admin;
  return (
    <>
      <PageHeader title="Meu turno" description={<>Aberto desde {formatDateTimeBR(mine.opened_at)} · troco na abertura {formatBRL(mine.opening_cents)}</>}
        actions={<>{history}<LinkButton href={`/caixa/turnos/${mine.id}`} variant="ghost">Detalhes</LinkButton></>} />
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader title="Fechar o turno" description="Informe o total vendido e conte a gaveta. O sistema diz quanto retirar para ficar só o troco." />
          <CardBody><SimpleCloseForm shiftId={mine.id} openingCents={Number(mine.opening_cents)} changeFundCents={fund} blind={blind} /></CardBody>
        </Card>
      </div>
      {admin && others.length > 0 && <OpenShifts rows={others} />}
    </>
  );
}

function OpenShifts({ rows }: { rows: RegStatus[] }) {
  return (
    <Card className="mt-5">
      <CardHeader icon={AlertTriangle} title="Outros turnos abertos agora" />
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
