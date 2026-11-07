import { describe, expect, it } from "vitest";
import { parseCsvStatement, parseOfxStatement, parseStatementDate, parseStatementFile } from "./parse";

describe("extrato CSV", () => {
  const csv = `Data;Descrição;Valor\n05/03/2026;PIX RECEBIDO CLIENTE;1.234,56\n05/03/2026;TARIFA;-12,90\n05/03/2026;TARIFA;-12,90\n32/13/2026;INVÁLIDA;1,00\n`;
  it("lê datas e valores brasileiros e numera ocorrências idênticas", () => {
    const r = parseCsvStatement(csv);
    expect(r.lines.map((l) => [l.posted_on, l.amount_cents])).toEqual([["2026-03-05", 123456], ["2026-03-05", -1290], ["2026-03-05", -1290]]);
    expect(new Set(r.lines.map((l) => l.key)).size).toBe(3); // duas tarifas iguais NÃO são duplicidade dentro do arquivo
    expect(r.skipped).toEqual([{ row: 5, reason: "data inválida" }]);
  });
  it("aceita colunas Crédito/Débito e vírgula como separador com aspas", () => {
    const r = parseCsvStatement(`date,description,credit,debit\n2026-03-01,"Pagto, fornecedor",,"1.000,00"\n2026-03-02,Depósito,500.00,\n`);
    expect(r.lines.map((l) => l.amount_cents)).toEqual([-100000, 50000]);
    expect(r.lines[0].description).toBe("Pagto, fornecedor");
  });
  it("mesmas linhas em outro arquivo geram as mesmas chaves (base da deduplicação)", () => {
    expect(parseCsvStatement(csv).lines.map((l) => l.key)).toEqual(parseCsvStatement(csv).lines.map((l) => l.key));
  });
  it("erro claro se faltar coluna", () => expect(() => parseCsvStatement("a;b\n1;2")).toThrow(/colunas obrigatórias/));
});

describe("extrato OFX", () => {
  const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260305120000[-3:BRT]<TRNAMT>1500.50<FITID>ABC123<MEMO>DEPOSITO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260306<TRNAMT>-80.00<FITID>ABC124<NAME>TARIFA</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  it("usa FITID como chave e converte sinais", () => {
    const r = parseOfxStatement(ofx);
    expect(r.lines).toEqual([
      { posted_on: "2026-03-05", amount_cents: 150050, description: "DEPOSITO", fitid: "ABC123", key: "fitid:ABC123" },
      { posted_on: "2026-03-06", amount_cents: -8000, description: "TARIFA", fitid: "ABC124", key: "fitid:ABC124" },
    ]);
  });
  it("detecta formato e calcula hash do arquivo", () => {
    const a = parseStatementFile("extrato.ofx", new TextEncoder().encode(ofx));
    expect(a.format).toBe("ofx");
    expect(a.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(parseStatementFile("x.txt", new TextEncoder().encode(ofx)).format).toBe("ofx");
  });
  it("rejeita arquivo inválido e muito grande", () => {
    expect(() => parseOfxStatement("lixo")).toThrow();
    expect(() => parseStatementFile("a.csv", new Uint8Array(4 * 1024 * 1024))).toThrow(/3 MB/);
  });
});

describe("datas de extrato", () => {
  it.each([["05/03/2026", "2026-03-05"], ["2026-03-05", "2026-03-05"], ["20260305", "2026-03-05"], ["31/02/2026", null], ["xx", null]])(
    "%s", (i, o) => expect(parseStatementDate(i)).toBe(o));
});
