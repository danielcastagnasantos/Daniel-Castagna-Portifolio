import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { billStatusLabel } from "@/lib/labels";

const FIELD: Record<string, string> = {
  amount_cents: "Valor", paid_cents: "Valor pago", due_date: "Vencimento", status: "Situação", description: "Descrição",
  notes: "Observações", barcode: "Linha digitável", supplier_id: "Fornecedor", category_id: "Categoria", paid_on: "Pago em",
  cancel_reason: "Motivo do cancelamento", cancelled_at: "Cancelado em", cancelled_by: "Cancelado por", name: "Nome", role: "Perfil",
  active: "Ativo", full_name: "Nome", review_status: "Conferência", review_note: "Observação da conferência",
  counted_cents: "Contado", expected_cents: "Esperado", difference_cents: "Diferença", closed_at: "Fechamento",
};
const HIDE = new Set(["id", "organization_id", "created_by", "created_at", "series_id", "client_request_id", "updated_at", "cancelled_by"]);

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "(vazio)";
  if (key.endsWith("_cents")) return formatBRL(Number(v));
  if (key === "due_date" || key === "paid_on") return formatDateBR(String(v));
  if (key === "status") return billStatusLabel[String(v)] ?? String(v);
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v).slice(0, 120);
}

/** "Valor: R$ 10,00 → R$ 12,00; Vencimento: 01/03 → 05/03" */
export function describeChange(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  if (!after) return "";
  return Object.keys(after).filter((k) => !HIDE.has(k)).map((k) => {
    const label = FIELD[k] ?? k;
    return before && k in before ? `${label}: ${show(k, before[k])} → ${show(k, after[k])}` : `${label}: ${show(k, after[k])}`;
  }).join(" · ");
}
