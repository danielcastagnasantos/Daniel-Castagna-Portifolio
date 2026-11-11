import { describe, expect, it } from "vitest";
import { porDia, resumo, saldos } from "./calc";
import { toCsv } from "./csv";
import type { Lancamento } from "./types";

let n = 0;
const L = (data: string, tipo: "entrada" | "saida", forma: "dinheiro" | "cartao", valor: number, categoria = "Venda", descricao: string | null = null): Lancamento =>
  ({ id: `id${n++}`, data, tipo, forma, valor_centavos: valor, categoria, descricao, criado_em: `2026-11-11T10:${String(n).padStart(2, "0")}:00Z` });

// O exemplo do pai: 340 de manhã + caixas antigos = 1.200 de dinheiro; paga 800 de mercadoria; sobra 400.
const exemplo = [
  L("2026-11-11", "entrada", "dinheiro", 34000, "Venda", "Manhã"),
  L("2026-11-08", "entrada", "dinheiro", 86000, "Caixa anterior", "Dias anteriores"),
  L("2026-11-11", "saida", "dinheiro", 80000, "Mercadoria", "Fornecedor"),
  L("2026-11-11", "entrada", "cartao", 25000, "Venda", "Tarde no cartão"),
];

describe("saldos", () => {
  it("1.200 em caixa antes da saída; 400 depois; cartão separado", () => {
    expect(saldos(exemplo.filter((l) => l.tipo === "entrada")).dinheiro).toBe(120000);
    expect(saldos(exemplo)).toEqual({ dinheiro: 40000, cartao: 25000, total: 65000 });
  });
  it("saldo até uma data ignora o que veio depois", () => {
    expect(saldos(exemplo, "2026-11-09")).toEqual({ dinheiro: 86000, cartao: 0, total: 86000 });
  });
  it("centavos não se perdem (0,10 + 0,20)", () => {
    expect(saldos([L("2026-11-11", "entrada", "dinheiro", 10), L("2026-11-11", "entrada", "dinheiro", 20)]).dinheiro).toBe(30);
  });
});

describe("resumo do período", () => {
  it("separa entradas, saídas e por forma, filtrando por data", () => {
    const r = resumo(exemplo, "2026-11-11", "2026-11-11");
    expect(r).toMatchObject({ entradas: 59000, saidas: 80000, resultado: -21000, entradasDinheiro: 34000, entradasCartao: 25000, saidasDinheiro: 80000 });
    expect(r.porCategoria[0]).toEqual({ categoria: "Mercadoria", tipo: "saida", total: 80000 });
    expect(resumo(exemplo).entradas).toBe(145000);
  });
});

describe("por dia", () => {
  it("mostra o dinheiro acumulado no fim de cada dia (caixa antigo + hoje)", () => {
    const dias = porDia(exemplo);
    expect(dias.map((d) => d.data)).toEqual(["2026-11-11", "2026-11-08"]);
    expect(dias[1].acumulado.dinheiro).toBe(86000);          // fim do dia 08
    expect(dias[0].acumulado.dinheiro).toBe(40000);          // fim do dia 11: 860 + 340 − 800
    expect(dias[0]).toMatchObject({ entradas: 59000, saidas: 80000 });
  });
  it("o acumulado considera TODOS os dias anteriores mesmo se o filtro mostrar só hoje", () => {
    const hoje = porDia(exemplo, "2026-11-11", "2026-11-11");
    expect(hoje).toHaveLength(1);
    expect(hoje[0].acumulado.dinheiro).toBe(40000);
  });
});

describe("csv", () => {
  it("BOM, ';', saída negativa e proteção contra fórmula", () => {
    const csv = toCsv([L("2026-11-11", "saida", "dinheiro", 80000, "Mercadoria", "=1+1"), L("2026-11-11", "entrada", "cartao", 1234, "Venda", "a;b")]);
    expect(csv.startsWith("﻿Data;Tipo;Forma;Categoria;Descrição;Valor (R$)")).toBe(true);
    expect(csv).toContain("11/11/2026;Saída;Dinheiro;Mercadoria;'=1+1;-800,00");
    expect(csv).toContain('"a;b";12,34');
  });
});
