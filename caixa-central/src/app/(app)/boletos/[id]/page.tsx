import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History, Paperclip, Wallet } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { loadBill, loadBillLookups } from "@/lib/bills-queries";
import { Alert, Badge, Card, CardBody, CardHeader, Empty, PageHeader, Stat } from "@/components/ui/primitives";
import { billTone } from "@/components/ui/tones";
import { CancelBillButton, CancelPaymentButton, EditBillButton, PayBillButton } from "@/components/bills/BillForms";
import { FileUploadButton, OpenFileButton } from "@/components/bills/FileUpload";
import { describeChange } from "@/lib/audit-format";
import { billStatusLabel, payMethodLabel } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates";

export const metadata = { title: "Boleto" };

interface Payment { id: string; amount_cents: number; paid_on: string; method: string; note: string | null; status: string; cancel_reason: string | null; account_id: string; created_at: string; confirmed_by: string }
interface FileRow { id: string; kind: string; filename: string; payment_id: string | null; created_at: string; size_bytes: number }
interface AuditRow { id: number; created_at: string; actor_id: string | null; action: string; entity_type: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string | null }

export default async function BillDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireAuth("boletos");
  const bill = await loadBill(ctx, id);
  if (!bill) notFound();

  const [lookups, pay, files, names, accountsAll] = await Promise.all([
    loadBillLookups(ctx),
    ctx.supabase.from("bill_payments").select("id, amount_cents, paid_on, method, note, status, cancel_reason, account_id, created_at, confirmed_by").eq("bill_id", id).order("created_at", { ascending: true }),
    ctx.supabase.from("bill_files").select("id, kind, filename, payment_id, created_at, size_bytes").eq("bill_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("profiles").select("id, full_name"),
    ctx.supabase.from("accounts").select("id, name"),
  ]);
  const payments = (pay.data ?? []) as Payment[];
  const fileRows = (files.data ?? []) as FileRow[];
  const nameOf = Object.fromEntries((names.data ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
  const accountName = Object.fromEntries((accountsAll.data ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));

  const ids = [id, ...payments.map((p) => p.id)];
  const { data: audit } = await ctx.supabase.from("audit_log").select("id, created_at, actor_id, action, entity_type, before, after, reason")
    .in("entity_type", ["bill", "bill_payment", "bill_file"]).in("entity_id", ids).order("created_at", { ascending: false }).limit(100);
  const history = (audit ?? []) as AuditRow[];

  const editable = bill.status === "open" || bill.status === "partial";
  const entityLabel: Record<string, string> = { bill: "Boleto", bill_payment: "Pagamento", bill_file: "Anexo" };
  const actionLabel: Record<string, string> = { insert: "criou", update: "alterou", delete: "removeu" };

  return (
    <>
      <div className="mb-3"><Link href="/boletos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft size={15} aria-hidden /> Boletos</Link></div>
      <PageHeader
        title={bill.supplier}
        description={<>{bill.description}{bill.installments_total > 1 ? ` · parcela ${bill.installment_no}/${bill.installments_total}` : ""}{bill.category ? ` · ${bill.category}` : ""}</>}
        actions={editable ? <>
          <PayBillButton billId={id} remainingCents={bill.remaining_cents} accounts={lookups.accounts} />
          <EditBillButton bill={bill} suppliers={lookups.suppliers} categories={lookups.categories} />
          {bill.paid_cents === 0 && <CancelBillButton id={id} />}
        </> : undefined}
      />
      <div className="mb-4 flex flex-wrap gap-2"><Badge tone={billTone[bill.situation]}>{billStatusLabel[bill.situation]}</Badge>{bill.barcode && <Badge className="font-mono">{bill.barcode.replace(/(\d{5})(?=\d)/g, "$1 ")}</Badge>}</div>
      {bill.situation === "overdue" && <div className="mb-4"><Alert tone="danger" title="Boleto vencido">Venceu em {formatDateBR(bill.due_date)}. Confira no banco se já foi pago; se não, pague ou negocie.</Alert></div>}
      {bill.notes && <p className="mb-4 text-sm text-muted">Obs.: {bill.notes}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Valor do boleto" value={formatBRL(bill.amount_cents)} />
        <Stat label="Já pago" value={formatBRL(bill.paid_cents)} tone="success" />
        <Stat label="Em aberto" value={formatBRL(bill.remaining_cents)} tone={bill.remaining_cents ? "warning" : "success"} />
        <Stat label="Vencimento" value={formatDateBR(bill.due_date)} hint={bill.paid_on ? `Pago em ${formatDateBR(bill.paid_on)}` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="self-start">
          <CardHeader icon={Wallet} title="Pagamentos" description="Cada pagamento sai de uma conta e fica no livro-razão." />
          {payments.length === 0 ? <Empty title="Nenhum pagamento registrado" /> : (
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="space-y-2 px-4 py-3 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="tabular text-sm font-semibold">{formatBRL(p.amount_cents)} {p.status === "cancelled" && <Badge tone="danger">cancelado</Badge>}</p>
                      <p className="text-xs text-muted">{formatDateBR(p.paid_on)} · {payMethodLabel[p.method]} · {accountName[p.account_id] ?? "conta"} · confirmado por {nameOf[p.confirmed_by] ?? "—"}</p>
                      {p.note && <p className="text-xs text-muted">{p.note}</p>}
                      {p.cancel_reason && <p className="text-xs text-danger">Cancelamento: {p.cancel_reason}</p>}
                    </div>
                    {p.status === "posted" && <CancelPaymentButton id={p.id} />}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {fileRows.filter((f) => f.payment_id === p.id).map((f) => <OpenFileButton key={f.id} fileId={f.id} filename={f.filename} />)}
                    {p.status === "posted" && <FileUploadButton orgId={ctx.profile.organization_id} billId={id} paymentId={p.id} kind="receipt" label="Anexar comprovante" />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="self-start">
          <CardHeader icon={Paperclip} title="Anexos do boleto" description="Arquivos privados; os links abrem por 2 minutos." action={editable ? <FileUploadButton orgId={ctx.profile.organization_id} billId={id} kind="boleto" label="Anexar boleto" /> : undefined} />
          <CardBody className="space-y-2">
            {fileRows.filter((f) => f.kind === "boleto").map((f) => <div key={f.id}><OpenFileButton fileId={f.id} filename={f.filename} /><span className="ml-2 text-xs text-muted">{formatDateTimeBR(f.created_at)}</span></div>)}
            {!fileRows.some((f) => f.kind === "boleto") && <p className="text-sm text-muted">Nenhum boleto anexado.</p>}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader icon={History} title="Histórico de alterações" description="Quem fez o quê e quando. Não pode ser editado." />
          {history.length === 0 ? <Empty title="Sem registros" /> : (
            <ul className="divide-y divide-border">
              {history.map((h) => (
                <li key={h.id} className="px-4 py-3 text-sm sm:px-5">
                  <p><b>{h.actor_id ? nameOf[h.actor_id] ?? "Usuário" : "Sistema"}</b> {actionLabel[h.action] ?? h.action} · {entityLabel[h.entity_type]} <span className="text-xs text-muted">em {formatDateTimeBR(h.created_at)}</span></p>
                  <p className="text-xs text-muted">{h.action === "insert" && h.entity_type === "bill" ? "Boleto cadastrado." : describeChange(h.before, h.after)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
