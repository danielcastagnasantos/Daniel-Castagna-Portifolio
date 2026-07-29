"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Atraso em segundos, para escalonar itens de uma grade. */
  delay?: number;
  className?: string;
  as?: "div" | "li" | "article" | "section";
}

/**
 * Revela o conteúdo ao entrar na viewport. Dispara uma vez só.
 *
 * Não precisa checar `prefers-reduced-motion` em JS: o motion respeita a
 * preferência do sistema automaticamente, e globals.css já zera durações.
 */
export function Reveal({ children, delay = 0, className, as = "div" }: RevealProps) {
  const Component = motion[as];

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Component>
  );
}
