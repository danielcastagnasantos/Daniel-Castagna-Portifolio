import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Configuração para deploy na Vercel.
 *
 * Deliberadamente SEM `output: "export"`, `basePath` ou `images.unoptimized` —
 * essas três opções servem ao GitHub Pages e quebram este projeto:
 *
 * - `output: "export"` desliga o proxy de idioma, que é o que faz `/`
 *   redirecionar para `/pt` ou `/en`, e ainda derruba o build nas rotas de
 *   metadata (robots.txt, sitemap.xml) por falta de `dynamic = "force-static"`.
 * - `basePath` prefixaria toda URL do site, que na Vercel responde na raiz.
 * - `images.unoptimized` faria a captura do Tô Chegando baixar 1,4 MB de PNG
 *   em vez dos 42 KB de WebP que o otimizador entrega hoje.
 *
 * O `createNextIntlPlugin` também não é opcional: sem ele o next-intl não
 * localiza `src/i18n/request.ts` e o site bilíngue para de funcionar.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compiler: {
    // Remove console.* do bundle de produção, exceto erros e avisos
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
