import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMovement, balance, closeShift, createTestDb, openShift, uid, world, type World } from "./helpers";

let w: World;
beforeAll(async () => { w = await world(await createTestDb()); });
afterAll(async () => { await w.db.drop(); });

describe("concorrência (conexões simultâneas reais)", () => {
  it("dois operadores abrindo a mesma gaveta ao mesmo tempo: exatamente um vence", async () => {
    const results = await Promise.allSettled([openShift(w, w.cashier1, 1000), openShift(w, w.cashier2, 1000)]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as any).hint).toBe("SHIFT_ALREADY_OPEN");
    expect((await w.db.sql("select count(*)::int c from cash_shifts where status='open'"))[0].c).toBe(1);
    const [open] = await w.db.sql("select id, employee_id from cash_shifts where status='open'");
    await closeShift(w, open.employee_id, open.id, 1000);
  });

  it("mesma requisição de abertura disparada 8 vezes ao mesmo tempo cria um único turno", async () => {
    const req = uid();
    const ids = await Promise.all(Array.from({ length: 8 }, () => openShift(w, w.cashier1, 1000, null, req)));
    expect(new Set(ids).size).toBe(1);
    expect((await w.db.sql("select count(*)::int c from cash_shifts where open_request_id=$1", [req]))[0].c).toBe(1);
    await closeShift(w, w.cashier1, ids[0], 1000);
  });

  it("clique duplo: 10 lançamentos idênticos simultâneos com a mesma chave => 1 lançamento e 1 entrada no razão", async () => {
    const s = await openShift(w, w.cashier1, 1000);
    const req = uid();
    const ids = await Promise.all(Array.from({ length: 10 }, () => addMovement(w, w.cashier1, s, "sale", "dinheiro", 2500, {}, req)));
    expect(new Set(ids).size).toBe(1);
    expect((await w.db.sql("select count(*)::int c from cash_movements where shift_id=$1", [s]))[0].c).toBe(1);
    expect((await w.db.sql("select count(*)::int c from ledger_entries where source_id=$1", [ids[0]]))[0].c).toBe(1);
    await closeShift(w, w.cashier1, s, 3500);
  });

  it("lançamentos concorrentes vs. fechamento: nada fica fora do esperado nem entra depois de fechar", async () => {
    const s = await openShift(w, w.cashier1, 3500);
    const sales = Array.from({ length: 12 }, () => addMovement(w, w.cashier1, s, "sale", "dinheiro", 100));
    const close = new Promise((r) => setTimeout(r, 5)).then(() => closeShift(w, w.cashier1, s, 0, "fechamento concorrente"));
    const settled = await Promise.allSettled([...sales, close]);
    const [shift] = await w.db.sql("select status, expected_cents from cash_shifts where id=$1", [s]);
    expect(shift.status).toBe("closed");
    const [m] = await w.db.sql("select coalesce(sum(amount_cents),0)::int total, count(*)::int n from cash_movements where shift_id=$1 and status='posted'", [s]);
    // O esperado gravado no fechamento é exatamente a abertura + os lançamentos que o antecederam.
    expect(Number(shift.expected_cents)).toBe(3500 + m.total);
    // Todo lançamento rejeitado foi por turno fechado.
    for (const r of settled.slice(0, 12)) if (r.status === "rejected") expect((r.reason as any).hint).toBe("SHIFT_CLOSED");
    expect(settled[12].status).toBe("fulfilled");
    expect(m.n).toBe(settled.slice(0, 12).filter((r) => r.status === "fulfilled").length);
    expect(await balance(w.db, w.registerAccount)).toBe(0);
  });

  it("dois pagamentos simultâneos que juntos excedem o boleto: só um é aceito", async () => {
    const [bill] = await w.db.as(w.manager).rpc("create_bills", {
      p_supplier_id: w.supplier, p_description: "Pedido", p_category_id: null, p_amount_cents: 10000, p_first_due: "2030-01-01",
      p_mode: "single", p_count: 1, p_interval: "month", p_barcode: null, p_notes: null, p_request_id: uid(),
    });
    const pay = () => w.db.as(w.manager).rpc("pay_bill", {
      p_bill_id: bill, p_amount_cents: 6000, p_paid_on: null, p_account_id: w.bank, p_method: "pix", p_note: null, p_confirmed: true, p_request_id: uid(),
    });
    const r = await Promise.allSettled([pay(), pay(), pay()]);
    expect(r.filter((x) => x.status === "fulfilled").length).toBe(1);
    expect(await balance(w.db, w.bank)).toBe(-6000);
    const [b] = await w.db.sql("select paid_cents, status from bills where id=$1", [bill]);
    expect(b).toMatchObject({ paid_cents: "6000", status: "partial" });
  });

  it("uma mesma linha de extrato não é conciliada duas vezes em paralelo", async () => {
    const d = (await w.db.sql("select private.local_date($1)::text d", [w.org]))[0].d;
    await w.db.as(w.manager).rpc("post_account_adjustment", { p_account_id: w.bank, p_amount_cents: 7700, p_reason: "ajuste para conciliar", p_request_id: uid() });
    await w.db.as(w.manager).rpc("import_bank_statement", {
      p_account_id: w.bank, p_filename: "c.csv", p_format: "csv", p_file_hash: uid(),
      p_lines: JSON.stringify([{ posted_on: d, amount_cents: 7700, description: "DEP", fitid: null, key: "z1", force: false }, { posted_on: d, amount_cents: 7700, description: "DEP2", fitid: null, key: "z2", force: false }]),
    });
    const lines = await w.db.sql("select id from bank_statement_lines where dedupe_key in ('z1','z2')");
    const [entry] = await w.db.sql("select id from ledger_entries where amount_cents=7700");
    const r = await Promise.allSettled(lines.map((l) => w.db.as(w.manager).rpc("reconcile_statement_line", { p_line_id: l.id, p_entry_id: entry.id })));
    expect(r.filter((x) => x.status === "fulfilled").length).toBe(1);
    expect((await w.db.sql("select count(*)::int c from bank_statement_lines where matched_entry_id=$1", [entry.id]))[0].c).toBe(1);
  });
});
