/**
 * Logger estruturado minúsculo. Cada registro vai para os "sinks" registrados
 * (console, arquivo, SSE da interface, log por projeto). Segredos conhecidos são mascarados.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogRecord {
  t: string;
  level: LogLevel;
  msg: string;
  projectId?: string;
  step?: string;
  data?: Record<string, unknown>;
}
export type LogSink = (record: LogRecord) => void;

const sinks = new Set<LogSink>();
const secrets = new Set<string>();
let minLevel: LogLevel = "info";

export const addLogSink = (s: LogSink): (() => void) => {
  sinks.add(s);
  return () => sinks.delete(s);
};
export const setLogLevel = (l: LogLevel) => {
  minLevel = l;
};
export function registerSecret(value: string): void {
  if (value && value.length >= 6) secrets.add(value);
}

export function redact(text: string): string {
  let out = text;
  for (const s of secrets) out = out.split(s).join("***");
  // Padrões comuns de chave caso algum segredo não tenha sido registrado.
  out = out.replace(/\b(sk-ant-[A-Za-z0-9_-]{8,}|sk_[a-f0-9]{16,}|key_[a-f0-9]{16,})\b/g, "***");
  out = out.replace(/bot\d{6,}:[A-Za-z0-9_-]{20,}/g, "bot***");
  return out;
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(bindings: { projectId?: string; step?: string }): Logger;
}

export function createLogger(bindings: { projectId?: string; step?: string } = {}): Logger {
  const emit = (level: LogLevel, msg: string, data?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    const record: LogRecord = {
      t: new Date().toISOString(),
      level,
      msg: redact(msg),
      ...bindings,
      ...(data ? { data: JSON.parse(redact(JSON.stringify(data))) as Record<string, unknown> } : {}),
    };
    for (const s of sinks) {
      try {
        s(record);
      } catch {
        /* um sink com defeito nunca pode derrubar o app */
      }
    }
  };
  return {
    debug: (m, d) => emit("debug", m, d),
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
    child: (b) => createLogger({ ...bindings, ...b }),
  };
}

export const consoleSink: LogSink = (r) => {
  const tag = r.projectId ? ` [${r.projectId}${r.step ? `/${r.step}` : ""}]` : "";
  const time = r.t.slice(11, 19);
  const line = `${time} ${r.level.toUpperCase().padEnd(5)}${tag} ${r.msg}${r.data ? " " + JSON.stringify(r.data) : ""}`;
  (r.level === "error" ? console.error : r.level === "warn" ? console.warn : console.log)(line);
};

export const log = createLogger();
