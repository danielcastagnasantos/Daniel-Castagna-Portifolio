import { describe, expect, it } from "vitest";
import { centsToInput, formatBRL, parseMoneyToCents, splitCents, sumCents } from "./money";

describe("parseMoneyToCents", () => {
  it.each([
    ["1.234,56", 123456], ["1234,56", 123456], ["1234.56", 123456], ["R$ 10", 1000], ["R$ 1.000", 100000],
    ["0,05", 5], ["0.05", 5], [",5", 50], ["12,5", 1250], ["12.5", 1250], ["1.234.567,89", 123456789],
    ["1.234", 123400], ["100", 10000], ["-20,00", -2000], ["  7,10 ", 710], ["1.000.000", 100000000],
  ])("%s -> %i", (input, cents) => expect(parseMoneyToCents(input)).toBe(cents));

  it.each(["", "abc", "1,2,3", "12,345", "1..2", "--5", "1e5", "R$", "999999999999999"])("rejeita %j", (s) =>
    expect(parseMoneyToCents(s)).toBeNull());

  it("0,1 + 0,2 não sofre erro de ponto flutuante", () => {
    expect(sumCents([parseMoneyToCents("0,10"), parseMoneyToCents("0,20")])).toBe(30);
  });
  it("rejeita acima do teto de sanidade", () => expect(parseMoneyToCents("2.000.000.000,00")).toBeNull());
});

describe("formatBRL / centsToInput", () => {
  it("formata em reais com milhar e vírgula", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(5)).toBe("R$ 0,05");
    expect(formatBRL(-2000)).toBe("-R$ 20,00");
    expect(formatBRL(100000000)).toBe("R$ 1.000.000,00");
    expect(formatBRL(null)).toBe("—");
    expect(formatBRL(50, { signed: true })).toBe("+R$ 0,50");
    expect(formatBRL("60000")).toBe("R$ 600,00");
  });
  it("ida e volta é exata", () => {
    for (const c of [0, 1, 99, 100, 123456, -250, 99999999]) expect(parseMoneyToCents(centsToInput(c))).toBe(c);
  });
});

describe("splitCents", () => {
  it("não perde centavos", () => {
    expect(splitCents(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitCents(100, 7).reduce((a, b) => a + b, 0)).toBe(100);
    expect(splitCents(5, 5)).toEqual([1, 1, 1, 1, 1]);
  });
});
