// Faz o build apontando para o servidor de teste (imita o Supabase) e roda o Playwright.
import { spawnSync } from "node:child_process";
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54400", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "chave-de-teste" };
for (const [cmd, args] of [["npx", ["next", "build"]], ["npx", ["playwright", "test"]]]) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
