import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { expect } from "vitest";

const ROOT = join(__dirname, "..", "..");
const BASE = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

export type Row = Record<string, any>;

export class DbError extends Error {
  constructor(public override message: string, public hint?: string, public code?: string) {
    super(message);
  }
}

/** Banco descartável com stub do Supabase + todas as migrations. */
export async function createTestDb() {
  const name = `caixa_t_${randomBytes(5).toString("hex")}`;
  const admin = new pg.Client({ connectionString: BASE });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = new URL(BASE);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 20 });
  const c = await pool.connect();
  await c.query(readFileSync(join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  const dir = join(ROOT, "supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await c.query(readFileSync(join(dir, f), "utf8"));
  }
  c.release();

  async function drop() {
    await pool.end();
    const a = new pg.Client({ connectionString: BASE });
    await a.connect();
    await a.query(`drop database if exists ${name} with (force)`);
    await a.end();
  }

  /** Executa como superusuário (equivale ao dono/postgres no Supabase). */
  const sql = async (text: string, params: unknown[] = []): Promise<Row[]> => (await pool.query(text, params)).rows;

  /** Sessão de um usuário autenticado (cada chamada = uma transação, como no PostgREST). */
  function as(userId: string | null, role: "authenticated" | "anon" | "service_role" = "authenticated") {
    async function run<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(`set local role ${role}`);
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
        const out = await fn(client);
        await client.query("commit");
        return out;
      } catch (e: any) {
        await client.query("rollback").catch(() => {});
        throw e instanceof DbError ? e : new DbError(e.message, e.hint, e.code);
      } finally {
        client.release();
      }
    }
    return {
      query: (text: string, params: unknown[] = []) => run(async (c) => (await c.query(text, params)).rows as Row[]),
      /** Chama uma função pública com argumentos nomeados. */
      rpc: (fn: string, args: Row = {}) =>
        run(async (c) => {
          const keys = Object.keys(args);
          const call = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
          const r = await c.query(`select * from public.${fn}(${call})`, keys.map((k) => args[k]));
          const rows = r.rows as Row[];
          // funções escalares devolvem { fn: valor }
          if (rows.length === 1 && Object.keys(rows[0]).length === 1 && Object.keys(rows[0])[0] === fn) return rows[0][fn];
          return rows;
        }),
    };
  }
  return { pool, sql, as, drop, name };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export interface World {
  db: TestDb;
  org: string;
  owner: string;
  manager: string;
  cashier1: string;
  cashier2: string;
  registerId: string;
  registerAccount: string;
  bank: string;
  pix: string;
  card: string;
  safe: string;
  expenseCategory: string;
  supplier: string;
}

let n = 0;
/** Cria um login de autenticação como o servidor faria (convite -> auth.users -> gatilho). */
export async function addUser(db: TestDb, actor: string, email: string, name: string, role: string) {
  await db.as(actor).rpc("invite_user", { p_email: email, p_full_name: name, p_role: role, p_must_change: false });
  const [u] = await db.sql("insert into auth.users (email) values ($1) returning id", [email]);
  return u.id as string;
}

/** Primeira empresa via fluxo oficial; as demais (isolamento) direto no banco. */
export async function bootstrapOrg(db: TestDb, name = "Distribuidora Teste") {
  const email = `owner${++n}@teste.com`;
  const [{ c }] = await db.sql("select count(*)::int c from organizations");
  let org: string;
  if (c === 0) {
    const [r] = await db.sql("select public.svc_bootstrap_organization($1,$2,$3) org", [name, email, "Pai Dono"]);
    org = r.org;
  } else {
    const [o] = await db.sql("insert into organizations (name) values ($1) returning id", [name]);
    org = o.id;
    await db.sql("select private.seed_org_defaults($1)", [org]);
    await db.sql("insert into invitations (organization_id, email, full_name, role, must_change_password) values ($1,$2,'Dono Outro','owner',false)", [org, email]);
  }
  const [u] = await db.sql("insert into auth.users (email) values ($1) returning id", [email]);
  return { org, owner: u.id as string };
}

export async function world(db: TestDb): Promise<World> {
  const { org, owner } = await bootstrapOrg(db);
  const manager = await addUser(db, owner, "gerente@teste.com", "Filho Gerente", "manager");
  const cashier1 = await addUser(db, manager, "ana@teste.com", "Ana Operadora", "cashier");
  const cashier2 = await addUser(db, manager, "bruno@teste.com", "Bruno Operador", "cashier");
  const acc = async (type: string) => (await db.sql("select id from accounts where organization_id=$1 and type=$2", [org, type]))[0].id as string;
  const [reg] = await db.sql("select id, account_id from registers where organization_id=$1", [org]);
  const [cat] = await db.sql("select id from expense_categories where organization_id=$1 and name='Aluguel'", [org]);
  const supplier = await db.as(manager).rpc("upsert_supplier", {
    p_id: null, p_name: "Ambev Distribuição", p_document: null, p_phone: null, p_email: null, p_notes: null, p_active: true,
  });
  return {
    db, org, owner, manager, cashier1, cashier2,
    registerId: reg.id, registerAccount: reg.account_id,
    bank: await acc("bank"), pix: await acc("pix"), card: await acc("card_receivable"), safe: await acc("safe"),
    expenseCategory: cat.id, supplier,
  };
}

export const uid = () => randomUUID();

export async function expectError(p: Promise<unknown>, hint?: string, messagePart?: string) {
  try {
    await p;
  } catch (e: any) {
    if (hint) expect(e.hint, `hint esperado ${hint}, veio ${e.hint} (${e.message})`).toBe(hint);
    if (messagePart) expect(e.message).toContain(messagePart);
    return e as DbError;
  }
  throw new Error("Era esperado um erro, mas a operação foi concluída");
}

/** Abre turno com a gaveta atual. */
export const openShift = (w: World, user: string, cents: number, note: string | null = null, request = uid()) =>
  w.db.as(user).rpc("open_cash_shift", { p_register_id: w.registerId, p_opening_cents: cents, p_note: note, p_request_id: request });

export const addMovement = (
  w: World, user: string, shift: string, kind: string, method: string, cents: number,
  extra: Row = {}, request = uid(),
) =>
  w.db.as(user).rpc("create_cash_movement", {
    p_shift_id: shift, p_kind: kind, p_method: method, p_amount_cents: cents,
    p_description: extra.description ?? (kind === "sale" ? null : "Descrição do lançamento"),
    p_category_id: extra.category ?? null, p_counter_account_id: extra.counter ?? null, p_request_id: request,
  });

export const closeShift = (w: World, user: string, shift: string, counted: number, just: string | null = null, request = uid()) =>
  w.db.as(user).rpc("close_cash_shift", { p_shift_id: shift, p_counted_cents: counted, p_justification: just, p_request_id: request });

export const balance = async (db: TestDb, account: string) =>
  Number((await db.sql("select coalesce(sum(amount_cents),0) b from ledger_entries where account_id=$1", [account]))[0].b);
