import { createHash } from "node:crypto";
import { parseMoneyToCents } from "@/lib/money";

export interface StatementLine {
  posted_on: string;      // YYYY-MM-DD
  amount_cents: number;   // + crédito, − débito
  description: string;
  fitid: string | null;
  key: string;            // chave de deduplicação
}
export interface ParsedStatement {
  format: "csv" | "ofx";
  lines: StatementLine[];
  skipped: Array<{ row: number; reason: string }>;
  fileHash: string;
}

export const MAX_STATEMENT_BYTES = 3 * 1024 * 1024;
export const MAX_STATEMENT_LINES = 5000;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** Datas dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, aaaammdd. */
export function parseStatementDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return validDate(m[1], m[2], m[3]);
  m = /^(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(s);
  if (m) return validDate(m[3], m[2], m[1]);
  m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  if (m) return validDate(m[1], m[2], m[3]);
  return null;
}
function validDate(y: string, mo: string, d: string): string | null {
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(mo) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${y}-${mo}-${d}`;
}

/** Atribui chaves únicas por (data|valor|descrição) + nº da ocorrência no arquivo; FITID tem prioridade. */
function assignKeys(items: Array<Omit<StatementLine, "key">>): StatementLine[] {
  const seen = new Map<string, number>();
  return items.map((it) => {
    if (it.fitid) return { ...it, key: `fitid:${it.fitid}` };
    const base = `${it.posted_on}|${it.amount_cents}|${norm(it.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...it, key: `${base}|${n}` };
  });
}

/** Quebra CSV respeitando aspas (campos com ; ou , dentro de "..."). */
export function splitCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const H = {
  date: ["DATA", "DATE", "DT", "DATA LANCAMENTO", "DATA MOVIMENTO", "DATA DO LANCAMENTO"],
  desc: ["DESCRICAO", "DESCRIPTION", "HISTORICO", "MEMO", "LANCAMENTO", "DETALHES", "NOME", "ESTABELECIMENTO"],
  amount: ["VALOR", "AMOUNT", "VALOR (R$)", "VALOR R$", "MONTANTE"],
  credit: ["CREDITO", "CREDITOS", "ENTRADA", "ENTRADAS", "CREDIT"],
  debit: ["DEBITO", "DEBITOS", "SAIDA", "SAIDAS", "DEBIT"],
  id: ["ID", "IDENTIFICADOR", "FITID", "DOCUMENTO", "NUMERO DOCUMENTO", "N DOCUMENTO"],
};

export function parseCsvStatement(text: string): Pick<ParsedStatement, "lines" | "skipped"> {
  const rows = splitCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) throw new Error("O arquivo CSV está vazio ou sem linhas de lançamentos.");
  const header = rows[0].map(norm);
  const find = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iDate = find(H.date), iDesc = find(H.desc), iAmount = find(H.amount);
  const iCredit = find(H.credit), iDebit = find(H.debit), iId = find(H.id);
  if (iDate < 0 || iDesc < 0 || (iAmount < 0 && (iCredit < 0 || iDebit < 0))) {
    throw new Error("Não encontrei as colunas obrigatórias. O cabeçalho precisa ter: Data, Descrição e Valor (ou Crédito/Débito).");
  }
  const items: Array<Omit<StatementLine, "key">> = [];
  const skipped: ParsedStatement["skipped"] = [];
  rows.slice(1).forEach((r, idx) => {
    const rowNo = idx + 2;
    const date = parseStatementDate(r[iDate] ?? "");
    if (!date) return void skipped.push({ row: rowNo, reason: "data inválida" });
    let cents: number | null;
    if (iAmount >= 0) cents = parseMoneyToCents(r[iAmount] ?? "");
    else {
      const cr = parseMoneyToCents(r[iCredit] ?? "") ?? 0;
      const db = parseMoneyToCents(r[iDebit] ?? "") ?? 0;
      cents = cr !== 0 ? Math.abs(cr) : db !== 0 ? -Math.abs(db) : null;
    }
    if (cents === null || cents === 0) return void skipped.push({ row: rowNo, reason: "valor inválido ou zero" });
    const desc = (r[iDesc] ?? "").trim().slice(0, 300) || "(sem descrição)";
    const id = iId >= 0 ? (r[iId] ?? "").trim() : "";
    items.push({ posted_on: date, amount_cents: cents, description: desc, fitid: id || null });
  });
  return { lines: assignKeys(items), skipped };
}

export function parseOfxStatement(text: string): Pick<ParsedStatement, "lines" | "skipped"> {
  if (!/<OFX>/i.test(text)) throw new Error("Arquivo OFX inválido (tag <OFX> não encontrada).");
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) ?? [];
  const tag = (block: string, name: string) => {
    const m = new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, "i").exec(block);
    return m ? m[1].trim() : "";
  };
  const items: Array<Omit<StatementLine, "key">> = [];
  const skipped: ParsedStatement["skipped"] = [];
  blocks.forEach((b, idx) => {
    const date = parseStatementDate(tag(b, "DTPOSTED"));
    const amtRaw = tag(b, "TRNAMT").replace(",", ".");
    const cents = /^-?\d+(\.\d{1,2})?$/.test(amtRaw) ? parseMoneyToCents(amtRaw.replace(".", ",")) : null;
    if (!date) return void skipped.push({ row: idx + 1, reason: "data inválida" });
    if (cents === null || cents === 0) return void skipped.push({ row: idx + 1, reason: "valor inválido ou zero" });
    const desc = (tag(b, "MEMO") || tag(b, "NAME") || "(sem descrição)").slice(0, 300);
    items.push({ posted_on: date, amount_cents: cents, description: desc, fitid: tag(b, "FITID") || null });
  });
  if (!blocks.length) throw new Error("Nenhuma transação encontrada no OFX.");
  return { lines: assignKeys(items), skipped };
}

export function parseStatementFile(filename: string, bytes: Uint8Array): ParsedStatement {
  if (bytes.byteLength > MAX_STATEMENT_BYTES) throw new Error("Arquivo maior que 3 MB.");
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  // OFX bancário brasileiro costuma vir em latin1; tenta UTF-8 e cai para latin1 se houver caracteres inválidos.
  let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (text.includes("�")) text = new TextDecoder("latin1").decode(bytes);
  const isOfx = /\.ofx$/i.test(filename) || /<OFX>/i.test(text.slice(0, 4000));
  const parsed = isOfx ? parseOfxStatement(text) : parseCsvStatement(text);
  if (parsed.lines.length === 0) throw new Error("Nenhum lançamento válido encontrado no arquivo.");
  if (parsed.lines.length > MAX_STATEMENT_LINES) throw new Error(`O arquivo tem mais de ${MAX_STATEMENT_LINES} lançamentos. Importe por períodos menores.`);
  return { format: isOfx ? "ofx" : "csv", ...parsed, fileHash };
}
