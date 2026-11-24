import { serve } from "@hono/node-server";
import { createApp } from "../core/app";
import { loadConfig, loadEnvFile, providerAvailability } from "../core/config";
import { toErrorInfo } from "../core/errors";
import { attachLogSinks } from "../core/logging";
import { createLogger } from "../core/logger";
import { createServerApp } from "./app";

async function main() {
  loadEnvFile();
  const config = loadConfig();
  const app = await createApp(config);
  attachLogSinks(config.dataDir, app.bus);
  const log = createLogger();

  // Bibliotecas (ex.: Remotion ao falhar o download do navegador) podem emitir um segundo erro "solto" além
  // do erro que já tratamos. Num servidor local com estado gravado em disco, registramos e seguimos em frente.
  process.on("unhandledRejection", (reason) => log.error(`Rejeição não tratada (ignorada): ${toErrorInfo(reason).message}`));
  process.on("uncaughtException", (err) => log.error(`Exceção não tratada (ignorada): ${toErrorInfo(err).message}`));

  const server = serve({ fetch: createServerApp(app).fetch, port: config.server.port, hostname: config.server.host });
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") log.error(`A porta ${config.server.port} já está em uso. Feche a outra instância ou defina PORT no .env.`);
    else log.error(`Erro no servidor: ${e.message}`);
    process.exit(1);
  });
  await new Promise<void>((r) => (server.listening ? r() : server.once("listening", () => r())));

  const av = providerAvailability(config);
  log.info(`Máquina de Vídeos em http://${config.server.host === "0.0.0.0" ? "localhost" : config.server.host}:${config.server.port}`);
  log.info(`Dados em ${config.dataDir}`);
  log.info(`Chaves: Claude ${av.anthropic ? "✔" : "✘"} · ElevenLabs ${av.elevenlabs ? "✔" : "✘"} · Runway ${av.runway ? "✔" : "✘"} · Telegram ${av.telegram ? "✔" : "✘"} · Webhook ${av.webhook ? "✔" : "✘"}`);
  if (config.defaultTestMode) log.info("Modo de teste é o padrão: nenhum custo até você desligá-lo por projeto.");

  const { startIntegrations } = await import("./integrations");
  const stop = await startIntegrations(app);

  // Retoma o que ficou pela metade (ex.: queda de energia no meio de uma renderização).
  const resumed = await app.engine.recoverInterrupted(process.env.AUTO_RESUME !== "false").catch((e) => {
    log.error(`Falha ao recuperar projetos interrompidos: ${toErrorInfo(e).message}`);
    return [] as string[];
  });
  if (resumed.length) log.info(`Retomando ${resumed.length} projeto(s) interrompido(s): ${resumed.join(", ")}`);

  const shutdown = () => {
    log.info("Encerrando…");
    stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(`\n✖ ${toErrorInfo(e).message}\n`);
  process.exit(1);
});
