"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Assina uma media query.
 *
 * `useSyncExternalStore` é a API correta para ler de uma fonte externa: ela
 * elimina o `setState` dentro de effect (que provoca renderização em cascata)
 * e fornece um snapshot de servidor explícito, sem divergência de hidratação.
 *
 * O snapshot do servidor é sempre `false` — o servidor não conhece o
 * dispositivo. Por isso todo consumidor deve tratar `false` como o padrão
 * seguro: cursor customizado desligado, movimento permitido.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
