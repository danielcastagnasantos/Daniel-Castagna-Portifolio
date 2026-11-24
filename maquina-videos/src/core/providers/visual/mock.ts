/**
 * Visuais do MODO DE TESTE: imagem de gradiente (PNG local) ou clipe sintético do FFmpeg.
 * Não são "imagens geradas por IA" — servem para exercitar os caminhos de imagem/vídeo.
 */
import { atomicWrite } from "../../util/fs";
import type { Ffmpeg } from "../../media/ffmpeg";
import { gradientImage } from "../../media/synth";
import type { VisualProvider, VisualRequest, VisualResult } from "./types";

export class MockVisuals implements VisualProvider {
  readonly id = "teste";
  constructor(private ffmpeg: Ffmpeg) {}

  async resolve(req: VisualRequest): Promise<VisualResult | undefined> {
    const { brand } = req;
    if (req.scene.visual.kind === "video") {
      const file = `${req.outBase}.mp4`;
      await this.ffmpeg.makeTestVideo(file, { seconds: 4, width: 540, height: 960, fps: 30 }, req.signal);
      return { kind: "video", file, provider: this.id, durationSec: 4 };
    }
    const file = `${req.outBase}.png`;
    const png = gradientImage(540, 960, brand.palette.backgroundAlt, brand.palette.primary, req.seed);
    await atomicWrite(file, png);
    return { kind: "image", file, provider: this.id };
  }
}
