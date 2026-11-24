import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { EventBus } from "./events";
import { addLogSink, consoleSink, type LogRecord } from "./logger";

/** Liga os destinos de log: console, data/logs/app.log, data/projects/<id>/events.log e o barramento (SSE). */
export function attachLogSinks(dataDir: string, bus: EventBus): void {
  addLogSink(consoleSink);
  const logsDir = path.join(dataDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const appLog = fs.createWriteStream(path.join(logsDir, "app.log"), { flags: "a" });
  appLog.on("error", () => undefined);
  addLogSink((r) => {
    appLog.write(JSON.stringify(r) + "\n");
    if (r.projectId) {
      const dir = path.join(dataDir, "projects", r.projectId);
      if (fs.existsSync(dir)) void fsp.appendFile(path.join(dir, "events.log"), JSON.stringify(r) + "\n").catch(() => undefined);
    }
    bus.emit("log", r);
  });
}

export async function readLogTail(dataDir: string, projectId: string, lines = 200): Promise<LogRecord[]> {
  try {
    const raw = await fsp.readFile(path.join(dataDir, "projects", projectId, "events.log"), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .slice(-lines)
      .map((l) => {
        try {
          return JSON.parse(l) as LogRecord;
        } catch {
          return undefined;
        }
      })
      .filter((x): x is LogRecord => x !== undefined);
  } catch {
    return [];
  }
}
