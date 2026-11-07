import { z } from "zod";
import { MAX_CENTS, parseMoneyToCents } from "@/lib/money";
import { isISODate } from "@/lib/dates";

const text = (min: number, max: number, label: string) =>
  z.string({ error: `${label} é obrigatório` }).trim().min(min, `${label}: mínimo ${min} caracteres`).max(max, `${label}: máximo ${max} caracteres`);
const optionalText = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`).optional().transform((v) => (v ? v : null));

/** Valor em reais digitado ("1.234,56") -> centavos inteiros. */
export const money = (label = "Valor", opts: { allowZero?: boolean; allowNegative?: boolean } = {}) =>
  z.string({ error: `${label} é obrigatório` }).transform((v, ctx) => {
    const cents = parseMoneyToCents(v);
    if (cents === null) { ctx.addIssue({ code: "custom", message: `${label} inválido. Ex.: 1.234,56` }); return z.NEVER; }
    if (!opts.allowNegative && cents < 0) { ctx.addIssue({ code: "custom", message: `${label} não pode ser negativo` }); return z.NEVER; }
    if (!opts.allowZero && cents === 0) { ctx.addIssue({ code: "custom", message: `${label} deve ser maior que zero` }); return z.NEVER; }
    if (Math.abs(cents) > MAX_CENTS) { ctx.addIssue({ code: "custom", message: `${label} acima do limite` }); return z.NEVER; }
    return cents;
  });

export const uuid = (label = "Registro") => z.string({ error: `${label} inválido` }).uuid(`${label} inválido`);
export const requestId = uuid("Chave da operação");
const optionalUuid = z.string().uuid().optional().or(z.literal("")).transform((v) => (v ? v : null));
const isoDate = (label: string) => z.string().refine(isISODate, `${label} inválida`);
const bool = z.string().optional().transform((v) => v === "on" || v === "true" || v === "1");

export const METHODS = ["dinheiro", "pix", "debito", "credito", "transferencia"] as const;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export const setupSchema = z.object({
  token: z.string().optional().default(""),
  org_name: text(2, 120, "Nome da distribuidora"),
  owner_name: text(2, 120, "Seu nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(10, "A senha deve ter ao menos 10 caracteres").max(72, "Senha muito longa"),
  password2: z.string(),
}).refine((v) => v.password === v.password2, { path: ["password2"], message: "As senhas não conferem" });

export const newPasswordSchema = z.object({
  password: z.string().min(10, "A senha deve ter ao menos 10 caracteres").max(72, "Senha muito longa"),
  password2: z.string(),
}).refine((v) => v.password === v.password2, { path: ["password2"], message: "As senhas não conferem" });

export const openShiftSchema = z.object({
  request_id: requestId,
  register_id: uuid("Caixa"),
  opening: money("Valor contado na abertura", { allowZero: true }),
  note: optionalText(500),
});

export const movementSchema = z.object({
  request_id: requestId,
  shift_id: uuid("Turno"),
  kind: z.enum(["sale", "other_in", "supply", "refund", "expense", "withdrawal"], { error: "Tipo inválido" }),
  method: z.enum(METHODS, { error: "Forma de pagamento inválida" }).default("dinheiro"),
  amount: money(),
  description: optionalText(250),
  category_id: optionalUuid,
  counter_account_id: optionalUuid,
  corrects_shift_id: optionalUuid,
});

export const closeShiftSchema = z.object({
  request_id: requestId,
  shift_id: uuid("Turno"),
  counted: money("Dinheiro contado", { allowZero: true }),
  justification: optionalText(500),
});

/** Fechamento simples: totais do turno por forma de pagamento + dinheiro contado. */
export const closeSimpleSchema = z.object({
  request_id: requestId,
  shift_id: uuid("Turno"),
  cash_sales: money("Vendas em dinheiro", { allowZero: true }).optional().default(0),
  pix: money("Vendas no Pix", { allowZero: true }).optional().default(0),
  debit: money("Vendas no débito", { allowZero: true }).optional().default(0),
  credit: money("Vendas no crédito", { allowZero: true }).optional().default(0),
  transfer: money("Vendas por transferência", { allowZero: true }).optional().default(0),
  expense: money("Despesa em dinheiro", { allowZero: true }).optional().default(0),
  expense_note: optionalText(250),
  counted: money("Dinheiro contado na gaveta", { allowZero: true }),
  justification: optionalText(500),
});
export const changeFundSchema = z.object({ amount: money("Troco", { allowZero: true }) });

export const cancelSchema = z.object({
  id: uuid(),
  reason: text(5, 300, "Motivo"),
});
export const reviewMovementSchema = z.object({
  id: uuid(), decision: z.enum(["approve", "reject"]), note: optionalText(300),
});
export const reviewShiftSchema = z.object({
  id: uuid(), status: z.enum(["approved", "flagged"]), note: optionalText(500),
});

export const supplierSchema = z.object({
  id: optionalUuid,
  name: text(2, 140, "Nome do fornecedor"),
  document: optionalText(24), phone: optionalText(30),
  email: z.string().trim().max(160).optional().transform((v) => v || null),
  notes: optionalText(500),
  active: z.string().optional().transform((v) => v !== "false"),
});

export const billSchema = z.object({
  request_id: requestId,
  supplier_name: text(2, 140, "Quem cobra"),
  description: text(2, 200, "Descrição"),
  category_id: optionalUuid,
  amount: money("Valor"),
  first_due: isoDate("Data de vencimento"),
  mode: z.enum(["single", "installments", "recurring"]).default("single"),
  count: z.coerce.number().int().min(1).max(60).default(1),
  interval: z.enum(["month", "week"]).default("month"),
  barcode: optionalText(80),
  notes: optionalText(500),
});
export const billUpdateSchema = z.object({
  id: uuid(), supplier_name: text(2, 140, "Quem cobra"), description: text(2, 200, "Descrição"), category_id: optionalUuid,
  amount: money("Valor"), due_date: isoDate("Data de vencimento"), barcode: optionalText(80), notes: optionalText(500),
});
export const payBillSchema = z.object({
  request_id: requestId, bill_id: uuid("Boleto"), amount: money("Valor pago"), paid_on: isoDate("Data do pagamento"),
  account_id: uuid("Conta"),
  method: z.enum(["pix", "boleto", "dinheiro", "transferencia", "debito_automatico", "outro"]),
  note: optionalText(250), confirmed: bool,
});
export const registerFileSchema = z.object({
  bill_id: uuid("Boleto"), payment_id: optionalUuid, kind: z.enum(["boleto", "receipt"]),
  path: text(10, 400, "Caminho"), filename: text(1, 200, "Arquivo"),
});

export const accountSchema = z.object({
  name: text(2, 80, "Nome da conta"),
  type: z.enum(["safe", "bank", "pix", "card_receivable"], { error: "Tipo inválido" }),
  bank_name: optionalText(80),
  opening: money("Saldo inicial", { allowZero: true, allowNegative: true }).optional().default(0),
  opening_date: z.string().optional().transform((v) => (v && isISODate(v) ? v : null)),
});
export const transferSchema = z.object({
  request_id: requestId, from: uuid("Conta de origem"), to: uuid("Conta de destino"), amount: money(),
  occurred_on: isoDate("Data"), note: optionalText(250),
  kind: z.enum(["transfer", "card_settlement"]).default("transfer"),
  fee: money("Taxa", { allowZero: true }).optional().default(0),
});
export const adjustmentSchema = z.object({
  request_id: requestId, account_id: uuid("Conta"),
  amount: money("Valor do ajuste", { allowNegative: true }), reason: text(10, 300, "Motivo (mínimo 10 caracteres)"),
});

export const receivableSchema = z.object({
  request_id: requestId, customer: text(2, 140, "Cliente"), description: optionalText(250),
  amount: money(), due_date: isoDate("Vencimento"),
});
export const receiveSchema = z.object({
  request_id: requestId, id: uuid(), account_id: uuid("Conta"), received_on: isoDate("Data do recebimento"),
});

export const inviteSchema = z.object({
  full_name: text(2, 120, "Nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(["owner", "manager", "cashier"]),
  mode: z.enum(["temp_password", "email_invite"]).default("temp_password"),
});
export const roleSchema = z.object({ id: uuid(), role: z.enum(["owner", "manager", "cashier"]) });
export const activeSchema = z.object({ id: uuid(), active: z.enum(["true", "false"]).transform((v) => v === "true") });
export const userIdSchema = z.object({ id: uuid() });

export const settingsSchema = z.object({
  name: text(2, 120, "Nome da empresa"),
  blind_close: bool,
  review_threshold: money("Limite de conferência", { allowZero: true }),
  diff_alert: money("Alerta de diferença", { allowZero: true }),
  shift_max_hours: z.coerce.number().int().min(1, "Mínimo 1 hora").max(72, "Máximo 72 horas"),
});
export const registerNameSchema = z.object({ name: text(2, 80, "Nome do caixa") });
export const categorySchema = z.object({
  id: optionalUuid, name: text(2, 60, "Nome da categoria"), kind: z.enum(["expense", "income"]).default("expense"),
  active: z.string().optional().transform((v) => v !== "false"),
});
export const routeSchema = z.object({ method: z.enum(["pix", "debito", "credito", "transferencia"]), account_id: uuid("Conta") });
export const accountActiveSchema = z.object({ id: uuid(), active: z.enum(["true", "false"]).transform((v) => v === "true") });

export const statementLineSchema = z.object({
  posted_on: isoDate("Data"), amount_cents: z.number().int(), description: z.string().max(300),
  fitid: z.string().nullable().optional(), key: z.string().min(1).max(300), force: z.boolean().optional().default(false),
});
