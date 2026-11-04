import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Alert, Card, CardBody, LinkButton, PageHeader } from "@/components/ui/primitives";
import { DataTable, type TableColumn, type TableRow } from "@/components/ui/DataTable";
import { Input, Select } from "@/components/forms/ActionForm";
import { reportById, formatCell, totalsRow, type Column } from "@/lib/reports";
import { parseReportParams, periodLabel, runReport } from "@/lib/report-query";
import { formatBRL } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: reportById((await params).id)?.title ?? "Relatório" };
}

const toTableCol = (c: Column): TableColumn =>
  c.type === "enum" ? { key: c.key, label: c.label, type: "badge", labels: c.map } :
  c.type === "money" ? { key: c.key, label: c.label, type: "money", signed: /diff|result|net|balance/.test(c.key) } :
  { key: c.key, label: c.label, type: c.type };

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const def = reportById(id);
  if (!def) notFound();
  const sp = await searchParams;
  const ctx = await requireAuth("relatorios");
  const p = parseReportParams(sp);
  const [{ rows, error }, people] = await Promise.all([
    p.error ? Promise.resolve({ rows: [], error: p.error }) : runReport(ctx, def, p),
    def.employeeFilter ? ctx.supabase.from("profiles").select("id, full_name").order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const total = totalsRow(def, rows);
  const qs = new URLSearchParams({ from: p.from, to: p.to, ...(p.employee ? { employee: p.employee } : {}), ...(p.kind ? { kind: p.kind } : {}) }).toString();
  const tableRows = rows.map((r) => {
    const out: TableRow = {};
    for (const c of def.columns) out[c.key] = (r[c.key] as string | number | null) ?? null;
    return out;
  });

  return (
    <>
      <div className="no-print mb-3"><Link href="/relatorios" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft size={15} aria-hidden /> Relatórios</Link></div>
      <PageHeader title={def.title} description={def.description}
        actions={<div className="no-print flex flex-wrap gap-2">
          <LinkButton href={`/api/reports/${def.id}/export?format=pdf&${qs}`} prefetch={false} variant="secondary"><FileText size={16} aria-hidden /> PDF</LinkButton>
          <LinkButton href={`/api/reports/${def.id}/export?format=xlsx&${qs}`} prefetch={false} variant="secondary"><FileSpreadsheet size={16} aria-hidden /> Excel</LinkButton>
          <LinkButton href={`/api/reports/${def.id}/export?format=csv&${qs}`} prefetch={false} variant="secondary"><Sheet size={16} aria-hidden /> CSV</LinkButton>
        </div>} />

      <Card className="no-print mb-4">
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium">De<Input name="from" type="date" defaultValue={p.from} className="mt-1 w-40" required /></label>
            <label className="text-xs font-medium">Até<Input name="to" type="date" defaultValue={p.to} className="mt-1 w-40" required /></label>
            {def.employeeFilter && (
              <label className="text-xs font-medium">Funcionário
                <Select name="employee" defaultValue={p.employee ?? ""} className="mt-1 w-48"><option value="">Todos</option>{((people.data ?? []) as Array<{ id: string; full_name: string }>).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</Select>
              </label>
            )}
            {def.kindFilter && (
              <label className="text-xs font-medium">{def.kindFilter.label}
                <Select name="kind" defaultValue={p.kind ?? def.kindFilter.options[0][0]} className="mt-1 w-48">{def.kindFilter.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
              </label>
            )}
            <button className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-on-primary">Aplicar</button>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {[["hoje", "Hoje"], ["7d", "7 dias"], ["mes", "Este mês"], ["mes-passado", "Mês passado"]].map(([k, l]) => <Link key={k} href={`/relatorios/${def.id}?p=${k}`} className="rounded-lg border border-border px-2.5 py-1.5 text-muted hover:text-text">{l}</Link>)}
            </div>
          </form>
        </CardBody>
      </Card>

      <p className="mb-2 text-xs text-muted">Período: {periodLabel(p)} · {rows.length} linha(s)</p>
      {error ? <Alert tone="danger" title="Não foi possível gerar o relatório">{error}</Alert> : (
        <Card>
          <DataTable rows={tableRows} columns={def.columns.map(toTableCol)} searchKeys={def.columns.filter((c) => c.type === "text" || c.type === "enum").map((c) => c.key)} pageSize={25} empty="Nenhum registro no período selecionado." />
          {total && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border bg-surface-2/50 px-4 py-3 text-sm sm:px-5">
              <b>Total do período</b>
              {def.columns.filter((c) => c.sum).map((c) => <span key={c.key}><span className="text-muted">{c.label}: </span><b className="tabular">{c.type === "money" ? formatBRL(Number(total[c.key])) : formatCell(c, total)}</b></span>)}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
