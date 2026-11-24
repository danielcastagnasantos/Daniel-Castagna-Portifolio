/** Dublês usados nos testes: renderizador rápido (sem Remotion) e TTS que registra as chamadas. */
import { AppError } from "../core/errors";
import { runProcess } from "../core/media/process";
import { MockTts } from "../core/providers/tts/mock";
import type { TtsProvider, TtsRequest } from "../core/providers/tts/types";
import type { RenderRequest, Renderer } from "../core/render/types";

/** Renderizador de teste: não usa Remotion; gera um MP4 real (H.264 1080x1920@60 + AAC) do tamanho do plano. */
export class FakeRenderer implements Renderer {
  calls = 0;
  failNext = 0;
  hangUntilAbort = false;
  async render(req: RenderRequest) {
    this.calls++;
    if (this.hangUntilAbort) {
      await new Promise<void>((_, reject) => req.signal.addEventListener("abort", () => reject(new Error("abortado")), { once: true }));
    }
    if (this.failNext > 0) {
      this.failNext--;
      throw new AppError("RENDER_FAILED", "falha simulada");
    }
    const d = (req.plan.totalFrames / req.plan.fps).toFixed(3);
    const r = await runProcess("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", `color=c=0x101830:s=${req.plan.width}x${req.plan.height}:r=${req.plan.fps}:d=${d}`,
      "-f", "lavfi", "-i", `sine=frequency=330:duration=${d}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "35", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-shortest", "-f", "mp4", req.outFile,
    ]);
    if (r.code !== 0) throw new Error(r.stderr);
    req.onProgress(1);
    return { renderSeconds: 0.1 };
  }
}

export class SpyTts implements TtsProvider {
  readonly id = "teste";
  readonly realAlignment = false;
  texts: string[] = [];
  private inner = new MockTts();
  synthesize(req: TtsRequest) {
    this.texts.push(req.text);
    return this.inner.synthesize(req);
  }
}

