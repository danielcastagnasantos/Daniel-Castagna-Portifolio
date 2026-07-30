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
      // A troca acontece dentro de um timeout, e não no corpo do efeito: além
      // de evitar renderização em cascata, a pausa curta dá respiro entre uma
      // palavra e a próxima.
      const advance = window.setTimeout(() => {
        setDeleting(false);
        setWordIndex((index) => (index + 1) % words.length);
      }, 180);
      return () => window.clearTimeout(advance);
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

  // A palavra mais longa reserva o espaço. Sem isso, cada troca de palavra
  // requebra as linhas do h1 e empurra a página inteira: o Lighthouse mediu
  // 15 deslocamentos numa única carga, levando o CLS a 0,231 — mais do que o
  // dobro do limite aceitável. Além da nota, é desconfortável de ler.
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), fallback);

  if (prefersReducedMotion) {
    return <span className="text-gradient">{fallback}</span>;
  }

  return (
    <>
      <span className="sr-only">{fallback}</span>
      <span aria-hidden="true" className="inline-grid align-bottom">
        <span className="invisible col-start-1 row-start-1" aria-hidden="true">
          {longest}
        </span>
        <span className="col-start-1 row-start-1 justify-self-start text-gradient">
          {text}
          <span className="ml-0.5 inline-block w-[3px] animate-pulse bg-glow align-middle [height:0.85em]" />
        </span>
      </span>
    </>
  );
}
