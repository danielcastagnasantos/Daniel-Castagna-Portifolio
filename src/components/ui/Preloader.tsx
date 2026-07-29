"use client";

import { useEffect, useState } from "react";

/** Batida mínima para a transição não piscar em conexões rápidas. */
const MINIMUM_MS = 550;
/** Teto absoluto: nada segura a página além disto. */
const MAXIMUM_MS = 2500;

/**
 * Tela de carregamento.
 *
 * Duas decisões vindas de falhas observadas em teste, não de hipótese:
 *
 * 1. Depende apenas das fontes e de uma batida mínima — deliberadamente NÃO da
 *    cena 3D. Decoração não pode bloquear conteúdo: com WebGL desabilitado,
 *    bloqueado por política ou lento, o visitante ficava preso numa tela preta.
 *
 * 2. A saída é transição CSS, não animação em JS. `AnimatePresence` só desmonta
 *    o elemento quando a animação de saída termina, e ela depende de
 *    requestAnimationFrame — que não roda em aba sem composição. O overlay
 *    ficava visível e cobrindo o site para sempre. Com CSS, mesmo que a
 *    transição não anime, `visibility` e `pointer-events` mudam de imediato e
 *    a página fica utilizável.
 */
export function Preloader({ brand }: { brand: string }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const start = performance.now();

    const finish = () => {
      const remaining = Math.max(0, MINIMUM_MS - (performance.now() - start));
      window.setTimeout(() => setDone(true), remaining);
    };

    document.fonts.ready.then(finish).catch(finish);

    const hardStop = window.setTimeout(() => setDone(true), MAXIMUM_MS);
    return () => window.clearTimeout(hardStop);
  }, []);

  useEffect(() => {
    document.body.style.overflow = done ? "" : "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [done]);

  return (
    <div
      {...(done ? { "aria-hidden": true as const } : { role: "status", "aria-live": "polite" as const })}
      className={[
        "fixed inset-0 z-[200] flex items-center justify-center bg-bg",
        "transition-[opacity,visibility] duration-700 ease-[var(--ease-out-expo)]",
        done ? "pointer-events-none invisible opacity-0" : "visible opacity-100",
      ].join(" ")}
    >
      <div className="flex flex-col items-center gap-6">
        <span className="animate-pulse font-display text-2xl font-bold tracking-tight">
          {brand}
        </span>

        <span className="h-px w-40 overflow-hidden bg-[var(--line)]">
          <span className="block h-full w-1/3 bg-glow [animation:loader-sweep_1.2s_ease-in-out_infinite]" />
        </span>
      </div>
    </div>
  );
}
