"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Banknote, CreditCard, Download, Loader2, LogOut, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { carregarTudo, temAcesso } from "@/lib/data";
import { porDia, resumo, saldos } from "@/lib/calc";
import { toCsv } from "@/lib/csv";
import { formatBRL } from "@/lib/money";
import { formatDateBR, presetRange, todayISO, type PeriodPreset } from "@/lib/dates";
import { FORMA_LABEL, type Lancamento, type Tipo } from "@/lib/types";
import { Lancar } from "./Lancar";

const PERIODOS: Array<[string, string, PeriodPreset | "all"]> = [["hoje", "Hoje", "today"], ["semana", "Semana", "week"], ["mes", "Mês", "month"], ["ano", "Ano", "year"], ["tudo", "Tudo", "all"]];
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
        <h1 className="text-xl font-semibold tracking-tight">Caixa Simples</h1>
        <div className="flex items-center gap-1">
          <button onClick={recarregar} aria-label="Atualizar" className="rounded-xl p-2 text-muted hover:bg-surface-2"><RefreshCw size={18} /></button>
          <button onClick={() => void supabase().auth.signOut()} aria-label="Sair" title={email} className="rounded-xl p-2 text-muted hover:bg-surface-2"><LogOut size={18} /></button>
        </div>
      </header>

      {aviso && <p role="status" className="mb-3 rounded-xl bg-in-soft px-3 py-2 text-sm font-medium text-in">{aviso}</p>}
      {erro && <p role="alert" className="mb-3 rounded-xl bg-out-soft px-3 py-2 text-sm text-out">{erro}</p>}
      {acesso === false && <p role="alert" className="mb-3 rounded-xl bg-warn-soft px-3 py-3 text-sm text-warn">Este e-mail ainda não foi liberado para usar o caixa. Peça para quem administra adicionar <b>{email}</b>.</p>}
      {rows === null && <div className="grid place-items-center py-20 text-muted"><Loader2 className="animate-spin" aria-label="Carregando" /></div>}

      {rows !== null && acesso !== false && (
        <>
          <section aria-label="Saldos" className="grid grid-cols-2 gap-3">
            <div className="col-span-2 rounded-3xl border border-border bg-surface p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-muted"><Banknote size={16} aria-hidden /> Dinheiro em caixa</p>
              <p data-testid="saldo-dinheiro" className={cx("tabular mt-1 text-4xl font-bold tracking-tight", total.dinheiro < 0 && "text-out")}>{formatBRL(total.dinheiro)}</p>
              <p className="mt-1 text-xs text-muted">Tudo que entrou e saiu em dinheiro, inclusive dias anteriores.</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><CreditCard size={14} aria-hidden /> Cartão</p>
              <p data-testid="saldo-cartao" className="tabular mt-1 text-xl font-semibold">{formatBRL(total.cartao)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-medium text-muted">Dinheiro + cartão</p>
              <p data-testid="saldo-total" className="tabular mt-1 text-xl font-semibold">{formatBRL(total.total)}</p>
            </div>
          </section>

          <div role="tablist" aria-label="Período" className="mt-5 flex overflow-x-auto rounded-xl border border-border bg-surface p-0.5">
            {PERIODOS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={periodo === k} onClick={() => setPeriodo(k)}
                className={cx("flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", periodo === k ? "bg-primary text-on-primary" : "text-muted")}>{label}</button>
            ))}
          </div>

          <section aria-label="Resumo do período" className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-in-soft p-3"><p className="text-[11px] font-medium text-in">Entradas</p><p data-testid="res-entradas" className="tabular text-base font-semibold text-in">{formatBRL(res.entradas)}</p></div>
            <div className="rounded-2xl bg-out-soft p-3"><p className="text-[11px] font-medium text-out">Saídas</p><p data-testid="res-saidas" className="tabular text-base font-semibold text-out">{formatBRL(res.saidas)}</p></div>
            <div className="rounded-2xl bg-surface-2 p-3"><p className="text-[11px] font-medium text-muted">Resultado</p><p data-testid="res-resultado" className={cx("tabular text-base font-semibold", res.resultado < 0 && "text-out")}>{formatBRL(res.resultado, { signed: true })}</p></div>
          </section>
          {res.porCategoria.length > 0 && (
            <p className="mt-2 text-xs text-muted">{res.porCategoria.slice(0, 4).map((c) => `${c.categoria}: ${formatBRL(c.total)}`).join(" · ")}</p>
          )}

          <div className="mt-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Lançamentos</h2>
            <button onClick={baixar} disabled={!dias.length} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary disabled:opacity-40"><Download size={14} aria-hidden /> Baixar planilha</button>
          </div>

          {dias.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">Nada lançado neste período. Toque em “Entrada” ou “Saída” para começar.</p>
          ) : (
            <div className="mt-2 space-y-4">
              {dias.map((d) => (
                <section key={d.data} aria-label={`Dia ${formatDateBR(d.data)}`} className="overflow-hidden rounded-2xl border border-border bg-surface">
                  <header className="flex items-center justify-between gap-2 bg-surface-2/70 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-semibold capitalize">{WEEKDAY.format(new Date(`${d.data}T00:00:00Z`))}, {formatDateBR(d.data)}{d.data === hoje && " · hoje"}</p>
                      <p className="text-xs text-muted">Dinheiro no caixa no fim do dia: <b data-testid="acumulado" className="tabular text-text">{formatBRL(d.acumulado.dinheiro)}</b></p>
                    </div>
                    <p className="tabular text-right text-xs text-muted"><span className="text-in">+{formatBRL(d.entradas)}</span><br /><span className="text-out">−{formatBRL(d.saidas)}</span></p>
                  </header>
                  <ul className="divide-y divide-border">
                    {d.itens.map((l) => (
                      <li key={l.id}>
                        <button onClick={() => setLancar({ tipo: l.tipo, edit: l })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
                          {l.tipo === "entrada" ? <ArrowDownCircle size={20} className="shrink-0 text-in" aria-label="Entrada" /> : <ArrowUpCircle size={20} className="shrink-0 text-out" aria-label="Saída" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{l.categoria}{l.descricao ? <span className="font-normal text-muted"> · {l.descricao}</span> : null}</span>
                            <span className="text-xs text-muted">{FORMA_LABEL[l.forma]}</span>
                          </span>
                          <span className={cx("tabular whitespace-nowrap text-sm font-semibold", l.tipo === "entrada" ? "text-in" : "text-out")}>{l.tipo === "entrada" ? "+" : "−"}{formatBRL(l.valor_centavos)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {rows !== null && acesso !== false && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 px-4 pt-3 backdrop-blur">
          <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3">
            <button onClick={() => setLancar({ tipo: "entrada" })} className="h-14 rounded-2xl bg-in text-base font-semibold text-white">+ Entrada</button>
            <button onClick={() => setLancar({ tipo: "saida" })} className="h-14 rounded-2xl bg-out text-base font-semibold text-white">− Saída</button>
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
