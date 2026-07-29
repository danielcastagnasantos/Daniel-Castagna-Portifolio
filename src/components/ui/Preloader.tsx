"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useSceneStore } from "@/store/scene";

/** Tempo máximo de espera antes de liberar a página de qualquer forma. */
const SAFETY_TIMEOUT_MS = 4000;

/**
 * Tela de carregamento.
 *
 * O sinal de pronto é a combinação de fontes carregadas e primeiro frame da
 * cena 3D renderizado — não um temporizador fingido. O timeout de segurança
 * existe porque a cena pode nunca renderizar: WebGL indisponível, contexto
 * perdido ou GPU bloqueada. Sem ele, essa falha prenderia o visitante numa
 * tela preta permanente.
 */
export function Preloader({ brand }: { brand: string }) {
  const ready = useSceneStore((state) => state.ready);
  const setReady = useSceneStore((state) => state.setReady);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });

    const safety = window.setTimeout(() => {
      if (!cancelled) {
        setFontsReady(true);
        setReady(true);
      }
    }, SAFETY_TIMEOUT_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(safety);
    };
  }, [setReady]);

  const done = ready && fontsReady;

  useEffect(() => {
    document.body.style.overflow = done ? "" : "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [done]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-bg"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-6">
            <motion.span
              className="font-display text-2xl font-bold tracking-tight"
              initial={{ opacity: 0.4 }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              {brand}
            </motion.span>

            <span className="h-px w-40 overflow-hidden bg-[var(--line)]">
              <motion.span
                className="block h-full w-1/3 bg-glow"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
