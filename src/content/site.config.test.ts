import { describe, expect, it } from "vitest";
import {
  CONTACT_ORDER,
  getLinkHref,
  isLinkActive,
  siteConfig,
  type SiteConfig,
} from "./site.config";

function configWith(links: Partial<SiteConfig["links"]>): SiteConfig {
  return {
    ...siteConfig,
    links: { whatsapp: null, email: null, github: null, linkedin: null, instagram: null, ...links },
  };
}

describe("isLinkActive", () => {
  it("treats an unset channel as inactive", () => {
    expect(isLinkActive("github", configWith({}))).toBe(false);
  });

  it("treats a whitespace-only value as inactive", () => {
    // Quebra que este teste pega: colar um valor com só espaços renderizaria
    // um link clicável apontando para lugar nenhum.
    expect(isLinkActive("github", configWith({ github: "   " }))).toBe(false);
  });

  it("treats a configured value as active", () => {
    expect(isLinkActive("github", configWith({ github: "https://github.com/daniel" }))).toBe(true);
  });
});

describe("getLinkHref", () => {
  it("returns null for an unset channel so the UI never renders an anchor", () => {
    // Quebra que este teste pega: um href null virando string "null" produz
    // um link para /null em produção.
    expect(getLinkHref("linkedin", configWith({}))).toBeNull();
  });

  it("builds a wa.me url and strips punctuation from the phone number", () => {
    // Quebra que este teste pega: wa.me rejeita qualquer caractere que não
    // seja dígito, e o visitante cai numa página de erro do WhatsApp.
    expect(getLinkHref("whatsapp", configWith({ whatsapp: "+55 (27) 99999-9999" }))).toBe(
      "https://wa.me/5527999999999",
    );
  });

  it("builds a mailto url for email", () => {
    expect(getLinkHref("email", configWith({ email: "contato@exemplo.com" }))).toBe(
      "mailto:contato@exemplo.com",
    );
  });

  it("passes through a full url untouched", () => {
    expect(getLinkHref("instagram", configWith({ instagram: "https://instagram.com/daniel" }))).toBe(
      "https://instagram.com/daniel",
    );
  });

  it("trims surrounding whitespace before building the href", () => {
    expect(getLinkHref("email", configWith({ email: "  a@b.com  " }))).toBe("mailto:a@b.com");
  });
});

describe("CONTACT_ORDER", () => {
  it("covers every configurable channel exactly once", () => {
    // Quebra que este teste pega: adicionar um canal em SiteConfig e esquecer
    // de listá-lo aqui faz o canal sumir da seção de contato sem erro algum.
    const configured = Object.keys(siteConfig.links).sort();
    expect([...CONTACT_ORDER].sort()).toEqual(configured);
    expect(new Set(CONTACT_ORDER).size).toBe(CONTACT_ORDER.length);
  });
});
