import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/** QA visual: app (build separado em .next-visual) falando com tests/e2e-visual/fake-supabase (dados fictícios). */
const APP = 3101, FAKE = 54399;
const chromiumFallback = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const executablePath = process.env.CHROMIUM_PATH || (existsSync(chromiumFallback) ? chromiumFallback : undefined);

export default defineConfig({
  testDir: "tests/e2e-visual",
  timeout: 60_000,
  reporter: [["list"]],
  outputDir: "test-results-visual",
  use: { baseURL: `http://127.0.0.1:${APP}`, ...devices["Desktop Chrome"], launchOptions: { executablePath }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
  webServer: [
    { command: "node tests/e2e-visual/fake-supabase/server.mjs", url: `http://127.0.0.1:${FAKE}/health`, reuseExistingServer: !process.env.CI, env: { FAKE_PORT: String(FAKE) } },
    {
      command: `npx next start -p ${APP}`, url: `http://127.0.0.1:${APP}/api/health`, reuseExistingServer: !process.env.CI, timeout: 60_000,
      env: { NEXT_DIST_DIR: ".next-visual", NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FAKE}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fake-publishable", SUPABASE_SERVICE_ROLE_KEY: "fake-service", NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${APP}` },
    },
  ],
});
