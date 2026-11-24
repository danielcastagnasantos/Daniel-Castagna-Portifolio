import path from "node:path";
import { hashOf } from "../../util/hash";
import { exists } from "../../util/fs";
import { seedFromString } from "../../../shared/timing";
import { pickGraphic } from "../../../shared/plan";
import type { Project, Scene, VisualArtifact } from "../../../shared/schemas";
import { throwIfCancelled, type StepContext } from "../context";

function findVisual(project: Project, hash: string): VisualArtifact | undefined {
  for (const a of Object.values(project.artifacts.scenes)) if (a.visual?.inputHash === hash) return a.visual;
  return undefined;
}

function visualHash(ctx: StepContext, project: Project, scene: Scene): string {
  return hashOf({
    v: 1,
    resolver: ctx.providers.visuals.id,
    test: project.testMode,
    kind: scene.visual.kind,
    description: scene.visual.description,
    prompt: scene.visual.prompt ?? "",
    tags: scene.visual.libraryTags,
    graphic: scene.visual.graphic ?? null,
    onScreen: scene.onScreenText ?? "",
    palette: ctx.brand.palette,
  });
}

export async function visualsStep(ctx: StepContext): Promise<void> {
  const { deps, projectId, providers } = ctx;
  const initial = await deps.store.require(projectId);
  const script = initial.script;
  if (!script) throw new Error("Sem roteiro.");
  const used = new Set<string>();
  let reused = 0;
  let made = 0;

  for (const [i, scene] of script.scenes.entries()) {
    throwIfCancelled(ctx.signal);
    ctx.progress(i / script.scenes.length, `Cena ${i + 1}/${script.scenes.length}`);
    const current = await deps.store.require(projectId);
    const hash = visualHash(ctx, current, scene);
    const existing = findVisual(current, hash);
    const disk = existing?.file ? deps.assets.toDisk(existing.file) : null;
    if (existing && (existing.kind === "graphic" || (disk && (await exists(disk))))) {
      if (existing.file && disk) used.add(disk);
      reused++;
      if (current.artifacts.scenes[scene.id]?.visual?.inputHash !== hash) {
        await deps.store.update(projectId, (p) => {
          p.artifacts.scenes[scene.id] = { ...p.artifacts.scenes[scene.id], visual: existing };
        });
      }
      continue;
    }

    const seed = seedFromString(`${scene.id}:${script.title}`);
    const res = await providers.visuals.resolve({
      scene,
      brand: ctx.brand,
      outBase: path.join(ctx.projectDir, "media", `v-${hash}`),
      seed,
      usedLibraryFiles: used,
      signal: ctx.signal,
    });

    let durationSec = res.durationSec;
    if (res.kind === "video" && res.file) {
      try {
        durationSec = (await deps.ffmpeg.probe(res.file, ctx.signal)).durationSec || durationSec;
      } catch {
        /* mantém a duração informada */
      }
    }
    const artifact: VisualArtifact = {
      inputHash: hash,
      kind: res.kind,
      file: res.file ? deps.assets.fromDisk(res.file) : undefined,
      graphic: res.kind === "graphic" ? (res.graphic ?? pickGraphic(seed)) : undefined,
      provider: res.provider,
      durationSec,
    };
    made++;
    await deps.store.update(projectId, (p) => {
      p.artifacts.scenes[scene.id] = { ...p.artifacts.scenes[scene.id], visual: artifact };
    });
    ctx.log.info(`Visual da cena ${scene.id}: ${artifact.kind} (${artifact.provider})`);
  }
  ctx.progress(1, `${made} gerado(s), ${reused} reaproveitado(s)`);
}
