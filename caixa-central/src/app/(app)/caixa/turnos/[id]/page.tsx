import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown, ShieldAlert } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { loadFormLookups, loadMovements, loadNames, loadSummary } from "@/lib/cash-queries";
import { Alert, Badge, Card, CardBody, CardHeader, LinkButton, PageHeader, Stat } from "@/components/ui/primitives";
import { MovementList } from "@/components/cash/MovementList";
import { CloseShiftButton, MovementForm } from "@/components/cash/CashForms";
import { ReviewShiftButton } from "@/components/cash/AdminActions";
import { PrintButton } from "@/components/ui/PrintButton";
import { formatBRL } from "@/lib/money";
import { formatDateTimeBR } from "@/lib/dates";
import { methodLabel, reviewLabel } from "@/lib/labels";
import { reviewTone } from "@/components/ui/tones";

export const metadata = { title: "Detalhe do turno" };

export default async function ShiftDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireAuth("caixa");
  const admin = isAdmin(ctx.profile.role);
  const { data: shift } = await ctx.supabase.from("cash_shifts").select("*").eq("id", id).maybeSingle();
  if (!shift) notFound();
  const [summary, movements, names, reg, lookups] = await Promise.all([
    loadSummary(ctx, id), loadMovements(ctx, id), admin ? loadNames(ctx) : Promise.resolve({ [ctx.profile.id]: ctx.profile.full_name } as Record<string, string>),
    ctx.supabase.from("registers").select("name").eq("id", shift.register_id).maybeSingle(),
    shift.status === "open" && admin ? loadFormLookups(ctx, true) : Promise.resolve(null),
  ]);
  const owner = names[shift.employee_id] ?? "Operador";
  const open = shift.status === "open";
  const diff = shift.difference_cents as number | null;

  return (
    <>
      <div className="no-print mb-3"><Link href="/caixa/turnos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft size={15} aria-hidden /> Turnos</Link></div>
      <PageHeader
        title={`Turno de ${owner}`}
        description={<>{reg.data?.name} · {formatDateTimeBR(shift.opened_at)}{shift.closed_at ? ` até ${formatDateTimeBR(shift.closed_at)}` : " · em andamento"}</>}
        actions={<div className="no-print flex flex-wrap gap-2">
          {!open && <LinkButton href={`/api/shifts/${id}/receipt`} variant="secondary" prefetch={false}><FileDown size={16} aria-hidden /> Comprovante (PDF)</LinkButton>}
          <PrintButton />
          {open && admin && <CloseShiftButton shiftId={id} expectedCents={summary?.expected_cents ?? null} blind={false} />}
          {!open && admin && shift.review_status === "pending" && <ReviewShiftButton id={id} />}
        </div>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={open ? "success" : "neutral"}>{open ? "Aberto" : "Fechado"}</Badge>
        {!open && <Badge tone={reviewTone[shift.review_status]}>{reviewLabel[shift.review_status]}</Badge>}
        {summary?.blind && <Badge tone="info">Fechamento cego</Badge>}
      </div>

      {shift.handoff_difference_cents ? (
        <div className="mb-4"><Alert tone="warning" title="Diferença na passagem de turno">
          O turno anterior deixou {formatBRL(shift.handoff_expected_cents)} e a contagem na abertura foi {formatBRL(shift.opening_cents)} ({formatBRL(shift.handoff_difference_cents, { signed: true })}).
          {shift.handoff_note ? ` Observação: ${shift.handoff_note}` : ""}
        </Alert></div>
      ) : null}
      {!open && shift.review_note && <div className="mb-4"><Alert tone={shift.review_status === "flagged" ? "danger" : "info"} title="Conferência da gerência">{shift.review_note}</Alert></div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Abertura" value={formatBRL(summary?.opening_cents)} />
        <Stat label="Esperado em dinheiro" value={summary?.expected_cents == null ? "—" : formatBRL(summary.expected_cents)} hint={summary?.blind ? "Oculto até o fechamento" : "Abertura + entradas − saídas em dinheiro"} />
        <Stat label="Contado" value={formatBRL(summary?.counted_cents)} />
        <Stat label="Diferença" value={diff == null ? "—" : formatBRL(diff, { signed: true })} tone={diff == null || diff === 0 ? "success" : "warning"} icon={diff ? ShieldAlert : undefined}
          hint={diff == null ? undefined : diff === 0 ? "Caixa bateu" : diff > 0 ? "Sobra" : "Falta"} />
      </div>
      {shift.close_justification && <div className="mb-4"><Alert tone="warning" title="Justificativa do fechamento">{shift.close_justification}</Alert></div>}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Resumo do turno" />
            <CardBody className="space-y-2 text-sm">
              {Object.entries(summary?.sales_by_method ?? {}).map(([m, v]) => <Row key={m} label={`Vendas — ${methodLabel[m]}`} value={formatBRL(v)} />)}
              {!Object.keys(summary?.sales_by_method ?? {}).length && <p className="text-muted">Sem vendas.</p>}
              <hr className="border-border" />
              <Row label="Suprimentos" value={formatBRL(summary?.totals.supply)} />
              <Row label="Sangrias" value={formatBRL(summary?.totals.withdrawal)} />
              <Row label="Despesas e boletos em dinheiro" value={formatBRL(summary?.totals.expense)} />
              <Row label="Estornos" value={formatBRL(summary?.totals.refund)} />
            </CardBody>
          </Card>
          {open && admin && lookups && (
            <Card>
              <CardHeader title="Lançar neste turno" description="Como gerência, você pode registrar correções." />
              <CardBody><MovementForm shiftId={id} isAdmin categories={lookups.categories} counterAccounts={lookups.counterAccounts} /></CardBody>
            </Card>
          )}
        </div>
        <Card className="self-start">
          <CardHeader title="Movimentações" />
          <MovementList rows={movements} isAdmin={admin} canCancel={admin && open} names={names} me={ctx.profile.id} />
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted">{label}</span><span className="tabular font-medium">{value}</span></div>;
}
