/**
 * Ferramenta de depuração visual: renderiza quadros (PNG) de um projeto sem renderizar o vídeo todo.
 *   npm run still -- <idDoProjeto> 10 120 300 [--saida pasta]
 * Usa o plano gerado na etapa "Montagem" (render/plan.json) e o mesmo bundle do render.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { AssetPaths } from "../core/assets";
import { loadConfig, loadEnvFile } from "../core/config";
import { createAssetApp } from "../core/render/assetApp";
import { RenderPlanSchema } from "../shared/schemas";

async function main() {
  loadEnvFile();
  const config = loadConfig();
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { saida: { type: "string" } } });
  const [projectId, ...frames] = positionals;
  if (!projectId || frames.length === 0) {
    console.error("Uso: npm run still -- <idDoProjeto> <frame> [<frame>...] [--saida pasta]");
    process.exit(2);
  }
  const projectDir = path.join(config.dataDir, "projects", projectId);
  const plan = RenderPlanSchema.parse(JSON.parse(await fs.readFile(path.join(projectDir, "render", "plan.json"), "utf8")));
  const outDir = path.resolve(values.saida ?? path.join(projectDir, "render", "stills"));
  await fs.mkdir(outDir, { recursive: true });

  const serveUrl = await bundle({
    entryPoint: path.join(config.rootDir, "src", "remotion", "index.ts"),
    publicDir: config.publicDir,
    outDir: path.join(config.dataDir, "cache", "bundle-still"),
  });
  const server = serve({ fetch: createAssetApp(new AssetPaths(config.dataDir, config.assetsDir)).fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => (server.listening ? r() : server.once("listening", () => r())));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const inputProps = { plan: { ...plan, assetBase: `http://127.0.0.1:${port}` } };
  try {
    const common = { serveUrl, browserExecutable: config.browserExecutable ?? null, logLevel: "warn" as const };
    const composition = await selectComposition({ ...common, id: "MainVideo", inputProps });
    for (const f of frames) {
      const out = path.join(outDir, `frame-${String(f).padStart(5, "0")}.png`);
      await renderStill({ ...common, composition, inputProps, frame: Number(f), output: out, imageFormat: "png" });
      console.log(out);
    }
  } finally {
    server.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
