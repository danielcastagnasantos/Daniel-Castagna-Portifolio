/** Erros tipados: o `code` é estável (a UI/automação pode reagir a ele); a mensagem é para humanos. */
export class AppError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    opts: { cause?: unknown; retryable?: boolean; httpStatus?: number; details?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.httpStatus = opts.httpStatus ?? 500;
    this.details = opts.details;
  }
}

export class CancelledError extends AppError {
  constructor(message = "Operação cancelada.") {
    super("CANCELLED", message, { httpStatus: 409 });
    this.name = "CancelledError";
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super("NOT_FOUND", `${what} não encontrado.`, { httpStatus: 404 });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION", message, { httpStatus: 400, details });
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, { httpStatus: 409 });
  }
}

export class MissingConfigError extends AppError {
  constructor(what: string, hint: string) {
    super("MISSING_CONFIG", `${what} não configurado. ${hint}`, { httpStatus: 412 });
  }
}

export class ExternalApiError extends AppError {
  readonly provider: string;
  readonly status?: number;
  constructor(provider: string, message: string, opts: { status?: number; retryable?: boolean; cause?: unknown } = {}) {
    super(`API_${provider.toUpperCase()}`, `${provider}: ${message}`, {
      retryable: opts.retryable ?? false,
      httpStatus: 502,
      cause: opts.cause,
    });
    this.provider = provider;
    this.status = opts.status;
    this.name = "ExternalApiError";
  }
}

export function isAbortError(e: unknown): boolean {
  return (
    e instanceof CancelledError ||
    (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) ||
    (typeof e === "object" && e !== null && (e as { code?: string }).code === "ABORT_ERR")
  );
}

export function toErrorInfo(e: unknown): { code: string; message: string } {
  if (e instanceof AppError) return { code: e.code, message: e.message };
  if (e instanceof Error) return { code: "UNEXPECTED", message: e.message };
  return { code: "UNEXPECTED", message: String(e) };
}
