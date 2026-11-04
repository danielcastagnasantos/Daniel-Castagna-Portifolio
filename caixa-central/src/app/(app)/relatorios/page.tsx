import Link from "next/link";
import { ChevronRight, FileBarChart } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui/primitives";
import { REPORTS } from "@/lib/reports";

export const metadata = { title: "Relatórios" };

export default async function ReportsIndex() {
  await requireAuth("relatorios");
  return (
    <>
      <PageHeader title="Relatórios" description="Calculados na hora a partir dos lançamentos reais do banco. Exporte em PDF, Excel ou CSV." />
      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.id} href={`/relatorios/${r.id}`}>
            <Card className="flex h-full items-start gap-3 p-4 transition hover:border-primary/50 hover:shadow-md">
              <span className="rounded-xl bg-primary-soft p-2 text-primary"><FileBarChart size={18} aria-hidden /></span>
              <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{r.title}</h2><p className="mt-0.5 text-xs leading-5 text-muted">{r.description}</p></div>
              <ChevronRight size={16} className="mt-1 text-muted" aria-hidden />
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
