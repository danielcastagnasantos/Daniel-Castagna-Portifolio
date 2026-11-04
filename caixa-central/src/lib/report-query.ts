import "server-only";
import type { AuthContext } from "@/lib/auth";
import { isISODate, presetRange, todayISO, formatDateBR, type PeriodPreset } from "@/lib/dates";
import type { ReportDef, Row } from "@/lib/reports";

export interface ReportParams { from: string; to: string; employee: string | null; kind: string | null }

const PRESETS: Record<string, PeriodPreset> = { hoje: "today", "7d": "7d", "30d": "30d", mes: "month", "mes-passado": "last-month" };

/** Lê o período dos parâmetros da URL (predefinido ou datas) com padrão "este mês". */
export function parseReportParams(sp: Record<string, string | string[] | undefined>): ReportParams & { error?: string } {
  const get = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) ?? "";
  let range = presetRange("month", todayISO());
  const p = get("p");
  if (p && PRESETS[p]) range = presetRange(PRESETS[p], todayISO());
  else if (isISODate(get("from")) && isISODate(get("to"))) range = { from: get("from"), to: get("to") };
  const emp = get("employee");
  const base = { ...range, employee: /^[0-9a-f-]{36}$/.test(emp) ? emp : null, kind: get("kind").slice(0, 40) || null };
  if (base.from > base.to) return { ...base, error: "A data inicial é maior que a final." };
  return base;
}

export async function runReport(ctx: AuthContext, def: ReportDef, p: ReportParams): Promise<{ rows: Row[]; error?: string }> {
  const { data, error } = await ctx.supabase.rpc("report_data", {
    p_report: def.id, p_from: p.from, p_to: p.to, p_employee: def.employeeFilter ? p.employee : null, p_kind: def.kindFilter ? p.kind : null,
  });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as Row[] };
}

export const periodLabel = (p: ReportParams) => (p.from === p.to ? formatDateBR(p.from) : `${formatDateBR(p.from)} a ${formatDateBR(p.to)}`);
