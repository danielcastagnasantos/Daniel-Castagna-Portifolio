"use client";

import { useEffect, useRef, useState } from "react";
import { counterValue } from "@/lib/counter";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface CounterProps {
  to: number;
  suffix?: string;
  durationMs?: number;
}

/**
 * Contador que anima de 0 até `to` quando entra na viewport.
 *
 * Com movimento reduzido, exibe o valor final imediatamente — o número é a
 * informação, a contagem é enfeite.
 */
export function Counter({ to, suffix = "", durationMs = 1600 }: CounterProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  const elementRef = useRef<HTMLSpanElement>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion) {
      setValue(to);
      return;
    }

    const element = elementRef.current;
    if (!element) return;

    let frame = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || hasRun.current) return;
        hasRun.current = true;

        const start = performance.now();
        const tick = (now: number) => {
          const elapsed = now - start;
          setValue(counterValue(elapsed, durationMs, to));
          if (elapsed < durationMs) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, durationMs, prefersReducedMotion]);

  return (
    <span ref={elementRef} className="font-mono tabular-nums">
      {value}
      {suffix}
    </span>
  );
}
