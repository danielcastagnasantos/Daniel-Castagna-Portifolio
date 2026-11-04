import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { balance, closeShift, createTestDb, expectError, openShift, uid, world, type World } from "./helpers";

let w: World;
beforeAll(async () => { w = await world(await createTestDb()); });
afterAll(async () => { await w.db.drop(); });

const mgr = () => w.db.as(w.manager);
const today = async () => (await w.db.sql("select private.local_date($1) d", [w.org]))[0].d.toISOString().slice(0, 10) as string;
const create = (over: Record<string, unknown> = {}) =>
  mgr().rpc("create_bills", {
    p_supplier_id: w.supplier, p_description: "Pedido 123", p_category_id: w.expenseCategory, p_amount_cents: 100000,
    p_first_due: "2030-01-31", p_mode: "single", p_count: 1, p_interval: "month", p_barcode: null, p_notes: null,
    p_request_id: uid(), ...over,
  }) as Promise<string[]>;
const pay = (bill: string, cents: number, account: string, over: Record<string, unknown> = {}) =>
  mgr().rpc("pay_bill", {
    p_bill_id: bill, p_amount_cents: cents, p_paid_on: null, p_account_id: account, p_method: "pix",
    p_note: null, p_confirmed: true, p_request_id: uid(), ...over,
  }) as Promise<string>;

describe("boletos e contas a pagar", () => {
  it("parcelamento divide em centavos exatos (sem perda) e respeita fim de mês", async () => {
    const ids = await create({ p_amount_cents: 10000, p_mode: "installments", p_count: 3, p_first_due: "2030-01-31" });
    const rows = await w.db.sql("select amount_cents, due_date::text d, installment_no from bills where id = any($1) order by installment_no", [ids]);
    expect(rows.map((r) => Number(r.amount_cents))).toEqual([3334, 3333, 3333]);
    expect(rows.reduce((a, r) => a + Number(r.amount_cents), 0)).toBe(10000);
    expect(rows.map((r) => r.d)).toEqual(["2030-01-31", "2030-02-28", "2030-03-31"]);
  });

  it("recorrente gera N ocorrências do mesmo valor; repetir a mesma requisição não duplica", async () => {
    const req = uid();
    const a = await create({ p_mode: "recurring", p_count: 6, p_amount_cents: 250000, p_request_id: req, p_first_due: "2030-05-10" });
    const b = await create({ p_mode: "recurring", p_count: 6, p_amount_cents: 250000, p_request_id: req, p_first_due: "2030-05-10" });
    expect(b).toEqual(a);
    expect(a.length).toBe(6);
    const [c] = await w.db.sql("select count(*)::int c from bills where series_id=$1", [req]);
    expect(c.c).toBe(6);
  });

  it("valida valor, fornecedor, linha digitável e duplicidade", async () => {
    await expectError(create({ p_amount_cents: 0 }), "INVALID");
    await expectError(create({ p_supplier_id: uid() }), "INVALID");
    await expectError(create({ p_barcode: "123" }), "INVALID");
    const code = "23790.12345 60000.123456 78901.234567 8 12340000010000";
    await create({ p_barcode: code });
    await expectError(create({ p_barcode: code }), "DUPLICATE_BARCODE");
    await expectError(create({ p_barcode: code, p_mode: "installments", p_count: 2 }), "INVALID");
  });

  it("pagamento exige confirmação humana; parcial -> pago; não paga a mais", async () => {
    const [bill] = await create({ p_amount_cents: 100000 });
    await expectError(pay(bill, 40000, w.bank, { p_confirmed: false }), "CONFIRM_REQUIRED");
    await pay(bill, 40000, w.bank);
    let [b] = await w.db.sql("select status, paid_cents from bills where id=$1", [bill]);
    expect(b).toMatchObject({ status: "partial", paid_cents: "40000" });
    await expectError(pay(bill, 60001, w.bank), "OVERPAYMENT");
    await pay(bill, 60000, w.bank);
    [b] = await w.db.sql("select status, paid_cents, paid_on from bills where id=$1", [bill]);
    expect(b.status).toBe("paid");
    expect(b.paid_on).not.toBeNull();
    await expectError(pay(bill, 1, w.bank), "NOT_OPEN");
    // saiu 1.000,00 da conta bancária; é despesa (uma única vez) e não receita
    const [e] = await w.db.sql("select sum(amount_cents) s from ledger_entries where account_id=$1 and nature='expense'", [w.bank]);
    expect(Number(e.s)).toBe(-100000);
  });

  it("pagamento repetido com a mesma chave não debita duas vezes", async () => {
    const [bill] = await create({ p_amount_cents: 5000 });
    const req = uid();
    const p1 = await pay(bill, 5000, w.bank, { p_request_id: req });
    const p2 = await pay(bill, 5000, w.bank, { p_request_id: req });
    expect(p2).toBe(p1);
    const [c] = await w.db.sql("select count(*)::int c from ledger_entries where source_id=$1", [p1]);
    expect(c.c).toBe(1);
  });

  it("pagamento em dinheiro pela gaveta gera UM lançamento (sem contar boleto + retirada em dobro)", async () => {
    const [bill] = await create({ p_amount_cents: 12000 });
    await expectError(pay(bill, 12000, w.registerAccount, { p_method: "dinheiro", p_paid_on: await today() }), "NO_OPEN_SHIFT");
    const shift = await openShift(w, w.cashier1, 50000, "abertura");
    const before = await balance(w.db, w.registerAccount);
    const payment = await pay(bill, 12000, w.registerAccount, { p_method: "dinheiro", p_paid_on: await today() });
    expect(await balance(w.db, w.registerAccount)).toBe(before - 12000);
    const entries = await w.db.sql(`select source_type, amount_cents from ledger_entries
      where source_id in (select id from cash_movements where bill_payment_id=$1) or source_id=$1`, [payment]);
    expect(entries.length).toBe(1);
    expect(entries[0].source_type).toBe("cash_movement");
    const sum = await mgr().rpc("shift_summary", { p_shift_id: shift });
    expect(sum.expected_cents).toBe(50000 - 12000);
    // cancelar pelo boleto devolve o saldo da gaveta e reabre o boleto
    await mgr().rpc("cancel_bill_payment", { p_payment_id: payment, p_reason: "pagamento lançado errado" });
    expect(await balance(w.db, w.registerAccount)).toBe(before);
    const [b] = await w.db.sql("select status, paid_cents from bills where id=$1", [bill]);
    expect(b).toMatchObject({ status: "open", paid_cents: "0" });
    // cancelar o movimento diretamente não é permitido (evita descasar boleto e caixa)
    const payment2 = await pay(bill, 12000, w.registerAccount, { p_method: "dinheiro", p_paid_on: await today() });
    const [mv] = await w.db.sql("select id from cash_movements where bill_payment_id=$1", [payment2]);
    await expectError(mgr().rpc("cancel_cash_movement", { p_movement_id: mv.id, p_reason: "tentando cancelar" }), "USE_BILL");
    await closeShift(w, w.cashier1, shift, 38000);
    await expectError(mgr().rpc("cancel_bill_payment", { p_payment_id: payment2, p_reason: "depois do fechamento" }), "SHIFT_CLOSED");
  });

  it("edição respeita pagamentos, cancelamento exige motivo e não há exclusão", async () => {
    const [bill] = await create({ p_amount_cents: 20000 });
    await pay(bill, 5000, w.bank);
    await expectError(mgr().rpc("update_bill", { p_bill_id: bill, p_supplier_id: w.supplier, p_description: "Editado", p_category_id: null, p_amount_cents: 4000, p_due_date: "2030-02-01", p_barcode: null, p_notes: null }), "INVALID");
    await mgr().rpc("update_bill", { p_bill_id: bill, p_supplier_id: w.supplier, p_description: "Editado", p_category_id: null, p_amount_cents: 5000, p_due_date: "2030-02-01", p_barcode: null, p_notes: "ajustado" });
    expect((await w.db.sql("select status from bills where id=$1", [bill]))[0].status).toBe("paid");
    const [bill2] = await create({ p_amount_cents: 1000 });
    await expectError(mgr().rpc("cancel_bill", { p_bill_id: bill2, p_reason: "x" }), "REASON_REQUIRED");
    await mgr().rpc("cancel_bill", { p_bill_id: bill2, p_reason: "pedido cancelado pelo fornecedor" });
    await expect(w.db.sql("delete from bills where id=$1", [bill2])).rejects.toThrow(/imutável/);
    const hist = await mgr().query("select action, after from audit_log where entity_type='bill' and entity_id=$1 order by id", [bill2]);
    expect(hist.map((h) => h.action)).toEqual(["insert", "update"]);
    expect(hist[1].after.status).toBe("cancelled");
  });

  it("operador não cria nem paga boletos; gerente de outra empresa tampouco", async () => {
    await expectError(w.db.as(w.cashier1).rpc("create_bills", { p_supplier_id: w.supplier, p_description: "x", p_category_id: null, p_amount_cents: 1, p_first_due: "2030-01-01", p_mode: "single", p_count: 1, p_interval: "month", p_barcode: null, p_notes: null, p_request_id: uid() }), "FORBIDDEN");
    const [bill] = await create();
    await expectError(w.db.as(w.cashier1).rpc("pay_bill", { p_bill_id: bill, p_amount_cents: 1, p_paid_on: null, p_account_id: w.bank, p_method: "pix", p_note: null, p_confirmed: true, p_request_id: uid() }), "FORBIDDEN");
  });

  it("agenda e notificações: vencidos e a vencer geram alerta uma única vez e somem ao pagar", async () => {
    const t = await today();
    const [due] = await create({ p_first_due: t, p_description: "Vence hoje" });
    const [late] = await create({ p_first_due: "2026-01-02", p_description: "Atrasado" });
    const n1 = await mgr().rpc("refresh_notifications");
    expect(n1).toBeGreaterThanOrEqual(2);
    expect(await mgr().rpc("refresh_notifications")).toBe(0);
    let feed = await mgr().query("select kind, severity from notification_feed where resolved_at is null");
    expect(feed.some((f) => f.kind === "bill_overdue" && f.severity === "critical")).toBe(true);
    await pay(due, 100000, w.bank, { p_paid_on: t });
    await mgr().rpc("refresh_notifications");
    const open = await w.db.sql("select 1 from notifications where entity_id=$1 and resolved_at is null", [due]);
    expect(open.length).toBe(0);
    const stillOpen = await w.db.sql("select 1 from notifications where entity_id=$1 and resolved_at is null", [late]);
    expect(stillOpen.length).toBe(1);
    await mgr().rpc("mark_notifications_read");
    feed = await mgr().query("select is_read from notification_feed");
    expect(feed.every((f) => f.is_read)).toBe(true);
  });
});

describe("anexos privados (Storage)", () => {
  const put = (bucket: string, path: string, size = 1000, mime = "application/pdf") =>
    w.db.sql("insert into storage.objects (bucket_id, name, metadata) values ($1,$2,$3)", [bucket, path, JSON.stringify({ size, mimetype: mime })]);

  it("buckets são privados e com limites", async () => {
    const rows = await w.db.sql("select id, public, file_size_limit from storage.buckets order by id");
    expect(rows.map((r) => [r.id, r.public])).toEqual([["boletos", false], ["comprovantes", false]]);
  });

  it("administração da própria empresa envia/lê; operador e outra empresa não", async () => {
    const [bill] = await create();
    const path = `${w.org}/${bill}/${uid()}-boleto.pdf`;
    const insertAs = (user: string, p: string, bucket = "boletos") =>
      w.db.as(user).query("insert into storage.objects (bucket_id, name, metadata) values ($1,$2,'{}')", [bucket, p]);
    await expect(insertAs(w.cashier1, path)).rejects.toThrow(/row-level security/);
    const otherOrg = (await w.db.sql("insert into organizations (name) values ('Outra') returning id"))[0].id;
    await w.db.sql("select private.seed_org_defaults($1)", [otherOrg]);
    await w.db.sql("insert into invitations (organization_id,email,full_name,role,must_change_password) values ($1,'o2@x.com','Dono Dois','owner',false)", [otherOrg]);
    const [o2] = await w.db.sql("insert into auth.users (email) values ('o2@x.com') returning id");
    await expect(insertAs(o2.id, path)).rejects.toThrow(/row-level security/);               // pasta de outra empresa
    await expect(insertAs(w.manager, `${otherOrg}/${bill}/x.pdf`)).rejects.toThrow(/row-level security/);
    await insertAs(w.manager, path);                                                           // gerente ok
    expect((await w.db.as(w.manager).query("select name from storage.objects where name=$1", [path])).length).toBe(1);
    expect((await w.db.as(w.cashier1).query("select name from storage.objects where name=$1", [path])).length).toBe(0);
    expect((await w.db.as(o2.id).query("select name from storage.objects where name=$1", [path])).length).toBe(0);
    expect((await w.db.as(null, "anon").query("select 1").then(() => 1).catch(() => 0))).toBe(1);
    await expect(w.db.as(null, "anon").query("select * from storage.objects")).rejects.toThrow(/permission denied/);
  });

  it("registro do anexo confere se o arquivo realmente existe, é do boleto e tem tipo válido", async () => {
    const [bill] = await create();
    const reg = (path: string, kind = "boleto") =>
      mgr().rpc("register_bill_file", { p_bill_id: bill, p_payment_id: null, p_kind: kind, p_path: path, p_filename: "boleto.pdf" });
    const path = `${w.org}/${bill}/${uid()}-ok.pdf`;
    await expectError(reg(path), "FILE_MISSING");
    await put("boletos", path);
    const id = await reg(path);
    expect(await reg(path)).toBe(id); // idempotente
    await expectError(reg(`${w.org}/${uid()}/x.pdf`), "INVALID");
    const big = `${w.org}/${bill}/${uid()}-big.pdf`;
    await put("boletos", big, 20_000_000);
    await expectError(reg(big), "INVALID");
    const exe = `${w.org}/${bill}/${uid()}-x.exe`;
    await put("boletos", exe, 100, "application/x-msdownload");
    await expectError(reg(exe), "INVALID");
    // anexo registrado não pode ser apagado do storage
    await expect(w.db.as(w.manager).query("delete from storage.objects where name=$1", [path]).then((r) => r.length)).resolves.toBe(0);
    expect((await w.db.sql("select 1 from storage.objects where name=$1", [path])).length).toBe(1);
    await expect(w.db.sql("delete from bill_files")).rejects.toThrow(/imutável/);
  });
});
