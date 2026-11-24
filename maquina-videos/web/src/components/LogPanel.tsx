import { useEffect, useRef } from "react";
import type { LogLine } from "../types";

export function LogPanel({ logs, open }: { logs: LogLine[]; open: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs.length]);
  return (
    <details className="card" open={open}>
      <summary>Log do projeto ({logs.length})</summary>
      <div className="log" ref={ref} style={{ marginTop: 10 }}>
        {logs.length === 0 && <span className="muted">Sem eventos ainda.</span>}
        {logs.map((l, i) => (
          <div key={i} className={l.level}>
            <span className="t">{l.t.slice(11, 19)}</span> {l.step ? `[${l.step}] ` : ""}{l.msg}
          </div>
        ))}
      </div>
    </details>
  );
}
