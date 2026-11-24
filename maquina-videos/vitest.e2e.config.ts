import { defineConfig } from "vitest/config";

// Testes de ponta a ponta: sobem o servidor de verdade e rodam o pipeline inteiro
// em modo de teste (inclui renderização Remotion — leva alguns minutos).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 15 * 60_000,
    hookTimeout: 5 * 60_000,
    fileParallelism: false,
  },
});
