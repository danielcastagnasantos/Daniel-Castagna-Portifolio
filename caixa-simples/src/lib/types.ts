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

/** Sugestões (a pessoa também pode digitar outra). */
export const CATEGORIAS: Record<Tipo, string[]> = {
  entrada: ["Venda", "Caixa anterior", "Recebimento", "Outros"],
  saida: ["Mercadoria", "Funcionário", "Aluguel", "Energia / Água", "Combustível", "Manutenção", "Outros"],
};
/** Atalhos de especificação para preencher a descrição com um toque. */
export const ATALHOS: Record<Tipo, string[]> = {
  entrada: ["Manhã", "Tarde", "Noite", "Dia todo", "Dias anteriores"],
  saida: ["Fornecedor", "Frete", "Pagamento", "Retirada"],
};
