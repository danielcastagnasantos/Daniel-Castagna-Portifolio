import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const APP = 3200, FAKE = 54400;
const fallback = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const executablePath = process.env.CHROMIUM_PATH || (existsSync(fallback) ? fallback : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${APP}`, ...devices["Desktop Chrome"], launchOptions: { executablePath }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
  webServer: [
    { command: "node tests/fake/server.mjs", url: `http://127.0.0.1:${FAKE}/health`, reuseExistingServer: !process.env.CI, env: { FAKE_PORT: String(FAKE) } },
    { command: `npx next start -p ${APP}`, url: `http://127.0.0.1:${APP}/manifest.webmanifest`, reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
});
