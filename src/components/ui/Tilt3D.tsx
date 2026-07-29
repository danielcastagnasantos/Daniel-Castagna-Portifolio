"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { useIsTouch } from "@/hooks/useIsTouch";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface Tilt3DProps {
  children: ReactNode;
  className?: string;
  /** Inclinação máxima em graus, em cada eixo. */
  maxTilt?: number;
  /** Distância do observador. Menor = perspectiva mais dramática. */
  perspective?: number;
}

/**
 * Card com inclinação 3D real seguindo o ponteiro.
 *
 * Deliberadamente CSS, não WebGL. Doze cards com canvas próprio seriam doze
 * contextos WebGL — navegadores limitam a algo entre 8 e 16, e a memória de
 * GPU no celular não aguentaria. Transformação 3D em CSS é composta pela GPU,
 * dá perspectiva verdadeira e custa perto de nada.
 *
 * O loop de animação só roda enquanto o ponteiro está sobre o card. Doze
 * `requestAnimationFrame` permanentes desperdiçariam bateria para animar
 * elementos que ninguém está olhando.
 *
 * Os filhos podem se posicionar em profundidade com `translateZ`, e é isso que
 * cria o efeito: o ícone paira acima da superfície do card e ganha parallax
 * próprio ao inclinar.
 */
export function Tilt3D({
  children,
  className = "",
  maxTilt = 14,
  perspective = 700,
}: Tilt3DProps) {
  const isTouch = useIsTouch();
  const prefersReducedMotion = usePrefersReducedMotion();
  const enabled = !isTouch && !prefersReducedMotion;

  const innerRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef(0);
  const target = useRef({ x: 0, y: 0, glareX: 50, glareY: 50, lift: 0 });
  const current = useRef({ x: 0, y: 0, glareX: 50, glareY: 50, lift: 0 });

  const stopLoop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }, []);

  const runLoop = useCallback(() => {
    if (frameRef.current !== 0) return;

    const tick = () => {
      const inner = innerRef.current;
      const glare = glareRef.current;
      if (!inner) return;

      const c = current.current;
      const t = target.current;

      c.x += (t.x - c.x) * 0.12;
      c.y += (t.y - c.y) * 0.12;
      c.lift += (t.lift - c.lift) * 0.12;
      c.glareX += (t.glareX - c.glareX) * 0.12;
      c.glareY += (t.glareY - c.glareY) * 0.12;

      inner.style.transform = `rotateX(${c.y.toFixed(2)}deg) rotateY(${c.x.toFixed(2)}deg) translateZ(${c.lift.toFixed(2)}px)`;

      if (glare) {
        glare.style.background = `radial-gradient(circle at ${c.glareX.toFixed(1)}% ${c.glareY.toFixed(1)}%, rgba(192,132,252,.28) 0%, transparent 55%)`;
      }

      const settled =
        Math.abs(t.x - c.x) < 0.01 &&
        Math.abs(t.y - c.y) < 0.01 &&
        Math.abs(t.lift - c.lift) < 0.01;

      // Ao voltar ao repouso, encerra o loop em vez de girar para sempre.
      if (settled && t.x === 0 && t.y === 0 && t.lift === 0) {
        inner.style.transform = "";
        if (glare) glare.style.background = "";
        stopLoop();
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [stopLoop]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;

      target.current.x = (px - 0.5) * 2 * maxTilt;
      target.current.y = -(py - 0.5) * 2 * maxTilt;
      target.current.glareX = px * 100;
      target.current.glareY = py * 100;
      target.current.lift = 14;

      runLoop();
    },
    [enabled, maxTilt, runLoop],
  );

  const onPointerLeave = useCallback(() => {
    if (!enabled) return;
    target.current = { x: 0, y: 0, glareX: 50, glareY: 50, lift: 0 };
    runLoop();
  }, [enabled, runLoop]);

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={className}
      style={{ perspective: `${perspective}px` }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div
        ref={innerRef}
        className="relative h-full will-change-transform"
        style={{ transformStyle: "preserve-3d" }}
      >
        {children}
        <span
          ref={glareRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl"
        />
      </div>
    </div>
  );
}
