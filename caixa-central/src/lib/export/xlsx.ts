import ExcelJS from "exceljs";
import { formatCell, type ReportDef, type Row } from "@/lib/reports";

/** Excel com valores numéricos reais (R$ #.##0,00) e cabeçalho congelado. */
export async function reportToXlsx(def: ReportDef, rows: Row[], meta: { org: string; period: string }, total?: Row | null): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Caixa Central";
  wb.created = new Date();
  const ws = wb.addWorksheet(def.title.slice(0, 30).replace(/[\\/?*[\]:]/g, " "));
  ws.addRow([`${meta.org} — ${def.title}`]).font = { bold: true, size: 13 };
  ws.addRow([`Período: ${meta.period}`]);
  ws.addRow([]);
  const header = ws.addRow(def.columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECF4" } }; });
  const put = (r: Row, bold = false) => {
    const row = ws.addRow(def.columns.map((c) => {
      const v = r[c.key];
      if (v == null || v === "") return null;
      if (c.type === "money") return Number((Number(v) / 100).toFixed(2));
      if (c.type === "int") return Number(v);
      return formatCell(c, r).replace(/^([=+\-@])/, "'$1");
    }));
    def.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.type === "money") cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
      if (bold) cell.font = { bold: true };
    });
  };
  rows.forEach((r) => put(r));
  if (total) put(total, true);
  def.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.min(48, Math.max(c.label.length + 2, c.type === "money" ? 16 : c.type === "text" ? 28 : 18));
  });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
