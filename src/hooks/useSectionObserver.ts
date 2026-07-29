"use client";

import { useEffect } from "react";
import { SECTION_IDS, useSceneStore, type SectionId } from "@/store/scene";

/**
 * Observa as seções e publica a que domina a viewport no store.
 *
 * A margem inferior de -45% faz a troca acontecer quando a seção cruza o meio
 * da tela, e não ao encostar na borda — sem isso a cena 3D trocaria de estado
 * enquanto a seção anterior ainda ocupa quase toda a tela.
 */
export function useSectionObserver(): void {
  const setActiveSection = useSceneStore((state) => state.setActiveSection);

  useEffect(() => {
    const elements = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (element): element is HTMLElement => element !== null,
    );

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible) {
          setActiveSection(visible.target.id as SectionId);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [setActiveSection]);
}
