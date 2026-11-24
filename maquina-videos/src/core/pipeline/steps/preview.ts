import path from "node:path";
import { AppError } from "../../errors";
import { fileSize } from "../../util/fs";
import type { StepContext } from "../context";

/** Prévia leve (540×960 @30fps) + imagem de capa — rápida de abrir e pequena para o Telegram. */
export async function previewStep(ctx: StepContext): Promise<void> {
  const { deps, projectId } = ctx;
  const project = await deps.store.require(projectId);
  const render = project.artifacts.render;
  if (!render) throw new AppError("NO_RENDER", "Sem vídeo renderizado.");
  const src = deps.assets.toDisk(render.file);
  if (!src) throw new AppError("NO_RENDER", "Caminho do vídeo inválido.");
  const tag = render.inputHash.slice(0, 12);
  const previewFile = path.join(ctx.projectDir, "render", `preview-${tag}.mp4`);
  const posterFile = path.join(ctx.projectDir, "render", `poster-${tag}.jpg`);
  await deps.ffmpeg.makePreview(src, previewFile, ctx.signal);
  ctx.progress(0.8, "Capa");
  await deps.ffmpeg.makePoster(src, posterFile, Math.min(1.2, render.durationSec / 3), ctx.signal);
  await deps.store.update(projectId, (p) => {
    p.artifacts.preview = {
      inputHash: render.inputHash,
      file: deps.assets.fromDisk(previewFile),
      poster: deps.assets.fromDisk(posterFile),
      sizeBytes: 0,
    };
  });
  const size = await fileSize(previewFile);
  await deps.store.update(projectId, (p) => {
    if (p.artifacts.preview) p.artifacts.preview.sizeBytes = size;
  });
  ctx.progress(1, `${(size / 1e6).toFixed(1)} MB`);
}
