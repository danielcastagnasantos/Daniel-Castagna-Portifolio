import { describe, expect, it } from "vitest";
import { proxyHandles } from "./proxyMatcher";

/**
 * O matcher decide quais rotas recebem prefixo de idioma. Errar aqui não
 * quebra o build nem gera erro no console — apenas faz um recurso sumir do
 * site publicado, que foi exatamente o que aconteceu com o favicon.
 */
describe("matcher do proxy de idioma", () => {
  it("intercepta rotas de página, que precisam do prefixo de idioma", () => {
    expect(proxyHandles("/")).toBe(true);
    expect(proxyHandles("/pt")).toBe(true);
    expect(proxyHandles("/en")).toBe(true);
  });

  it("não intercepta o favicon gerado", () => {
    // Quebra que este teste pega: /icon vira /pt/icon, devolve 404 e o site
    // fica sem favicon. Observado em produção.
    expect(proxyHandles("/icon")).toBe(false);
  });

  it("não intercepta rotas internas do Next nem da infraestrutura", () => {
    expect(proxyHandles("/api/qualquer")).toBe(false);
    expect(proxyHandles("/_next/static/chunk.js")).toBe(false);
    expect(proxyHandles("/_vercel/insights")).toBe(false);
  });

  it("não intercepta arquivos com extensão", () => {
    expect(proxyHandles("/sitemap.xml")).toBe(false);
    expect(proxyHandles("/robots.txt")).toBe(false);
    expect(proxyHandles("/tochegando.png")).toBe(false);
    expect(proxyHandles("/daniel.jpg")).toBe(false);
  });
});
