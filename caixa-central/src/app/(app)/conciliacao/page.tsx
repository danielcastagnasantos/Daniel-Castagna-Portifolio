import Link from "next/link";
import { Landmark } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Alert, Badge, Card, CardHeader, Empty, PageHeader, Stat } from "@/components/ui/primitives";
import { StatementImport } from "@/components/finance/StatementImport";
import { LineActions } from "@/components/finance/LineActions";
import { cn } from "@/components/ui/cn";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";

export const metadata = { title: "Conciliação" };
const PAGE = 100;
const STATUS: Record<string, string> = { unmatched: "Pendentes", matched: "Conciliadas", created: "Geraram lançamento", ignored: "Ignoradas" };

interface Line { id: string; posted_on: string; amount_cents: number; description: string; status: string; note: string | null }

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ conta?: string; status?: string; pagina?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireAuth("conciliacao");
  const { data: accs } = await ctx.supabase.from("accounts").select("id, name").in("type", ["bank", "pix"]).eq("active", true).order("name");
  const accounts = (accs ?? []) as Array<{ id: string; name: string }>;
  const account = accounts.find((a) => a.id === sp.conta) ?? accounts[0];
  const status = sp.status && STATUS[sp.status] ? sp.status : "unmatched";
  const page = Math.max(0, Number(sp.pagina) || 0);

  const cats = await ctx.supabase.from("expense_categories").select("id, name").eq("kind", "expense").eq("active", true).order("name");
  let lines: Line[] = [];
  let counts: Record<string, number> = {};
  if (account) {
    const [l, c] = await Promise.all([
      ctx.supabase.from("bank_statement_lines").select("id, posted_on, amount_cents, description, status, note").eq("account_id", account.id).eq("status", status)
        .order("posted_on", { ascending: false }).order("id").range(page * PAGE, page * PAGE + PAGE - 1),
      Promise.all(Object.keys(STATUS).map(async (s) => [s, (await ctx.supabase.from("bank_statement_lines").select("id", { count: "exact", head: true }).eq("account_id", account.id).eq("status", s)).count ?? 0] as const)),
    ]);
    lines = (l.data ?? []) as Line[];
    counts = Object.fromEntries(c);
  }
  const total = counts[status] ?? 0;
  const qs = (o: Record<string, string | number>) => `/conciliacao?${new URLSearchParams({ conta: account?.id ?? "", status, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <>
      <PageHeader title="Conciliação bancária" description="Importe o extrato do banco e confira linha a linha com os lançamentos do sistema. Nada é lançado em duplicidade." />
      {accounts.length === 0 ? <Alert tone="warning" title="Nenhuma conta bancária ou Pix">Cadastre uma conta em Contas e saldos.</Alert> : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {accounts.map((a) => <Link key={a.id} href={`/conciliacao?conta=${a.id}`} className={cn("rounded-xl border px-3.5 py-2 text-sm font-medium", a.id === account?.id ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-muted hover:text-text")}>{a.name}</Link>)}
          </div>
          <StatementImport accounts={accounts} selected={account?.id} />
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Object.entries(STATUS).map(([k, label]) => (
              <Link key={k} href={qs({ status: k, pagina: 0 })}><Stat label={label} icon={k === status ? Landmark : undefined} tone={k === status ? "primary" : "neutral"} value={counts[k] ?? 0} /></Link>
            ))}
          </div>
          <Card>
            <CardHeader title={`${STATUS[status]} — ${account?.name}`} description={`${total} linha(s)`} />
            {lines.length === 0 ? <Empty icon={Landmark} title="Nada por aqui" description={status === "unmatched" ? "Importe um extrato ou todas as linhas já foram tratadas." : undefined} /> : (
              <ul className="divide-y divide-border">
                {lines.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.description}</p>
                      <p className="text-xs text-muted">{formatDateBR(l.posted_on)}{l.note ? ` · ${l.note}` : ""}</p>
                    </div>
                    <span className={cn("tabular text-sm font-semibold", l.amount_cents < 0 ? "text-danger" : "text-success")}>{formatBRL(l.amount_cents, { signed: true })}</span>
                    {l.status === "matched" && <Badge tone="success">conciliada</Badge>}
                    <LineActions lineId={l.id} amountCents={l.amount_cents} status={l.status} categories={(cats.data ?? []) as Array<{ id: string; name: string }>} />
                  </li>
                ))}
              </ul>
            )}
            {total > PAGE && (
              <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
                {page > 0 ? <Link href={qs({ pagina: page - 1 })} className="text-primary">← Anterior</Link> : <span />}
                <span className="text-xs text-muted">Página {page + 1} de {Math.ceil(total / PAGE)}</span>
                {(page + 1) * PAGE < total ? <Link href={qs({ pagina: page + 1 })} className="text-primary">Próxima →</Link> : <span />}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
