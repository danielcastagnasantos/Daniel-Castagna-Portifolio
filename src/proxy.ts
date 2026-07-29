import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { PROXY_MATCHER } from "./lib/proxyMatcher";

export default createMiddleware(routing);

export const config = {
  matcher: PROXY_MATCHER,
};
