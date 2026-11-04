/**
 * Teste de CONTRATO app × banco.
 * Lê o código-fonte do app e confere, contra o schema real (migrations aplicadas), que:
 *  - toda chamada .rpc()/callRpc() usa função existente e nomes de argumentos corretos (sem faltar obrigatório);
 *  - todo .from().select() usa colunas/relações (embeds e hints de FK) que existem;
 *  - filtros/ordenações usam colunas que existem;
 *  - o cliente com sessão do usuário NUNCA grava direto em tabela (só via RPC);
 *  - funções svc_* só são chamadas pelo cliente administrativo.
 * Isso pega, em tempo de teste, erros que só apareceriam em produção (ex.: nome de coluna errado).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers";

const SRC = join(__dirname, "..", "..", "src");
const files: string[] = [];
(function walk(d: string) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f)) files.push(p);
  }
})(SRC);

/** Devolve o trecho balanceado que começa em `open` (um de "({["). */
function balanced(src: string, start: number): { text: string; end: number } | null {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const open = src[start];
  if (!pairs[open]) return null;
  let depth = 0, inStr: string | null = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === "\\") i++; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "(" || c === "{" || c === "[") depth++;
    if (c === ")" || c === "}" || c === "]") { depth--; if (depth === 0) return { text: src.slice(start + 1, i), end: i + 1 }; }
  }
  return null;
}

function topLevelKeys(objText: string): string[] {
  const keys: string[] = [];
  let depth = 0, inStr: string | null = null, buf = "";
  const flush = () => { const m = /^\s*(\w+)\s*:/.exec(buf); if (m) keys.push(m[1]); else { const s = /^\s*(\w+)\s*$/.exec(buf); if (s) keys.push(s[1]); } buf = ""; };
  for (let i = 0; i < objText.length; i++) {
    const c = objText[i];
    if (inStr) { buf += c; if (c === "\\") { buf += objText[++i]; } else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; buf += c; continue; }
    if ("({[".includes(c)) depth++;
    if (")}]".includes(c)) depth--;
    if (c === "," && depth === 0) { flush(); continue; }
    buf += c;
  }
  flush();
  return keys;
}

function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0, buf = "";
  for (const c of s) {
    if (c === "(") depth++; if (c === ")") depth--;
    if (c === "," && depth === 0) { out.push(buf.trim()); buf = ""; } else buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Separa argumentos de chamada respeitando aspas, crases e parênteses/colchetes/chaves. */
function splitArgs(s: string): string[] {
  const out: string[] = []; let depth = 0, inStr: string | null = null, buf = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { buf += c; if (c === "\\") buf += s[++i]; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; buf += c; continue; }
    if ("({[".includes(c)) depth++;
    if (")}]".includes(c)) depth--;
    if (c === "," && depth === 0) { out.push(buf.trim()); buf = ""; } else buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

interface RpcCall { file: string; fn: string; keys: string[]; admin: boolean }
interface Query { file: string; table: string; select: string | null; cols: string[]; admin: boolean; writes: string[] }

const rpcCalls: RpcCall[] = [];
const queries: Query[] = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(SRC, file);
  const consts: Record<string, string> = {};
  for (const c of src.matchAll(/const\s+(\w+)\s*=\s*"([^"]*)";/g)) consts[c[1]] = c[2];
  const re = /(callRpc(?:<[^()]*>)?\(\s*ctx\s*,\s*|(\w+(?:\.\w+)*)\s*\.rpc\(\s*)"(\w+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const after = src.slice(re.lastIndex).match(/^\s*,\s*/);
    let keys: string[] = [];
    if (after) {
      const objStart = re.lastIndex + after[0].length;
      if (src[objStart] === "{") { const b = balanced(src, objStart); if (b) keys = topLevelKeys(b.text); }
    }
    const recv = m[2] ?? "";
    rpcCalls.push({ file: rel, fn: m[3], keys, admin: /admin/i.test(recv) });
  }
  const fre = /(\w+(?:\.\w+)*)\s*\.from\(\s*"(\w+)"\s*\)/g;
  while ((m = fre.exec(src))) {
    const recv = m[1];
    const q: Query = { file: rel, table: m[2], select: null, cols: [], admin: /admin/i.test(recv), writes: [] };
    let pos = fre.lastIndex;
    for (;;) {
      const next = /^\s*\.(\w+)\s*\(/.exec(src.slice(pos));
      if (!next) break;
      const method = next[1];
      const open = pos + next[0].length - 1;
      const b = balanced(src, open);
      if (!b) break;
      const args = splitArgs(b.text);
      const lit = (a?: string) => (a && (/^"([^"]*)"$/.exec(a.trim())?.[1] ?? consts[a.trim()])) ?? null;
      if (method === "select") q.select = lit(args[0]);
      else if (["eq", "neq", "gt", "gte", "lt", "lte", "is", "in", "like", "ilike", "order"].includes(method)) { const c = lit(args[0]); if (c) q.cols.push(c); }
      else if (method === "or") { const s = lit(args[0]) ?? (/^`([^`]*)`$/.exec(args[0].trim())?.[1] ?? ""); for (const t of s.split(/,(?![^(]*\))/)) { const c = /^(\w+)\./.exec(t.trim())?.[1]; if (c) q.cols.push(c); } }
      else if (["insert", "update", "delete", "upsert"].includes(method)) q.writes.push(method);
      pos = b.end;
    }
    queries.push(q);
  }
}

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.drop(); });

describe("contrato app × banco", () => {
  it("o scanner encontrou as chamadas (evita falso verde)", () => {
    expect(rpcCalls.length).toBeGreaterThanOrEqual(59);
    expect(queries.length).toBeGreaterThan(40);
    expect(rpcCalls.filter((c) => c.keys.length > 0).length).toBeGreaterThan(40);
    expect(queries.filter((q) => q.select !== null).length).toBeGreaterThan(25); // selects realmente lidos
  });

  it("todo rpc() usa função existente, argumentos válidos e nenhum obrigatório faltando", async () => {
    const errors: string[] = [];
    const fns = await db.sql(`select p.proname, p.proargnames, p.pronargs, p.pronargdefaults,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_ok, has_function_privilege('service_role', p.oid, 'EXECUTE') svc_ok
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'`);
    const byName = new Map(fns.map((f) => [f.proname as string, f]));
    for (const c of rpcCalls) {
      const f = byName.get(c.fn);
      const where = `${c.file}: ${c.fn}`;
      if (!f) { errors.push(`${where} — função inexistente`); continue; }
      const names: string[] = f.proargnames ?? [];
      const required = names.slice(0, f.pronargs - f.pronargdefaults);
      for (const k of c.keys) if (!names.includes(k)) errors.push(`${where} — argumento desconhecido "${k}" (esperado: ${names.join(", ")})`);
      for (const r of required) if (!c.keys.includes(r)) errors.push(`${where} — falta o argumento obrigatório "${r}"`);
      if (c.fn.startsWith("svc_")) { if (!c.admin) errors.push(`${where} — função de serviço chamada por cliente com sessão de usuário`); if (!f.svc_ok) errors.push(`${where} — service_role sem permissão`); }
      else { if (c.admin) errors.push(`${where} — função de usuário chamada pelo cliente administrativo`); if (!f.auth_ok) errors.push(`${where} — authenticated sem permissão de execução`); }
    }
    expect(errors).toEqual([]);
  });

  it("todo from().select()/filtro usa colunas e relações que existem (inclusive embeds com hint de FK)", async () => {
    const cols = await db.sql("select table_name, column_name from information_schema.columns where table_schema='public'");
    const colsOf = (t: string) => new Set(cols.filter((c) => c.table_name === t).map((c) => c.column_name as string));
    const fks = await db.sql(`select c.conname, c.conrelid::regclass::text t, c.confrelid::regclass::text rt from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace`);
    const rel = (a: string, b: string) => fks.some((f) => (f.t === a && f.rt === b) || (f.t === b && f.rt === a));
    const errors: string[] = [];

    const check = (table: string, sel: string, where: string) => {
      const have = colsOf(table);
      if (have.size === 0) { errors.push(`${where} — tabela/visão "${table}" inexistente`); return; }
      for (const item of splitTop(sel)) {
        if (!item || item === "*") continue;
        const em = /^(\w+)(?:!(\w+))?\((.*)\)$/s.exec(item);
        if (em) {
          const [, name, hint, inner] = em;
          if (colsOf(name).size === 0) { errors.push(`${where} — embed "${name}" não é tabela`); continue; }
          if (!rel(table, name)) errors.push(`${where} — não há FK entre ${table} e ${name}`);
          // PostgREST exige hint quando há mais de uma relação entre as tabelas (senão responde "PGRST201")
          const n = fks.filter((f) => (f.t === table && f.rt === name) || (f.t === name && f.rt === table)).length;
          if (!hint && n > 1) errors.push(`${where} — embed "${name}" é ambíguo (${n} FKs); use name!constraint`);
          if (hint && !fks.some((f) => f.conname === hint && (f.t === table || f.rt === table))) errors.push(`${where} — hint de FK "${hint}" inexistente em ${table}`);
          check(name, inner, `${where} > ${name}`);
        } else {
          const name = item.includes(":") ? item.split(":")[1] : item;
          if (!have.has(name.trim())) errors.push(`${where} — coluna "${name}" não existe em ${table}`);
        }
      }
    };
    for (const q of queries.filter((x) => !x.admin)) {
      const where = `${q.file}: ${q.table}`;
      if (q.select) check(q.table, q.select, where);
      const have = colsOf(q.table);
      for (const c of q.cols) if (!have.has(c)) errors.push(`${where} — filtro/ordem em coluna inexistente "${c}"`);
      const [{ ok }] = await db.sql("select has_table_privilege('authenticated', $1, 'SELECT') ok", [`public.${q.table}`]);
      if (!ok) errors.push(`${where} — authenticated não tem SELECT`);
    }
    expect(errors).toEqual([]);
  });

  it("cliente com sessão de usuário nunca grava direto em tabelas (somente RPC)", () => {
    const direct = queries.filter((q) => !q.admin && q.writes.length).map((q) => `${q.file}: ${q.table}.${q.writes.join(",")}`);
    expect(direct).toEqual([]);
  });

  it("o cliente administrativo (service role) só é usado onde se espera", () => {
    const users = files.filter((f) => /createAdminClient\(/.test(readFileSync(f, "utf8")) && !/supabase[\\/]admin\.ts$/.test(f)).map((f) => relative(SRC, f)).sort();
    expect(users).toEqual([
      "app/actions/auth.ts", "app/actions/team.ts", "app/api/cron/notifications/route.ts", "app/login/page.tsx", "app/setup/page.tsx",
    ]);
  });
});
