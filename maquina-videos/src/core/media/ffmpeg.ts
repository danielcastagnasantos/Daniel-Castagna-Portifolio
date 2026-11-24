import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors";
import { ensureDir } from "../util/fs";
import { runBinary, runProcess } from "./process";

export interface StreamInfo {
  type: "video" | "audio" | "other";
  codec: string;
  profile?: string;
  width?: number;
  height?: number;
  fps?: number;
  pixFmt?: string;
  channels?: number;
  sampleRate?: number;
  durationSec?: number;
}
export interface ProbeResult {
  durationSec: number;
  sizeBytes: number;
  formatName: string;
  streams: StreamInfo[];
  video?: StreamInfo;
  audio?: StreamInfo;
}

interface RawStream {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  pix_fmt?: string;
  channels?: number;
  sample_rate?: string;
  duration?: string;
}

function parseRate(r?: string): number | undefined {
  if (!r) return undefined;
  const [a, b] = r.split("/").map(Number);
  if (!a || !b) return undefined;
  return a / b;
}

export class Ffmpeg {
  constructor(
    readonly ffmpegPath: string,
    readonly ffprobePath: string,
  ) {}

  async versions(): Promise<{ ffmpeg?: string; ffprobe?: string; errors: string[] }> {
    const errors: string[] = [];
    const get = async (bin: string) => {
      try {
        const r = await runProcess(bin, ["-version"], { timeoutMs: 10_000 });
        return r.stdout.split("\n")[0]?.trim();
      } catch (e) {
        errors.push((e as Error).message);
        return undefined;
      }
    };
    return { ffmpeg: await get(this.ffmpegPath), ffprobe: await get(this.ffprobePath), errors };
  }

  async probe(file: string, signal?: AbortSignal): Promise<ProbeResult> {
    const r = await runProcess(
      this.ffprobePath,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
      { signal, timeoutMs: 60_000 },
    );
    if (r.code !== 0) throw new AppError("FFPROBE_FAILED", `ffprobe falhou em ${path.basename(file)}: ${r.stderr.trim().slice(0, 300)}`);
    const j = JSON.parse(r.stdout) as { format?: { duration?: string; size?: string; format_name?: string }; streams?: RawStream[] };
    const streams: StreamInfo[] = (j.streams ?? []).map((s) => ({
      type: s.codec_type === "video" ? "video" : s.codec_type === "audio" ? "audio" : "other",
      codec: s.codec_name ?? "?",
      profile: s.profile,
      width: s.width,
      height: s.height,
      fps: parseRate(s.r_frame_rate),
      pixFmt: s.pix_fmt,
      channels: s.channels,
      sampleRate: s.sample_rate ? Number(s.sample_rate) : undefined,
      durationSec: s.duration ? Number(s.duration) : undefined,
    }));
    const durationSec = Number(j.format?.duration ?? streams.find((s) => s.durationSec)?.durationSec ?? 0);
    return {
      durationSec,
      sizeBytes: Number(j.format?.size ?? 0),
      formatName: j.format?.format_name ?? "?",
      streams,
      video: streams.find((s) => s.type === "video"),
      audio: streams.find((s) => s.type === "audio"),
    };
  }

  /** Volume médio/pico em dB (detecta áudio mudo). */
  async volume(file: string, signal?: AbortSignal): Promise<{ meanDb: number | null; maxDb: number | null }> {
    const r = await runProcess(this.ffmpegPath, ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"], {
      signal,
      timeoutMs: 5 * 60_000,
    });
    const mean = /mean_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(r.stderr)?.[1];
    const max = /max_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(r.stderr)?.[1];
    const num = (s?: string) => (s === undefined ? null : s === "-inf" ? -120 : Number(s));
    return { meanDb: num(mean), maxDb: num(max) };
  }

  /** Decodifica o áudio para PCM mono 16 kHz (Int16) — usado para medir a sincronia. */
  async decodeMono16k(file: string, signal?: AbortSignal): Promise<Int16Array> {
    const r = await runBinary(this.ffmpegPath, ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { signal, timeoutMs: 5 * 60_000 });
    if (r.code !== 0) throw new AppError("FFMPEG_FAILED", `ffmpeg falhou ao decodificar áudio: ${r.stderr.slice(-300)}`);
    const buf = r.stdout;
    return new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 2)));
  }

  private async run(args: string[], signal?: AbortSignal, timeoutMs = 20 * 60_000): Promise<void> {
    const r = await runProcess(this.ffmpegPath, ["-hide_banner", "-nostats", "-y", "-loglevel", "error", ...args], { signal, timeoutMs });
    if (r.code !== 0) throw new AppError("FFMPEG_FAILED", `ffmpeg falhou: ${r.stderr.trim().slice(-500)}`);
  }

  /** Prévia leve (540x960 @30fps) para aprovar rápido e enviar pelo Telegram. */
  async makePreview(input: string, output: string, signal?: AbortSignal): Promise<void> {
    await ensureDir(path.dirname(output));
    await this.run(
      [
        "-i", input,
        "-vf", "scale=540:960:flags=bicubic,fps=30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        output,
      ],
      signal,
    );
  }

  async makePoster(input: string, output: string, atSec: number, signal?: AbortSignal): Promise<void> {
    await ensureDir(path.dirname(output));
    await this.run(["-ss", String(Math.max(0, atSec)), "-i", input, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", output], signal);
  }

  /** Clipe de teste (padrão animado + tom) — usado só em modo de teste. */
  async makeTestVideo(output: string, opts: { seconds: number; width: number; height: number; fps: number }, signal?: AbortSignal): Promise<void> {
    await ensureDir(path.dirname(output));
    await this.run(
      [
        "-f", "lavfi", "-i", `testsrc2=size=${opts.width}x${opts.height}:rate=${opts.fps}:duration=${opts.seconds}`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-an",
        output,
      ],
      signal,
    );
  }
}

export async function removeIfExists(file: string): Promise<void> {
  await fs.rm(file, { force: true });
}
