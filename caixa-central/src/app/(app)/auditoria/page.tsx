import { ScrollText } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Card, CardBody, CardHeader, Empty, PageHeader } from "@/components/ui/primitives";
import { Input, Select } from "@/components/forms/ActionForm";
import { describeChange } from "@/lib/audit-format";
import { addDaysISO, formatDateTimeBR, isISODate, todayISO } from "@/lib/dates";

export const metadata = { title: "Auditoria" };
const ENTITY: Record<string, string> = { bill: "Boleto", bill_payment: "Pagamento de boleto", cash_shift: "Turno", cash_movement: "Movimentação", account: "Conta", account_transfer: "Transferência", account_adjustment: "Ajuste", profile: "Usuário", organization: "Empresa", supplier: "Fornecedor", receivable: "A receber", register: "Caixa", payment_route: "Rota de pagamento", expense_category: "Categoria", bank_statement_line: "Extrato", invitation: "Convite", bill_file: "Anexo" };
const ACTION: Record<string, string> = { insert: "criou", update: "alterou", delete: "removeu" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ tipo?: string; de?: string; ate?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireAuth("auditoria");
  const from = isISODate(sp.de) ? sp.de : addDaysISO(todayISO(), -7);
  const to = isISODate(sp.ate) ? sp.ate : todayISO();
  let q = ctx.supabase.from("audit_log").select("id, created_at, actor_id, action, entity_type, entity_id, before, after, reason")
    .gte("created_at", `${from}T00:00:00-03:00`).lt("created_at", `${addDaysISO(to, 1)}T00:00:00-03:00`).order("created_at", { ascending: false }).limit(300);
  if (sp.tipo && ENTITY[sp.tipo]) q = q.eq("entity_type", sp.tipo);
  const [{ data }, people] = await Promise.all([q, ctx.supabase.from("profiles").select("id, full_name")]);
  const nameOf = Object.fromEntries((people.data ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
  const rows = (data ?? []) as Array<{ id: number; created_at: string; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string | null }>;
  return (
    <>
      <PageHeader title="Auditoria" description="Registro permanente de quem criou, alterou ou cancelou cada informação. Ninguém — nem o proprietário — pode editar ou apagar." />
      <Card className="mb-4"><CardBody>
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium">De<Input name="de" type="date" defaultValue={from} className="mt-1 w-40" /></label>
          <label className="text-xs font-medium">Até<Input name="ate" type="date" defaultValue={to} className="mt-1 w-40" /></label>
          <label className="text-xs font-medium">Registro<Select name="tipo" defaultValue={sp.tipo ?? ""} className="mt-1 w-52"><option value="">Todos</option>{Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></label>
          <button className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-on-primary">Filtrar</button>
        </form>
      </CardBody></Card>
      <Card>
        <CardHeader icon={ScrollText} title="Eventos" description={`${rows.length} registro(s)${rows.length === 300 ? " (limite de 300; refine o filtro)" : ""}`} />
        {rows.length === 0 ? <Empty title="Nenhum evento no período" /> : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm sm:px-5">
                <p><b>{r.actor_id ? nameOf[r.actor_id] ?? "Usuário" : "Sistema"}</b> {ACTION[r.action] ?? r.action} · {ENTITY[r.entity_type] ?? r.entity_type} <span className="text-xs text-muted">· {formatDateTimeBR(r.created_at)}</span></p>
                <p className="break-words text-xs text-muted">{describeChange(r.before, r.after).slice(0, 400)}{r.reason ? ` · motivo: ${r.reason}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
