/**
 * Produção pela linha de comando (sem a interface web) — útil para testar e para automação.
 *   npm run produzir -- "tema do vídeo" --duracao 30 [--ao-vivo] [--aprovar] [--visuais graphics|library|generated-images|generated-video]
 * Sem --aprovar, para depois do roteiro (você aprova pela interface ou rodando de novo com --aprovar).
 */
import { parseArgs } from "node:util";
import { createApp } from "../core/app";
import { loadConfig, loadEnvFile } from "../core/config";
import { attachLogSinks } from "../core/logging";
import { toErrorInfo } from "../core/errors";
import type { Project, VisualMode } from "../shared/schemas";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    marca: { type: "string" },
    duracao: { type: "string" },
    visuais: { type: "string" },
    "ao-vivo": { type: "boolean", default: false },
    aprovar: { type: "boolean", default: false },
  },
});
const arg = (name: "marca" | "duracao" | "visuais") => values[name];
const flag = (name: "ao-vivo" | "aprovar") => values[name] === true;

async function waitFor(get: () => Promise<Project>, done: (p: Project) => boolean, timeoutMs: number): Promise<Project> {
  const t0 = Date.now();
  for (;;) {
    const p = await get();
    if (done(p)) return p;
    if (Date.now() - t0 > timeoutMs) throw new Error("Tempo esgotado esperando o pipeline.");
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main() {
  loadEnvFile();
  const config = loadConfig();
  const theme = positionals.join(" ").trim();
  if (!theme) {
    console.error('Uso: npm run produzir -- "tema do vídeo" [--duracao 30] [--ao-vivo] [--aprovar] [--visuais graphics]');
    process.exit(2);
  }
  const app = await createApp(config);
  attachLogSinks(config.dataDir, app.bus);
  const testMode = flag("ao-vivo") ? false : true;
  const project = await app.engine.createProject({
    brandId: arg("marca") ?? "versao-x",
    theme,
    targetDurationSec: Number(arg("duracao") ?? 30),
    testMode,
    visualMode: (arg("visuais") as VisualMode | undefined) ?? "graphics",
  });
  console.log(`Projeto ${project.id} (${testMode ? "MODO DE TESTE — sem custo" : "AO VIVO — usa APIs pagas"})`);
  await app.engine.generateScript(project.id);
  const scripted = await waitFor(() => app.store.require(project.id), (p) => p.status !== "generating_script", 10 * 60_000);
  if (scripted.status === "failed") throw new Error(scripted.lastError?.message ?? "Falha ao gerar o roteiro.");
  console.log(`\nRoteiro: ${scripted.script?.title}`);
  scripted.script?.scenes.forEach((s) => console.log(`  [${s.id}] ${s.narration}`));
  if (!flag("aprovar")) {
    console.log("\nRoteiro pronto. Rode com --aprovar para produzir, ou aprove pela interface web.");
    return;
  }
  await app.engine.approveScript(project.id);
  const done = await waitFor(() => app.store.require(project.id), (p) => p.status !== "producing", 60 * 60_000);
  if (done.status !== "awaiting_video_approval") throw new Error(done.lastError?.message ?? `Terminou em "${done.status}".`);
  const { file } = await app.engine.exportVideo(project.id);
  console.log(`\n✔ Vídeo exportado: ${file}`);
}

main().catch((e) => {
  console.error(`\n✖ ${toErrorInfo(e).message}`);
  process.exit(1);
});
