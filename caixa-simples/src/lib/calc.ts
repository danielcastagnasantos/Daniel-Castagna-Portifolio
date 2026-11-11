import type { Forma, Lancamento } from "./types";

/** Valor com sinal para o saldo: entrada soma, saída subtrai. Tudo em centavos inteiros. */
export const assinado = (l: Pick<Lancamento, "tipo" | "valor_centavos">) => (l.tipo === "entrada" ? l.valor_centavos : -l.valor_centavos);

export interface Saldos { dinheiro: number; cartao: number; total: number }

/** Quanto tem em cada lugar (tudo desde o começo, inclusive caixas antigos). */
export function saldos(rows: Lancamento[], ate?: string): Saldos {
  const s: Saldos = { dinheiro: 0, cartao: 0, total: 0 };
  for (const l of rows) {
    if (ate && l.data > ate) continue;
    s[l.forma] += assinado(l);
    s.total += assinado(l);
  }
  return s;
}

export interface Resumo {
  entradas: number; saidas: number; resultado: number;
  entradasDinheiro: number; entradasCartao: number; saidasDinheiro: number; saidasCartao: number;
  porCategoria: Array<{ categoria: string; tipo: "entrada" | "saida"; total: number }>;
}

export function resumo(rows: Lancamento[], de?: string, ate?: string): Resumo {
  const r: Resumo = { entradas: 0, saidas: 0, resultado: 0, entradasDinheiro: 0, entradasCartao: 0, saidasDinheiro: 0, saidasCartao: 0, porCategoria: [] };
  const cats = new Map<string, number>();
  for (const l of rows) {
    if ((de && l.data < de) || (ate && l.data > ate)) continue;
    const v = l.valor_centavos;
    if (l.tipo === "entrada") { r.entradas += v; if (l.forma === "dinheiro") r.entradasDinheiro += v; else r.entradasCartao += v; }
    else { r.saidas += v; if (l.forma === "dinheiro") r.saidasDinheiro += v; else r.saidasCartao += v; }
    const k = `${l.tipo}|${l.categoria}`;
    cats.set(k, (cats.get(k) ?? 0) + v);
  }
  r.resultado = r.entradas - r.saidas;
  r.porCategoria = [...cats.entries()].map(([k, total]) => { const [tipo, categoria] = k.split("|"); return { tipo: tipo as "entrada" | "saida", categoria, total }; })
    .sort((a, b) => b.total - a.total);
  return r;
}

export interface Dia {
  data: string; itens: Lancamento[]; entradas: number; saidas: number;
  /** Dinheiro e cartão acumulados até o FIM deste dia (inclui todos os dias anteriores). */
  acumulado: Saldos;
}

/** Agrupa por dia (mais novo primeiro) já com o saldo acumulado no fim de cada dia. */
export function porDia(rows: Lancamento[], de?: string, ate?: string): Dia[] {
  const byDate = new Map<string, Lancamento[]>();
  for (const l of rows) byDate.set(l.data, [...(byDate.get(l.data) ?? []), l]);
  const datas = [...byDate.keys()].sort();
  let run: Saldos = { dinheiro: 0, cartao: 0, total: 0 };
  const dias: Dia[] = [];
  for (const d of datas) {
    const itens = byDate.get(d)!;
    let entradas = 0, saidas = 0;
    const next = { ...run };
    for (const l of itens) {
      const v = assinado(l);
      next[l.forma as Forma] += v; next.total += v;
      if (l.tipo === "entrada") entradas += l.valor_centavos; else saidas += l.valor_centavos;
    }
    run = next;
    dias.push({ data: d, itens: [...itens].sort((a, b) => b.criado_em.localeCompare(a.criado_em)), entradas, saidas, acumulado: next });
  }
  return dias.filter((d) => (!de || d.data >= de) && (!ate || d.data <= ate)).reverse();
}
