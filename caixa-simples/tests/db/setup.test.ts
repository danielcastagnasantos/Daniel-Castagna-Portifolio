import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const name = `cs_t_${randomBytes(4).toString("hex")}`;
let pool: pg.Pool;
const users = { dono: { id: randomUUID(), email: "dono@teste.com" }, pai: { id: randomUUID(), email: "pai@teste.com" }, intruso: { id: randomUUID(), email: "intruso@teste.com" } };

/** Executa como um usuário do Supabase (papel authenticated + claims do JWT), uma transação por chamada. */
async function as(u: { id: string; email: string } | null, sql: string, params: unknown[] = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${u ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.email', $2, true)", [u?.id ?? "", u?.email ?? ""]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r.rows as any[];
  } catch (e) { await c.query("rollback").catch(() => {}); throw e; } finally { c.release(); }
}
const ins = (u: typeof users.dono, o: { tipo: string; forma: string; valor: number; cat: string; data?: string; desc?: string }) =>
  as(u, "insert into lancamentos (id, data, tipo, forma, valor_centavos, categoria, descricao) values ($1,$2,$3,$4,$5,$6,$7) returning id",
    [randomUUID(), o.data ?? "2026-11-11", o.tipo, o.forma, o.valor, o.cat, o.desc ?? null]);

beforeAll(async () => {
  const a = new pg.Client({ connectionString: BASE }); await a.connect(); await a.query(`create database ${name}`); await a.end();
  const u = new URL(BASE); u.pathname = `/${name}`;
  pool = new pg.Pool({ connectionString: u.toString(), max: 5 });
  await pool.query(readFileSync(join(__dirname, "stub.sql"), "utf8"));
  await pool.query(readFileSync(join(__dirname, "../../supabase/setup.sql"), "utf8"));
  for (const x of Object.values(users)) await pool.query("insert into auth.users (id, email) values ($1,$2)", [x.id, x.email]);
  await pool.query("insert into acesso (email) values ('dono@teste.com'), ('pai@teste.com')");
});
afterAll(async () => { await pool.end(); const a = new pg.Client({ connectionString: BASE }); await a.connect(); await a.query(`drop database if exists ${name} with (force)`); await a.end(); });

describe("setup.sql", () => {
  it("exemplo do pai: 340 (manhã) + 860 de caixas antigos = 1.200; paga 800 de mercadoria; sobra 400", async () => {
    await ins(users.dono, { tipo: "entrada", forma: "dinheiro", valor: 34000, cat: "Venda", desc: "Manhã" });
    await ins(users.dono, { tipo: "entrada", forma: "dinheiro", valor: 86000, cat: "Caixa anterior", data: "2026-11-08", desc: "Dias anteriores" });
    await ins(users.pai, { tipo: "saida", forma: "dinheiro", valor: 80000, cat: "Mercadoria", desc: "Fornecedor" });
    await ins(users.dono, { tipo: "entrada", forma: "cartao", valor: 25000, cat: "Venda", desc: "Cartão da tarde" });
    const [s] = await as(users.pai, `select
      sum(case when forma='dinheiro' and tipo='entrada' then valor_centavos when forma='dinheiro' then -valor_centavos else 0 end)::int dinheiro,
      sum(case when forma='cartao' and tipo='entrada' then valor_centavos when forma='cartao' then -valor_centavos else 0 end)::int cartao
      from lancamentos where excluido_em is null`);
    expect(s).toEqual({ dinheiro: 40000, cartao: 25000 });
  });

  it("os dois usuários liberados enxergam os mesmos lançamentos", async () => {
    expect((await as(users.dono, "select 1 from lancamentos")).length).toBe(4);
    expect((await as(users.pai, "select 1 from lancamentos")).length).toBe(4);
  });

  it("quem não está liberado e o visitante não veem nem lançam nada", async () => {
    expect((await as(users.intruso, "select 1 from lancamentos")).length).toBe(0);
    await expect(ins(users.intruso, { tipo: "entrada", forma: "dinheiro", valor: 100, cat: "X" })).rejects.toThrow(/row-level security/);
    await expect(as(null, "select 1 from lancamentos")).rejects.toThrow(/permission denied/);
    await expect(as(null, "select 1 from acesso")).rejects.toThrow(/permission denied/);
    expect((await as(users.intruso, "select 1 from acesso")).length).toBe(0); // nem a lista de liberados
    expect((await as(users.dono, "select email from acesso")).map((r) => r.email)).toEqual(["dono@teste.com"]); // só o próprio e-mail
  });

  it("não dá para apagar de verdade, nem trocar o autor; exclusão é 'suave' e some da lista", async () => {
    await expect(as(users.dono, "delete from lancamentos")).rejects.toThrow(/permission denied/);
    await expect(as(users.dono, "update lancamentos set criado_por = $1", [users.pai.id])).rejects.toThrow(/permission denied/);
    const [row] = await ins(users.dono, { tipo: "saida", forma: "dinheiro", valor: 500, cat: "Outros", desc: "erro de digitação" });
    await as(users.dono, "update lancamentos set excluido_em = now() where id = $1", [row.id]);
    expect((await as(users.dono, "select 1 from lancamentos where excluido_em is null")).length).toBe(4);
    expect((await pool.query("select count(*)::int c from lancamentos")).rows[0].c).toBe(5); // continua guardado
  });

  it("autor é sempre quem está logado (não dá para lançar em nome de outro)", async () => {
    await expect(as(users.dono, "insert into lancamentos (data, tipo, forma, valor_centavos, categoria, criado_por) values ('2026-11-11','entrada','dinheiro',100,'X',$1)", [users.pai.id])).rejects.toThrow(/permission denied/);
    const [r] = await as(users.pai, "select criado_por from lancamentos order by criado_em limit 1");
    expect(r.criado_por).toBe(users.dono.id);
  });

  it("dados inválidos são recusados pelo banco", async () => {
    await expect(ins(users.dono, { tipo: "entrada", forma: "dinheiro", valor: 0, cat: "X" })).rejects.toThrow(/check constraint/);
    await expect(ins(users.dono, { tipo: "entrada", forma: "dinheiro", valor: -5, cat: "X" })).rejects.toThrow(/check constraint/);
    await expect(ins(users.dono, { tipo: "transferencia", forma: "dinheiro", valor: 5, cat: "X" })).rejects.toThrow(/check constraint/);
    await expect(ins(users.dono, { tipo: "entrada", forma: "pix", valor: 5, cat: "X" })).rejects.toThrow(/check constraint/);
    await expect(ins(users.dono, { tipo: "entrada", forma: "dinheiro", valor: 5, cat: "   " })).rejects.toThrow(/check constraint/);
  });

  it("repetir o mesmo envio (mesmo id) não duplica", async () => {
    const id = randomUUID();
    const q = "insert into lancamentos (id, data, tipo, forma, valor_centavos, categoria) values ($1,'2026-11-11','entrada','dinheiro',700,'Venda')";
    await as(users.dono, q, [id]);
    await expect(as(users.dono, q, [id])).rejects.toThrow(/duplicate key/);
    expect((await pool.query("select count(*)::int c from lancamentos where id=$1", [id])).rows[0].c).toBe(1);
  });

  it("atualizado_em muda ao editar", async () => {
    const [r] = await ins(users.dono, { tipo: "entrada", forma: "cartao", valor: 1000, cat: "Venda" });
    const before = (await pool.query("select atualizado_em t from lancamentos where id=$1", [r.id])).rows[0].t;
    await new Promise((x) => setTimeout(x, 20));
    await as(users.dono, "update lancamentos set valor_centavos = 2000 where id = $1", [r.id]);
    const after = (await pool.query("select atualizado_em t from lancamentos where id=$1", [r.id])).rows[0].t;
    expect(+after).toBeGreaterThan(+before);
  });
});
