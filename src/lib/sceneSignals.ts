/**
 * Sinais de alta frequência lidos exclusivamente dentro de `useFrame`.
 *
 * Deliberadamente FORA do React. Scroll e posição do ponteiro mudam a cada
 * frame; mantê-los em estado do React dispararia re-render de toda a árvore
 * 60 vezes por segundo. Um objeto mutável é lido pelo loop de renderização do
 * three.js sem custo nenhum de reconciliação.
 *
 * Estado discreto que a UI precisa observar (seção ativa, pronto) vive no
 * store Zustand em `@/store/scene`.
 */
export const sceneSignals = {
  /** Progresso de scroll do documento, 0 no topo e 1 no fim. */
  scroll: 0,
  /** Ponteiro normalizado, -1 a 1 em ambos os eixos, origem no centro. */
  pointerX: 0,
  pointerY: 0,
};

export function setScroll(progress: number): void {
  sceneSignals.scroll = progress;
}

export function setPointer(x: number, y: number): void {
  sceneSignals.pointerX = x;
  sceneSignals.pointerY = y;
}
