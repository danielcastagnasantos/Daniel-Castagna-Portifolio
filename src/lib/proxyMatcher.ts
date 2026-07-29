import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Lê o matcher realmente usado em `src/proxy.ts`.
 *
 * Por que extrair do arquivo em vez de importar: o Next exige que `matcher`
 * seja uma string literal, lida em tempo de compilação, e recusa constantes
 * importadas. E `proxy.ts` importa `next-intl/middleware`, que nem carrega
 * fora do runtime do Next.
 *
 * Duplicar o valor num módulo separado deixaria os dois divergirem em
 * silêncio — exatamente o tipo de falha que o teste existe para impedir.
 * Extrair garante que o teste avalie o valor que vai para produção.
 */
export function readProxyMatcher(): string {
  const proxyPath = fileURLToPath(new URL("../proxy.ts", import.meta.url));
  const source = readFileSync(proxyPath, "utf8");

  const match = source.match(/matcher:\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Não foi possível encontrar o matcher em src/proxy.ts");
  }

  // O literal do arquivo traz as barras invertidas escapadas para JS.
  return JSON.parse(`"${match[1]}"`);
}

/** Reproduz a decisão do matcher para um caminho. */
export function proxyHandles(pathname: string, matcher = readProxyMatcher()): boolean {
  return new RegExp(`^${matcher}$`).test(pathname);
}
