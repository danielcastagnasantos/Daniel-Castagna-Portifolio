import { NextResponse } from "next/server";

/**
 * Proxy neutro. Existe só para o Next usar ESTE arquivo (e não o de outro projeto do mesmo repositório).
 * A proteção dos dados é feita pelo banco (RLS), não aqui.
 */
export function proxy() {
  return NextResponse.next();
}

export const config = { matcher: ["/__nunca__"] };
