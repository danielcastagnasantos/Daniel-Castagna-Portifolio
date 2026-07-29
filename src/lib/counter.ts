/**
 * Interpolação de contador animado.
 *
 * O detalhe que importa: `easeOutExpo` sem tratamento do limite devolve
 * 1 - 2^-10 = 0.999023 quando t = 1. Com arredondamento para baixo, um
 * contador que deveria terminar em 12 exibe 11 para sempre — falha silenciosa
 * e visível ao usuário. Daí o retorno exato em t >= 1.
 */

export function easeOutExpo(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(2, -10 * t);
}

/**
 * Valor a exibir depois de `elapsed` ms de uma animação de `duration` ms
 * indo de 0 até `to`. Sempre inteiro.
 */
export function counterValue(elapsed: number, duration: number, to: number): number {
  if (duration <= 0) return to;
  const progress = easeOutExpo(elapsed / duration);
  return Math.round(to * progress);
}
