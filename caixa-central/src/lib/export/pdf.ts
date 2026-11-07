import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatCell, type ReportDef, type Row } from "@/lib/reports";
import { formatDateTimeBR } from "@/lib/dates";

const INK = rgb(0.1, 0.12, 0.17), MUTED = rgb(0.4, 0.44, 0.52), LINE = rgb(0.85, 0.87, 0.91), HEAD = rgb(0.93, 0.94, 0.97);

export class Pdf {
  private constructor(
    private doc: PDFDocument, private font: PDFFont, private bold: PDFFont,
    public page: PDFPage, public y: number, private size: [number, number], private margin: number,
    private footer: string,
  ) {}
  static async create(opts: { landscape?: boolean; footer: string }) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const size: [number, number] = opts.landscape ? [841.89, 595.28] : [595.28, 841.89];
    const margin = 36;
    const page = doc.addPage(size);
    return new Pdf(doc, font, bold, page, size[1] - margin, size, margin, opts.footer);
  }
  /** Helvetica só entende WinAnsi: troca o que não cabe por "?" em vez de quebrar a geração. */
  private clean(s: string): string {
    const set = new Set(this.font.getCharacterSet());
    return Array.from(s.replace(/[\r\n\t]+/g, " ")).map((ch) => (set.has(ch.codePointAt(0)!) ? ch : "?")).join("");
  }
  width(s: string, size: number, bold = false) { return (bold ? this.bold : this.font).widthOfTextAtSize(this.clean(s), size); }
  fit(s: string, maxW: number, size: number, bold = false): string {
    let t = this.clean(s);
    if (this.width(t, size, bold) <= maxW) return t;
    while (t.length > 1 && this.width(`${t}…`.replace("…", "..."), size, bold) > maxW) t = t.slice(0, -1);
    return `${t}...`;
  }
  ensure(h: number) {
    if (this.y - h < this.margin + 18) {
      this.page = this.doc.addPage(this.size);
      this.y = this.size[1] - this.margin;
    }
  }
  text(s: string, x: number, size = 9, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; maxW?: number } = {}) {
    const t = opts.maxW ? this.fit(s, opts.maxW, size, opts.bold) : this.clean(s);
    this.page.drawText(t, { x, y: this.y, size, font: opts.bold ? this.bold : this.font, color: opts.color ?? INK });
  }
  textRight(s: string, xRight: number, size = 9, bold = false) {
    const t = this.clean(s);
    this.page.drawText(t, { x: xRight - this.width(t, size, bold), y: this.y, size, font: bold ? this.bold : this.font, color: INK });
  }
  title(t: string, subtitle?: string) {
    this.text(t, this.margin, 16, { bold: true }); this.y -= 18;
    if (subtitle) { this.text(subtitle, this.margin, 9, { color: MUTED }); this.y -= 14; }
    this.y -= 4;
  }
  heading(t: string) { this.ensure(26); this.y -= 6; this.text(t, this.margin, 11, { bold: true }); this.y -= 6; this.rule(); this.y -= 12; }
  kv(label: string, value: string, x = this.margin, w = 240) {
    this.text(label, x, 8.5, { color: MUTED }); this.textRight(value, x + w, 9.5, true);
  }
  rule() { this.page.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.size[0] - this.margin, y: this.y }, thickness: 0.6, color: LINE }); }
  get contentWidth() { return this.size[0] - this.margin * 2; }
  get left() { return this.margin; }

  /** Tabela com quebra de página e cabeçalho repetido. */
  table(columns: Array<{ label: string; align?: "right" | "left"; weight: number }>, rows: string[][], opts: { total?: string[] } = {}) {
    const totalW = columns.reduce((a, c) => a + c.weight, 0);
    const widths = columns.map((c) => (c.weight / totalW) * this.contentWidth);
    const size = columns.length > 9 ? 6.5 : columns.length > 6 ? 7.5 : 8.5;
    const drawRow = (cells: string[], bold = false, shade = false) => {
      this.ensure(16);
      if (shade) this.page.drawRectangle({ x: this.margin, y: this.y - 4, width: this.contentWidth, height: 14, color: HEAD });
      let x = this.margin;
      cells.forEach((c, i) => {
        const pad = 3;
        if (columns[i].align === "right") this.textRight(this.fit(c, widths[i] - pad * 2, size, bold), x + widths[i] - pad, size, bold);
        else this.text(c, x + pad, size, { bold, maxW: widths[i] - pad * 2 });
        x += widths[i];
      });
      this.y -= 14;
    };
    const header = () => drawRow(columns.map((c) => c.label), true, true);
    header();
    rows.forEach((r, i) => {
      if (this.y - 16 < this.margin + 18) { this.ensure(999); header(); }
      drawRow(r);
      if (i % 1 === 0) { this.page.drawLine({ start: { x: this.margin, y: this.y + 10 }, end: { x: this.margin + this.contentWidth, y: this.y + 10 }, thickness: 0.3, color: LINE }); }
    });
    if (opts.total) { this.ensure(18); drawRow(opts.total, true, true); }
  }

  async finish(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const t = this.clean(`${this.footer}  •  Página ${i + 1} de ${pages.length}`);
      p.drawText(t, { x: this.margin, y: 20, size: 7.5, font: this.font, color: MUTED });
    });
    return this.doc.save();
  }
}

export async function reportToPdf(def: ReportDef, rows: Row[], meta: { org: string; period: string; filters?: string }, total?: Row | null) {
  const wide = def.columns.length > 5;
  const pdf = await Pdf.create({ landscape: wide, footer: `${meta.org} — ${def.title} — emitido em ${formatDateTimeBR(new Date())}` });
  pdf.title(def.title, `${meta.org}  •  Período: ${meta.period}${meta.filters ? `  •  ${meta.filters}` : ""}`);
  if (!rows.length) pdf.text("Nenhum registro no período selecionado.", pdf.left, 10);
  else {
    pdf.table(
      def.columns.map((c) => ({ label: c.label, align: c.align ?? (c.type === "money" || c.type === "int" ? "right" : "left"), weight: c.type === "text" ? 2 : c.type === "datetime" ? 1.5 : 1.2 })),
      rows.map((r) => def.columns.map((c) => formatCell(c, r))),
      { total: total ? def.columns.map((c) => (c.key in total ? (c.type === "money" ? formatCell(c, total) : String(total[c.key])) : "")) : undefined },
    );
  }
  return pdf.finish();
}
