"use client";

import { useEffect, useRef } from "react";
import { useIsTouch } from "@/hooks/useIsTouch";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * Cursor customizado com dois anéis: o ponto segue o mouse na hora, o halo
 * segue com atraso, criando a sensação de peso.
 *
 * A posição é escrita direto no style do elemento dentro de um rAF, nunca em
 * estado do React — cursor via setState engasga visivelmente.
 *
 * Não renderiza em toque (não há cursor) nem com movimento reduzido (o halo
 * defasado é justamente o tipo de movimento que a preferência pede para
 * desligar). O cursor nativo permanece intacto nesses casos.
 */
export function Cursor() {
  const isTouch = useIsTouch();
  const prefersReducedMotion = usePrefersReducedMotion();
  const dotRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);

  const enabled = !isTouch && !prefersReducedMotion;

  useEffect(() => {
    if (!enabled) return;

    const dot = dotRef.current;
    const halo = haloRef.current;
    if (!dot || !halo) return;

    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;
    let haloX = pointerX;
    let haloY = pointerY;
    let visible = false;

    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;

      if (!visible) {
        visible = true;
        dot.style.opacity = "1";
        halo.style.opacity = "1";
      }

      const interactive = (event.target as HTMLElement | null)?.closest(
        'a, button, [role="button"], input, textarea, select, summary',
      );
      halo.dataset.hover = interactive ? "true" : "false";
    };

    const onLeave = () => {
      visible = false;
      dot.style.opacity = "0";
      halo.style.opacity = "0";
    };

    let frame = requestAnimationFrame(function tick() {
      haloX += (pointerX - haloX) * 0.15;
      haloY += (pointerY - haloY) * 0.15;

      dot.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0) translate(-50%, -50%)`;
      halo.style.transform = `translate3d(${haloX}px, ${haloY}px, 0) translate(-50%, -50%)`;

      frame = requestAnimationFrame(tick);
    });

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100] hidden lg:block">
      <div
        ref={haloRef}
        data-hover="false"
        className="absolute left-0 top-0 h-9 w-9 rounded-full border border-glow/70 opacity-0 transition-[width,height,background-color,opacity] duration-300 data-[hover=true]:h-14 data-[hover=true]:w-14 data-[hover=true]:bg-primary/15"
      />
      <div
        ref={dotRef}
        className="absolute left-0 top-0 h-1.5 w-1.5 rounded-full bg-glow opacity-0 transition-opacity duration-300"
      />
    </div>
  );
}
