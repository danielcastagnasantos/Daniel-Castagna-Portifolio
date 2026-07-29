"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  type Group,
  type LineBasicMaterial,
  type PointsMaterial,
} from "three";
import { createRandom } from "@/lib/prng";
import { liveConfig } from "@/lib/sceneConfig";
import { sceneSignals } from "@/lib/sceneSignals";

const NODE_COUNT = 46;
const SPREAD = 7;
const CONNECT_DISTANCE = 2.6;

/**
 * Rede neural: nós conectados por arestas entre vizinhos próximos.
 *
 * As arestas são calculadas uma vez na montagem, comparando cada par de nós.
 * São 46 nós, ou seja 1035 comparações — irrelevante uma vez, proibitivo por
 * frame. Por isso a topologia é fixa e só a animação varia.
 */
export function NeuralNetwork() {
  const groupRef = useRef<Group>(null);
  const nodeMaterialRef = useRef<PointsMaterial>(null);
  const lineMaterialRef = useRef<LineBasicMaterial>(null);

  const { nodes, edges } = useMemo(() => {
    const random = createRandom(0xbeef7);
    const nodeArray = new Float32Array(NODE_COUNT * 3);
    const points: Array<[number, number, number]> = [];

    for (let index = 0; index < NODE_COUNT; index += 1) {
      const point: [number, number, number] = [
        (random() - 0.5) * SPREAD * 1.6,
        (random() - 0.5) * SPREAD,
        (random() - 0.5) * SPREAD * 0.6,
      ];
      points.push(point);
      nodeArray.set(point, index * 3);
    }

    const edgeList: number[] = [];
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        const dx = points[a][0] - points[b][0];
        const dy = points[a][1] - points[b][1];
        const dz = points[a][2] - points[b][2];

        if (Math.hypot(dx, dy, dz) < CONNECT_DISTANCE) {
          edgeList.push(...points[a], ...points[b]);
        }
      }
    }

    return { nodes: nodeArray, edges: new Float32Array(edgeList) };
  }, []);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    group.rotation.y += delta * 0.06;
    group.rotation.x += (sceneSignals.pointerY * 0.15 - group.rotation.x) * 0.04;

    const target = liveConfig.neuralOpacity;
    group.visible = target > 0.01;

    // Pulso nas arestas, para a rede parecer transmitir sinal.
    const pulse = 0.55 + Math.sin(state.clock.elapsedTime * 1.6) * 0.25;

    if (nodeMaterialRef.current) {
      nodeMaterialRef.current.opacity += (target - nodeMaterialRef.current.opacity) * 0.06;
    }
    if (lineMaterialRef.current) {
      lineMaterialRef.current.opacity +=
        (target * pulse * 0.5 - lineMaterialRef.current.opacity) * 0.06;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[nodes, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={nodeMaterialRef}
          size={0.13}
          color="#c084fc"
          transparent
          opacity={0}
          depthWrite={false}
          sizeAttenuation
          blending={AdditiveBlending}
        />
      </points>

      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[edges, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          ref={lineMaterialRef}
          color="#7c3aed"
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}
