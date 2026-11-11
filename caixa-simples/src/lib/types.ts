export type Tipo = "entrada" | "saida";
export type Forma = "dinheiro" | "cartao";

export interface Lancamento {
  id: string;
  data: string;            // YYYY-MM-DD
  tipo: Tipo;
  forma: Forma;
  valor_centavos: number;
  categoria: string;
  descricao: string | null;
  criado_em: string;
}

export const FORMA_LABEL: Record<Forma, string> = { dinheiro: "Dinheiro", cartao: "Cartão" };
export const TIPO_LABEL: Record<Tipo, string> = { entrada: "Entrada", saida: "Saída" };

/** Opções de "de quê?" (só toque). "Outro" deixa a pessoa digitar. */
export const CATEGORIAS: Record<Tipo, string[]> = {
  entrada: ["Venda", "Caixa anterior", "Outro"],
  saida: ["Mercadoria", "Funcionário", "Contas (luz, água, aluguel)", "Combustível", "Outro"],
};
/** Atalhos para a observação. */
export const ATALHOS: Record<Tipo, string[]> = {
  entrada: ["Manhã", "Tarde", "Noite", "Dia todo"],
  saida: ["Fornecedor", "Frete", "Pagamento"],
};
