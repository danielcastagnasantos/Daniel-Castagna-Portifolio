import { formatBRL } from "@/lib/money";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates";
import { billStatusLabel, kindLabel, methodLabel, reviewLabel } from "@/lib/labels";

export type ColType = "text" | "money" | "date" | "datetime" | "int" | "enum";
export interface Column {
  key: string; label: string; type: ColType; map?: Record<string, string>;
  sum?: boolean; align?: "right" | "left"; width?: number;
}
export type ReportId =
  | "daily_close" | "monthly_close" | "sales_by_employee" | "sales_by_method" | "entries_exits"
  | "expenses_by_category" | "bills" | "cash_flow" | "discrepancies" | "operations_history";

export interface ReportDef {
  id: ReportId; title: string; description: string; columns: Column[];
  employeeFilter?: boolean; kindFilter?: { label: string; options: Array<[string, string]> };
}

const money = (key: string, label: string, sum = true): Column => ({ key, label, type: "money", sum, align: "right" });
const statusMap = { ...billStatusLabel, open: "Em aberto" };
const actionMap = { insert: "Criado", update: "Alterado", delete: "Removido" };
const entityMap: Record<string, string> = {
  bill: "Boleto", bill_payment: "Pagamento de boleto", cash_shift: "Turno", cash_movement: "Movimentação", account: "Conta",
  account_transfer: "Transferência", account_adjustment: "Ajuste", profile: "Usuário", organization: "Empresa",
  supplier: "Fornecedor", receivable: "Conta a receber", register: "Caixa", payment_route: "Rota de pagamento",
  expense_category: "Categoria", bank_statement_line: "Linha de extrato", invitation: "Convite", bill_file: "Anexo",
};

export const REPORTS: ReportDef[] = [
  {
    id: "daily_close", title: "Fechamento diário", employeeFilter: true,
    description: "Cada turno do período: abertura, vendas por forma de pagamento, dinheiro esperado × contado e diferença.",
    columns: [
      { key: "opened_at", label: "Abertura", type: "datetime" }, { key: "employee", label: "Funcionário", type: "text" },
      { key: "closed_at", label: "Fechamento", type: "datetime" },
      money("opening_cents", "Abertura (R$)", false),
      money("sales_dinheiro", "Vendas dinheiro"), money("sales_pix", "Vendas Pix"), money("sales_debito", "Vendas débito"),
      money("sales_credito", "Vendas crédito"), money("sales_transferencia", "Vendas transf."),
      money("supply_cents", "Suprimentos"), money("withdrawal_cents", "Sangrias"), money("expense_cents", "Despesas/boletos em dinheiro"),
      money("expected_cents", "Esperado em dinheiro", false), money("counted_cents", "Contado", false),
      money("difference_cents", "Diferença"),
      { key: "review_status", label: "Conferência", type: "enum", map: reviewLabel },
      { key: "close_justification", label: "Justificativa", type: "text" },
    ],
  },
  {
    id: "monthly_close", title: "Fechamento mensal (por dia)",
    description: "Resumo diário do período: faturamento, estornos, despesas, diferenças de caixa e resultado.",
    columns: [
      { key: "day", label: "Dia", type: "date" }, money("sales_cents", "Faturamento"), money("other_in_cents", "Outras entradas"),
      money("refunds_cents", "Estornos"), money("expenses_cents", "Despesas"), money("result_cents", "Resultado do dia"),
      money("cash_diff_cents", "Diferenças de caixa"),
    ],
  },
  {
    id: "sales_by_employee", title: "Vendas por funcionário", employeeFilter: true,
    description: "Total vendido por operador, aberto por forma de pagamento.",
    columns: [
      { key: "employee", label: "Funcionário", type: "text" }, { key: "sales_count", label: "Vendas", type: "int", sum: true, align: "right" },
      money("total_cents", "Total vendido"), money("dinheiro", "Dinheiro"), money("pix", "Pix"), money("debito", "Débito"),
      money("credito", "Crédito"), money("transferencia", "Transferência"),
    ],
  },
  {
    id: "sales_by_method", title: "Vendas por forma de pagamento", employeeFilter: true,
    description: "Participação de cada forma de pagamento nas vendas do período.",
    columns: [
      { key: "method", label: "Forma de pagamento", type: "enum", map: methodLabel },
      { key: "sales_count", label: "Vendas", type: "int", sum: true, align: "right" }, money("total_cents", "Total"),
    ],
  },
  {
    id: "entries_exits", title: "Entradas e saídas do caixa", employeeFilter: true,
    description: "Todas as movimentações dos turnos, inclusive canceladas (marcadas).",
    kindFilter: { label: "Tipo", options: [["", "Todos"], ["in", "Somente entradas"], ["out", "Somente saídas"],
      ...Object.entries(kindLabel).filter(([k]) => k !== "bill_payment")] },
    columns: [
      { key: "created_at", label: "Data/hora", type: "datetime" }, { key: "employee", label: "Turno de", type: "text" },
      { key: "kind", label: "Tipo", type: "enum", map: kindLabel }, { key: "method", label: "Forma", type: "enum", map: methodLabel },
      { key: "category", label: "Categoria", type: "text" }, { key: "description", label: "Descrição", type: "text" },
      money("amount_cents", "Valor"),
      { key: "status", label: "Situação", type: "enum", map: { posted: "Válido", cancelled: "Cancelado" } },
      { key: "review_status", label: "Conferência", type: "enum", map: reviewLabel },
    ],
  },
  {
    id: "expenses_by_category", title: "Despesas por categoria",
    description: "Despesas e taxas lançadas no razão, já descontados os estornos.",
    columns: [{ key: "category", label: "Categoria", type: "text" }, { key: "entries_count", label: "Lançamentos", type: "int", sum: true, align: "right" }, money("total_cents", "Total")],
  },
  {
    id: "bills", title: "Boletos (pagos, pendentes e vencidos)",
    description: "Boletos pelo vencimento (ou data de pagamento, quando filtrado por pagos).",
    kindFilter: { label: "Situação", options: [["all", "Todos"], ["pending", "Pendentes (a vencer)"], ["overdue", "Vencidos"], ["paid", "Pagos"]] },
    columns: [
      { key: "due_date", label: "Vencimento", type: "date" }, { key: "supplier", label: "Fornecedor", type: "text" },
      { key: "description", label: "Descrição", type: "text" }, { key: "category", label: "Categoria", type: "text" },
      money("amount_cents", "Valor"), money("paid_cents", "Pago"), money("remaining_cents", "Em aberto"),
      { key: "paid_on", label: "Pago em", type: "date" }, { key: "situation", label: "Situação", type: "enum", map: statusMap },
    ],
  },
  {
    id: "cash_flow", title: "Fluxo de caixa",
    description: "Entradas e saídas de dinheiro nas contas líquidas (gaveta, cofre, banco, Pix), sem contar transferências entre elas.",
    columns: [
      { key: "day", label: "Dia", type: "date" }, money("inflow_cents", "Entradas"), money("outflow_cents", "Saídas"),
      money("net_cents", "Saldo do dia"), money("balance_cents", "Saldo acumulado", false),
    ],
  },
  {
    id: "discrepancies", title: "Divergências de caixa", employeeFilter: true,
    description: "Fechamentos e passagens de turno com diferença, com justificativa e situação da conferência.",
    columns: [
      { key: "at", label: "Data/hora", type: "datetime" }, { key: "origin", label: "Origem", type: "text" },
      { key: "employee", label: "Funcionário", type: "text" }, money("expected_cents", "Esperado", false), money("counted_cents", "Contado", false),
      money("difference_cents", "Diferença"), { key: "justification", label: "Justificativa", type: "text" },
      { key: "review_status", label: "Conferência", type: "enum", map: reviewLabel },
    ],
  },
  {
    id: "operations_history", title: "Histórico de operações (auditoria)", employeeFilter: true,
    description: "Quem criou, alterou ou cancelou cada registro, com data e hora.",
    kindFilter: { label: "Registro", options: [["", "Todos"], ...Object.entries(entityMap)] },
    columns: [
      { key: "created_at", label: "Data/hora", type: "datetime" }, { key: "actor", label: "Quem", type: "text" },
      { key: "action", label: "Ação", type: "enum", map: actionMap }, { key: "entity_type", label: "Registro", type: "enum", map: entityMap },
      { key: "reason", label: "Motivo", type: "text" },
    ],
  },
];

export const reportById = (id: string) => REPORTS.find((r) => r.id === id);

export type Row = Record<string, unknown>;

/** Valor exibível (tela, CSV e PDF usam a mesma formatação). */
export function formatCell(col: Column, row: Row): string {
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return col.type === "money" || col.type === "int" ? "—" : "";
  switch (col.type) {
    case "money": return formatBRL(Number(v));
    case "int": return String(v);
    case "date": return formatDateBR(String(v));
    case "datetime": return formatDateTimeBR(String(v));
    case "enum": return col.map?.[String(v)] ?? String(v);
    default: return String(v);
  }
}

export function totalsRow(def: ReportDef, rows: Row[]): Row | null {
  const sums = def.columns.filter((c) => c.sum);
  if (!sums.length || !rows.length) return null;
  const out: Row = { [def.columns[0].key]: "TOTAL" };
  for (const c of sums) out[c.key] = rows.reduce((a, r) => a + Number(r[c.key] ?? 0), 0);
  return out;
}
