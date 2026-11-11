"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Download, Loader2, LogOut, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { carregarTudo, temAcesso } from "@/lib/data";
import { porDia, resumo, saldos } from "@/lib/calc";
import { toCsv } from "@/lib/csv";
import { formatBRL } from "@/lib/money";
import { formatDateBR, presetRange, todayISO, type PeriodPreset } from "@/lib/dates";
import { FORMA_LABEL, type Lancamento, type Tipo } from "@/lib/types";
import { Lancar } from "./Lancar";

const PERIODOS: Array<[string, string, PeriodPreset | "all"]> = [["hoje", "Hoje", "today"], ["semana", "Semana", "week"], ["mes", "Mês", "month"], ["tudo", "Tudo", "all"]];
const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });
const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export function Painel({ email }: { email: string }) {
  const [rows, setRows] = useState<Lancamento[] | null>(null);
  const [acesso, setAcesso] = useState<boolean | null>(null);
  const [erro, setErro] = useState("");
  const [periodo, setPeriodo] = useState("mes");
  const [lancar, setLancar] = useState<{ tipo: Tipo; edit?: Lancamento } | null>(null);
  const [ultimaData, setUltimaData] = useState(todayISO());
  const [aviso, setAviso] = useState("");

  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const ok = await temAcesso(email);
        const dados = ok ? await carregarTudo() : [];
        if (vivo) { setAcesso(ok); setRows(dados); setErro(""); }
      } catch (e) { if (vivo) { setErro((e as Error).message); setRows((r) => r ?? []); } }
    })();
    return () => { vivo = false; };
  }, [email, versao]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(""), 4000); return () => clearTimeout(t); }, [aviso]);

  const hoje = todayISO();
  const [p] = PERIODOS.filter(([k]) => k === periodo);
  const faixa = p[2] === "all" ? { from: undefined, to: undefined } : presetRange(p[2], hoje);
  const all = useMemo(() => rows ?? [], [rows]);
  const total = useMemo(() => saldos(all), [all]);
  const res = useMemo(() => resumo(all, faixa.from, faixa.to), [all, faixa.from, faixa.to]);
  const dias = useMemo(() => porDia(all, faixa.from, faixa.to), [all, faixa.from, faixa.to]);
  const categorias = useMemo(() => ({
    entrada: [...new Set(all.filter((l) => l.tipo === "entrada").map((l) => l.categoria))],
    saida: [...new Set(all.filter((l) => l.tipo === "saida").map((l) => l.categoria))],
  }), [all]);

  function baixar() {
    const noPeriodo = all.filter((l) => (!faixa.from || l.data >= faixa.from) && (!faixa.to || l.data <= faixa.to));
    const url = URL.createObjectURL(new Blob([toCsv(noPeriodo)], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `caixa-${faixa.from ?? "inicio"}_${faixa.to ?? hoje}.csv` });
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-32 pt-5">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Caixa</h1>
        <div className="flex items-center gap-1">
          <button onClick={recarregar} aria-label="Atualizar" className="rounded-xl p-2 text-muted hover:bg-surface-2"><RefreshCw size={20} /></button>
          <button onClick={() => void supabase().auth.signOut()} aria-label="Sair" title={email} className="rounded-xl p-2 text-muted hover:bg-surface-2"><LogOut size={20} /></button>
        </div>
      </header>

      {aviso && <p role="status" className="mb-3 rounded-xl bg-in-soft px-3 py-2 text-sm font-medium text-in">{aviso}</p>}
      {erro && <p role="alert" className="mb-3 rounded-xl bg-out-soft px-3 py-2 text-sm text-out">{erro}</p>}
      {acesso === false && <p role="alert" className="mb-3 rounded-xl bg-warn-soft px-3 py-3 text-sm text-warn">Este e-mail ainda não foi liberado para usar o caixa. Peça para quem cuida do sistema liberar <b>{email}</b>.</p>}
      {rows === null && <div className="grid place-items-center py-20 text-muted"><Loader2 className="animate-spin" aria-label="Carregando" /></div>}

      {rows !== null && acesso !== false && (
        <>
          <section aria-label="Saldo" className="rounded-3xl border-2 border-border bg-surface p-5">
            <p className="text-base font-semibold text-muted">Dinheiro no caixa agora</p>
            <p data-testid="saldo-dinheiro" className={cx("tabular mt-1 text-5xl font-bold tracking-tight", total.dinheiro < 0 && "text-out")}>{formatBRL(total.dinheiro)}</p>
            <p className="mt-2 text-sm text-muted">É tudo que entrou em dinheiro menos o que saiu, contando os dias anteriores.</p>
            <p className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-base">
              <span className="flex items-center gap-2 text-muted"><CreditCard size={18} aria-hidden /> No cartão</span>
              <b data-testid="saldo-cartao" className="tabular text-lg">{formatBRL(total.cartao)}</b>
            </p>
          </section>

          <div role="tablist" aria-label="Período" className="mt-6 flex rounded-2xl border-2 border-border bg-surface p-1">
            {PERIODOS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={periodo === k} onClick={() => setPeriodo(k)}
                className={cx("flex-1 whitespace-nowrap rounded-xl px-2 py-3 text-base font-semibold", periodo === k ? "bg-primary text-on-primary" : "text-muted")}>{label}</button>
            ))}
          </div>

          <section aria-label="Resumo do período" className="mt-3 divide-y divide-border rounded-2xl border-2 border-border bg-surface">
            <p className="flex items-center justify-between gap-3 px-4 py-3 text-lg"><span className="font-semibold text-in">Entrou</span><b data-testid="res-entradas" className="tabular text-xl text-in">{formatBRL(res.entradas)}</b></p>
            <p className="flex items-center justify-between gap-3 px-4 py-3 text-lg"><span className="font-semibold text-out">Saiu</span><b data-testid="res-saidas" className="tabular text-xl text-out">{formatBRL(res.saidas)}</b></p>
            <p className="flex items-center justify-between gap-3 bg-surface-2/60 px-4 py-3 text-lg"><span className="font-semibold">Sobrou</span><b data-testid="res-resultado" className={cx("tabular text-xl", res.resultado < 0 && "text-out")}>{formatBRL(res.resultado)}</b></p>
          </section>

          <h2 className="mt-6 text-lg font-bold">O que foi lançado</h2>

          {dias.length === 0 ? (
            <div className="mt-3 rounded-3xl border-2 border-dashed border-border p-8 text-center">
              <p className="text-lg font-semibold">Ainda não tem nada aqui.</p>
              <p className="mt-2 text-base text-muted">Quando entrar dinheiro, toque em <b className="text-in">“Entrou”</b>.<br />Quando sair, toque em <b className="text-out">“Saiu”</b>.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {dias.map((d) => (
                <section key={d.data} aria-label={`Dia ${formatDateBR(d.data)}`} className="overflow-hidden rounded-3xl border-2 border-border bg-surface">
                  <header className="bg-surface-2/70 px-4 py-3">
                    <p className="text-base font-bold capitalize">{WEEKDAY.format(new Date(`${d.data}T00:00:00Z`))}, {formatDateBR(d.data).slice(0, 5)}{d.data === hoje && " · hoje"}</p>
                    <p className="text-sm text-muted">Dinheiro no caixa no fim do dia: <b data-testid="acumulado" className="tabular text-base text-text">{formatBRL(d.acumulado.dinheiro)}</b></p>
                  </header>
                  <ul className="divide-y divide-border">
                    {d.itens.map((l) => (
                      <li key={l.id}>
                        <button onClick={() => setLancar({ tipo: l.tipo, edit: l })} aria-label={`${l.tipo === "entrada" ? "Entrou" : "Saiu"} ${formatBRL(l.valor_centavos)}, ${l.categoria}. Tocar para mudar`}
                          className="flex w-full items-center gap-3 px-4 py-4 text-left">
                          <span className={cx("grid size-10 shrink-0 place-items-center rounded-full text-xl font-bold", l.tipo === "entrada" ? "bg-in-soft text-in" : "bg-out-soft text-out")} aria-hidden>{l.tipo === "entrada" ? "+" : "−"}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold">{l.categoria}</span>
                            <span className="block text-sm text-muted">{FORMA_LABEL[l.forma]}{l.descricao ? ` · ${l.descricao}` : ""}</span>
                          </span>
                          <span className={cx("tabular whitespace-nowrap text-lg font-bold", l.tipo === "entrada" ? "text-in" : "text-out")}>{l.tipo === "entrada" ? "+" : "−"}{formatBRL(l.valor_centavos)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <button onClick={baixar} className="mx-auto flex items-center gap-2 rounded-xl px-3 py-2 text-base font-medium text-primary"><Download size={18} aria-hidden /> Baixar planilha (Excel)</button>
            </div>
          )}
        </>
      )}

      {rows !== null && acesso !== false && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 px-4 pt-3 backdrop-blur">
          <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3">
            <button onClick={() => setLancar({ tipo: "entrada" })} className="h-16 rounded-2xl bg-in text-xl font-bold text-white">+ Entrou</button>
            <button onClick={() => setLancar({ tipo: "saida" })} className="h-16 rounded-2xl bg-out text-xl font-bold text-white">− Saiu</button>
          </div>
        </div>
      )}

      {lancar && (
        <Lancar key={lancar.edit?.id ?? "novo"} tipoInicial={lancar.tipo} edit={lancar.edit} dataInicial={ultimaData} categoriasUsadas={categorias}
          onClose={() => setLancar(null)}
          onSaved={(msg, data) => { setLancar(null); setUltimaData(data); setAviso(msg); recarregar(); }} />
      )}
    </main>
  );
}
