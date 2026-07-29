/**
 * Mapeia o progresso de scroll (0 a 1) para o estado da cena 3D.
 *
 * Função pura e sem dependência do three.js — é o único ponto onde a
 * coreografia da cena está descrita, e o único que dá para testar sem GPU.
 * Se a cena travar no estado errado, o defeito está aqui.
 */

export interface SceneConfig {
  cameraZ: number;
  cameraY: number;
  /** Multiplicador da opacidade do campo de partículas, 0 a 1. */
  particleOpacity: number;
  bloomIntensity: number;
  notebookOpacity: number;
  neuralOpacity: number;
  gridOpacity: number;
  objectsOpacity: number;
}

interface Keyframe extends SceneConfig {
  /** Progresso de scroll em que este estado vale integralmente. */
  at: number;
}

/**
 * Bandas de progresso alinhadas à ordem das seções:
 * hero · about+stats · tech · services+projects · differentials+process · contact
 */
const KEYFRAMES: readonly Keyframe[] = [
  {
    at: 0,
    cameraZ: 6,
    cameraY: 0,
    particleOpacity: 1,
    bloomIntensity: 1.1,
    notebookOpacity: 1,
    neuralOpacity: 0,
    gridOpacity: 0,
    objectsOpacity: 0.55,
  },
  {
    at: 0.2,
    cameraZ: 8.5,
    cameraY: 0.4,
    particleOpacity: 0.55,
    bloomIntensity: 0.85,
    notebookOpacity: 0,
    neuralOpacity: 0,
    gridOpacity: 0,
    objectsOpacity: 1,
  },
  {
    at: 0.38,
    cameraZ: 7,
    cameraY: 0,
    particleOpacity: 0.35,
    bloomIntensity: 1.25,
    notebookOpacity: 0,
    neuralOpacity: 1,
    gridOpacity: 0,
    objectsOpacity: 0.3,
  },
  {
    at: 0.62,
    cameraZ: 10,
    cameraY: -0.3,
    particleOpacity: 0.3,
    bloomIntensity: 0.7,
    notebookOpacity: 0,
    neuralOpacity: 0.15,
    gridOpacity: 0,
    objectsOpacity: 0.5,
  },
  {
    at: 0.82,
    cameraZ: 7.5,
    cameraY: 1.2,
    particleOpacity: 0.25,
    bloomIntensity: 0.9,
    notebookOpacity: 0,
    neuralOpacity: 0,
    gridOpacity: 1,
    objectsOpacity: 0.25,
  },
  {
    at: 1,
    cameraZ: 5.5,
    cameraY: 0,
    particleOpacity: 1,
    bloomIntensity: 1.6,
    notebookOpacity: 0,
    neuralOpacity: 0,
    gridOpacity: 0.25,
    objectsOpacity: 0.4,
  },
] as const;

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function blend(from: Keyframe, to: Keyframe, t: number): SceneConfig {
  return {
    cameraZ: lerp(from.cameraZ, to.cameraZ, t),
    cameraY: lerp(from.cameraY, to.cameraY, t),
    particleOpacity: lerp(from.particleOpacity, to.particleOpacity, t),
    bloomIntensity: lerp(from.bloomIntensity, to.bloomIntensity, t),
    notebookOpacity: lerp(from.notebookOpacity, to.notebookOpacity, t),
    neuralOpacity: lerp(from.neuralOpacity, to.neuralOpacity, t),
    gridOpacity: lerp(from.gridOpacity, to.gridOpacity, t),
    objectsOpacity: lerp(from.objectsOpacity, to.objectsOpacity, t),
  };
}

function stripKeyframe(keyframe: Keyframe): SceneConfig {
  const { at: _at, ...config } = keyframe;
  void _at;
  return config;
}

/**
 * Interpola linearmente entre os keyframes vizinhos.
 * Progresso fora de [0, 1] é fixado nos extremos — nunca extrapola, porque
 * extrapolar geraria opacidade negativa e câmera atrás do horizonte.
 */
export function configForProgress(progress: number): SceneConfig {
  if (!Number.isFinite(progress) || progress <= KEYFRAMES[0].at) {
    return stripKeyframe(KEYFRAMES[0]);
  }

  const last = KEYFRAMES[KEYFRAMES.length - 1];
  if (progress >= last.at) return stripKeyframe(last);

  for (let index = 0; index < KEYFRAMES.length - 1; index += 1) {
    const from = KEYFRAMES[index];
    const to = KEYFRAMES[index + 1];

    if (progress >= from.at && progress <= to.at) {
      const span = to.at - from.at;
      return blend(from, to, span === 0 ? 0 : (progress - from.at) / span);
    }
  }

  return stripKeyframe(last);
}

/**
 * Estado interpolado do frame atual.
 *
 * Objeto mutável: o Rig calcula uma vez por frame e todos os objetos da cena
 * leem daqui. Recalcular em cada componente desperdiçaria o mesmo trabalho
 * seis vezes por frame.
 */
export const liveConfig: SceneConfig = stripKeyframe(KEYFRAMES[0]);

export function updateLiveConfig(progress: number): void {
  Object.assign(liveConfig, configForProgress(progress));
}
