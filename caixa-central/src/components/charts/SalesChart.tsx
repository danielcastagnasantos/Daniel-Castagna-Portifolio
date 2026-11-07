"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/money";

export interface SeriesPoint { label: string; sales: number; expenses: number }

const compact = (cents: number) => {
  const r = cents / 100;
  if (Math.abs(r) >= 1000) return `${(r / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return r.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
};

/** Evolução de faturamento × despesas. Cores via variáveis do tema (claro/escuro). */
export function SalesChart({ data }: { data: SeriesPoint[] }) {
  if (!data.length) return null;
  return (
    <div role="img" aria-label="Gráfico de faturamento e despesas no período" className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} /></linearGradient>
            <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--warning)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--warning)" stopOpacity={0.02} /></linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={16} />
          <YAxis tickFormatter={compact} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v, name) => [formatBRL(Number(v)), name === "sales" ? "Faturamento" : "Despesas"]}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 12 }}
            labelStyle={{ color: "var(--muted)" }}
          />
          <Legend formatter={(v) => (v === "sales" ? "Faturamento" : "Despesas")} wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={2} fill="url(#gSales)" />
          <Area type="monotone" dataKey="expenses" stroke="var(--warning)" strokeWidth={2} fill="url(#gExp)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
