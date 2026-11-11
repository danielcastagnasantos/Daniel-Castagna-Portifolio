// SERVIDOR DE TESTE: imita o formato do Supabase (login + tabela `lancamentos`) em memória.
// Serve só para os testes de navegador. As regras reais de segurança são testadas no PostgreSQL (tests/db).
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_PORT ?? 54400);
const USERS = { "dono@teste.com": { id: "u1", senha: "senha12345", acesso: true }, "intruso@teste.com": { id: "u2", senha: "senha12345", acesso: false } };
let rows = [];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (email) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USERS[email].id, email, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const emailOf = (req) => { try { return JSON.parse(Buffer.from(String(req.headers.authorization).replace("Bearer ", "").split(".")[1], "base64url").toString()).email; } catch { return null; } };

createServer(async (req, res) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS", "access-control-expose-headers": "content-range" };
  const send = (status, body, extra = {}) => { res.writeHead(status, { "content-type": "application/json", ...cors, ...extra }); res.end(body === undefined ? "" : JSON.stringify(body)); };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  let raw = ""; for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};

  if (url.pathname === "/health") return send(200, { ok: true });
  if (url.pathname === "/__reset") { rows = []; return send(200, { ok: true }); }
  if (url.pathname === "/__rows") return send(200, rows);

  if (url.pathname === "/auth/v1/token") {
    const u = USERS[body.email];
    if (!u || u.senha !== body.password) return send(400, { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials", msg: "Invalid login credentials" });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return send(200, { access_token: jwt(body.email), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r", user: { id: u.id, aud: "authenticated", role: "authenticated", email: body.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });
  }
  if (url.pathname === "/auth/v1/logout") return send(204);
  if (url.pathname === "/auth/v1/user") { const e = emailOf(req); return e ? send(200, { id: USERS[e].id, email: e, aud: "authenticated" }) : send(401, { msg: "invalid" }); }

  const email = emailOf(req);
  const allowed = email && USERS[email]?.acesso;
  if (url.pathname === "/rest/v1/acesso") return send(200, allowed && url.searchParams.get("email") === `eq.${email}` ? [{ email }] : []);

  if (url.pathname === "/rest/v1/lancamentos") {
    if (req.method === "GET") {
      if (!allowed) return send(200, []);
      let out = rows.filter((r) => r.excluido_em == null).sort((a, b) => b.data.localeCompare(a.data) || b.criado_em.localeCompare(a.criado_em));
      const off = Number(url.searchParams.get("offset") ?? 0), lim = Number(url.searchParams.get("limit") ?? 1000);
      out = out.slice(off, off + lim);
      return send(200, out.map((r) => { const c = { ...r }; delete c.excluido_em; return c; }));
    }
    if (req.method === "POST") {
      if (!allowed) return send(403, { code: "42501", message: "new row violates row-level security policy" });
      const r = body;
      if (!(r.valor_centavos > 0) || !["entrada", "saida"].includes(r.tipo) || !["dinheiro", "cartao"].includes(r.forma) || !String(r.categoria ?? "").trim())
        return send(400, { code: "23514", message: "check constraint" });
      if (rows.some((x) => x.id === r.id)) return send(409, { code: "23505", message: "duplicate key value" });
      rows.push({ ...r, descricao: r.descricao ?? null, criado_em: new Date().toISOString(), excluido_em: null });
      return send(201);
    }
    if (req.method === "PATCH") {
      if (!allowed) return send(403, { code: "42501", message: "permission denied" });
      const id = (url.searchParams.get("id") ?? "").replace("eq.", "");
      const hit = rows.filter((r) => r.id === id);
      hit.forEach((r) => Object.assign(r, body));
      return send(200, hit.map((r) => ({ id: r.id })));
    }
  }
  send(404, { message: "não implementado no fake" });
}).listen(PORT, "127.0.0.1", () => console.log(`fake supabase em http://127.0.0.1:${PORT}`));
