import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { balance, createTestDb, expectError, openShift, uid, world, type World } from "./helpers";

let w: World;
beforeAll(async () => { w = await world(await createTestDb()); });
afterAll(async () => { await w.db.drop(); });

const simple = (user: string, shift: string, o: Partial<Record<string, unknown>> = {}) =>
  w.db.as(user).rpc("close_shift_simple", {
    p_shift_id: shift, p_cash_sales: 0, p_pix: 0, p_debit: 0, p_credit: 0, p_transfer: 0,
    p_expense_cents: 0, p_expense_note: null, p_counted_cents: 15000, p_justification: null, p_request_id: uid(), ...o,
  });

describe("fechamento simplificado com troco fixo de R$ 150", () => {
  it("troco padrão é R$ 150,00 e só a gerência altera", async () => {
    const [o] = await w.db.sql("select change_fund_cents from organizations where id=$1", [w.org]);
    expect(Number(o.change_fund_cents)).toBe(15000);
    await expectError(w.db.as(w.cashier1).rpc("set_change_fund", { p_cents: 10000 }), "FORBIDDEN");
    await expectError(w.db.as(w.manager).rpc("set_change_fund", { p_cents: -1 }), "INVALID");
  });

  it("dia normal: 150 de troco + 500 em dinheiro + 300 Pix; conta 650 => retira 500, deixa 150, sem diferença", async () => {
    const s = await openShift(w, w.cashier1, 15000);
    const r = await simple(w.cashier1, s, { p_cash_sales: 50000, p_pix: 30000, p_counted_cents: 65000 });
    expect(r).toMatchObject({ expected_cents: 15000, counted_cents: 15000, difference_cents: 0, withdrawn_cents: 50000 });
    expect(await balance(w.db, w.registerAccount)).toBe(15000);   // fica só o troco
    expect(await balance(w.db, w.safe)).toBe(50000);              // dinheiro do dia foi para o cofre
    expect(await balance(w.db, w.pix)).toBe(30000);               // Pix separado
    const [rev] = await w.db.sql("select sum(amount_cents) s from ledger_entries where nature='revenue'");
    expect(Number(rev.s)).toBe(80000);                            // faturamento = 800, transferência não conta
  });

  it("falta de dinheiro: esperado 650, contou 640 => diferença -10, exige justificativa", async () => {
    const s = await openShift(w, w.cashier2, 15000);
    await expectError(simple(w.cashier2, s, { p_cash_sales: 50000, p_counted_cents: 64000 }), "JUSTIFICATION_REQUIRED");
    // nada foi lançado pela tentativa recusada (transação inteira desfeita)
    expect((await w.db.sql("select count(*)::int c from cash_movements where shift_id=$1", [s]))[0].c).toBe(0);
    const r = await simple(w.cashier2, s, { p_cash_sales: 50000, p_counted_cents: 64000, p_justification: "Troco errado" });
    expect(r).toMatchObject({ difference_cents: -1000, withdrawn_cents: 49000 });
    expect(await balance(w.db, w.registerAccount)).toBe(15000); // a gaveta física fica com o troco; a falta saiu do dinheiro do dia
  });

  it("repetir o mesmo fechamento (queda de rede) não duplica nada", async () => {
    const s = await openShift(w, w.cashier1, 14000, "ficou menos troco ontem");
    const req = uid();
    const a = await simple(w.cashier1, s, { p_cash_sales: 20000, p_pix: 5000, p_counted_cents: 34000, p_request_id: req });
    const b = await simple(w.cashier1, s, { p_cash_sales: 20000, p_pix: 5000, p_counted_cents: 34000, p_request_id: req });
    expect(b.replayed).toBe(true);
    expect(b.difference_cents).toBe(a.difference_cents);
    expect((await w.db.sql("select count(*)::int c from cash_movements where shift_id=$1", [s]))[0].c).toBe(3);
    await expectError(simple(w.cashier1, s), "SHIFT_CLOSED");
  });

  it("despesa em dinheiro reduz o esperado; precisa de descrição", async () => {
    const s = await openShift(w, w.cashier2, 15000);
    await expectError(simple(w.cashier2, s, { p_cash_sales: 10000, p_expense_cents: 1500, p_counted_cents: 23500 }), "DESCRIPTION_REQUIRED");
    const r = await simple(w.cashier2, s, { p_cash_sales: 10000, p_expense_cents: 1500, p_expense_note: "Gelo", p_counted_cents: 23500 });
    expect(r).toMatchObject({ difference_cents: 0, withdrawn_cents: 8500 });
    const [e] = await w.db.sql("select sum(amount_cents) s from ledger_entries where nature='expense'");
    expect(Number(e.s)).toBe(-1500);
  });

  it("operador não fecha turno de outro; valores inválidos são recusados; gerência pode fechar", async () => {
    const s = await openShift(w, w.cashier1, 15000);
    await expectError(simple(w.cashier2, s), "FORBIDDEN");
    await expectError(simple(w.cashier1, s, { p_pix: -5 }), "INVALID");
    await expectError(simple(w.cashier1, s, { p_counted_cents: -1 }), "INVALID");
    const r = await simple(w.manager, s, { p_counted_cents: 15000 });
    expect(r.difference_cents).toBe(0);
  });

  it("anon não executa; troco configurável muda a retirada", async () => {
    await expect(w.db.as(null, "anon").query("select public.set_change_fund(1)")).rejects.toThrow(/permission denied/);
    await w.db.as(w.manager).rpc("set_change_fund", { p_cents: 20000 });
    const s = await openShift(w, w.cashier1, 15000, "troco mudou para 200");
    const r = await simple(w.cashier1, s, { p_cash_sales: 30000, p_counted_cents: 45000 });
    expect(r).toMatchObject({ change_fund_cents: 20000, withdrawn_cents: 25000, counted_cents: 20000, difference_cents: 0 });
  });
});
