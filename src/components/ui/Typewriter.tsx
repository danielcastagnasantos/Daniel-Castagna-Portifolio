"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const TYPE_MS = 65;
const DELETE_MS = 32;
const HOLD_MS = 1900;

/**
 * Efeito de digitação que cicla por uma lista de palavras.
 *
 * A palavra completa fica sempre no DOM dentro de um `<span class="sr-only">`,
 * e o texto animado é `aria-hidden`. Sem isso, um leitor de tela anunciaria
 * "e", "ex", "exp"... a cada caractere — o efeito é decorativo, o conteúdo
 * precisa chegar inteiro.
 *
 * Com movimento reduzido, exibe apenas a primeira palavra, estática.
 */
export function Typewriter({ words }: { words: readonly string[] }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [wordIndex, setWordIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion || words.length === 0) return;

    const current = words[wordIndex % words.length];

    if (!deleting && text === current) {
      const hold = window.setTimeout(() => setDeleting(true), HOLD_MS);
      return () => window.clearTimeout(hold);
    }

    if (deleting && text === "") {
      setDeleting(false);
      setWordIndex((index) => (index + 1) % words.length);
      return;
    }

    const step = window.setTimeout(
      () => {
        setText((previous) =>
          deleting ? current.slice(0, previous.length - 1) : current.slice(0, previous.length + 1),
        );
      },
      deleting ? DELETE_MS : TYPE_MS,
    );

    return () => window.clearTimeout(step);
  }, [text, deleting, wordIndex, words, prefersReducedMotion]);

  const fallback = words[0] ?? "";

  if (prefersReducedMotion) {
    return <span className="text-gradient">{fallback}</span>;
  }

  return (
    <>
      <span className="sr-only">{fallback}</span>
      <span aria-hidden="true" className="text-gradient">
        {text}
        <span className="ml-0.5 inline-block w-[3px] animate-pulse bg-glow align-middle [height:0.85em]" />
      </span>
    </>
  );
}
