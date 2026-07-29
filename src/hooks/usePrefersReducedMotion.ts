"use client";

import { useEffect, useState } from "react";

/**
 * True quando o sistema do usuário pede menos movimento.
 *
 * Requisito WCAG 2.3.3. Governa parallax, cursor customizado, efeito de
 * digitação e a animação da cena 3D.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setPrefersReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
}
