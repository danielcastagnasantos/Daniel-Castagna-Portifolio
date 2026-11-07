export type Role = "owner" | "manager" | "cashier";
export const roleLabel: Record<Role, string> = { owner: "Proprietário", manager: "Gerente", cashier: "Operador de caixa" };

export const methodLabel: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "Pix", debito: "Cartão de débito", credito: "Cartão de crédito", transferencia: "Transferência",
};
export const PAYMENT_METHODS = ["dinheiro", "pix", "debito", "credito", "transferencia"] as const;

export const kindLabel: Record<string, string> = {
  sale: "Venda", other_in: "Outra entrada", supply: "Suprimento", refund: "Estorno de venda",
  expense: "Despesa", withdrawal: "Sangria", bill_payment: "Pagamento de boleto",
};
export const accountTypeLabel: Record<string, string> = {
  cash_drawer: "Caixa físico (gaveta)", safe: "Cofre", bank: "Conta bancária", pix: "Conta Pix", card_receivable: "Cartão a receber",
};
export const natureLabel: Record<string, string> = {
  opening_balance: "Saldo inicial", revenue: "Faturamento", refund: "Estorno", other_income: "Outra entrada",
  expense: "Despesa", fee: "Taxa", transfer: "Transferência", contribution: "Aporte", withdrawal: "Retirada",
  cash_difference: "Diferença de caixa", adjustment: "Ajuste manual",
};
export const billStatusLabel: Record<string, string> = {
  open: "Em aberto", partial: "Pago parcialmente", paid: "Pago", cancelled: "Cancelado", overdue: "Vencido",
};
export const payMethodLabel: Record<string, string> = {
  pix: "Pix", boleto: "Boleto bancário", dinheiro: "Dinheiro", transferencia: "Transferência",
  debito_automatico: "Débito automático", outro: "Outro",
};
export const reviewLabel: Record<string, string> = {
  pending: "Aguardando conferência", approved: "Conferido", flagged: "Com problema",
  not_required: "—", rejected: "Recusado",
};
