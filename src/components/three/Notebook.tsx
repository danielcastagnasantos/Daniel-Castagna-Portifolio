"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import { liveConfig } from "@/lib/sceneConfig";
import { sceneSignals } from "@/lib/sceneSignals";

/**
 * Notebook construído com geometria procedural.
 *
 * Nenhum GLTF: um modelo externo custaria centenas de KB de download e um
 * carregador assíncrono, para um objeto que são cinco caixas e um plano
 * emissivo. Procedural carrega junto com o bundle e não bloqueia nada.
 */
export function Notebook() {
  const groupRef = useRef<Group>(null);
  const screenRef = useRef<Mesh>(null);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const time = state.clock.elapsedTime;

    // Flutuação e leve balanço, com o mouse inclinando o conjunto.
    group.position.y = -0.3 + Math.sin(time * 0.6) * 0.12;
    group.rotation.x += (-0.35 + sceneSignals.pointerY * 0.12 - group.rotation.x) * 0.05;
    group.rotation.y += (0.5 + sceneSignals.pointerX * 0.25 - group.rotation.y) * 0.05;
    group.rotation.z = Math.sin(time * 0.4) * 0.02;

    const target = liveConfig.notebookOpacity;
    group.visible = target > 0.01;
    group.scale.setScalar(group.scale.x + (target - group.scale.x) * 0.06);

    const screenMaterial = screenRef.current?.material as MeshStandardMaterial | undefined;
    if (screenMaterial) {
      screenMaterial.emissiveIntensity = 1.6 + Math.sin(time * 1.4) * 0.25;
    }

    void delta;
  });

  return (
    <group ref={groupRef} position={[2.4, -0.3, 0]} scale={0}>
      {/* Base */}
      <mesh castShadow position={[0, -0.05, 0]}>
        <boxGeometry args={[2.4, 0.08, 1.6]} />
        <meshStandardMaterial color="#15151c" metalness={0.85} roughness={0.28} />
      </mesh>

      {/* Área do teclado, levemente rebaixada */}
      <mesh position={[0, -0.005, 0.12]}>
        <boxGeometry args={[2.1, 0.02, 1.15]} />
        <meshStandardMaterial color="#0a0a10" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* Trackpad */}
      <mesh position={[0, 0.008, 0.52]}>
        <boxGeometry args={[0.62, 0.01, 0.4]} />
        <meshStandardMaterial color="#1c1c26" metalness={0.7} roughness={0.35} />
      </mesh>

      {/* Tampa */}
      <group position={[0, 0, -0.8]} rotation={[-1.15, 0, 0]}>
        <mesh position={[0, 0.75, 0]}>
          <boxGeometry args={[2.4, 1.5, 0.06]} />
          <meshStandardMaterial color="#15151c" metalness={0.85} roughness={0.28} />
        </mesh>

        {/* Tela emissiva — a fonte de luz que define o objeto */}
        <mesh ref={screenRef} position={[0, 0.75, 0.035]}>
          <planeGeometry args={[2.2, 1.32]} />
          <meshStandardMaterial
            color="#1b0f3a"
            emissive="#7c3aed"
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}
