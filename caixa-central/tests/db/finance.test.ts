import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMovement, balance, closeShift, createTestDb, expectError, openShift, uid, world, type World } from "./helpers";

let w: World;
beforeAll(async () => { w = await world(await createTestDb()); });
afterAll(async () => { await w.db.drop(); });
const mgr = () => w.db.as(w.manager);
const today = async () => (await w.db.sql("select private.local_date($1)::text d", [w.org]))[0].d as string;
const sum = async (where: string, ...p: unknown[]) =>
  Number((await w.db.sql(`select coalesce(sum(amount_cents),0) s from ledger_entries where ${where}`, p))[0].s);
const transfer = async (from: string, to: string, cents: number, over: Record<string, unknown> = {}) =>
  mgr().rpc("transfer_between_accounts", {
    p_from: from, p_to: to, p_amount_cents: cents, p_note: "teste", p_occurred_on: await today(), p_request_id: uid(), ...over,
  });

describe("livro-razão e contas", () => {
  it("venda no cartão vai para 'cartão a receber', não para o banco", async () => {
    const s = await openShift(w, w.cashier1, 0);
    await addMovement(w, w.cashier1, s, "sale", "credito", 100000);
    await addMovement(w, w.cashier1, s, "sale", "debito", 50000);
    expect(await balance(w.db, w.card)).toBe(150000);
    expect(await balance(w.db, w.bank)).toBe(0);
    await closeShift(w, w.cashier1, s, 0);
    const d = await mgr().rpc("dashboard_summary", { p_from: await today(), p_to: await today() });
    expect(d.card_receivable_cents).toBe(150000);
    expect(d.bank_balance_cents).toBe(0);
    expect(d.today_sales_cents).toBe(150000);
  });

  it("liquidação de cartão é transferência + taxa: não vira receita nova", async () => {
    const revenueBefore = await sum("nature='revenue'");
    await mgr().rpc("transfer_between_accounts", {
      p_from: w.card, p_to: w.bank, p_amount_cents: 100000, p_note: "Liquidação D+1", p_occurred_on: await today(),
      p_request_id: uid(), p_kind: "card_settlement", p_fee_cents: 2000,
    });
    expect(await balance(w.db, w.card)).toBe(50000);
    expect(await balance(w.db, w.bank)).toBe(98000);
    expect(await sum("nature='revenue'")).toBe(revenueBefore);
    expect(await sum("nature='fee'")).toBe(-2000);
  });

  it("transferência entre contas não é entrada nem saída no painel e fica rastreável", async () => {
    const before = await mgr().rpc("dashboard_summary", { p_from: await today(), p_to: await today() });
    const req = uid();
    const t1 = await transfer(w.bank, w.safe, 30000, { p_request_id: req });
    const t2 = await transfer(w.bank, w.safe, 30000, { p_request_id: req });
    expect(t2).toBe(t1);
    expect(await balance(w.db, w.bank)).toBe(68000);
    expect(await balance(w.db, w.safe)).toBe(30000);
    const after = await mgr().rpc("dashboard_summary", { p_from: await today(), p_to: await today() });
    expect(after.today_in_cents).toBe(before.today_in_cents);
    expect(after.today_out_cents).toBe(before.today_out_cents);
    expect(after.cash_balance_cents).toBe(before.cash_balance_cents + 30000);
    expect(after.bank_balance_cents).toBe(before.bank_balance_cents - 30000);
    const legs = await w.db.sql("select count(*)::int c, sum(amount_cents)::int s from ledger_entries where source_id=$1", [t1]);
    expect(legs[0]).toEqual({ c: 2, s: 0 });
    await mgr().rpc("cancel_account_transfer", { p_transfer_id: t1, p_reason: "valor digitado errado" });
    expect(await balance(w.db, w.bank)).toBe(98000);
    expect(await balance(w.db, w.safe)).toBe(0);
    await mgr().rpc("cancel_account_transfer", { p_transfer_id: t1, p_reason: "valor digitado errado" }); // idempotente
    expect(await balance(w.db, w.bank)).toBe(98000);
  });

  it("validações: mesma conta, gaveta, data futura, valor", async () => {
    await expectError(transfer(w.bank, w.bank, 100), "INVALID");
    await expectError(transfer(w.bank, w.registerAccount, 100), "CASH_DRAWER");
    await expectError(transfer(w.bank, w.safe, 0), "INVALID");
    await expectError(transfer(w.bank, w.safe, 100, { p_occurred_on: "2099-01-01" }), "INVALID");
    await expectError(w.db.as(w.cashier1).rpc("transfer_between_accounts", {
      p_from: w.bank, p_to: w.safe, p_amount_cents: 100, p_note: null, p_occurred_on: await today(), p_request_id: uid(),
    }), "FORBIDDEN");
  });

  it("sangria/suprimento com contrapartida não é despesa nem receita", async () => {
    const s = await openShift(w, w.cashier1, 0);
    await addMovement(w, w.cashier1, s, "sale", "dinheiro", 40000);
    const exp0 = await sum("nature='expense'");
    await addMovement(w, w.cashier1, s, "withdrawal", "dinheiro", 15000, { description: "Depósito no banco", counter: w.bank });
    await addMovement(w, w.manager, s, "supply", "dinheiro", 5000, { description: "Troco do cofre", counter: w.safe });
    expect(await sum("nature='expense'")).toBe(exp0);
    expect(await balance(w.db, w.bank)).toBe(98000 + 15000);
    expect(await balance(w.db, w.safe)).toBe(-5000);
    const sm = await mgr().rpc("shift_summary", { p_shift_id: s });
    expect(sm.expected_cents).toBe(40000 - 15000 + 5000);
    await closeShift(w, w.cashier1, s, 30000);
  });

  it("ajuste manual: só gerência, motivo obrigatório, nunca na gaveta, idempotente", async () => {
    await expectError(mgr().rpc("post_account_adjustment", { p_account_id: w.bank, p_amount_cents: 500, p_reason: "curto", p_request_id: uid() }), "REASON_REQUIRED");
    await expectError(mgr().rpc("post_account_adjustment", { p_account_id: w.registerAccount, p_amount_cents: 500, p_reason: "ajuste da gaveta aqui", p_request_id: uid() }), "CASH_DRAWER");
    const req = uid();
    const before = await balance(w.db, w.bank);
    await mgr().rpc("post_account_adjustment", { p_account_id: w.bank, p_amount_cents: -1500, p_reason: "tarifa não lançada em março", p_request_id: req });
    await mgr().rpc("post_account_adjustment", { p_account_id: w.bank, p_amount_cents: -1500, p_reason: "tarifa não lançada em março", p_request_id: req });
    expect(await balance(w.db, w.bank)).toBe(before - 1500);
    await expect(w.db.sql("delete from account_adjustments")).rejects.toThrow(/imutável/);
  });

  it("contas: saldo inicial vira lançamento, nome único, rota de pagamento validada", async () => {
    const acc = await mgr().rpc("create_account", { p_name: "Banco do Brasil", p_type: "bank", p_opening_cents: 250000, p_bank_name: "BB", p_opening_date: null });
    expect(await balance(w.db, acc)).toBe(250000);
    await expectError(mgr().rpc("create_account", { p_name: "banco do brasil", p_type: "bank", p_opening_cents: 0, p_bank_name: null, p_opening_date: null }), "DUPLICATE");
    await expectError(mgr().rpc("create_account", { p_name: "Outra gaveta", p_type: "cash_drawer", p_opening_cents: 0, p_bank_name: null, p_opening_date: null }), "INVALID");
    await expectError(mgr().rpc("set_payment_route", { p_method: "credito", p_account_id: acc }), "INVALID");
    await mgr().rpc("set_payment_route", { p_method: "transferencia", p_account_id: acc });
    const s = await openShift(w, w.cashier2, 30000);
    await addMovement(w, w.cashier2, s, "sale", "transferencia", 7000);
    expect(await balance(w.db, acc)).toBe(257000);
    await expectError(mgr().rpc("set_account_active", { p_account_id: acc, p_active: false }), "IN_USE");
    await closeShift(w, w.cashier2, s, 30000);
  });

  it("contas a receber: baixa lança receita uma vez; cartão a receber é conta, não título", async () => {
    const id = await mgr().rpc("create_receivable", { p_customer: "Bar do Zé", p_description: "Pedido fiado", p_amount_cents: 80000, p_due_date: await today(), p_request_id: uid() });
    await expectError(mgr().rpc("receive_receivable", { p_id: id, p_account_id: w.registerAccount, p_received_on: await today(), p_request_id: uid() }), "INVALID");
    const dash0 = await mgr().rpc("dashboard_summary", { p_from: await today(), p_to: await today() });
    expect(dash0.receivables_open_cents).toBe(80000);
    const bankBefore = await balance(w.db, w.bank);
    await mgr().rpc("receive_receivable", { p_id: id, p_account_id: w.bank, p_received_on: await today(), p_request_id: uid() });
    await mgr().rpc("receive_receivable", { p_id: id, p_account_id: w.bank, p_received_on: await today(), p_request_id: uid() });
    expect(await balance(w.db, w.bank)).toBe(bankBefore + 80000);
    const dash1 = await mgr().rpc("dashboard_summary", { p_from: await today(), p_to: await today() });
    expect(dash1.receivables_open_cents).toBe(0);
  });
});

describe("conciliação de extratos", () => {
  let importId: string;
  const line = (d: string, cents: number, desc: string, key: string, force = false) =>
    ({ posted_on: d, amount_cents: cents, description: desc, fitid: null, key, force });

  it("importa, detecta duplicidade (arquivo repetido e linhas repetidas) e não lança nada no razão", async () => {
    const ledgerBefore = (await w.db.sql("select count(*)::int c from ledger_entries"))[0].c;
    const d = await today();
    const lines = [line(d, 100000, "CRED LIQ CARTAO", "k1"), line(d, -2500, "TARIFA PACOTE", "k2"), line(d, -4400, "PIX FORNECEDOR", "k3")];
    const r = await mgr().rpc("import_bank_statement", { p_account_id: w.bank, p_filename: "extrato.csv", p_format: "csv", p_file_hash: "hash1", p_lines: JSON.stringify(lines) });
    importId = r.import_id;
    expect(r).toMatchObject({ imported: 3, duplicates: 0 });
    await expectError(mgr().rpc("import_bank_statement", { p_account_id: w.bank, p_filename: "extrato.csv", p_format: "csv", p_file_hash: "hash1", p_lines: JSON.stringify(lines) }), "FILE_ALREADY_IMPORTED");
    // arquivo diferente que repete 2 linhas e traz 1 nova
    const r2 = await mgr().rpc("import_bank_statement", { p_account_id: w.bank, p_filename: "extrato2.csv", p_format: "csv", p_file_hash: "hash2", p_lines: JSON.stringify([lines[0], lines[1], line(d, -1000, "NOVA", "k4")]) });
    expect(r2).toMatchObject({ imported: 1, duplicates: 2 });
    expect((await mgr().rpc("statement_existing_keys", { p_account_id: w.bank, p_keys: ["k1", "kx"] }))).toEqual(["k1"]);
    expect((await w.db.sql("select count(*)::int c from ledger_entries"))[0].c).toBe(ledgerBefore);
    await expectError(mgr().rpc("import_bank_statement", { p_account_id: w.card, p_filename: "x.csv", p_format: "csv", p_file_hash: "h3", p_lines: JSON.stringify(lines) }), "INVALID");
    await expectError(w.db.as(w.cashier1).rpc("import_bank_statement", { p_account_id: w.bank, p_filename: "x.csv", p_format: "csv", p_file_hash: "h4", p_lines: JSON.stringify(lines) }), "FORBIDDEN");
  });

  it("concilia linha com lançamento de mesmo valor; sugere candidatos; recusa valor diferente e dupla conciliação", async () => {
    const [lineRow] = await w.db.sql("select id from bank_statement_lines where dedupe_key='k1'");
    const cands = await mgr().rpc("reconciliation_candidates", { p_line_id: lineRow.id });
    expect(cands.length).toBe(1);
    expect(Number(cands[0].amount_cents)).toBe(100000);
    await mgr().rpc("reconcile_statement_line", { p_line_id: lineRow.id, p_entry_id: cands[0].entry_id });
    expect((await mgr().rpc("reconciliation_candidates", { p_line_id: lineRow.id })).length).toBe(0); // já conciliado: não é mais candidato
    const [tarifa] = await w.db.sql("select id from bank_statement_lines where dedupe_key='k2'");
    await expectError(mgr().rpc("reconcile_statement_line", { p_line_id: tarifa.id, p_entry_id: cands[0].entry_id }), "AMOUNT_MISMATCH");
    const [again] = await w.db.sql("select id from bank_statement_lines where dedupe_key='k3'");
    const other = await w.db.sql("select id from ledger_entries where account_id=$1 and amount_cents=-4400", [w.bank]);
    expect(other.length).toBe(0);
    await expectError(mgr().rpc("reconcile_statement_line", { p_line_id: lineRow.id, p_entry_id: cands[0].entry_id }), "ALREADY_RESOLVED");
    expect(again.id).toBeTruthy();
  });

  it("linha sem correspondente vira lançamento (tarifa) uma única vez; desfazer conciliação exige motivo", async () => {
    const [tarifa] = await w.db.sql("select id from bank_statement_lines where dedupe_key='k2'");
    const before = await balance(w.db, w.bank);
    const entry = await mgr().rpc("create_entry_from_statement_line", { p_line_id: tarifa.id, p_nature: "fee", p_category_id: null, p_description: null });
    expect(await balance(w.db, w.bank)).toBe(before - 2500);
    await expectError(mgr().rpc("create_entry_from_statement_line", { p_line_id: tarifa.id, p_nature: "fee", p_category_id: null, p_description: null }), "ALREADY_RESOLVED");
    expect(Number(entry)).toBeGreaterThan(0);
    await expectError(mgr().rpc("unreconcile_statement_line", { p_line_id: tarifa.id, p_reason: "engano total" }), "INVALID");
    const [k1] = await w.db.sql("select id from bank_statement_lines where dedupe_key='k1'");
    await expectError(mgr().rpc("unreconcile_statement_line", { p_line_id: k1.id, p_reason: "" }), "REASON_REQUIRED");
    await mgr().rpc("unreconcile_statement_line", { p_line_id: k1.id, p_reason: "conciliei a linha errada" });
    expect((await w.db.sql("select status from bank_statement_lines where id=$1", [k1.id]))[0].status).toBe("unmatched");
    const [k3] = await w.db.sql("select id from bank_statement_lines where dedupe_key='k3'");
    await expectError(mgr().rpc("create_entry_from_statement_line", { p_line_id: k3.id, p_nature: "other_income", p_category_id: null, p_description: null }), "INVALID");
    await mgr().rpc("ignore_statement_line", { p_line_id: k3.id, p_reason: "pertence a outra conta" });
    expect(importId).toBeTruthy();
  });
});

describe("relatórios com dados reais", () => {
  it("cada relatório devolve linhas coerentes com o razão", async () => {
    const d = await today();
    const sd = await openShift(w, w.cashier1, 30000);
    await closeShift(w, w.cashier1, sd, 29900, "faltou troco");
    const rep = (report: string, extra: Record<string, unknown> = {}) =>
      mgr().rpc("report_data", { p_report: report, p_from: d, p_to: d, p_employee: null, p_kind: null, ...extra }) as Promise<any[]>;
    const daily = await rep("daily_close");
    expect(daily.length).toBeGreaterThan(0);
    expect(daily.every((r) => r.employee && r.expected_cents !== undefined)).toBe(true);
    const monthly = await rep("monthly_close");
    expect(monthly.length).toBe(1);
    const [rev] = await w.db.sql("select sum(amount_cents) s from ledger_entries where nature='revenue'");
    expect(Number(monthly[0].sales_cents)).toBe(Number(rev.s));
    const byMethod = await rep("sales_by_method");
    expect(byMethod.reduce((a, r) => a + Number(r.total_cents), 0)).toBe(Number(rev.s) - 80000); // sem a baixa de título
    expect((await rep("sales_by_employee")).length).toBeGreaterThan(0);
    expect((await rep("entries_exits")).length).toBeGreaterThan(0);
    expect((await rep("entries_exits", { p_kind: "out" })).every((r) => r.direction === "out")).toBe(true);
    const cats = await rep("expenses_by_category");
    expect(cats.length).toBeGreaterThan(0);
    expect((await rep("bills", { p_from: "2026-01-01", p_to: "2027-12-31", p_kind: "all" }))).toBeTruthy();
    const flow = await rep("cash_flow");
    expect(flow.length).toBe(1);
    expect(Number(flow[0].inflow_cents)).toBeGreaterThan(0);
    // saldo corrente do fluxo = saldo líquido das contas líquidas (gaveta, cofre, banco, pix)
    const [liquid] = await w.db.sql("select sum(l.amount_cents) s from ledger_entries l join accounts a on a.id=l.account_id where a.type in ('cash_drawer','safe','bank','pix')");
    expect(Number(flow[0].balance_cents)).toBe(Number(liquid.s) - 0);
    const disc = await rep("discrepancies");
    expect(disc.map((r) => [r.origin, Number(r.difference_cents)])).toContainEqual(["Fechamento", -100]);
    expect(disc.every((r) => Number(r.difference_cents) !== 0)).toBe(true);
    expect((await rep("operations_history")).length).toBeGreaterThan(0);
    await expectError(rep("nope"), "INVALID");
    await expectError(rep("daily_close", { p_from: d, p_to: "1999-01-01" }), "INVALID");
  });
});
