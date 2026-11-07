import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers";

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.drop(); });

describe("seed de desenvolvimento", () => {
  it("roda limpo, cria o cenário do enunciado e é idempotente", async () => {
    const sql = readFileSync(join(__dirname, "../../supabase/seed.sql"), "utf8");
    await db.pool.query(sql);
    const roles = await db.sql("select role, count(*)::int n from profiles group by role order by role");
    expect(roles).toEqual([{ role: "cashier", n: 2 }, { role: "manager", n: 1 }, { role: "owner", n: 1 }]);
    const [closed] = await db.sql("select expected_cents, counted_cents, difference_cents from cash_shifts where status='closed'");
    expect(closed).toEqual({ expected_cents: "60000", counted_cents: "58000", difference_cents: "-2000" });
    expect((await db.sql("select count(*)::int n from cash_shifts where status='open'"))[0].n).toBe(1);
    expect((await db.sql("select count(*)::int n from bills"))[0].n).toBe(5);
    await db.pool.query(sql); // segunda execução não duplica
    expect((await db.sql("select count(*)::int n from profiles"))[0].n).toBe(4);
  });
});
