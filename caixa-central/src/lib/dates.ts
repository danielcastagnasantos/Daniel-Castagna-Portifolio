/** Datas no padrão brasileiro e fuso America/Sao_Paulo (independente do fuso do servidor/navegador). */
export const TZ = "America/Sao_Paulo";

const partsFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Data de hoje (YYYY-MM-DD) em Brasília. */
export function todayISO(now: Date = new Date()): string {
  return partsFmt.format(now);
}

/** ISO date "2026-03-05" -> "05/03/2026" (sem passar por Date, evitando fuso). */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const dtFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export function formatDateTimeBR(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  return dtFmt.format(new Date(ts)).replace(",", "");
}
export function formatTimeBR(ts: string | Date | null | undefined): string {
  return ts ? timeFmt.format(new Date(ts)) : "—";
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
export function startOfMonthISO(iso: string): string {
  return `${iso.slice(0, 8)}01`;
}
export function endOfMonthISO(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function addMonthsISO(iso: string, months: number): string {
  const [y, m] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  return dt.toISOString().slice(0, 10);
}
export const isISODate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export type PeriodPreset = "today" | "week" | "7d" | "30d" | "month" | "last-month" | "year";
export function presetRange(preset: PeriodPreset, today = todayISO()): { from: string; to: string } {
  switch (preset) {
    case "today": return { from: today, to: today };
    case "week": {
      // semana corrente: segunda-feira até hoje
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = domingo
      return { from: addDaysISO(today, -((dow + 6) % 7)), to: today };
    }
    case "year": return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "7d": return { from: addDaysISO(today, -6), to: today };
    case "30d": return { from: addDaysISO(today, -29), to: today };
    case "month": return { from: startOfMonthISO(today), to: today };
    case "last-month": {
      const prev = addMonthsISO(startOfMonthISO(today), -1);
      return { from: prev, to: endOfMonthISO(prev) };
    }
  }
}
