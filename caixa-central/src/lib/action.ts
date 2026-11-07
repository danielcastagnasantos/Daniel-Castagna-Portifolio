import "server-only";
import { z, type ZodType } from "zod";
import { AuthError, requireActionAuth, type AuthContext } from "@/lib/auth";
import type { NavKey } from "@/lib/permissions";

/** Resultado padrão de toda Server Action. `ok:true` SÓ depois que o banco confirmou. */
export type ActionState =
  | { ok: true; message: string; data?: Record<string, unknown>; redirectTo?: string; at: number }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string>; at: number }
  | null;

export const ok = (message: string, extra: { data?: Record<string, unknown>; redirectTo?: string } = {}): ActionState => ({
  ok: true, message, at: Date.now(), ...extra,
});
export const fail = (error: string, extra: { code?: string; fieldErrors?: Record<string, string> } = {}): ActionState => ({
  ok: false, error, at: Date.now(), ...extra,
});

const NETWORK_RE = /fetch failed|network|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN|socket|aborted/i;
export const CONNECTION_MESSAGE =
  "Não foi possível confirmar com o servidor. A operação pode não ter sido salva. Verifique a conexão e tente novamente — repetir é seguro, o sistema não duplica o lançamento.";

interface DbErrorLike { message?: string; hint?: string | null; code?: string; details?: string | null }

/** Converte erros do Postgres/PostgREST em mensagem amigável + código estável (hint). */
export function mapDbError(error: DbErrorLike): { message: string; code?: string } {
  const message = error.message ?? "";
  if (!error.code && NETWORK_RE.test(message)) return { message: CONNECTION_MESSAGE, code: "NETWORK" };
  if (error.code === "P0001") return { message, code: error.hint ?? undefined };      // erros de negócio do banco (pt-BR)
  if (error.code === "42501") return { message: "Você não tem permissão para esta operação.", code: "FORBIDDEN" };
  if (error.code === "23505") return { message: "Este registro já existe.", code: "DUPLICATE" };
  if (error.code === "23514" || error.code === "23502") return { message: "Dados inválidos para esta operação.", code: "INVALID" };
  console.error("[db-error]", error.code, message, error.details);
  return { message: "Erro inesperado ao salvar. Nenhum dado foi alterado. Tente novamente ou avise o administrador.", code: "UNEXPECTED" };
}

/** Chama uma função do banco e devolve {data} ou {state} já pronto para retornar da ação. */
export async function callRpc<T = unknown>(
  ctx: AuthContext, fn: string, args: Record<string, unknown>,
): Promise<{ data: T; state?: undefined } | { data?: undefined; state: NonNullable<ActionState> & { ok: false } }> {
  try {
    const { data, error } = await ctx.supabase.rpc(fn, args);
    if (error) {
      const m = mapDbError(error);
      return { state: fail(m.message, { code: m.code }) as NonNullable<ActionState> & { ok: false } };
    }
    return { data: data as T };
  } catch (e) {
    const m = mapDbError({ message: e instanceof Error ? e.message : String(e) });
    return { state: fail(m.message, { code: m.code }) as NonNullable<ActionState> & { ok: false } };
  }
}

/** Converte FormData em objeto e valida com Zod, devolvendo erros por campo. */
export function parseForm<S extends ZodType>(schema: S, formData: FormData):
  { ok: true; data: z.output<S> } | { ok: false; state: NonNullable<ActionState> & { ok: false } } {
  const raw: Record<string, FormDataEntryValue> = {};
  for (const [k, v] of formData.entries()) if (!k.startsWith("$ACTION")) raw[k] = v;
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "_")] ??= issue.message;
  const first = Object.values(fieldErrors)[0] ?? "Dados inválidos";
  return { ok: false, state: fail(first, { fieldErrors, code: "VALIDATION" }) as NonNullable<ActionState> & { ok: false } };
}

/**
 * Envolve a ação: valida sessão/permissão NO SERVIDOR a cada chamada, captura erros
 * e garante que nada seja reportado como salvo sem confirmação do banco.
 */
export function action<S extends ZodType>(
  opts: { area?: NavKey; schema: S; allowPasswordChange?: boolean },
  handler: (input: z.output<S>, ctx: AuthContext, formData: FormData) => Promise<ActionState>,
) {
  return async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    try {
      const ctx = await requireActionAuth(opts.area, { allowPasswordChange: opts.allowPasswordChange });
      const parsed = parseForm(opts.schema, formData);
      if (!parsed.ok) return parsed.state;
      return await handler(parsed.data, ctx, formData);
    } catch (e) {
      if (e instanceof AuthError) return fail(e.message, { code: "AUTH" });
      if (e instanceof Error && (e.message === "NEXT_REDIRECT" || (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"))) throw e;
      const m = mapDbError({ message: e instanceof Error ? e.message : String(e) });
      return fail(m.message, { code: m.code });
    }
  };
}

/** Ação sem sessão (login, cadastro inicial, recuperação de senha). Valida dados e trata erros do mesmo modo. */
export function publicAction<S extends ZodType>(
  schema: S,
  handler: (input: z.output<S>, formData: FormData) => Promise<ActionState>,
) {
  return async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    try {
      const parsed = parseForm(schema, formData);
      if (!parsed.ok) return parsed.state;
      return await handler(parsed.data, formData);
    } catch (e) {
      const m = mapDbError({ message: e instanceof Error ? e.message : String(e) });
      return fail(m.message, { code: m.code });
    }
  };
}
