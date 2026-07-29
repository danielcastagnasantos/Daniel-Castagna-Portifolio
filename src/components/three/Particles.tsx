"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, type Points, type PointsMaterial } from "three";
import { createRandom } from "@/lib/prng";
import { liveConfig } from "@/lib/sceneConfig";
import { sceneSignals } from "@/lib/sceneSignals";

const COUNT = 1400;
const RADIUS = 14;

/**
 * Campo de partículas que envolve a cena inteira.
 *
 * As posições são geradas uma única vez e nunca recriadas — realocar um
 * Float32Array de 4200 posições a cada render entupiria o coletor de lixo e
 * causaria engasgo periódico no scroll.
 */
export function Particles() {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<PointsMaterial>(null);

  const positions = useMemo(() => {
    const random = createRandom(0x5eed1);
    const array = new Float32Array(COUNT * 3);

    for (let index = 0; index < COUNT; index += 1) {
      // Distribuição em casca esférica com raiz cúbica, para densidade uniforme
      // no volume em vez de acúmulo no centro.
      const radius = RADIUS * Math.cbrt(random());
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);

      array[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      array[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      array[index * 3 + 2] = radius * Math.cos(phi);
    }

    return array;
  }, []);

  useFrame((_, delta) => {
    const points = pointsRef.current;
    const material = materialRef.current;
    if (!points || !material) return;

    points.rotation.y += delta * 0.02;
    points.rotation.x = sceneSignals.pointerY * 0.05;
    points.rotation.z = sceneSignals.pointerX * 0.05;

    material.opacity += (liveConfig.particleOpacity * 0.9 - material.opacity) * 0.05;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={0.028}
        color="#c084fc"
        transparent
        opacity={0.9}
        depthWrite={false}
        sizeAttenuation
        blending={AdditiveBlending}
      />
    </points>
  );
}
