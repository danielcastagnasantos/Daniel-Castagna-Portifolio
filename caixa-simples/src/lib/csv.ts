import { centsToInput } from "./money";
import { formatDateBR } from "./dates";
import { FORMA_LABEL, TIPO_LABEL, type Lancamento } from "./types";

const esc = (s: string) => (/[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** Evita que o Excel interprete texto como fórmula. */
const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

/** CSV com ';' e BOM UTF-8 (abre direto no Excel em português). Saída aparece com sinal negativo. */
export function toCsv(rows: Lancamento[]): string {
  const head = ["Data", "Tipo", "Forma", "Categoria", "Descrição", "Valor (R$)"].join(";");
  const lines = [...rows].sort((a, b) => a.data.localeCompare(b.data) || a.criado_em.localeCompare(b.criado_em)).map((l) =>
    [formatDateBR(l.data), TIPO_LABEL[l.tipo], FORMA_LABEL[l.forma], esc(safe(l.categoria)), esc(safe(l.descricao ?? "")),
      centsToInput(l.tipo === "saida" ? -l.valor_centavos : l.valor_centavos)].join(";"));
  return `﻿${[head, ...lines].join("\r\n")}\r\n`;
}
