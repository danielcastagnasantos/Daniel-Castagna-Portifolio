/**
 * Apenas projetos reais e publicados. Um card de projeto é lido pelo visitante
 * como prova de trabalho executado — preenchimento fictício aqui é o tipo de
 * promessa que cobra o preço depois, com o dinheiro do cliente já pago.
 */

export interface Project {
  /** Chave em messages.projects.items */
  id: string;
  /** URL ao vivo, ou `null` enquanto não publicado. */
  url: string | null;
  /** Caminho da captura em /public, ou `null` para o estado de espera. */
  image: string | null;
  stack: readonly string[];
  status: "live" | "in-progress";
  /** Destaque ocupa a largura inteira da grade. */
  featured: boolean;
}

export const projects: readonly Project[] = [
  {
    id: "tochegando",
    url: "https://tochegandobar.vercel.app",
    image: "/tochegando.png",
    stack: ["Next.js", "TypeScript", "Supabase", "Tailwind CSS", "Vitest"],
    status: "live",
    featured: true,
  },
  {
    id: "thaystop",
    url: "https://thaystop-brasil.vercel.app",
    image: null,
    // Sem framework de propósito: uma landing page estática de uma página não
    // precisa de bundler, e o resultado carrega mais rápido sem ele.
    stack: ["HTML", "CSS", "JavaScript", "Vercel"],
    status: "live",
    featured: false,
  },
] as const;
