"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, CreditCard, Loader2, Trash2, X } from "lucide-react";
import { alterar, criar, excluir } from "@/lib/data";
import { parseMoneyToCents, centsToInput } from "@/lib/money";
import { addDaysISO, formatDateBR, todayISO } from "@/lib/dates";
import { ATALHOS, CATEGORIAS, type Forma, type Lancamento, type Tipo } from "@/lib/types";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");
const ESCOLHA = "mt-2 grid gap-2";

/** Lançar (ou editar) em perguntas simples: quanto, em quê, quando, de quê. */
export function Lancar({ tipoInicial, edit, dataInicial, categoriasUsadas, onClose, onSaved }: {
  tipoInicial: Tipo; edit?: Lancamento; dataInicial: string; categoriasUsadas: Record<Tipo, string[]>;
  onClose: () => void; onSaved: (msg: string, data: string) => void;
}) {
  const hoje = todayISO();
  const ontem = addDaysISO(hoje, -1);
  const ref = useRef<HTMLDialogElement>(null);
  const idRef = useRef(edit?.id ?? crypto.randomUUID()); // mesma chave em reenvios: não duplica
  const [tipo, setTipo] = useState<Tipo>(edit?.tipo ?? tipoInicial);
  const [data, setData] = useState(edit?.data ?? dataInicial);
  const [outroDia, setOutroDia] = useState(!!edit && edit.data !== hoje && edit.data !== ontem || (!edit && dataInicial !== hoje && dataInicial !== ontem));
  const [forma, setForma] = useState<Forma>(edit?.forma ?? "dinheiro");
  const [valor, setValor] = useState(edit ? centsToInput(edit.valor_centavos) : "");
  const [categoria, setCategoria] = useState(edit?.categoria ?? CATEGORIAS[tipoInicial][0]);
  const [digitando, setDigitando] = useState(!!edit && !CATEGORIAS[edit.tipo].includes(edit.categoria));
  const [descricao, setDescricao] = useState(edit?.descricao ?? "");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);

  function trocaTipo(t: Tipo) {
    setTipo(t);
    if (!digitando) setCategoria(CATEGORIAS[t][0]);
  }
  const opcoes = [...CATEGORIAS[tipo].filter((c) => c !== "Outro"), ...categoriasUsadas[tipo].filter((c) => !CATEGORIAS[tipo].includes(c)), "Outro"];

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseMoneyToCents(valor);
    if (cents === null || cents <= 0) return setErro("Digite quanto foi. Exemplo: 340 ou 1.200,50");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return setErro("Escolha o dia.");
    if (data > hoje) return setErro("O dia não pode ser no futuro.");
    if (!categoria.trim()) return setErro("Escolha de quê foi (ou digite).");
    setBusy(true); setErro("");
    try {
      const corpo = { data, tipo, forma, valor_centavos: cents, categoria: categoria.trim(), descricao: descricao.trim() || null };
      if (edit) await alterar(edit.id, corpo); else await criar({ id: idRef.current, ...corpo });
      onSaved(edit ? "Alterado." : "Salvo!", data);
    } catch (x) { setErro((x as Error).message); setBusy(false); }
  }

  async function apagar() {
    if (!edit) return;
    setBusy(true); setErro("");
    try { await excluir(edit.id); onSaved("Excluído.", edit.data); }
    catch (x) { setErro((x as Error).message); setBusy(false); setConfirmaExcluir(false); }
  }

  const entrada = tipo === "entrada";
  return (
    <dialog ref={ref} className="modal" aria-labelledby="lancar-titulo" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <form onSubmit={salvar} noValidate className="flex max-h-[calc(100dvh-16px)] flex-col">
        <div className={cx("flex items-center justify-between px-5 py-4", entrada ? "bg-in-soft" : "bg-out-soft")}>
          <h2 id="lancar-titulo" className={cx("text-xl font-bold", entrada ? "text-in" : "text-out")}>{edit ? "Mudar lançamento" : entrada ? "Entrou dinheiro" : "Saiu dinheiro"}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Fechar" className="rounded-lg p-2 text-muted"><X size={22} /></button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {edit && (
            <div role="group" aria-label="Tipo" className="grid grid-cols-2 gap-2">
              {(["entrada", "saida"] as Tipo[]).map((t) => (
                <button key={t} type="button" aria-pressed={tipo === t} onClick={() => trocaTipo(t)}
                  className={cx("h-12 rounded-xl border text-base font-semibold", tipo === t ? (t === "entrada" ? "border-in bg-in-soft text-in" : "border-out bg-out-soft text-out") : "border-border text-muted")}>
                  {t === "entrada" ? "Entrou" : "Saiu"}
                </button>
              ))}
            </div>
          )}

          <label className="block text-base font-semibold">Quanto foi? (R$)
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0,00" autoFocus={!edit}
              className="tabular mt-2 h-16 w-full rounded-2xl border-2 border-border bg-surface px-4 text-right text-3xl font-bold" />
          </label>

          <div role="group" aria-label="Foi em" className="text-base font-semibold">
            <span className="block">Foi em:</span>
            <div className={cx(ESCOLHA, "grid-cols-2")}>
              {([["dinheiro", "Dinheiro", Banknote], ["cartao", "Cartão", CreditCard]] as const).map(([f, label, Icon]) => (
                <button key={f} type="button" aria-pressed={forma === f} onClick={() => setForma(f)}
                  className={cx("flex h-14 items-center justify-center gap-2 rounded-2xl border-2 text-lg font-semibold", forma === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted")}>
                  <Icon size={22} aria-hidden />{label}
                </button>
              ))}
            </div>
          </div>

          <div role="group" aria-label="Quando" className="text-base font-semibold">
            <span className="block">Quando?</span>
            <div className={cx(ESCOLHA, "grid-cols-3")}>
              {([["Hoje", hoje], ["Ontem", ontem]] as const).map(([label, d]) => (
                <button key={label} type="button" aria-pressed={!outroDia && data === d} onClick={() => { setOutroDia(false); setData(d); }}
                  className={cx("h-14 rounded-2xl border-2 text-lg font-semibold", !outroDia && data === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted")}>{label}</button>
              ))}
              <button type="button" aria-pressed={outroDia} onClick={() => setOutroDia(true)}
                className={cx("h-14 rounded-2xl border-2 text-lg font-semibold", outroDia ? "border-primary bg-primary/10 text-primary" : "border-border text-muted")}>Outro dia</button>
            </div>
            {outroDia && (
              <label className="mt-3 block text-sm font-medium text-muted">Escolha o dia (para lançar um caixa antigo)
                <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} aria-label="Escolha o dia"
                  className="mt-1 h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-lg text-text" />
              </label>
            )}
            {!outroDia && <p className="mt-1 text-sm font-normal text-muted">{formatDateBR(data)}</p>}
          </div>

          <div role="group" aria-label="De quê" className="text-base font-semibold">
            <span className="block">{entrada ? "De quê foi?" : "Pagou o quê?"}</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {opcoes.map((c) => {
                const ativo = c === "Outro" ? digitando : !digitando && categoria === c;
                return (
                  <button key={c} type="button" aria-pressed={ativo}
                    onClick={() => { if (c === "Outro") { setDigitando(true); setCategoria(""); } else { setDigitando(false); setCategoria(c); } }}
                    className={cx("rounded-full border-2 px-4 py-2.5 text-base font-medium", ativo ? "border-primary bg-primary/10 text-primary" : "border-border text-muted")}>{c}</button>
                );
              })}
            </div>
            {digitando && (
              <input value={categoria} onChange={(e) => setCategoria(e.target.value)} maxLength={60} autoComplete="off" aria-label="Digite de quê foi" placeholder="Digite aqui"
                className="mt-3 h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-lg font-normal" autoFocus />
            )}
          </div>

          <div className="text-base font-semibold">
            <label htmlFor="descricao" className="block">Observação <span className="font-normal text-muted">(se quiser)</span></label>
            <input id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} autoComplete="off"
              placeholder={entrada ? "Ex.: vendas da manhã" : "Ex.: pedido do fornecedor"}
              className="mt-2 h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-lg font-normal" />
            <div className="mt-2 flex flex-wrap gap-2">
              {ATALHOS[tipo].map((a) => (
                <button key={a} type="button" onClick={() => setDescricao((d) => (d.trim() ? `${d.trim()} · ${a}` : a))}
                  className="rounded-full border-2 border-border px-4 py-2 text-base font-medium text-muted">{a}</button>
              ))}
            </div>
          </div>

          {erro && <p role="alert" className="rounded-2xl bg-out-soft px-4 py-3 text-base font-medium text-out">{erro}</p>}
        </div>

        <div className="safe-bottom flex items-center gap-2 border-t border-border px-5 pt-4">
          {edit && (confirmaExcluir ? (
            <button type="button" onClick={apagar} disabled={busy} className="h-14 rounded-2xl bg-out px-4 text-base font-bold text-white disabled:opacity-60">Sim, excluir</button>
          ) : (
            <button type="button" onClick={() => setConfirmaExcluir(true)} aria-label="Excluir" className="grid h-14 w-14 place-items-center rounded-2xl border-2 border-border text-out"><Trash2 size={22} /></button>
          ))}
          <button disabled={busy} className={cx("flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-xl font-bold text-white disabled:opacity-60", entrada ? "bg-in" : "bg-out")}>
            {busy && <Loader2 size={20} className="animate-spin" aria-hidden />}Salvar
          </button>
        </div>
      </form>
    </dialog>
  );
}
