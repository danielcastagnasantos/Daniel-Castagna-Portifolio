import {
  siCss,
  siFirebase,
  siGit,
  siGithub,
  siHtml5,
  siJavascript,
  siNextdotjs,
  siNodedotjs,
  siReact,
  siSupabase,
  siTypescript,
  siVercel,
} from "simple-icons";

export type TechCategory = "lang" | "framework" | "tool" | "db";

export interface Tech {
  id: string;
  name: string;
  category: TechCategory;
  /** Dados do caminho SVG (viewBox 0 0 24 24). */
  path: string;
  /** Cor de exibição em hex, já ajustada para legibilidade sobre #050505. */
  color: string;
}

/**
 * Marcas cuja cor oficial é preta ou quase preta ficariam invisíveis sobre o
 * fundo #050505. Estas recebem uma variante clara para exibição.
 */
const DISPLAY_COLOR_OVERRIDES: Record<string, string> = {
  nextdotjs: "#FFFFFF",
  vercel: "#FFFFFF",
  github: "#E6E6E6",
};

function displayColor(slug: string, brandHex: string): string {
  return DISPLAY_COLOR_OVERRIDES[slug] ?? `#${brandHex}`;
}

export const technologies: readonly Tech[] = [
  { id: "html5", name: "HTML", category: "lang", path: siHtml5.path, color: displayColor("html5", siHtml5.hex) },
  { id: "css", name: "CSS", category: "lang", path: siCss.path, color: displayColor("css", siCss.hex) },
  { id: "javascript", name: "JavaScript", category: "lang", path: siJavascript.path, color: displayColor("javascript", siJavascript.hex) },
  { id: "typescript", name: "TypeScript", category: "lang", path: siTypescript.path, color: displayColor("typescript", siTypescript.hex) },
  { id: "react", name: "React", category: "framework", path: siReact.path, color: displayColor("react", siReact.hex) },
  { id: "nextdotjs", name: "Next.js", category: "framework", path: siNextdotjs.path, color: displayColor("nextdotjs", siNextdotjs.hex) },
  { id: "nodedotjs", name: "Node.js", category: "framework", path: siNodedotjs.path, color: displayColor("nodedotjs", siNodedotjs.hex) },
  { id: "git", name: "Git", category: "tool", path: siGit.path, color: displayColor("git", siGit.hex) },
  { id: "github", name: "GitHub", category: "tool", path: siGithub.path, color: displayColor("github", siGithub.hex) },
  { id: "vercel", name: "Vercel", category: "tool", path: siVercel.path, color: displayColor("vercel", siVercel.hex) },
  { id: "firebase", name: "Firebase", category: "db", path: siFirebase.path, color: displayColor("firebase", siFirebase.hex) },
  { id: "supabase", name: "Supabase", category: "db", path: siSupabase.path, color: displayColor("supabase", siSupabase.hex) },
] as const;

export const TECH_COUNT = technologies.length;
