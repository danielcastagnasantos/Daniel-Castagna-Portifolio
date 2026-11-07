// Recria um banco local de desenvolvimento/teste aplicando as migrations em ordem.
// Uso: DATABASE_URL=postgres://... node scripts/db-reset.mjs [--stub]
//   --stub  aplica antes o stub mínimo do Supabase (somente para PostgreSQL comum).
// Em um projeto Supabase real use `supabase db push` (ver README).
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/caixa_dev";
const useStub = process.argv.includes("--stub");

const target = new URL(url);
const dbName = target.pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error("Nome de banco inválido");
if (!["127.0.0.1", "localhost"].includes(target.hostname)) {
  throw new Error("db-reset só roda em banco local (apaga e recria o banco).");
}
const admin = new URL(url);
admin.pathname = "/postgres";
const a = new pg.Client({ connectionString: admin.toString() });
await a.connect();
await a.query(`drop database if exists ${dbName} with (force)`);
await a.query(`create database ${dbName}`);
await a.end();

const c = new pg.Client({ connectionString: url });
await c.connect();
if (useStub) await c.query(readFileSync(join(root, "tests/db/supabase-stub.sql"), "utf8"));
const dir = join(root, "supabase/migrations");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  try {
    await c.query(readFileSync(join(dir, f), "utf8"));
    console.log("ok  ", f);
  } catch (e) {
    console.error("FALHA", f, "\n", e.message, e.position ? `(pos ${e.position})` : "", e.where ?? "");
    process.exit(1);
  }
}
await c.end();
console.log("Banco pronto:", dbName);
