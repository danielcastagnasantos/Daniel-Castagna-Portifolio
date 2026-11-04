// Executa os testes de ponta a ponta (Playwright) já com o build certo.
//   node scripts/run-e2e.mjs            -> suíte sem backend (PWA, redirecionamentos, segurança, layout)
//   node scripts/run-e2e.mjs visual     -> QA visual/renderização com servidor de fixtures fictícias
import { spawnSync } from "node:child_process";

const visual = process.argv[2] === "visual";
const env = visual
  ? { NEXT_DIST_DIR: ".next-visual", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fake-publishable", SUPABASE_SERVICE_ROLE_KEY: "fake-service" }
  : { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable", SUPABASE_SERVICE_ROLE_KEY: "e2e-service" };
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env }, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("npx", ["next", "build"]);
run("npx", ["playwright", "test", ...(visual ? ["-c", "playwright.visual.config.ts"] : [])]);
