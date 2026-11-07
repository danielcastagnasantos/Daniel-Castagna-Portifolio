// Dados FICTÍCIOS (nomes e valores inventados) usados apenas para renderizar telas em teste.
const ORG = "00000000-0000-4000-8000-000000000001";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = new Date();
const ago = (h) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const day = (d) => new Date(NOW.getTime() + d * 86400_000).toISOString().slice(0, 10);

const U = { owner: id(10), manager: id(11), cashier: id(12) };
const profile = (uid, name, role) => ({ id: uid, organization_id: ORG, full_name: name, email: `${role}@exemplo.com`, role, active: true, must_change_password: false, email_notifications: true, created_at: ago(900) });
const users = Object.fromEntries([
  [U.owner, { profile: profile(U.owner, "Carlos Mendes", "owner") }],
  [U.manager, { profile: profile(U.manager, "Daniel Mendes", "manager") }],
  [U.cashier, { profile: profile(U.cashier, "Ana Souza", "cashier") }],
].map(([k, v]) => [k, { ...v, auth: { id: k, aud: "authenticated", role: "authenticated", email: v.profile.email, user_metadata: {}, app_metadata: {} } }]));

const shiftOpen = { id: id(100), register_id: id(20), employee_id: U.cashier, opened_at: ago(3), opening_cents: 15000, status: "open", closed_at: null, counted_cents: null, expected_cents: null, difference_cents: null, handoff_expected_cents: 20000, handoff_difference_cents: 0, handoff_note: null, close_justification: null, review_status: "pending", review_note: null, closed_by: null, blind: false, profiles: { full_name: "Ana Souza" } };
const shiftClosed = (n, diff) => ({ ...shiftOpen, id: id(101 + n), status: "closed", opened_at: ago(30 + n * 24), closed_at: ago(22 + n * 24), counted_cents: 61000 + diff, expected_cents: 61000, difference_cents: diff, close_justification: diff ? "Troco devolvido a mais" : null, review_status: diff ? "pending" : "approved", closed_by: U.cashier });
const summary = { shift_id: shiftOpen.id, status: "open", opening_cents: 20000, blind: false, expected_cents: 60000, counted_cents: null, difference_cents: null, sales_by_method: { dinheiro: 50000, pix: 30000, credito: 18990 }, totals: { sales: 98990, other_in: 0, supply: 0, withdrawal: 10000, expense: 0, refund: 0, cash_in: 50000, cash_out: 10000, count: 7 } };
const mv = (n, kind, dir, method, cents, desc, extra = {}) => ({ id: id(200 + n), kind, direction: dir, payment_method: method, amount_cents: cents, description: desc, status: "posted", review_status: "not_required", created_at: ago(3 - n * 0.4), created_by: U.cashier, cancel_reason: null, shift_id: shiftOpen.id, expense_categories: null, ...extra });
const movements = [mv(1, "sale", "in", "dinheiro", 32000, "Venda balcão"), mv(2, "sale", "in", "pix", 30000, null), mv(3, "withdrawal", "out", "dinheiro", 10000, "Sangria para o cofre", { review_status: "pending" }), mv(4, "sale", "in", "dinheiro", 18000, null), mv(5, "sale", "in", "credito", 18990, "Cartão"), mv(6, "expense", "out", "dinheiro", 1500, "Gelo", { expense_categories: { name: "Material de limpeza / escritório" } })];

const bill = (n, supplier, desc, cents, dueOffset, status = "open", paid = 0) => ({ id: id(300 + n), supplier_id: id(400 + n), description: desc, category_id: id(500), amount_cents: cents, paid_cents: paid, due_date: day(dueOffset), paid_on: status === "paid" ? day(-1) : null, status, barcode: n === 1 ? "23790123456000012345678901234567812340000010000" : null, notes: null, installment_no: 1, installments_total: 1, series_kind: "single", suppliers: { name: supplier }, expense_categories: { name: "Fornecedores / Mercadoria" } });
const bills = [bill(1, "Ambev Distribuição", "Pedido 4521 — cerveja", 1850000, -3), bill(2, "Coca-Cola FEMSA", "Pedido 118 — refrigerantes", 920050, 0), bill(3, "Energia Elétrica", "Conta de março", 187432, 4), bill(4, "Aluguel do galpão", "Mensalidade", 650000, 9, "partial", 200000), bill(5, "Transportadora Rota", "Frete 03/03", 45000, -20, "paid", 45000)];

const accounts = [
  { account_id: id(20), name: "Gaveta - Caixa principal", type: "cash_drawer", bank_name: null, active: true, balance_cents: 60000, entries_count: 24 },
  { account_id: id(21), name: "Cofre", type: "safe", bank_name: null, active: true, balance_cents: 1250000, entries_count: 6 },
  { account_id: id(22), name: "Conta bancária", type: "bank", bank_name: "Banco do Brasil", active: true, balance_cents: 4378910, entries_count: 40 },
  { account_id: id(23), name: "Conta Pix", type: "pix", bank_name: null, active: true, balance_cents: 812050, entries_count: 31 },
  { account_id: id(24), name: "Cartão a receber", type: "card_receivable", bank_name: null, active: true, balance_cents: 2210775, entries_count: 18 },
];
const dash = { today: day(0), today_in_cents: 98990, today_out_cents: 1500, today_sales_cents: 98990, period_sales_cents: 2841500, period_refunds_cents: 12000, period_expenses_cents: 1234000, period_other_in_cents: 0, period_cash_diff_cents: -2000, cash_balance_cents: 1310000, bank_balance_cents: 5190960, card_receivable_cents: 2210775, payables_open_cents: 3652482, payables_open_count: 4, payables_overdue_cents: 1850000, payables_overdue_count: 1, payables_due_7d_cents: 1107482, payables_due_today_cents: 920050, receivables_open_cents: 310000, receivables_overdue_cents: 0, open_shifts: [{ id: shiftOpen.id, employee: "Ana Souza", register: "Caixa principal", opened_at: ago(3), expected_cents: 60000 }], pending_movement_reviews: 1, pending_shift_reviews: 1, shifts_with_diff_period: 2 };
const series = Array.from({ length: 21 }, (_, i) => ({ bucket: day(i - 20), sales: 90000 + ((i * 7919) % 70000) + i * 1500, other_in: 0, expenses: 30000 + ((i * 4001) % 50000), refunds: 0 }));

const reportRows = {
  sales_by_method: [{ method: "dinheiro", sales_count: 128, total_cents: 1320050 }, { method: "pix", sales_count: 96, total_cents: 905000 }, { method: "credito", sales_count: 40, total_cents: 616450 }],
  daily_close: [{ shift_id: shiftOpen.id, opened_at: ago(30), closed_at: ago(22), employee: "Ana Souza", register: "Caixa principal", opening_cents: 20000, sales_dinheiro: 50000, sales_pix: 30000, sales_debito: 0, sales_credito: 18990, sales_transferencia: 0, supply_cents: 0, withdrawal_cents: 10000, expense_cents: 1500, expected_cents: 58500, counted_cents: 58000, difference_cents: -500, status: "closed", review_status: "pending", close_justification: "Troco" }],
};
const notifs = [
  { id: id(600), kind: "bill_overdue", severity: "critical", title: "Boleto vencido: Ambev Distribuição", body: "R$ 18.500,00 venceu em 01/11/2026.", link: "/boletos/" + id(301), created_at: ago(5), resolved_at: null, is_read: false },
  { id: id(601), kind: "cash_difference", severity: "warning", title: "Diferença no fechamento do caixa", body: "Diferença de -R$ 5,00 no fechamento.", link: "/caixa/turnos/" + id(101), created_at: ago(26), resolved_at: null, is_read: true },
  { id: id(602), kind: "bill_due_soon", severity: "warning", title: "Boleto vence hoje: Coca-Cola FEMSA", body: "R$ 9.200,50", link: "/boletos/" + id(302), created_at: ago(2), resolved_at: null, is_read: false },
];

export const fixtures = {
  users,
  rpc: {
    register_status: (_a, user) => [{ register_id: id(20), register_name: "Caixa principal", shift_id: shiftOpen.id, employee_id: U.cashier, employee_name: "Ana Souza", opened_at: ago(3), is_mine: user?.profile.role === "cashier" }],
    shift_summary: summary, cash_counter_accounts: [{ id: id(21), name: "Cofre", type: "safe" }, { id: id(22), name: "Conta bancária", type: "bank" }],
    refresh_notifications: 0, dashboard_summary: dash, dashboard_series: series,
    report_data: (a) => reportRows[a.p_report] ?? [],
    reconciliation_candidates: [],
  },
  tables: {
    profiles: (user) => (user ? [user.profile, ...Object.values(users).map((u) => u.profile).filter((p) => p.id !== user.profile.id)] : []),
    organizations: [{ id: ORG, name: "Distribuidora Modelo", blind_close: false, review_threshold_cents: 20000, diff_alert_cents: 0, shift_max_hours: 12, change_fund_cents: 15000 }],
    notification_feed: notifs,
    cash_shifts: (user, url) => (url.searchParams.get("status") === "eq.open" ? [shiftOpen] : [shiftOpen, shiftClosed(0, -500), shiftClosed(1, 0), shiftClosed(2, 0)]),
    cash_movements: movements,
    expense_categories: [{ id: id(500), name: "Fornecedores / Mercadoria", kind: "expense", active: true }, { id: id(501), name: "Aluguel", kind: "expense", active: true }, { id: id(502), name: "Energia elétrica", kind: "expense", active: true }],
    registers: [{ id: id(20), name: "Caixa principal", active: true, account_id: id(20) }],
    bills, suppliers: [1, 2, 3, 4].map((n) => ({ id: id(400 + n), name: bills[n - 1].suppliers.name, document: "12.345.678/0001-9" + n, phone: "(27) 99999-000" + n, email: null, notes: null, active: true })),
    accounts: accounts.map((a) => ({ id: a.account_id, name: a.name, type: a.type })),
    account_balances: accounts,
    account_transfers: [{ id: id(700), from_account_id: id(24), to_account_id: id(22), amount_cents: 1000000, kind: "card_settlement", fee_cents: 19000, note: "Cielo — vendas de 02/11", occurred_on: day(-2), status: "posted", cancel_reason: null }],
    ledger_entries: [{ id: 9, occurred_at: ago(3), occurred_on: day(0), amount_cents: 1000000, nature: "transfer", description: "Liquidação", is_reversal: false, source_type: "account_transfer", expense_categories: null }, { id: 8, occurred_at: ago(30), occurred_on: day(-1), amount_cents: -45000, nature: "expense", description: "Boleto: Transportadora Rota - Frete", is_reversal: false, source_type: "bill_payment", expense_categories: { name: "Frete" } }],
    bank_statement_lines: [{ id: id(800), posted_on: day(-1), amount_cents: 1000000, description: "CRED LIQ CARTAO CIELO", status: "unmatched", note: null }, { id: id(801), posted_on: day(-1), amount_cents: -2590, description: "TARIFA PACOTE SERVICOS", status: "unmatched", note: null }],
    bill_payments: [{ id: id(900), amount_cents: 200000, paid_on: day(-5), method: "pix", note: null, status: "posted", cancel_reason: null, account_id: id(22), created_at: ago(120), confirmed_by: U.manager }],
    bill_files: [{ id: id(950), kind: "boleto", filename: "boleto-aluguel-marco.pdf", payment_id: null, created_at: ago(200), size_bytes: 120000 }],
    audit_log: [{ id: 1, created_at: ago(2), actor_id: U.manager, action: "update", entity_type: "bill", entity_id: id(301), before: { due_date: day(-5), amount_cents: 1800000 }, after: { due_date: day(-3), amount_cents: 1850000 }, reason: null }],
    receivables: [{ id: id(1000), customer: "Bar do Zé", description: "Pedido 118 — 20 caixas", amount_cents: 310000, due_date: day(6), status: "open", received_on: null }],
    invitations: [], payment_routes: [{ payment_method: "pix", account_id: id(23) }, { payment_method: "debito", account_id: id(24) }, { payment_method: "credito", account_id: id(24) }, { payment_method: "transferencia", account_id: id(22) }],
  },
  ids: { U, id },
};
