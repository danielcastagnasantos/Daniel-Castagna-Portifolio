"use client";

import { useSectionObserver } from "@/hooks/useSectionObserver";

/**
 * Liga o observador de seções sem introduzir marcação.
 *
 * O hook precisa de um componente cliente montado; separá-lo evita transformar
 * Header ou Footer em donos de uma responsabilidade que não é deles.
 */
export function SectionTracker() {
  useSectionObserver();
  return null;
}
