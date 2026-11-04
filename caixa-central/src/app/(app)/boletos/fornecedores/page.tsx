import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { loadBillLookups } from "@/lib/bills-queries";
import { Badge, Card, Empty, PageHeader } from "@/components/ui/primitives";
import { SupplierButton } from "@/components/bills/BillForms";

export const metadata = { title: "Fornecedores" };

export default async function SuppliersPage() {
  const ctx = await requireAuth("boletos");
  const { suppliers } = await loadBillLookups(ctx);
  return (
    <>
      <div className="mb-3"><Link href="/boletos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft size={15} aria-hidden /> Boletos</Link></div>
      <PageHeader title="Fornecedores" description="Quem emite os boletos da empresa." actions={<SupplierButton />} />
      <Card>
        {suppliers.length === 0 ? <Empty title="Nenhum fornecedor ainda" description="Cadastre o primeiro para poder lançar boletos." /> : (
          <ul className="divide-y divide-border">
            {suppliers.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">{s.name}{!s.active && <Badge>Inativo</Badge>}</p>
                  <p className="truncate text-xs text-muted">{[s.document, s.phone, s.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}</p>
                </div>
                <SupplierButton supplier={s} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
