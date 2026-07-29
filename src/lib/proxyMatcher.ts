/**
 * Caminhos que o proxy de idioma NÃO deve interceptar.
 *
 * Mora aqui, separado de `proxy.ts`, porque aquele arquivo importa
 * `next-intl/middleware` e só carrega dentro do runtime do Next — o que
 * tornaria esta regra impossível de testar.
 *
 * `icon` está na lista por um defeito encontrado em produção: o favicon
 * gerado por `app/icon.tsx` é servido em `/icon`, sem extensão de arquivo.
 * A exclusão genérica `.*\..*` só pega caminhos com ponto, então `/icon`
 * passava batido, era tratado como página, ganhava prefixo de idioma e
 * virava `/pt/icon` — que não existe. O site ficou sem favicon em silêncio,
 * porque a tag no HTML continuava correta e nada acusava erro.
 *
 * `sitemap.xml` e `robots.txt` já são cobertos pela regra do ponto.
 */
export const PROXY_MATCHER = "/((?!api|_next|_vercel|icon|.*\\..*).*)";

/**
 * Reproduz a decisão do matcher para um caminho.
 * Usado nos testes; o Next compila a mesma string do seu próprio lado.
 */
export function proxyHandles(pathname: string): boolean {
  return new RegExp(`^${PROXY_MATCHER}$`).test(pathname);
}
