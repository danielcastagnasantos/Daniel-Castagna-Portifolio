import { spawn } from "node:child_process";
import { AppError, CancelledError, MissingConfigError } from "../errors";

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  signal?: AbortSignal;
  /** Chamado a cada pedaço de stderr (útil para progresso do ffmpeg). */
  onStderr?: (chunk: string) => void;
  /** Limite de bytes mantidos em memória por stream. */
  maxBuffer?: number;
  timeoutMs?: number;
}

/** Executa um programa SEM shell (seguro com espaços/aspas, igual no Windows e Linux). */
export function runProcess(cmd: string, args: string[], opts: RunOptions = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new CancelledError());
    const child = spawn(cmd, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const max = opts.maxBuffer ?? 4_000_000;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : undefined;
    const onAbort = () => child.kill("SIGKILL");
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < max) stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      opts.onStderr?.(s);
      stderr = (stderr + s).slice(-max);
    });
    child.on("error", (e: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (e.code === "ENOENT") {
        reject(
          new MissingConfigError(
            `Programa "${cmd}"`,
            "Instale o FFmpeg (Windows: `winget install Gyan.FFmpeg`), reabra o terminal ou aponte FFMPEG_PATH/FFPROBE_PATH no .env.",
          ),
        );
      } else reject(e);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) return reject(new CancelledError());
      if (timedOut) return reject(new AppError("PROCESS_TIMEOUT", `${cmd} excedeu o tempo limite.`));
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** Como runProcess, mas devolve o stdout como Buffer (para decodificar áudio/vídeo cru). */
export function runBinary(cmd: string, args: string[], opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new CancelledError());
    const child = spawn(cmd, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    const timer = opts.timeoutMs ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs) : undefined;
    const onAbort = () => child.kill("SIGKILL");
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString("utf8")).slice(-4000);
    });
    child.on("error", (e: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      reject(e.code === "ENOENT" ? new MissingConfigError(`Programa "${cmd}"`, "Instale o FFmpeg e reabra o terminal.") : e);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) return reject(new CancelledError());
      resolve({ code: code ?? -1, stdout: Buffer.concat(chunks), stderr });
    });
  });
}
