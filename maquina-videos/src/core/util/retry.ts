import { isAbortError } from "../errors";
import { sleep } from "./fs";

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  signal?: AbortSignal;
  /** Decide se vale tentar de novo. Padrão: nunca para cancelamento. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Pode devolver um atraso específico (ex.: header Retry-After). */
  delayFor?: (error: unknown, attempt: number) => number | undefined;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/** Backoff exponencial com jitter. `attempt` começa em 1. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseMs ?? 800;
  const max = opts.maxMs ?? 20_000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (isAbortError(e) || opts.signal?.aborted) throw e;
      const can = attempt <= retries && (opts.shouldRetry ? opts.shouldRetry(e, attempt) : true);
      if (!can) throw e;
      const custom = opts.delayFor?.(e, attempt);
      const exp = Math.min(max, base * 2 ** (attempt - 1));
      const delay = custom ?? Math.round(exp * (0.7 + Math.random() * 0.6));
      opts.onRetry?.(e, attempt, delay);
      await sleep(delay, opts.signal);
    }
  }
}
