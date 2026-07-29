import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  /**
   * Caminhos que o proxy de idioma NÃO deve interceptar.
   *
   * PRECISA ser uma string literal: o Next lê este valor em tempo de
   * compilação e recusa qualquer constante importada.
   *
   * `icon` está aqui por um defeito encontrado em produção — o favicon
   * gerado por `app/icon.tsx` é servido em `/icon`, sem extensão, então a
   * exclusão genérica `.*\..*` não o cobria. Ele virava `/pt/icon`, dava 404,
   * e o site ficava sem favicon em silêncio.
   *
   * O comportamento desta regra é verificado em `lib/proxyMatcher.test.ts`,
   * que lê o valor daqui.
   */
  matcher: "/((?!api|_next|_vercel|icon|.*\\..*).*)",
};
