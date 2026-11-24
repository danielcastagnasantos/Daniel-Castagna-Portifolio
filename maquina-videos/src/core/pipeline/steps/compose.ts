import fs from "node:fs/promises";
import path from "node:path";
import { exists, atomicWriteJson } from "../../util/fs";
import { hashOf } from "../../util/hash";
import { ensureTestAssets } from "../../media/testAssets";
import { buildRenderPlan, type PlanNarration, type PlanVisual } from "../../../shared/plan";
import type { RenderPlan } from "../../../shared/schemas";
import type { StepContext } from "../context";

export interface ComposeResult {
  plan: RenderPlan;
  planHash: string;
  warnings: string[];
}

/** Monta o plano de renderização (timeline + legendas + áudio) a partir dos artefatos. Puro e rápido. */
export async function buildPlanForProject(ctx: StepContext): Promise<ComposeResult> {
  const { deps, projectId, brand, providers } = ctx;
  const project = await deps.store.require(projectId);
  const script = project.script;
  if (!script) throw new Error("Sem roteiro.");
  const warnings: string[] = [];

  const narrations: Record<string, PlanNarration> = {};
  const visuals: Record<string, PlanVisual> = {};
  for (const s of script.scenes) {
    const a = project.artifacts.scenes[s.id];
    if (!a?.narration) throw new Error(`Cena ${s.id} sem narração.`);
    narrations[s.id] = { src: a.narration.file, durationSec: a.narration.durationSec, words: a.narration.words };
    if (a.visual) visuals[s.id] = { kind: a.visual.kind, src: a.visual.file, graphic: a.visual.graphic, durationSec: a.visual.durationSec };
  }

  // Trilha e efeitos: biblioteca da marca; em modo de teste, sons sintéticos locais.
  let music: { src: string } | undefined;
  const sfx: Record<string, string> = {};
  if (brand.music.file) {
    const rel = `assets/${brand.music.file.replace(/\\/g, "/")}`;
    const disk = deps.assets.toDisk(rel);
    if (disk && (await exists(disk))) music = { src: rel };
    else warnings.push(`Trilha configurada (${brand.music.file}) não existe em assets/. O vídeo sairá sem trilha.`);
  }
  for (const [name, file] of Object.entries(brand.sfx.library)) {
    const rel = `assets/${file.replace(/\\/g, "/")}`;
    const disk = deps.assets.toDisk(rel);
    if (disk && (await exists(disk))) sfx[name] = rel;
    else warnings.push(`Efeito "${name}" (${file}) não existe em assets/.`);
  }
  if (providers.testMode) {
    const t = await ensureTestAssets(deps.config.dataDir);
    music ??= { src: `data/${t.music}` };
    for (const [n, f] of Object.entries(t.sfx)) sfx[n] ??= `data/${f}`;
  } else if (!music) {
    warnings.push("Sem trilha sonora: defina music.file na marca (ex.: library/music/trilha.mp3).");
  }

  const { plan, warnings: planWarnings } = buildRenderPlan({ title: script.title, brand, script, narrations, visuals, music, sfx });
  warnings.push(...planWarnings);
  return { plan, planHash: hashOf({ plan, renderer: RENDER_VERSION }), warnings };
}

/** Mude ao alterar a composição Remotion: invalida renders antigos em cache. */
export const RENDER_VERSION = 1;

export async function composeStep(ctx: StepContext): Promise<void> {
  const { plan, planHash, warnings } = await buildPlanForProject(ctx);
  for (const w of warnings) ctx.log.warn(w);
  const dir = path.join(ctx.projectDir, "render");
  await fs.mkdir(dir, { recursive: true });
  await atomicWriteJson(path.join(dir, "plan.json"), plan);
  await ctx.deps.store.update(ctx.projectId, (p) => {
    p.artifacts.planHash = planHash;
  });
  ctx.progress(1, `${plan.scenes.length} cenas, ${(plan.totalFrames / plan.fps).toFixed(1)}s, ${plan.captions.length} páginas de legenda`);
}
