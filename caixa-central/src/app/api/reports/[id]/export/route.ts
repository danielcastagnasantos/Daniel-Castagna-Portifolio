import { NextResponse, type NextRequest } from "next/server";
import { getOrganization, getSession } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { reportById, totalsRow } from "@/lib/reports";
import { parseReportParams, periodLabel, runReport } from "@/lib/report-query";
import { reportToCsv } from "@/lib/export/csv";
import { reportToXlsx } from "@/lib/export/xlsx";
import { reportToPdf } from "@/lib/export/pdf";

export const dynamic = "force-dynamic";

/** Exporta o relatório (csv | xlsx | pdf). Somente proprietário/gerente — e o banco também confere. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const def = reportById(id);
  if (!def) return new NextResponse("Relatório inexistente", { status: 404 });
  const s = await getSession();
  if (!s?.profile) return new NextResponse("Não autorizado", { status: 401 });
  if (!isAdmin(s.profile.role)) return new NextResponse("Sem permissão", { status: 403 });

  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  if (!["csv", "xlsx", "pdf"].includes(format)) return new NextResponse("Formato inválido", { status: 400 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const p = parseReportParams(sp);
  if (p.error) return new NextResponse(p.error, { status: 400 });

  const ctx = { supabase: s.supabase, profile: s.profile };
  const { rows, error } = await runReport(ctx, def, p);
  if (error) return new NextResponse(error, { status: 422 });
  const org = (await getOrganization())?.name ?? "Empresa";
  const total = totalsRow(def, rows);
  const meta = { org, period: periodLabel(p) };
  const base = `${def.id}-${p.from}_${p.to}`;
  const headers = (type: string, ext: string) => ({
    "Content-Type": type, "Content-Disposition": `attachment; filename="${base}.${ext}"`, "Cache-Control": "private, no-store",
  });

  if (format === "csv") return new NextResponse(reportToCsv(def, rows, total), { headers: headers("text/csv; charset=utf-8", "csv") });
  if (format === "xlsx") {
    const buf = await reportToXlsx(def, rows, meta, total);
    return new NextResponse(new Uint8Array(buf), { headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx") });
  }
  const pdf = await reportToPdf(def, rows, meta, total);
  return new NextResponse(Buffer.from(pdf), { headers: headers("application/pdf", "pdf") });
}
