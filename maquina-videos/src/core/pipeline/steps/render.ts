import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../../errors";
import { exists, fileSize, renameWithRetry } from "../../util/fs";
import { RenderPlanSchema } from "../../../shared/schemas";
import type { StepContext } from "../context";

export async function readPlan(ctx: StepContext) {
  const file = path.join(ctx.projectDir, "render", "plan.json");
  return RenderPlanSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
}

export async function renderStep(ctx: StepContext): Promise<void> {
  const { deps, projectId } = ctx;
  const project = await deps.store.require(projectId);
  const planHash = project.artifacts.planHash;
  if (!planHash) throw new AppError("NO_PLAN", "Plano de renderização ausente (etapa de montagem não rodou).");

  const rel = `render/video-${planHash.slice(0, 12)}.mp4`;
  const finalFile = path.join(ctx.projectDir, rel);
  const prev = project.artifacts.render;
  if (prev?.inputHash === planHash && (await exists(finalFile))) {
    ctx.progress(1, "Vídeo já renderizado (reaproveitado)");
    ctx.log.info("Render reaproveitado: nada mudou desde a última renderização.");
    return;
  }

  const plan = await readPlan(ctx);
  const partial = path.join(ctx.projectDir, "render", `video-${planHash.slice(0, 12)}.partial.mp4`);
  await fs.rm(partial, { force: true });
  const started = Date.now();
  ctx.log.info(`Renderizando ${plan.scenes.length} cenas · ${plan.width}x${plan.height} @ ${plan.fps}fps · ${(plan.totalFrames / plan.fps).toFixed(1)}s`);
  const { renderSeconds } = await deps.renderer.render({
    plan,
    outFile: partial,
    signal: ctx.signal,
    onProgress: (f, d) => ctx.progress(f, d),
  });
  await renameWithRetry(partial, finalFile);

  let durationSec = plan.totalFrames / plan.fps;
  try {
    durationSec = (await deps.ffmpeg.probe(finalFile, ctx.signal)).durationSec || durationSec;
  } catch {
    /* a verificação reporta o problema */
  }
  const sizeBytes = await fileSize(finalFile);
  await deps.store.update(projectId, (p) => {
    p.artifacts.render = {
      inputHash: planHash,
      file: deps.assets.fromDisk(finalFile),
      durationSec,
      sizeBytes,
      renderedAt: new Date().toISOString(),
      renderSeconds: renderSeconds || (Date.now() - started) / 1000,
    };
    p.artifacts.preview = undefined;
    p.artifacts.verification = undefined;
  });

  // Mantém só o render mais recente (economiza disco).
  for (const f of await fs.readdir(path.join(ctx.projectDir, "render"))) {
    if (/^video-.*\.mp4$/.test(f) && path.join(ctx.projectDir, "render", f) !== finalFile) {
      await fs.rm(path.join(ctx.projectDir, "render", f), { force: true });
    }
  }
  ctx.log.info(`Render concluído em ${((Date.now() - started) / 1000).toFixed(0)}s (${(sizeBytes / 1e6).toFixed(1)} MB)`);
}
