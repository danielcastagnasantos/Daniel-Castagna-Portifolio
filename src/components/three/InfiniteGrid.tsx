"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, type LineBasicMaterial, type LineSegments } from "three";
import { liveConfig } from "@/lib/sceneConfig";

const HALF_LINES = 24;
const SPACING = 1.2;
const EXTENT = HALF_LINES * SPACING;

/**
 * Grid em perspectiva com sensação de infinito.
 *
 * A ilusão vem de deslocar o grid continuamente em Z e reiniciar a cada célula
 * (`% SPACING`): o olho vê avanço perpétuo, mas a geometria é fixa e pequena.
 * Um grid realmente infinito exigiria shader dedicado sem ganho visual aqui.
 */
export function InfiniteGrid() {
  const gridRef = useRef<LineSegments>(null);
  const materialRef = useRef<LineBasicMaterial>(null);

  const vertices = useMemo(() => {
    const points: number[] = [];

    for (let index = -HALF_LINES; index <= HALF_LINES; index += 1) {
      const offset = index * SPACING;
      // Linhas paralelas a Z
      points.push(offset, 0, -EXTENT, offset, 0, EXTENT);
      // Linhas paralelas a X
      points.push(-EXTENT, 0, offset, EXTENT, 0, offset);
    }

    return new Float32Array(points);
  }, []);

  useFrame((_, delta) => {
    const grid = gridRef.current;
    const material = materialRef.current;
    if (!grid || !material) return;

    grid.position.z = (grid.position.z + delta * 1.6) % SPACING;

    const target = liveConfig.gridOpacity;
    material.opacity += (target * 0.42 - material.opacity) * 0.05;
    grid.visible = material.opacity > 0.01;
  });

  return (
    <lineSegments ref={gridRef} position={[0, -3.2, 0]} rotation={[0, 0, 0]} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[vertices, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        ref={materialRef}
        color="#7c3aed"
        transparent
        opacity={0}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </lineSegments>
  );
}
