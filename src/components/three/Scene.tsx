"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense } from "react";
import { usePointerTracking } from "@/hooks/usePointerTracking";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { liveConfig, updateLiveConfig } from "@/lib/sceneConfig";
import { sceneSignals } from "@/lib/sceneSignals";
import { useSceneStore } from "@/store/scene";
import { Effects } from "./Effects";
import { FloatingObjects } from "./FloatingObjects";
import { InfiniteGrid } from "./InfiniteGrid";
import { NeuralNetwork } from "./NeuralNetwork";
import { Notebook } from "./Notebook";
import { Particles } from "./Particles";

/**
 * Único ponto que calcula o estado interpolado do frame e move a câmera.
 * Todos os objetos leem de `liveConfig`, calculado aqui uma vez por frame.
 */
function Rig() {
  const camera = useThree((state) => state.camera);

  useFrame(() => {
    updateLiveConfig(sceneSignals.scroll);

    // Amortecimento: a câmera persegue o alvo em vez de saltar até ele.
    camera.position.z += (liveConfig.cameraZ - camera.position.z) * 0.04;
    camera.position.y += (liveConfig.cameraY - camera.position.y) * 0.04;
    camera.position.x += (sceneSignals.pointerX * 0.6 - camera.position.x) * 0.03;
    camera.lookAt(0, liveConfig.cameraY * 0.4, 0);
  });

  return null;
}

/**
 * Cena 3D persistente do site inteiro.
 *
 * Montada uma única vez no layout, fixa atrás de todo o conteúdo. Um contexto
 * WebGL só — canvases por seção estourariam o limite do navegador e a memória
 * de GPU no celular.
 *
 * `aria-hidden` e `pointer-events: none`: é decoração. Leitores de tela devem
 * ignorá-la, e ela jamais pode interceptar um clique destinado ao conteúdo.
 */
export function Scene() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const setReady = useSceneStore((state) => state.setReady);
  const ready = useSceneStore((state) => state.ready);

  usePointerTracking(!prefersReducedMotion);

  return (
    // A cena revela a si mesma quando o renderer existe, em vez de o site
    // esperar por ela. Transição em CSS, não em JS: se o WebGL nunca subir, o
    // que fica é um fundo preto limpo, e não uma página bloqueada.
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 transition-opacity duration-1000 ease-out ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    >
      <Canvas
        // Teto de 1.75 no device pixel ratio: acima disso o custo de
        // preenchimento do bloom cresce sem ganho visual perceptível.
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 6], fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
        // Com movimento reduzido a cena renderiza um frame e congela.
        frameloop={prefersReducedMotion ? "demand" : "always"}
        onCreated={() => setReady(true)}
      >
        <Suspense fallback={null}>
          <Rig />

          <ambientLight intensity={0.35} />
          <pointLight position={[6, 4, 6]} intensity={45} color="#a855f7" distance={30} />
          <pointLight position={[-6, -3, 4]} intensity={30} color="#7c3aed" distance={28} />
          <spotLight
            position={[0, 8, 4]}
            angle={0.6}
            penumbra={1}
            intensity={40}
            color="#c084fc"
            distance={30}
          />

          <Particles />
          <Notebook />
          <FloatingObjects />
          <NeuralNetwork />
          <InfiniteGrid />

          <Effects />
        </Suspense>
      </Canvas>
    </div>
  );
}
