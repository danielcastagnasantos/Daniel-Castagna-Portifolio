"use client";

import { useMediaQuery } from "./useMediaQuery";

/**
 * True quando o sistema do usuário pede menos movimento.
 *
 * Requisito WCAG 2.3.3. Governa parallax, cursor customizado, efeito de
 * digitação e a animação da cena 3D.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
