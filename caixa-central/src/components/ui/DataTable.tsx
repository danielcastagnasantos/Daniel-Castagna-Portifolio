"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { formatBRL, parseMoneyToCents } from "@/lib/money";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates";
import { Badge, Empty, type Tone } from "./primitives";
import { cn } from "./cn";

export interface TableColumn {
  key: string;
  label: string;
  type?: "text" | "money" | "date" | "datetime" | "badge" | "int" | "mono";
  /** badge: rótulos e cores por valor */
  labels?: Record<string, string>;
  tones?: Record<string, Tone>;
  sortable?: boolean;
  /** money: colorir sinal (verde/vermelho) */
  signed?: boolean;
  hideOnMobile?: boolean;
  sub?: string; // chave de uma segunda linha (texto menor)
}
export interface TableFilter { key: string; label: string; options: Array<[string, string]> }
export type TableRow = Record<string, string | number | boolean | null | undefined> & { _href?: string };

function cell(col: TableColumn, row: TableRow) {
  const v = row[col.key];
  switch (col.type) {
    case "money": {
      const n = Number(v);
      return <span className={cn("tabular", col.signed && n < 0 && "text-danger", col.signed && n > 0 && "text-success")}>{v == null ? "—" : formatBRL(n, { signed: col.signed })}</span>;
    }
    case "date": return formatDateBR(v as string);
    case "datetime": return formatDateTimeBR(v as string);
    case "int": return <span className="tabular">{v ?? "—"}</span>;
    case "mono": return <span className="font-mono text-xs">{v ?? "—"}</span>;
    case "badge": return v == null || v === "" ? "—" : <Badge tone={col.tones?.[String(v)] ?? "neutral"}>{col.labels?.[String(v)] ?? String(v)}</Badge>;
    default: return v == null || v === "" ? "—" : String(v);
  }
}

/**
 * Tabela com busca, filtros, ordenação e paginação (no navegador, sobre as linhas já carregadas).
 * Em telas pequenas, cada linha vira um cartão (sem rolagem horizontal).
 */
export function DataTable({
  columns, rows, searchKeys, filters = [], pageSize = 15, empty = "Nada por aqui ainda.", initialSort, rangeKey, rangeLabel = "Valor",
}: {
  columns: TableColumn[]; rows: TableRow[]; searchKeys?: string[]; filters?: TableFilter[]; pageSize?: number;
  empty?: string; initialSort?: { key: string; dir: "asc" | "desc" };
  /** Ativa filtro por faixa de valor (em centavos) sobre esta coluna. */
  rangeKey?: string; rangeLabel?: string;
}) {
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const minC = parseMoneyToCents(min);
  const maxC = parseMoneyToCents(max);
  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) =>
      (!needle || (searchKeys ?? columns.map((c) => c.key)).some((k) => String(r[k] ?? "").toLowerCase().includes(needle) || String(columns.find((c) => c.key === k)?.labels?.[String(r[k])] ?? "").toLowerCase().includes(needle)))
      && filters.every((f) => !sel[f.key] || String(r[f.key]) === sel[f.key])
      && (!rangeKey || ((minC === null || Number(r[rangeKey]) >= minC) && (maxC === null || Number(r[rangeKey]) <= maxC))));
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true })) * dir;
      });
    }
    return out;
  }, [rows, q, sel, sort, searchKeys, columns, filters, rangeKey, minC, maxC]);

  const pages = Math.max(1, Math.ceil(view.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = view.slice(cur * pageSize, cur * pageSize + pageSize);

  const toggleSort = (key: string) => setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
  const first = columns[0];

  return (
    <div>
      {(searchKeys || filters.length > 0 || rangeKey) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          {searchKeys && (
            <label className="relative min-w-40 flex-1">
              <span className="sr-only">Pesquisar</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Pesquisar..."
                className="h-9 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30" />
            </label>
          )}
          {filters.map((f) => (
            <label key={f.key} className="text-xs">
              <span className="sr-only">{f.label}</span>
              <select value={sel[f.key] ?? ""} onChange={(e) => { setSel((s) => ({ ...s, [f.key]: e.target.value })); setPage(0); }}
                className="h-9 rounded-xl border border-border bg-surface px-2.5 text-sm" aria-label={f.label}>
                <option value="">{f.label}: todos</option>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          ))}
          {rangeKey && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              {rangeLabel}
              <input value={min} onChange={(e) => { setMin(e.target.value); setPage(0); }} inputMode="decimal" placeholder="mín." aria-label={`${rangeLabel} mínimo`} className="h-9 w-20 rounded-xl border border-border bg-surface px-2 text-right text-sm" />
              –
              <input value={max} onChange={(e) => { setMax(e.target.value); setPage(0); }} inputMode="decimal" placeholder="máx." aria-label={`${rangeLabel} máximo`} className="h-9 w-20 rounded-xl border border-border bg-surface px-2 text-right text-sm" />
            </span>
          )}
        </div>
      )}

      {view.length === 0 ? <Empty title={rows.length ? "Nenhum resultado para os filtros." : empty} /> : (
        <>
          {/* Desktop/tablet */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className={cn("whitespace-nowrap px-4 py-2.5 font-medium sm:px-5", (c.type === "money" || c.type === "int") && "text-right")}
                      aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                      {c.sortable !== false ? (
                        <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-text">
                          {c.label}
                          {sort?.key === c.key && (sort.dir === "asc" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                        </button>
                      ) : c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((r, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-surface-2/60">
                    {columns.map((c, ci) => (
                      <td key={c.key} className={cn("px-4 py-3 align-top sm:px-5", (c.type === "money" || c.type === "int") && "text-right")}>
                        {ci === 0 && r._href ? <Link href={r._href} className="font-medium text-primary hover:underline">{cell(c, r)}</Link> : cell(c, r)}
                        {c.sub && r[c.sub] ? <div className="text-xs text-muted">{String(r[c.sub])}</div> : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Celular: cartões */}
          <ul className="divide-y divide-border md:hidden">
            {slice.map((r, i) => (
              <li key={i} className="space-y-1.5 px-4 py-3">
                {columns.filter((c) => !c.hideOnMobile).map((c, ci) => (
                  <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                    {ci === 0 ? (
                      <div className="min-w-0 font-medium">
                        {r._href ? <Link href={r._href} className="text-primary">{cell(c, r)}</Link> : cell(c, r)}
                        {c.sub && r[c.sub] ? <div className="text-xs font-normal text-muted">{String(r[c.sub])}</div> : null}
                      </div>
                    ) : (
                      <>
                        <span className="shrink-0 text-xs text-muted">{c.label}</span>
                        <span className="min-w-0 text-right">{cell(c, r)}</span>
                      </>
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted sm:px-5">
            <span>{view.length} registro{view.length === 1 ? "" : "s"}{first && ""}</span>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Página anterior" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded-lg p-1.5 hover:bg-surface-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
                <span className="tabular px-1">{cur + 1} / {pages}</span>
                <button type="button" aria-label="Próxima página" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded-lg p-1.5 hover:bg-surface-2 disabled:opacity-40"><ChevronRight size={16} /></button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
