import { formatCell, type ReportDef, type Row } from "@/lib/reports";
import { centsToInput } from "@/lib/money";

const esc = (s: string) => (/[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** Evita injeção de fórmula ao abrir no Excel (=, +, -, @). */
const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s);

/** CSV com ';' e BOM UTF-8: abre direto no Excel em português. Valores em reais com vírgula, sem símbolo. */
export function reportToCsv(def: ReportDef, rows: Row[], total?: Row | null): string {
  const cell = (c: ReportDef["columns"][number], r: Row) => {
    if (c.type === "money") return r[c.key] == null ? "" : centsToInput(Number(r[c.key]));
    return safe(formatCell(c, r));
  };
  const lines = [def.columns.map((c) => esc(c.label)).join(";")];
  for (const r of rows) lines.push(def.columns.map((c) => esc(cell(c, r))).join(";"));
  if (total) lines.push(def.columns.map((c) => esc(c.key in total ? (c.type === "money" ? centsToInput(Number(total[c.key])) : String(total[c.key])) : "")).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
