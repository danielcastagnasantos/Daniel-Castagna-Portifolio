import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function fileSize(p: string): Promise<number> {
  try {
    return (await fs.stat(p)).size;
  } catch {
    return 0;
  }
}

/**
 * Renomear por cima de um arquivo existente pode falhar no Windows (EPERM/EBUSY) se
 * antivírus/indexador estiver com o arquivo aberto por alguns milissegundos: tenta de novo.
 */
export async function renameWithRetry(from: string, to: string, attempts = 8): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (i >= attempts - 1 || !(code === "EPERM" || code === "EBUSY" || code === "EACCES")) throw e;
      await sleep(25 * (i + 1));
    }
  }
}

/** Escrita atômica: grava num temporário e troca. Nunca deixa JSON pela metade. */
export async function atomicWrite(file: string, data: string | Buffer): Promise<void> {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, data);
  try {
    await renameWithRetry(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

export const atomicWriteJson = (file: string, value: unknown): Promise<void> =>
  atomicWrite(file, JSON.stringify(value, null, 2));

export async function readJson<T = unknown>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

/** Converte caminho do SO em caminho de URL (barras normais), relativo a `base`. */
export function toPosixRelative(base: string, target: string): string {
  return path.relative(base, target).split(path.sep).join("/");
}

/** Impede "../" e caminhos absolutos: devolve o caminho resolvido só se estiver dentro de `root`. */
export function resolveInside(root: string, rel: string): string | null {
  const resolved = path.resolve(root, rel);
  const normRoot = path.resolve(root) + path.sep;
  if (resolved !== path.resolve(root) && !resolved.startsWith(normRoot)) return null;
  return resolved;
}
