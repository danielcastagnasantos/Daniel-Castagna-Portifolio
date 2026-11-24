import { ExternalApiError } from "../errors";

export type FetchLike = typeof fetch;

export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfterMs?: number,
  ) {
    super(`HTTP ${status}`);
    this.name = "HttpStatusError";
  }
}

export const isRetryableStatus = (status: number): boolean => status === 408 || status === 429 || status >= 500;

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** fetch com timeout próprio + cancelamento externo; lança HttpStatusError em status != 2xx. */
export async function request(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 60_000, signal, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("Tempo esgotado", "TimeoutError")), timeoutMs);
  const onAbort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl(url, { ...rest, signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new HttpStatusError(res.status, body.slice(0, 2000), parseRetryAfter(res.headers.get("retry-after")));
    }
    return res;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Traduz erros de baixo nível em ExternalApiError com mensagem útil e sem vazar segredos. */
export function wrapHttpError(provider: string, e: unknown): never {
  if (e instanceof HttpStatusError) {
    let detail = e.body;
    try {
      const j = JSON.parse(e.body) as { detail?: unknown; error?: unknown; message?: unknown };
      const d = j.detail ?? j.error ?? j.message;
      if (d !== undefined) detail = typeof d === "string" ? d : JSON.stringify(d);
    } catch {
      /* corpo não é JSON */
    }
    const hint =
      e.status === 401 || e.status === 403
        ? " (chave inválida ou sem permissão — confira no arquivo .env)"
        : e.status === 429
          ? " (limite de uso atingido — aguarde ou revise o plano)"
          : "";
    throw new ExternalApiError(provider, `HTTP ${e.status}${hint}: ${detail.slice(0, 400)}`, {
      status: e.status,
      retryable: isRetryableStatus(e.status),
      cause: e,
    });
  }
  throw e;
}
