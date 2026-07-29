"use client";

import { useEffect, useState } from "react";

/**
 * True em dispositivos cujo apontador primário é toque.
 *
 * Começa em `false` e só atualiza depois da montagem: o servidor não conhece o
 * dispositivo, e divergir na primeira renderização causaria erro de hidratação.
 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(hover: none), (pointer: coarse)");
    setIsTouch(query.matches);

    const onChange = (event: MediaQueryListEvent) => setIsTouch(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return isTouch;
}
