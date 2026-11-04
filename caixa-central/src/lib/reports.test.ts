import { describe, expect, it } from "vitest";
import { REPORTS, formatCell, totalsRow } from "./reports";
import { reportToCsv } from "./export/csv";
import { reportToXlsx } from "./export/xlsx";
import { reportToPdf } from "./export/pdf";

const def = REPORTS.find((r) => r.id === "sales_by_method")!;
const rows = [
  { method: "dinheiro", sales_count: 3, total_cents: 150050 },
  { method: "pix", sales_count: 1, total_cents: 30000 },
];

describe("relatórios e exportação", () => {
  it("todos os relatórios têm colunas únicas e títulos", () => {
    for (const r of REPORTS) {
      expect(new Set(r.columns.map((c) => c.key)).size).toBe(r.columns.length);
      expect(r.title.length).toBeGreaterThan(3);
    }
  });
  it("totais somam só colunas marcadas, em centavos", () => {
    expect(totalsRow(def, rows)).toEqual({ method: "TOTAL", sales_count: 4, total_cents: 180050 });
    expect(formatCell(def.columns[2], rows[0])).toBe("R$ 1.500,50");
    expect(formatCell(def.columns[0], rows[1])).toBe("Pix");
  });
  it("CSV: BOM, separador ';', decimal com vírgula e proteção contra fórmulas", () => {
    const csv = reportToCsv(def, rows, totalsRow(def, rows));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")[1]).toBe("Dinheiro;3;1500,50");
    expect(csv).toContain("TOTAL;4;1800,50");
    const evil = reportToCsv(REPORTS.find((r) => r.id === "expenses_by_category")!, [{ category: "=HYPERLINK(\"x\")", entries_count: 1, total_cents: 100 }]);
    expect(evil).toContain("'=HYPERLINK");
  });
  it("XLSX gerado é um arquivo zip válido", async () => {
    const buf = await reportToXlsx(def, rows, { org: "Teste", period: "01/03/2026 a 31/03/2026" });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
  it("PDF gerado é válido, inclusive com acentos e relatório vazio", async () => {
    const pdf = await reportToPdf(def, rows, { org: "Distribuidora Ação & Cia", period: "01/03/2026 a 31/03/2026" }, totalsRow(def, rows));
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
    const empty = await reportToPdf(def, [], { org: "X", period: "p" });
    expect(empty.length).toBeGreaterThan(500);
    const many = await reportToPdf(def, Array.from({ length: 200 }, (_, i) => ({ method: "pix", sales_count: i, total_cents: i * 100 })), { org: "X", period: "p" });
    expect(many.length).toBeGreaterThan(empty.length);
  });
});
