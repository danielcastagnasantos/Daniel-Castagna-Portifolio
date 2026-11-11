"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, CreditCard, Loader2, Trash2, X } from "lucide-react";
import { alterar, criar, excluir } from "@/lib/data";
import { parseMoneyToCents, centsToInput } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { ATALHOS, CATEGORIAS, type Forma, type Lancamento, type Tipo } from "@/lib/types";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/** Tela de lançar (ou editar) uma entrada/saída. */
export function Lancar({ tipoInicial, edit, dataInicial, categoriasUsadas, onClose, onSaved }: {
  tipoInicial: Tipo; edit?: Lancamento; dataInicial: string; categoriasUsadas: Record<Tipo, string[]>;
  onClose: () => void; onSaved: (msg: string, data: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idRef = useRef(edit?.id ?? crypto.randomUUID()); // mesma chave em reenvios: não duplica
  const [tipo, setTipo] = useState<Tipo>(edit?.tipo ?? tipoInicial);
  const [data, setData] = useState(edit?.data ?? dataInicial);
  const [forma, setForma] = useState<Forma>(edit?.forma ?? "dinheiro");
  const [valor, setValor] = useState(edit ? centsToInput(edit.valor_centavos) : "");
  const [categoria, setCategoria] = useState(edit?.categoria ?? CATEGORIAS[tipoInicial][0]);
  const [descricao, setDescricao] = useState(edit?.descricao ?? "");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const hoje = todayISO();

  useEffect(() => { ref.current?.showModal(); }, []);

  function trocaTipo(t: Tipo) {
    setTipo(t);
    // se a categoria ainda era uma sugestão do tipo anterior, troca pela primeira do novo tipo
    if (CATEGORIAS[tipo].includes(categoria)) setCategoria(CATEGORIAS[t][0]);
  }
  const sugestoes = [...new Set([...CATEGORIAS[tipo], ...categoriasUsadas[tipo]])];

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseMoneyToCents(valor);
    if (cents === null || cents <= 0) return setErro("Digite um valor maior que zero. Ex.: 340 ou 1.200,50");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return setErro("Escolha a data.");
    if (data > hoje) return setErro("A data não pode ser no futuro.");
    if (!categoria.trim()) return setErro("Escolha ou digite a categoria.");
    setBusy(true); setErro("");
    try {
      const corpo = { data, tipo, forma, valor_centavos: cents, categoria: categoria.trim(), descricao: descricao.trim() || null };
      if (edit) await alterar(edit.id, corpo); else await criar({ id: idRef.current, ...corpo });
      onSaved(edit ? "Lançamento alterado." : `${tipo === "entrada" ? "Entrada" : "Saída"} lançada.`, data);
    } catch (x) { setErro((x as Error).message); setBusy(false); }
  }

  async function apagar() {
    if (!edit) return;
    setBusy(true); setErro("");
    try { await excluir(edit.id); onSaved("Lançamento excluído.", edit.data); }
    catch (x) { setErro((x as Error).message); setBusy(false); setConfirmaExcluir(false); }
  }

  const entrada = tipo === "entrada";
  return (
    <dialog ref={ref} className="modal" aria-labelledby="lancar-titulo" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <form onSubmit={salvar} noValidate className="flex max-h-[calc(100dvh-16px)] flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="lancar-titulo" className="text-lg font-semibold">{edit ? "Editar lançamento" : "Novo lançamento"}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Fechar" className="rounded-lg p-2 text-muted hover:bg-surface-2"><X size={20} /></button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div role="group" aria-label="Tipo" className="grid grid-cols-2 gap-2">
            {(["entrada", "saida"] as Tipo[]).map((t) => (
              <button key={t} type="button" aria-pressed={tipo === t} onClick={() => trocaTipo(t)}
                className={cx("h-12 rounded-xl border text-base font-semibold", tipo === t ? (t === "entrada" ? "border-in bg-in-soft text-in" : "border-out bg-out-soft text-out") : "border-border text-muted")}>
                {t === "entrada" ? "Entrada" : "Saída"}
              </button>
            ))}
          </div>

          <label className="block text-sm font-medium">Valor (R$)
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0,00" autoFocus={!edit}
              className="tabular mt-1 h-14 w-full rounded-xl border border-border bg-surface px-3 text-right text-2xl font-semibold" />
          </label>

          <div role="group" aria-label="Forma" className="text-sm font-medium">
            <span className="block">Forma</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {([["dinheiro", "Dinheiro", Banknote], ["cartao", "Cartão", CreditCard]] as const).map(([f, label, Icon]) => (
                <button key={f} type="button" aria-pressed={forma === f} onClick={() => setForma(f)}
                  className={cx("flex h-12 items-center justify-center gap-2 rounded-xl border text-base font-medium", forma === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted")}>
                  <Icon size={18} aria-hidden />{label}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm font-medium">Data
            <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)}
              className="mt-1 h-12 w-full rounded-xl border border-border bg-surface px-3 text-base" />
            <span className="mt-1 block text-xs font-normal text-muted">Para lançar um caixa antigo, escolha o dia em que aconteceu.</span>
          </label>

          <div>
            <label htmlFor="categoria" className="block text-sm font-medium">Categoria</label>
            <input id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} maxLength={60} autoComplete="off"
              className="mt-1 h-12 w-full rounded-xl border border-border bg-surface px-3 text-base" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sugestoes.map((c) => (
                <button key={c} type="button" onClick={() => setCategoria(c)} aria-pressed={categoria === c}
                  className={cx("rounded-full border px-3 py-1 text-xs font-medium", categoria === c ? "border-primary bg-primary/10 text-primary" : "border-border text-muted")}>{c}</button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="descricao" className="block text-sm font-medium">Especificação (opcional)</label>
            <input id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} autoComplete="off"
              placeholder={entrada ? "Ex.: vendas da manhã" : "Ex.: pedido do fornecedor"}
              className="mt-1 h-12 w-full rounded-xl border border-border bg-surface px-3 text-base" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ATALHOS[tipo].map((a) => (
                <button key={a} type="button" onClick={() => setDescricao((d) => (d.trim() ? `${d.trim()} · ${a}` : a))}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted">{a}</button>
              ))}
            </div>
          </div>

          {erro && <p role="alert" className="rounded-xl bg-out-soft px-3 py-2 text-sm text-out">{erro}</p>}
        </div>

        <div className="safe-bottom flex items-center gap-2 border-t border-border px-5 pt-4">
          {edit && (confirmaExcluir ? (
            <button type="button" onClick={apagar} disabled={busy} className="flex h-12 items-center gap-1.5 rounded-xl bg-out px-4 text-sm font-semibold text-white disabled:opacity-60">Confirmar exclusão</button>
          ) : (
            <button type="button" onClick={() => setConfirmaExcluir(true)} aria-label="Excluir" className="grid h-12 w-12 place-items-center rounded-xl border border-border text-out"><Trash2 size={18} /></button>
          ))}
          <button disabled={busy} className={cx("flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-base font-semibold text-white disabled:opacity-60", entrada ? "bg-in" : "bg-out")}>
            {busy && <Loader2 size={18} className="animate-spin" aria-hidden />}{edit ? "Salvar alterações" : entrada ? "Lançar entrada" : "Lançar saída"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
