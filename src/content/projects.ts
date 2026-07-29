/**
 * Apenas projetos reais. Um card de projeto é lido pelo visitante como prova de
 * trabalho executado — preenchimento fictício aqui é o tipo de promessa que
 * cobra o preço depois, com o dinheiro do cliente já pago.
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
    url: "https://tochegandobar-three.vercel.app",
    image: "/tochegando.png",
    stack: ["Next.js", "React", "TypeScript", "Vercel"],
    status: "live",
    featured: true,
  },
  {
    id: "portfolio",
    url: null,
    image: null,
    stack: ["Next.js", "React Three Fiber", "TypeScript", "Tailwind CSS"],
    status: "in-progress",
    featured: false,
  },
] as const;
