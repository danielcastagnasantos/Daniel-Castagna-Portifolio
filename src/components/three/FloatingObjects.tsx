"use client";

import { Float } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import { liveConfig } from "@/lib/sceneConfig";
import { sceneSignals } from "@/lib/sceneSignals";

interface FloatingItem {
  position: [number, number, number];
  scale: number;
  speed: number;
  kind: "cube" | "sphere" | "torus" | "hexagon";
}

const ITEMS: readonly FloatingItem[] = [
  { position: [-4.2, 1.6, -2], scale: 0.55, speed: 1.1, kind: "cube" },
  { position: [4.6, 2.1, -3.5], scale: 0.75, speed: 0.8, kind: "sphere" },
  { position: [-3.4, -1.9, -1.5], scale: 0.65, speed: 1.4, kind: "torus" },
  { position: [3.2, -2.4, -2.8], scale: 0.5, speed: 1.2, kind: "hexagon" },
  { position: [-5.6, 0.2, -4.2], scale: 0.9, speed: 0.6, kind: "sphere" },
  { position: [5.4, -0.8, -4.8], scale: 0.7, speed: 0.9, kind: "cube" },
  { position: [0.6, 3.1, -5], scale: 0.6, speed: 1.05, kind: "torus" },
  { position: [-1.4, -3.2, -3.2], scale: 0.45, speed: 1.3, kind: "hexagon" },
] as const;

function Geometry({ kind }: { kind: FloatingItem["kind"] }) {
  switch (kind) {
    case "cube":
      return <boxGeometry args={[1, 1, 1]} />;
    case "sphere":
      return <sphereGeometry args={[0.6, 32, 32]} />;
    case "torus":
      return <torusGeometry args={[0.5, 0.14, 16, 48]} />;
    case "hexagon":
      return <cylinderGeometry args={[0.55, 0.55, 0.22, 6]} />;
  }
}

/**
 * Cubos, esferas cromadas, anéis e hexágonos em profundidade.
 *
 * `Float` do drei cuida da flutuação individual; o grupo inteiro responde ao
 * ponteiro e à opacidade ditada pelo scroll.
 */
export function FloatingObjects() {
  const groupRef = useRef<Group>(null);
  const meshRefs = useRef<(Mesh | null)[]>([]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    group.rotation.y += delta * 0.04;
    group.position.x += (sceneSignals.pointerX * 0.4 - group.position.x) * 0.04;
    group.position.y += (sceneSignals.pointerY * 0.3 - group.position.y) * 0.04;

    const target = liveConfig.objectsOpacity;
    for (const mesh of meshRefs.current) {
      if (!mesh) continue;
      const material = mesh.material as MeshStandardMaterial;
      material.opacity += (target - material.opacity) * 0.05;
      mesh.visible = material.opacity > 0.02;
    }
  });

  return (
    <group ref={groupRef}>
      {ITEMS.map((item, index) => (
        <Float
          key={`${item.kind}-${index}`}
          speed={item.speed}
          rotationIntensity={0.6}
          floatIntensity={0.9}
        >
          <mesh
            ref={(mesh) => {
              meshRefs.current[index] = mesh;
            }}
            position={item.position}
            scale={item.scale}
          >
            <Geometry kind={item.kind} />
            <meshStandardMaterial
              color={index % 3 === 0 ? "#a855f7" : "#d4d4d8"}
              metalness={0.95}
              roughness={index % 2 === 0 ? 0.12 : 0.3}
              transparent
              opacity={0.5}
            />
          </mesh>
        </Float>
      ))}
    </group>
  );
}
