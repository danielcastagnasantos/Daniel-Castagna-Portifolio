import { CONTACT_ORDER, getLinkHref, siteConfig } from "@/content/site.config";

/**
 * Dados estruturados Schema.org (Person + WebSite).
 *
 * `sameAs` só lista perfis realmente configurados: declarar URLs vazias ou
 * inventadas é o tipo de dado estruturado que buscadores tratam como spam.
 */
export function JsonLd({
  locale,
  description,
  role,
}: {
  locale: string;
  description: string;
  role: string;
}) {
  const sameAs = CONTACT_ORDER.filter(
    (key) => key !== "whatsapp" && key !== "email",
  )
    .map((key) => getLinkHref(key))
    .filter((href): href is string => href !== null);

  const person = {
    "@type": "Person",
    "@id": `${siteConfig.url}/#person`,
    name: siteConfig.name,
    jobTitle: role,
    description,
    url: siteConfig.url,
    ...(sameAs.length > 0 && { sameAs }),
    address: {
      "@type": "PostalAddress",
      addressLocality: siteConfig.location.city,
      addressRegion: siteConfig.location.regionCode,
      addressCountry: siteConfig.location.country,
    },
    // Sem `alumniOf`: essa propriedade significa formado, e o curso está em
    // andamento. A condição de estudante já consta na descrição.
    knowsAbout: ["Web Development", "Next.js", "React", "TypeScript", "Responsive Design"],
  };

  const website = {
    "@type": "WebSite",
    "@id": `${siteConfig.url}/#website`,
    url: siteConfig.url,
    name: siteConfig.name,
    description,
    inLanguage: locale === "pt" ? "pt-BR" : "en",
    publisher: { "@id": `${siteConfig.url}/#person` },
  };

  const graph = { "@context": "https://schema.org", "@graph": [person, website] };

  return (
    <script
      type="application/ld+json"
      // O conteúdo é montado a partir de constantes do próprio projeto, sem
      // entrada de usuário — não há vetor de injeção aqui.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
