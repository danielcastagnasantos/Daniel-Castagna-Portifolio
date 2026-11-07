// SERVIDOR DE FIXTURES — SOMENTE PARA QA VISUAL E DE RENDERIZAÇÃO.
// Imita só o formato das respostas do Supabase (Auth + PostgREST) com dados FICTÍCIOS fixos.
// Não aplica filtros, não valida regras e NÃO substitui testes com banco real: serve para ver as
// telas e achar erros de renderização/hidratação. Nada daqui vai para produção.
import { createServer } from "node:http";
import { fixtures } from "./fixtures.mjs";

const PORT = Number(process.env.FAKE_PORT ?? 54399);
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const subOf = (auth) => {
  try { return JSON.parse(Buffer.from(String(auth).replace("Bearer ", "").split(".")[1], "base64url").toString()).sub; } catch { return null; }
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sub = subOf(req.headers.authorization);
  const user = fixtures.users[sub];
  let body = "";
  for await (const c of req) body += c;

  if (url.pathname === "/health") return json(res, 200, { ok: true });
  if (url.pathname === "/auth/v1/user") return user ? json(res, 200, user.auth) : json(res, 401, { message: "invalid JWT" });
  if (url.pathname.startsWith("/auth/v1/")) return json(res, 200, {});

  const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
  if (rpc) {
    const fn = fixtures.rpc[rpc[1]];
    if (fn === undefined) return json(res, 404, { code: "PGRST202", message: `fixture ausente para rpc ${rpc[1]}` });
    const out = typeof fn === "function" ? fn(JSON.parse(body || "{}"), user) : fn;
    return json(res, 200, out);
  }
  const tbl = /^\/rest\/v1\/(\w+)$/.exec(url.pathname);
  if (tbl) {
    const t = fixtures.tables[tbl[1]];
    if (t === undefined) return json(res, 404, { code: "42P01", message: `fixture ausente para tabela ${tbl[1]}` });
    let rows = typeof t === "function" ? t(user, url) : t;
    // Filtros simples do PostgREST (eq/neq/in/is) para as consultas "por id" retornarem uma única linha.
    for (const [key, val] of url.searchParams) {
      if (["select", "order", "limit", "offset", "or", "and"].includes(key)) continue;
      if (val.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === val.slice(3));
      else if (val.startsWith("neq.")) rows = rows.filter((r) => String(r[key]) !== val.slice(4));
      else if (val.startsWith("in.(")) { const set = val.slice(4, -1).split(","); rows = rows.filter((r) => set.includes(String(r[key]))); }
      else if (val === "is.null") rows = rows.filter((r) => r[key] == null);
    }
    const accept = String(req.headers.accept ?? "");
    if (req.method === "HEAD") return json(res, 200, undefined, { "content-range": `*/${rows.length}` });
    if (accept.includes("pgrst.object")) return rows.length ? json(res, 200, rows[0]) : json(res, 406, { code: "PGRST116", message: "no rows" });
    return json(res, 200, rows, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
  }
  json(res, 404, { message: "não implementado no fake" });
}).listen(PORT, "127.0.0.1", () => console.log(`fake-supabase em http://127.0.0.1:${PORT}`));
