import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMovement, addUser, bootstrapOrg, closeShift, createTestDb, expectError, openShift, uid, world, type World } from "./helpers";

let w: World;
let other: { org: string; owner: string };
beforeAll(async () => {
  const db = await createTestDb();
  w = await world(db);
  other = await bootstrapOrg(db, "Outra Empresa");
});
afterAll(async () => { await w.db.drop(); });

const TABLES = [
  "organizations", "profiles", "invitations", "audit_log", "accounts", "expense_categories", "payment_routes",
  "ledger_entries", "account_transfers", "account_adjustments", "registers", "cash_shifts", "cash_movements",
  "notifications", "notification_reads", "notification_deliveries", "suppliers", "bills", "bill_payments",
  "bill_files", "receivables", "bank_statement_imports", "bank_statement_lines",
];

describe("RLS e privilégios", () => {
  it("toda tabela do domínio tem RLS ligada", async () => {
    const rows = await w.db.sql(
      "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    expect(rows.map((r) => r.relname).sort()).toEqual([...TABLES].sort());
    for (const r of rows) expect(r.relrowsecurity, r.relname).toBe(true);
  });

  it("navegador (authenticated/anon) não tem INSERT/UPDATE/DELETE direto em nenhuma tabela", async () => {
    for (const t of TABLES) for (const role of ["authenticated", "anon"]) for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
      const [r] = await w.db.sql("select has_table_privilege($1, $2, $3) p", [role, `public.${t}`, priv]);
      expect(r.p, `${role} ${priv} ${t}`).toBe(false);
    }
  });

  it("anon não lê nada e não executa nenhuma função", async () => {
    for (const t of TABLES) {
      const [r] = await w.db.sql("select has_table_privilege('anon', $1, 'SELECT') p", [`public.${t}`]);
      expect(r.p, t).toBe(false);
    }
    const fns = await w.db.sql(
      "select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prorettype<>'trigger'::regtype");
    for (const f of fns) {
      const [r] = await w.db.sql("select has_function_privilege('anon', $1::regprocedure, 'EXECUTE') p", [f.sig]);
      expect(r.p, f.sig).toBe(false);
    }
    await expect(w.db.as(null, "anon").query("select * from profiles")).rejects.toThrow();
  });

  it("funções internas (private.*) e de serviço (svc_*) não são executáveis pelo navegador", async () => {
    await expect(w.db.as(w.owner).query("select private.post_entry($1,$2,100,'revenue','x',gen_random_uuid(),1::smallint,gen_random_uuid())", [w.org, w.bank])).rejects.toThrow(/permission denied/);
    await expect(w.db.as(w.owner).query("select public.svc_bootstrap_organization('X','a@b.com','Y')")).rejects.toThrow(/permission denied/);
    await expect(w.db.as(w.owner).query("select public.svc_generate_all_notifications()")).rejects.toThrow(/permission denied/);
  });

  it("operador não enxerga boletos, razão, contas, auditoria, equipe nem turnos de outros", async () => {
    const s = await openShift(w, w.cashier1, 1000);
    await closeShift(w, w.cashier1, s, 1000);
    const s2 = await openShift(w, w.cashier2, 1000);
    await addMovement(w, w.cashier2, s2, "sale", "dinheiro", 5000);
    const c1 = w.db.as(w.cashier1);
    for (const t of ["bills", "bill_payments", "bill_files", "suppliers", "ledger_entries", "accounts", "payment_routes", "audit_log",
      "notifications", "receivables", "bank_statement_lines", "account_transfers", "invitations"]) {
      expect((await c1.query(`select 1 from ${t}`)).length, t).toBe(0);
    }
    expect((await c1.query("select id from profiles")).map((r) => r.id)).toEqual([w.cashier1]);
    expect((await c1.query("select employee_id from cash_shifts")).every((r) => r.employee_id === w.cashier1)).toBe(true);
    expect((await c1.query("select 1 from cash_movements")).length).toBe(0); // movimentos são do outro operador
    await expectError(c1.rpc("dashboard_summary", { p_from: "2026-01-01", p_to: "2026-12-31" }), "FORBIDDEN");
    await expectError(c1.rpc("report_data", { p_report: "daily_close", p_from: "2026-01-01", p_to: "2026-12-31" }), "FORBIDDEN");
    await expectError(c1.rpc("refresh_notifications"), "FORBIDDEN");
    await closeShift(w, w.cashier2, s2, 6000);
  });

  it("isolamento entre empresas: dono de outra empresa não vê nem toca nada", async () => {
    const o = w.db.as(other.owner);
    for (const t of TABLES.filter((x) => x !== "notification_deliveries")) {
      const rows = await o.query(`select * from ${t}`);
      const foreign = rows.filter((r) => (r.organization_id ?? r.id) === w.org);
      expect(foreign.length, t).toBe(0);
    }
    const [shift] = await w.db.sql("select id from cash_shifts limit 1");
    await expectError(o.rpc("close_cash_shift", { p_shift_id: shift.id, p_counted_cents: 0, p_justification: "x", p_request_id: uid() }), "NOT_FOUND");
    await expectError(o.rpc("create_cash_movement", { p_shift_id: shift.id, p_kind: "sale", p_method: "dinheiro", p_amount_cents: 100, p_description: null, p_category_id: null, p_counter_account_id: null, p_request_id: uid() }), "NOT_FOUND");
    await expectError(o.rpc("open_cash_shift", { p_register_id: w.registerId, p_opening_cents: 0, p_note: null, p_request_id: uid() }), "NOT_FOUND");
    await expectError(o.rpc("set_user_active", { p_user_id: w.cashier1, p_active: false }), "NOT_FOUND");
    await expectError(o.rpc("transfer_between_accounts", { p_from: w.bank, p_to: w.safe, p_amount_cents: 100, p_note: null, p_occurred_on: "2026-01-01", p_request_id: uid() }), "INVALID");
    await expectError(o.rpc("pay_bill", { p_bill_id: uid(), p_amount_cents: 1, p_paid_on: "2026-01-01", p_account_id: w.bank, p_method: "pix", p_note: null, p_confirmed: true, p_request_id: uid() }), "NOT_FOUND");
  });

  it("usuário sem perfil (conta criada fora do convite) não acessa nada", async () => {
    const [u] = await w.db.sql("insert into auth.users (email) values ('intruso@x.com') returning id");
    const s = w.db.as(u.id);
    expect((await s.query("select * from organizations")).length).toBe(0);
    expect((await s.query("select * from profiles")).length).toBe(0);
    await expectError(openShift(w, u.id, 100), "NO_ACCESS");
    await expectError(s.rpc("invite_user", { p_email: "x@y.com", p_full_name: "Xx", p_role: "cashier", p_must_change: true }), "NO_ACCESS");
  });

  it("usuário desativado perde o acesso imediatamente", async () => {
    const id = await addUser(w.db, w.manager, "temp@teste.com", "Temporário", "cashier");
    expect((await w.db.as(id).query("select 1 from organizations")).length).toBe(1);
    await w.db.as(w.manager).rpc("set_user_active", { p_user_id: id, p_active: false });
    expect((await w.db.as(id).query("select 1 from organizations")).length).toBe(0);
    await expectError(openShift(w, id, 0), "NO_ACCESS");
  });
});

describe("gestão de usuários e permissões", () => {
  it("operador não convida ninguém; gerente só cria operadores; só o proprietário cria gerente/proprietário", async () => {
    await expectError(w.db.as(w.cashier1).rpc("invite_user", { p_email: "a@b.com", p_full_name: "Alguém", p_role: "cashier", p_must_change: true }), "FORBIDDEN");
    await expectError(w.db.as(w.manager).rpc("invite_user", { p_email: "m@b.com", p_full_name: "Outro Gerente", p_role: "manager", p_must_change: true }), "FORBIDDEN");
    await expectError(w.db.as(w.manager).rpc("invite_user", { p_email: "o@b.com", p_full_name: "Outro Dono", p_role: "owner", p_must_change: true }), "FORBIDDEN");
    await w.db.as(w.owner).rpc("invite_user", { p_email: "m2@b.com", p_full_name: "Gerente Dois", p_role: "manager", p_must_change: true });
    await expectError(w.db.as(w.manager).rpc("invite_user", { p_email: "ana@teste.com", p_full_name: "Duplicada", p_role: "cashier", p_must_change: true }), "DUPLICATE");
  });

  it("ninguém aumenta a própria permissão; só o proprietário muda perfis", async () => {
    await expectError(w.db.as(w.cashier1).rpc("set_user_role", { p_user_id: w.cashier1, p_role: "owner" }), "FORBIDDEN");
    await expectError(w.db.as(w.manager).rpc("set_user_role", { p_user_id: w.manager, p_role: "owner" }), "FORBIDDEN");
    await expectError(w.db.as(w.manager).rpc("set_user_role", { p_user_id: w.cashier1, p_role: "manager" }), "FORBIDDEN");
    await expectError(w.db.as(w.owner).rpc("set_user_role", { p_user_id: w.owner, p_role: "cashier" }), "FORBIDDEN");
    // escrita direta também é impossível
    await expect(w.db.as(w.cashier1).query("update profiles set role='owner' where id=$1", [w.cashier1])).rejects.toThrow(/permission denied/);
  });

  it("gerente não gerencia proprietário; proprietário promove e a empresa nunca fica sem dono", async () => {
    await expectError(w.db.as(w.manager).rpc("set_user_active", { p_user_id: w.owner, p_active: false }), "FORBIDDEN");
    await w.db.as(w.owner).rpc("set_user_role", { p_user_id: w.cashier2, p_role: "manager" });
    expect((await w.db.sql("select role from profiles where id=$1", [w.cashier2]))[0].role).toBe("manager");
    await w.db.as(w.owner).rpc("set_user_role", { p_user_id: w.cashier2, p_role: "cashier" });
    // único dono: nem rebaixar (por outro dono inexistente) nem desativar a si mesmo
    await expectError(w.db.as(w.owner).rpc("set_user_active", { p_user_id: w.owner, p_active: false }), "FORBIDDEN");
  });

  it("não desativa funcionário com turno aberto", async () => {
    const s = await openShift(w, w.cashier1, 0, "abertura");
    await expectError(w.db.as(w.manager).rpc("set_user_active", { p_user_id: w.cashier1, p_active: false }), "SHIFT_OPEN");
    await closeShift(w, w.cashier1, s, 0);
  });

  it("auditoria registra quem alterou o quê e é inalterável", async () => {
    const rows = await w.db.as(w.manager).query("select actor_id, action, entity_type, after from audit_log where entity_type='profile' order by id desc limit 3");
    expect(rows.length).toBeGreaterThan(0);
    await expect(w.db.sql("delete from audit_log")).rejects.toThrow(/imutável/);
    await expect(w.db.as(w.manager).query("delete from audit_log")).rejects.toThrow(/permission denied/);
  });
});

describe("cadastro inicial", () => {
  it("só configura uma vez e cria dados padrão sem dados financeiros fictícios", async () => {
    const db = await createTestDb();
    try {
      expect((await db.sql("select public.svc_setup_status() s"))[0].s.needs_setup).toBe(true);
      const { org } = await bootstrapOrg(db, "Minha Distribuidora");
      expect((await db.sql("select public.svc_setup_status() s"))[0].s.needs_setup).toBe(false);
      await expect(db.sql("select public.svc_bootstrap_organization('Outra','x@y.com','Fulano')")).rejects.toThrow(/já foi configurada/);
      const counts = await db.sql(`select (select count(*) from accounts where organization_id=$1)::int accounts,
        (select count(*) from registers where organization_id=$1)::int registers,
        (select count(*) from ledger_entries)::int ledger, (select count(*) from bills)::int bills,
        (select count(*) from payment_routes where organization_id=$1)::int routes`, [org]);
      expect(counts[0]).toEqual({ accounts: 5, registers: 1, ledger: 0, bills: 0, routes: 4 });
    } finally { await db.drop(); }
  });

  it("falha na criação do login permite repetir o cadastro sem duplicar a empresa", async () => {
    const db = await createTestDb();
    try {
      await db.sql("select public.svc_bootstrap_organization('Dist','a@a.com','Dono')");
      await db.sql("select public.svc_discard_invitation('a@a.com')");
      await db.sql("select public.svc_bootstrap_organization('Dist 2','a@a.com','Dono')");
      expect((await db.sql("select count(*)::int c from organizations"))[0].c).toBe(1);
      await db.sql("insert into auth.users (email) values ('a@a.com')");
      expect((await db.sql("select role from profiles"))[0].role).toBe("owner");
    } finally { await db.drop(); }
  });
});
