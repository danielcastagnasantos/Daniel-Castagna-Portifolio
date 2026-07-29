/**
 * Gerador pseudoaleatório determinístico (mulberry32).
 *
 * Substitui `Math.random()` na geração de geometria por dois motivos:
 *
 * 1. `Math.random()` é impuro, e chamá-lo dentro de `useMemo` viola as regras
 *    do React Compiler — se o memo for reavaliado, a cena inteira se
 *    reorganiza na frente do usuário.
 * 2. Uma semente fixa torna a cena reproduzível: o layout de partículas e da
 *    rede neural é o mesmo em toda visita e em toda máquina, o que transforma
 *    "a rede ficou feia neste ângulo" num defeito investigável em vez de um
 *    acaso irrepetível.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
