import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Todas as rotas exceto assets estáticos, arquivos com extensão e internos do Next
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
