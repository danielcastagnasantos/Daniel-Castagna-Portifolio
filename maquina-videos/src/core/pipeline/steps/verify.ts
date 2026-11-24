import { AppError } from "../../errors";
import { exists } from "../../util/fs";
import { countWords } from "../../../shared/timing";
import { VIDEO, type Check, type Verification } from "../../../shared/schemas";
import type { StepContext } from "../context";
import { readPlan } from "./render";

const ok = (id: string, label: string, detail: string): Check => ({ id, label, status: "ok", detail });
const warn = (id: string, label: string, detail: string): Check => ({ id, label, status: "warn", detail });
const fail = (id: string, label: string, detail: string): Check => ({ id, label, status: "fail", detail });

/**
 * Verificação automática do vídeo pronto: formato, codec, duração, áudio, arquivos
 * ausentes e consistência das legendas. Nada disso depende de "achar que deu certo".
 */
export async function verifyStep(ctx: StepContext): Promise<void> {
  const { deps, projectId } = ctx;
  const project = await deps.store.require(projectId);
  const render = project.artifacts.render;
  const script = project.script;
  if (!render || !script) throw new AppError("NO_RENDER", "Não há vídeo renderizado para verificar.");
  const plan = await readPlan(ctx);
  const checks: Check[] = [];

  // 1. Arquivo
  const disk = deps.assets.toDisk(render.file);
  if (!disk || !(await exists(disk))) {
    checks.push(fail("file", "Arquivo do vídeo", `Arquivo ausente: ${render.file}`));
  } else {
    checks.push(ok("file", "Arquivo do vídeo", `${(render.sizeBytes / 1e6).toFixed(1)} MB`));
    const probe = await deps.ffmpeg.probe(disk, ctx.signal);
    const v = probe.video;
    const a = probe.audio;

    // 2. Formato / codec
    checks.push(
      v && v.width === VIDEO.width && v.height === VIDEO.height
        ? ok("resolution", "Resolução 1080×1920 (9:16)", `${v.width}×${v.height}`)
        : fail("resolution", "Resolução 1080×1920 (9:16)", v ? `Encontrado ${v.width}×${v.height}` : "Sem trilha de vídeo"),
    );
    checks.push(
      v?.fps && Math.abs(v.fps - VIDEO.fps) < 0.01
        ? ok("fps", "60 FPS", `${v.fps.toFixed(2)} fps`)
        : fail("fps", "60 FPS", v?.fps ? `Encontrado ${v.fps.toFixed(3)} fps` : "FPS desconhecido"),
    );
    checks.push(
      v?.codec === "h264"
        ? ok("codec", "Codec H.264", `${v.codec} (${v.profile ?? "?"}), ${v.pixFmt ?? "?"}`)
        : fail("codec", "Codec H.264", `Encontrado ${v?.codec ?? "nenhum"}`),
    );
    if (v?.pixFmt && v.pixFmt !== "yuv420p") {
      checks.push(warn("pixfmt", "Formato de pixel compatível", `${v.pixFmt} pode não tocar em todos os apps; o ideal é yuv420p.`));
    }

    // 3. Duração
    const expected = plan.totalFrames / plan.fps;
    const diff = Math.abs(probe.durationSec - expected);
    checks.push(
      diff <= 0.25
        ? ok("duration", "Duração confere com o plano", `${probe.durationSec.toFixed(2)}s (esperado ${expected.toFixed(2)}s)`)
        : diff <= 1
          ? warn("duration", "Duração confere com o plano", `${probe.durationSec.toFixed(2)}s vs esperado ${expected.toFixed(2)}s`)
          : fail("duration", "Duração confere com o plano", `${probe.durationSec.toFixed(2)}s vs esperado ${expected.toFixed(2)}s`),
    );
    const ratio = probe.durationSec / project.targetDurationSec;
    checks.push(
      ratio >= 0.7 && ratio <= 1.35
        ? ok("target", "Duração perto do alvo", `${probe.durationSec.toFixed(0)}s (alvo ~${project.targetDurationSec}s)`)
        : warn("target", "Duração perto do alvo", `${probe.durationSec.toFixed(0)}s, alvo ~${project.targetDurationSec}s — ajuste o roteiro se necessário.`),
    );

    // 4. Áudio
    if (!a) {
      checks.push(fail("audio", "Faixa de áudio", "O vídeo não tem áudio."));
    } else {
      const vol = await deps.ffmpeg.volume(disk, ctx.signal);
      if (vol.maxDb === null || vol.maxDb <= -60) checks.push(fail("silence", "Áudio audível", "O áudio está mudo."));
      else if ((vol.meanDb ?? -99) < -42) checks.push(warn("silence", "Áudio audível", `Volume muito baixo (média ${vol.meanDb?.toFixed(1)} dB).`));
      else checks.push(ok("silence", "Áudio audível", `${a.codec}, ${a.sampleRate ?? "?"} Hz, média ${vol.meanDb?.toFixed(1)} dB, pico ${vol.maxDb?.toFixed(1)} dB`));
      if (vol.maxDb !== null && vol.maxDb > -0.1) checks.push(warn("clipping", "Sem distorção", `Pico em ${vol.maxDb.toFixed(1)} dB: possível clipping.`));
    }
  }

  // 5. Arquivos referenciados pelo plano
  const refs = new Set<string>();
  for (const s of plan.scenes) {
    refs.add(s.narration.src);
    if (s.visual.src) refs.add(s.visual.src);
  }
  if (plan.audio.music) refs.add(plan.audio.music.src);
  for (const e of plan.audio.sfx) refs.add(e.src);
  const missing: string[] = [];
  for (const r of refs) {
    const d = deps.assets.toDisk(r);
    if (!d || !(await exists(d))) missing.push(r);
  }
  checks.push(
    missing.length === 0
      ? ok("assets", "Arquivos do plano presentes", `${refs.size} arquivo(s) conferido(s)`)
      : fail("assets", "Arquivos do plano presentes", `Ausentes: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}`),
  );

  // 6. Legendas
  const expectedWords = script.scenes.reduce((n, s) => n + countWords(s.narration), 0);
  const capWords = plan.captions.reduce((n, p) => n + p.words.length, 0);
  checks.push(
    capWords === expectedWords
      ? ok("captions-words", "Legendas cobrem toda a narração", `${capWords} palavras em ${plan.captions.length} páginas`)
      : fail("captions-words", "Legendas cobrem toda a narração", `Legendas têm ${capWords} palavras; a narração tem ${expectedWords}.`),
  );
  let order = true;
  let inRange = true;
  for (let i = 0; i < plan.captions.length; i++) {
    const p = plan.captions[i]!;
    const next = plan.captions[i + 1];
    if (p.endFrame <= p.startFrame || (next && p.endFrame > next.startFrame)) order = false;
    if (p.startFrame < 0 || p.endFrame > plan.totalFrames) inRange = false;
  }
  checks.push(order ? ok("captions-order", "Legendas em ordem e sem sobreposição", "ok") : fail("captions-order", "Legendas em ordem e sem sobreposição", "Há páginas sobrepostas ou invertidas."));
  checks.push(inRange ? ok("captions-range", "Legendas dentro da duração do vídeo", "ok") : fail("captions-range", "Legendas dentro da duração do vídeo", "Alguma legenda fica fora do vídeo."));

  // 7. Fala cabe dentro de cada cena
  const overflow = plan.scenes.filter((s) => s.narration.startFrame + s.narration.durationFrames > s.startFrame + s.durationFrames);
  checks.push(
    overflow.length === 0
      ? ok("sync", "Narração cabe em cada cena (sincronia)", `${plan.scenes.length} cenas`)
      : fail("sync", "Narração cabe em cada cena (sincronia)", `Cenas com fala maior que a cena: ${overflow.map((s) => s.id).join(", ")}`),
  );
  checks.push(plan.audio.music ? ok("music", "Trilha sonora", plan.audio.music.src) : warn("music", "Trilha sonora", "Sem trilha sonora (configure music.file na marca)."));
  if (project.testMode) checks.push(warn("test-mode", "Modo de teste", "Voz, roteiro e/ou imagens são de teste (sem IA). Não publique este vídeo."));

  const verification: Verification = { at: new Date().toISOString(), ok: !checks.some((c) => c.status === "fail"), checks };
  await deps.store.update(projectId, (p) => {
    p.artifacts.verification = verification;
  });
  const failed = checks.filter((c) => c.status === "fail");
  ctx.progress(1, failed.length ? `${failed.length} falha(s)` : "Tudo certo");
  if (failed.length) {
    throw new AppError("VERIFICATION_FAILED", `Verificação reprovou o vídeo: ${failed.map((c) => c.label).join("; ")}.`);
  }
  ctx.log.info(`Verificação OK (${checks.length} checagens, ${checks.filter((c) => c.status === "warn").length} aviso(s)).`);
}
