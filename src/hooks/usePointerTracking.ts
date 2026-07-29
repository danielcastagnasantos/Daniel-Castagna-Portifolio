"use client";

import { useEffect } from "react";
import { setPointer } from "@/lib/sceneSignals";

/**
 * Publica a posição normalizada do ponteiro (-1 a 1) para a cena 3D.
 *
 * Escreve direto no objeto de sinais, sem estado do React: mousemove dispara
 * dezenas de vezes por segundo e re-renderizar a árvore a cada evento
 * inviabilizaria o parallax.
 */
export function usePointerTracking(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      setPointer(0, 0);
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        -((event.clientY / window.innerHeight) * 2 - 1),
      );
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [enabled]);
}
