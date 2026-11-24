import path from "node:path";
import { hashOf } from "../../util/hash";
import { exists } from "../../util/fs";
import { seedFromString } from "../../../shared/timing";
import type { NarrationArtifact, Project } from "../../../shared/schemas";
import { throwIfCancelled, type StepContext } from "../context";

function findNarration(project: Project, hash: string): NarrationArtifact | undefined {
  for (const a of Object.values(project.artifacts.scenes)) if (a.narration?.inputHash === hash) return a.narration;
  return undefined;
}

export function narrationHash(ctx: Pick<StepContext, "providers" | "brand">, text: string): string {
  return hashOf({ v: 1, text, voice: ctx.providers.voiceFor(ctx.brand), provider: ctx.providers.tts.id });
}

/** Gera a narração cena a cena. Idempotente: reaproveita áudio cujo texto/voz não mudou. */
export async function narrationStep(ctx: StepContext): Promise<void> {
  const { deps, projectId, providers, brand } = ctx;
  const initial = await deps.store.require(projectId);
  const script = initial.script;
  if (!script) throw new Error("Sem roteiro.");
  const voice = providers.voiceFor(brand);
  let reused = 0;
  let generated = 0;
  let chars = 0;

  for (const [i, scene] of script.scenes.entries()) {
    throwIfCancelled(ctx.signal);
    ctx.progress(i / script.scenes.length, `Cena ${i + 1}/${script.scenes.length}`);
    const hash = narrationHash(ctx, scene.narration);
    const current = await deps.store.require(projectId);
    const existing = findNarration(current, hash);
    const existingDisk = existing ? deps.assets.toDisk(existing.file) : null;
    if (existing && existingDisk && (await exists(existingDisk))) {
      reused++;
      if (current.artifacts.scenes[scene.id]?.narration?.inputHash !== hash) {
        await deps.store.update(projectId, (p) => {
          p.artifacts.scenes[scene.id] = { ...p.artifacts.scenes[scene.id], narration: existing };
        });
      }
      continue;
    }

    const res = await providers.tts.synthesize({
      text: scene.narration,
      voice,
      previousText: script.scenes[i - 1]?.narration,
      nextText: script.scenes[i + 1]?.narration,
      outBase: path.join(ctx.projectDir, "audio", `n-${hash}`),
      seed: seedFromString(hash),
      signal: ctx.signal,
    });

    // A duração do arquivo (ffprobe) é a verdade; o provedor é só reserva.
    let durationSec = res.durationSec;
    try {
      const probe = await deps.ffmpeg.probe(res.file, ctx.signal);
      if (probe.durationSec > 0.2) durationSec = probe.durationSec;
    } catch (e) {
      if (e instanceof Error && e.name === "CancelledError") throw e;
      ctx.log.warn(`ffprobe indisponível para medir o áudio da cena ${scene.id}; usando a duração informada pelo provedor.`, { error: (e as Error).message });
      durationSec = res.durationSec + 0.15;
    }
    const words = res.words.map((w) => ({ text: w.text, start: Math.min(w.start, durationSec), end: Math.min(w.end, durationSec) }));
    const artifact: NarrationArtifact = {
      inputHash: hash,
      file: deps.assets.fromDisk(res.file),
      durationSec,
      words,
      provider: providers.tts.id,
      characters: res.characters,
    };
    generated++;
    chars += res.characters;
    await deps.store.update(projectId, (p) => {
      p.artifacts.scenes[scene.id] = { ...p.artifacts.scenes[scene.id], narration: artifact };
    });
    ctx.log.info(`Narração da cena ${scene.id} pronta (${durationSec.toFixed(2)}s, ${res.characters} caracteres)`);
  }

  // Remove artefatos de cenas que não existem mais.
  await deps.store.update(projectId, (p) => {
    const ids = new Set(script.scenes.map((s) => s.id));
    for (const id of Object.keys(p.artifacts.scenes)) if (!ids.has(id)) delete p.artifacts.scenes[id];
  });
  ctx.progress(1, `${generated} gerada(s), ${reused} reaproveitada(s)${chars ? `, ${chars} caracteres` : ""}`);
  ctx.log.info(`Narração: ${generated} nova(s), ${reused} reaproveitada(s).`);
}
