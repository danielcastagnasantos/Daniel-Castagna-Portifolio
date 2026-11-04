import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMovement, balance, closeShift, createTestDb, expectError, openShift, uid, world, type World,
} from "./helpers";

let w: World;
beforeAll(async () => { w = await world(await createTestDb()); });
afterAll(async () => { await w.db.drop(); });

describe("controle de caixa por turno", () => {
  it("exemplo obrigatório: 200 + 500 dinheiro + 300 Pix − 100 sangria = 600 esperado; contou 580 => −20", async () => {
    const shift = await openShift(w, w.cashier1, 20000);
    await addMovement(w, w.cashier1, shift, "sale", "dinheiro", 50000);
    await addMovement(w, w.cashier1, shift, "sale", "pix", 30000);
    await addMovement(w, w.cashier1, shift, "withdrawal", "dinheiro", 10000, { description: "Sangria para o cofre", counter: w.safe });

    const summary = await w.db.as(w.manager).rpc("shift_summary", { p_shift_id: shift });
    expect(summary.expected_cents).toBe(60000);
    expect(summary.sales_by_method).toEqual({ dinheiro: 50000, pix: 30000 });

    await expectError(closeShift(w, w.cashier1, shift, 58000, null), "JUSTIFICATION_REQUIRED");
    const result = await closeShift(w, w.cashier1, shift, 58000, "Troco errado");
    expect(result).toMatchObject({ expected_cents: 60000, counted_cents: 58000, difference_cents: -2000 });

    // Razão: gaveta = contagem física; Pix separado; sangria foi para o cofre; faturamento = 800
    expect(await balance(w.db, w.registerAccount)).toBe(58000);
    expect(await balance(w.db, w.pix)).toBe(30000);
    expect(await balance(w.db, w.safe)).toBe(10000);
    const [rev] = await w.db.sql("select sum(amount_cents) s from ledger_entries where nature='revenue' and organization_id=$1", [w.org]);
    expect(Number(rev.s)).toBe(80000);
  });

  it("nunca permite dois turnos abertos na mesma gaveta; mostra quem está com ela", async () => {
    const a = await openShift(w, w.cashier1, 58000, "reabertura confere");
    await expectError(openShift(w, w.cashier2, 0), "SHIFT_ALREADY_OPEN", "Ana Operadora");
    await closeShift(w, w.cashier1, a, 58000);
  });

  it("passagem de turno: contagem diferente exige motivo e gera divergência registrada", async () => {
    // último fechamento deixou 58000 na gaveta
    await expectError(openShift(w, w.cashier2, 57000), "HANDOFF_NOTE_REQUIRED");
    const s = await openShift(w, w.cashier2, 57000, "Faltou uma nota de R$ 10 ao contar");
    const [row] = await w.db.as(w.cashier2).query("select handoff_expected_cents, handoff_difference_cents from cash_shifts where id=$1", [s]);
    expect(Number(row.handoff_expected_cents)).toBe(58000);
    expect(Number(row.handoff_difference_cents)).toBe(-1000);
    expect(await balance(w.db, w.registerAccount)).toBe(57000);
    const n = await w.db.sql("select 1 from notifications where kind='handoff_mismatch'");
    expect(n.length).toBe(1);
    await closeShift(w, w.cashier2, s, 57000);
  });

  it("idempotência: repetir abertura, lançamento e fechamento com a mesma chave não duplica", async () => {
    const req = uid();
    const s1 = await openShift(w, w.cashier1, 57000, null, req);
    const s2 = await openShift(w, w.cashier1, 57000, null, req);
    expect(s2).toBe(s1);
    const mreq = uid();
    const m1 = await addMovement(w, w.cashier1, s1, "sale", "dinheiro", 1000, {}, mreq);
    const m2 = await addMovement(w, w.cashier1, s1, "sale", "dinheiro", 1000, {}, mreq);
    expect(m2).toBe(m1);
    const [c] = await w.db.sql("select count(*)::int c from ledger_entries where source_id=$1", [m1]);
    expect(c.c).toBe(1);
    const creq = uid();
    const r1 = await closeShift(w, w.cashier1, s1, 58000, null, creq);
    const r2 = await closeShift(w, w.cashier1, s1, 58000, null, creq);
    expect(r2.replayed).toBe(true);
    expect(r2.difference_cents).toBe(r1.difference_cents);
    await expectError(closeShift(w, w.cashier1, s1, 58000, null, uid()), "SHIFT_CLOSED");
  });

  it("turno fechado não pode receber lançamentos nem ser alterado, nem por SQL direto", async () => {
    const s = await openShift(w, w.cashier1, 58000);
    await closeShift(w, w.cashier1, s, 58000);
    await expectError(addMovement(w, w.cashier1, s, "sale", "dinheiro", 100), "SHIFT_CLOSED");
    await expect(w.db.sql("update cash_shifts set counted_cents=1 where id=$1", [s])).rejects.toThrow(/imutável/);
    await expect(w.db.sql("update cash_shifts set expected_cents=1 where id=$1", [s])).rejects.toThrow(/imutável/);
    await expect(w.db.sql("delete from cash_shifts where id=$1", [s])).rejects.toThrow(/imutável/);
    await expect(w.db.sql("update ledger_entries set amount_cents=1 where id=(select min(id) from ledger_entries)")).rejects.toThrow(/imutável/);
    await expect(w.db.sql("delete from ledger_entries")).rejects.toThrow(/imutável/);
    await expect(w.db.sql("truncate audit_log")).rejects.toThrow(/imutável/);
  });

  it("operador só lança nos próprios turnos e só os tipos permitidos", async () => {
    const s = await openShift(w, w.cashier1, 58000);
    await expectError(addMovement(w, w.cashier2, s, "sale", "dinheiro", 100), "FORBIDDEN");
    await expectError(addMovement(w, w.cashier1, s, "refund", "pix", 100), "FORBIDDEN");
    await expectError(addMovement(w, w.cashier1, s, "other_in", "pix", 100), "FORBIDDEN");
    await expectError(addMovement(w, w.cashier1, s, "sale", "dinheiro", 0), "INVALID");
    await expectError(addMovement(w, w.cashier1, s, "sale", "dinheiro", -5), "INVALID");
    await expectError(addMovement(w, w.cashier1, s, "withdrawal", "pix", 100), "INVALID");
    await expectError(addMovement(w, w.cashier1, s, "expense", "dinheiro", 500, { description: "Gelo" }), "CATEGORY_REQUIRED");
    // despesa válida em dinheiro reduz o esperado e vira despesa no razão
    await addMovement(w, w.cashier1, s, "expense", "dinheiro", 500, { description: "Gelo", category: w.expenseCategory });
    const sum = await w.db.as(w.manager).rpc("shift_summary", { p_shift_id: s });
    expect(sum.expected_cents).toBe(57500);
    // gerente pode lançar no turno de outro e corrigir; operador não cancela
    const m = await addMovement(w, w.manager, s, "other_in", "pix", 777, { description: "Entrada avulsa" });
    await expectError(w.db.as(w.cashier1).rpc("cancel_cash_movement", { p_movement_id: m, p_reason: "engano" }), "FORBIDDEN");
    await w.db.as(w.manager).rpc("cancel_cash_movement", { p_movement_id: m, p_reason: "lançado em duplicidade" });
    expect(await balance(w.db, w.pix)).toBe(30000);
    await closeShift(w, w.cashier1, s, 57500);
  });

  it("cancelamento estorna o razão e nunca apaga; cancelar duas vezes é inofensivo", async () => {
    const s = await openShift(w, w.cashier1, 57500);
    const m = await addMovement(w, w.cashier1, s, "sale", "dinheiro", 9900);
    const before = await balance(w.db, w.registerAccount);
    await w.db.as(w.manager).rpc("cancel_cash_movement", { p_movement_id: m, p_reason: "venda cancelada pelo cliente" });
    await w.db.as(w.manager).rpc("cancel_cash_movement", { p_movement_id: m, p_reason: "venda cancelada pelo cliente" });
    expect(await balance(w.db, w.registerAccount)).toBe(before - 9900);
    const [mov] = await w.db.sql("select status, cancelled_by from cash_movements where id=$1", [m]);
    expect(mov).toMatchObject({ status: "cancelled", cancelled_by: w.manager });
    const entries = await w.db.sql("select count(*)::int c from ledger_entries where source_id=$1", [m]);
    expect(entries[0].c).toBe(2);
    await closeShift(w, w.cashier1, s, 57500);
  });

  it("fechamento cego esconde o valor esperado do operador, mas não da gerência", async () => {
    await w.db.as(w.manager).rpc("update_org_settings", {
      p_name: "Distribuidora Teste", p_blind_close: true, p_review_threshold_cents: 20000, p_diff_alert_cents: 0, p_shift_max_hours: 12,
    });
    const s = await openShift(w, w.cashier2, 57500);
    await addMovement(w, w.cashier2, s, "sale", "dinheiro", 1000);
    const asCashier = await w.db.as(w.cashier2).rpc("shift_summary", { p_shift_id: s });
    expect(asCashier.expected_cents).toBeNull();
    expect(asCashier.blind).toBe(true);
    const asManager = await w.db.as(w.manager).rpc("shift_summary", { p_shift_id: s });
    expect(asManager.expected_cents).toBe(58500);
    const closed = await closeShift(w, w.cashier2, s, 58500);
    expect(closed.difference_cents).toBe(0);
    const after = await w.db.as(w.cashier2).rpc("shift_summary", { p_shift_id: s });
    expect(after.expected_cents).toBe(58500); // depois de fechar, o operador vê o resultado
    await w.db.as(w.manager).rpc("update_org_settings", {
      p_name: "Distribuidora Teste", p_blind_close: false, p_review_threshold_cents: 20000, p_diff_alert_cents: 0, p_shift_max_hours: 12,
    });
  });

  it("movimentações de operador acima do limite exigem conferência; quem lançou não aprova", async () => {
    const s = await openShift(w, w.cashier1, 58500);
    const big = await addMovement(w, w.cashier1, s, "withdrawal", "dinheiro", 30000, { description: "Sangria grande", counter: w.safe });
    const small = await addMovement(w, w.cashier1, s, "withdrawal", "dinheiro", 1000, { description: "Sangria pequena" });
    const rows = await w.db.sql("select id, review_status from cash_movements where id in ($1,$2)", [big, small]);
    expect(rows.find((r) => r.id === big)!.review_status).toBe("pending");
    expect(rows.find((r) => r.id === small)!.review_status).toBe("not_required");
    await expectError(w.db.as(w.cashier1).rpc("review_cash_movement", { p_movement_id: big, p_approve: true, p_note: null }), "FORBIDDEN");
    await expectError(w.db.as(w.manager).rpc("review_cash_movement", { p_movement_id: big, p_approve: false, p_note: "" }), "REASON_REQUIRED");
    await w.db.as(w.owner).rpc("review_cash_movement", { p_movement_id: big, p_approve: true, p_note: "ok, conferi" });
    const [r] = await w.db.sql("select review_status, reviewed_by from cash_movements where id=$1", [big]);
    expect(r).toMatchObject({ review_status: "approved", reviewed_by: w.owner });
    await closeShift(w, w.cashier1, s, 27500);
  });

  it("gerente confere o fechamento; só turno fechado; reprovar exige motivo", async () => {
    const [shift] = await w.db.sql("select id from cash_shifts where status='closed' order by closed_at desc limit 1");
    await expectError(w.db.as(w.cashier1).rpc("review_cash_shift", { p_shift_id: shift.id, p_status: "approved", p_note: null }), "FORBIDDEN");
    await expectError(w.db.as(w.manager).rpc("review_cash_shift", { p_shift_id: shift.id, p_status: "flagged", p_note: "" }), "REASON_REQUIRED");
    await w.db.as(w.manager).rpc("review_cash_shift", { p_shift_id: shift.id, p_status: "approved", p_note: "ok" });
    const [r] = await w.db.sql("select review_status from cash_shifts where id=$1", [shift.id]);
    expect(r.review_status).toBe("approved");
  });
});
