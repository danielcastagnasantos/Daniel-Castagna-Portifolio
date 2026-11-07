import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E sem backend (padrão): sobe o build de produção apontando para um Supabase INEXISTENTE e testa
 * tudo que não depende do banco: redirecionamentos, PWA, cabeçalhos de segurança, layout responsivo,
 * tema escuro, e o comportamento da interface quando o servidor não responde.
 * Fluxos completos com banco: veja tests/e2e-backend e README (usa `supabase start`).
 */
const PORT = 3100;
const chromiumFallback = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const executablePath = process.env.CHROMIUM_PATH || (existsSync(chromiumFallback) ? chromiumFallback : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
    launchOptions: { executablePath },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", // porta fechada de propósito
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable",
      SUPABASE_SERVICE_ROLE_KEY: "e2e-service",
      CRON_SECRET: "e2e-cron-secret",
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`,
    },
  },
});
