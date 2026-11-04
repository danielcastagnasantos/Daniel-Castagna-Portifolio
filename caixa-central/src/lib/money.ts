/**
 * Dinheiro = INTEIRO EM CENTAVOS. Nenhuma conta financeira usa ponto flutuante:
 * a entrada do usuário é lida como texto e convertida por manipulação de string.
 */
export const MAX_CENTS = 100_000_000_000; // R$ 1 bilhão: teto de sanidade (igual ao banco)

/** "1.234,56" | "1234,56" | "1234.56" | "R$ 10" -> centavos. Retorna null se inválido. */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).replace(/R\$/gi, "").replace(/[\s ]/g, "");
  if (s === "") return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[0-9.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart: string;
  let decPart = "";
  if (lastComma !== -1 && lastDot !== -1) {
    // Os dois aparecem: o último separador é o decimal.
    const dec = Math.max(lastComma, lastDot);
    intPart = s.slice(0, dec);
    decPart = s.slice(dec + 1);
  } else if (lastComma !== -1) {
    if (s.indexOf(",") !== lastComma) return null; // várias vírgulas
    intPart = s.slice(0, lastComma);
    decPart = s.slice(lastComma + 1);
  } else if (lastDot !== -1) {
    const dots = s.split(".").length - 1;
    const after = s.slice(lastDot + 1);
    // "1.234" ou "1.234.567" = milhar pt-BR; "12.5" / "12.50" = decimal.
    if (dots > 1 || (after.length === 3 && s.length > 4)) {
      intPart = s;
    } else {
      intPart = s.slice(0, lastDot);
      decPart = after;
    }
  } else {
    intPart = s;
  }
  // A parte inteira só pode ter separador de milhar em grupos de 3 dígitos ("1.234.567"), nunca "1..2".
  if (/[.,]/.test(intPart) && !/^[0-9]{1,3}([.,][0-9]{3})+$/.test(intPart)) return null;
  intPart = intPart.replace(/[.,]/g, "");
  if (intPart === "") intPart = "0";
  if (!/^[0-9]+$/.test(intPart) || (decPart !== "" && !/^[0-9]{1,2}$/.test(decPart))) return null;
  if (intPart.length > 12) return null;
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return negative ? -cents : cents;
}

/** Centavos -> "R$ 1.234,56" (sem Intl/float). */
export function formatBRL(cents: number | string | null | undefined, opts: { signed?: boolean } = {}): string {
  if (cents === null || cents === undefined || cents === "") return "—";
  const n = typeof cents === "string" ? Number(cents) : cents;
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(Math.trunc(n));
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = String(abs % 100).padStart(2, "0");
  const sign = n < 0 ? "-" : opts.signed && n > 0 ? "+" : "";
  return `${sign}R$ ${reais},${frac}`;
}

/** Centavos -> "1234,56" para preencher campos de edição. */
export function centsToInput(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export const sumCents = (values: Array<number | string | null | undefined>): number =>
  values.reduce<number>((acc, v) => acc + Number(v ?? 0), 0);

/** Divide um total em N parcelas sem perder centavos (as primeiras recebem o resto). */
export function splitCents(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const rest = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}
