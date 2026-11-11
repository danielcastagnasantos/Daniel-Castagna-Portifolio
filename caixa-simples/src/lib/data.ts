import { supabase } from "./supabase";
import type { Forma, Lancamento, Tipo } from "./types";

const COLS = "id, data, tipo, forma, valor_centavos, categoria, descricao, criado_em";
const NETWORK = /fetch failed|network|failed to fetch|timeout|load failed/i;

export const SEM_CONEXAO = "Sem conexão com o servidor. Nada foi salvo. Confira a internet e tente de novo.";
export const humaniza = (e: { message?: string } | null | undefined) =>
  !e ? "" : NETWORK.test(e.message ?? "") ? SEM_CONEXAO : "Não foi possível concluir. Tente de novo.";

/** Busca todos os lançamentos ativos (em páginas de 1.000, até 50.000). */
export async function carregarTudo(): Promise<Lancamento[]> {
  const out: Lancamento[] = [];
  for (let p = 0; p < 50; p++) {
    const { data, error } = await supabase().from("lancamentos").select(COLS).is("excluido_em", null)
      .order("data", { ascending: false }).order("criado_em", { ascending: false }).order("id")
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(humaniza(error));
    out.push(...((data ?? []) as unknown as Lancamento[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export interface Rascunho { id: string; data: string; tipo: Tipo; forma: Forma; valor_centavos: number; categoria: string; descricao: string | null }

/** Grava e SÓ devolve sucesso depois que o banco confirmou. Repetir o mesmo id não duplica. */
export async function criar(r: Rascunho): Promise<void> {
  const { error } = await supabase().from("lancamentos").insert(r);
  if (error && error.code !== "23505") throw new Error(humaniza(error)); // 23505 = já gravado numa tentativa anterior
}

export async function alterar(id: string, r: Omit<Rascunho, "id">): Promise<void> {
  const { data, error } = await supabase().from("lancamentos").update(r).eq("id", id).select("id");
  if (error) throw new Error(humaniza(error));
  if (!data?.length) throw new Error("Lançamento não encontrado (talvez já tenha sido excluído).");
}

export async function excluir(id: string): Promise<void> {
  const { data, error } = await supabase().from("lancamentos").update({ excluido_em: new Date().toISOString() }).eq("id", id).select("id");
  if (error) throw new Error(humaniza(error));
  if (!data?.length) throw new Error("Lançamento não encontrado.");
}

export async function temAcesso(email: string): Promise<boolean> {
  const { data, error } = await supabase().from("acesso").select("email").eq("email", email.toLowerCase());
  if (error) throw new Error(humaniza(error));
  return (data ?? []).length > 0;
}
