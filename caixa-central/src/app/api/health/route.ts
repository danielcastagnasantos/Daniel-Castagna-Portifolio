import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
/** Verificação de vida para monitoramento (não expõe dados). */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
