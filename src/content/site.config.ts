/**
 * Fonte única de verdade para dados de contato e arquivos do proprietário do site.
 *
 * Campos `null` representam informação que Daniel ainda não forneceu. A UI
 * renderiza o canal correspondente desabilitado com rótulo "em breve" — nunca
 * como link morto, que é pior para a credibilidade do que um botão ausente.
 *
 * Para ativar um canal, troque o `null` pelo valor real. Nenhum componente
 * precisa mudar.
 */

export type LinkKey = "whatsapp" | "email" | "github" | "linkedin" | "instagram";

/**
 * O cargo NÃO mora aqui: ele é copy, muda por idioma e vive em
 * `messages/*.json` sob a chave `identity.role`.
 */
export interface SiteConfig {
  /** Nome completo, usado em JSON-LD e no rodapé. */
  name: string;
  /** Nome curto da marca. */
  brand: string;
  /**
   * Origem canônica em produção, sem barra final.
   *
   * Alimenta canonical, hreflang, sitemap.xml, robots.txt, as URLs do Open
   * Graph e o `@id` do JSON-LD. Apontar para um domínio que não é seu diz ao
   * Google que o conteúdo original está em outro lugar, e quebra o preview de
   * link no WhatsApp e no LinkedIn. Ao registrar um domínio próprio, esta é a
   * única linha a trocar.
   */
  url: string;
  location: { city: string; region: string; regionCode: string; country: string };
  /** Caminho em /public. `null` renderiza o retrato em estado de espera. */
  photo: string | null;
  /** Caminho em /public. `null` desabilita o botão de currículo. */
  resume: string | null;
  /**
   * whatsapp: apenas dígitos com código do país, ex. "5527999999999"
   * email: endereço puro, ex. "contato@exemplo.com"
   * demais: URL completa com https://
   */
  links: Record<LinkKey, string | null>;
}

export const siteConfig: SiteConfig = {
  name: "Daniel Castagna Santos",
  brand: "Daniel Castagna",
  url: "https://daniel-castagna-portifolio.vercel.app",
  location: {
    city: "Vila Velha",
    region: "Espírito Santo",
    regionCode: "ES",
    country: "BR",
  },
  photo: "/daniel.jpg",
  resume: null,
  links: {
    // Formato internacional obrigatório para o wa.me: 55 (Brasil) + 27 (ES).
    whatsapp: "5527998723273",
    email: "danielcastagna2006@gmail.com",
    github: "https://github.com/danielcastagnasantos",
    linkedin: "https://www.linkedin.com/in/daniel-castagna-santos-8419893aa/",
    instagram: "https://www.instagram.com/danielcastagna_/",
  },
};

/** Um canal está ativo quando tem valor não vazio configurado. */
export function isLinkActive(key: LinkKey, config: SiteConfig = siteConfig): boolean {
  const value = config.links[key];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Converte o valor bruto configurado no href final.
 * Retorna `null` quando o canal está inativo, para que a UI não gere âncora.
 */
export function getLinkHref(key: LinkKey, config: SiteConfig = siteConfig): string | null {
  if (!isLinkActive(key, config)) return null;

  const value = config.links[key]!.trim();

  switch (key) {
    case "whatsapp":
      return `https://wa.me/${value.replace(/\D/g, "")}`;
    case "email":
      return `mailto:${value}`;
    default:
      return value;
  }
}

/** Canais na ordem de prioridade de conversão. */
export const CONTACT_ORDER: readonly LinkKey[] = [
  "whatsapp",
  "email",
  "github",
  "linkedin",
  "instagram",
] as const;
