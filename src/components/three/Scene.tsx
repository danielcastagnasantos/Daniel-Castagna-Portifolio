"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
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

/** Alvo de 30 quadros por segundo. */
const FRAME_INTERVAL_MS = 1000 / 30;

/**
 * Controla quando a cena desenha.
 *
 * O canvas roda em `frameloop="demand"`, então só renderiza quando pedimos.
 * Duas razões, ambas medidas com Lighthouse:
 *
 * 1. **30fps em vez de 60.** A cena é ambiente e lenta — deriva de partículas,
 *    flutuação, interpolação de câmera. A 30 quadros isso é indistinguível a
 *    olho nu, e corta pela metade o trabalho na thread principal, que era o
 *    que derrubava a nota de performance (18,5s de bloqueio).
 *
 * 2. **Pausa em aba oculta.** Sem isso a cena continuava desenhando para
 *    ninguém, queimando CPU e bateria enquanto o visitante estava em outra
 *    aba.
 */
function FrameDriver() {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    let frame = 0;
    let previous = 0;

    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (time - previous < FRAME_INTERVAL_MS) return;
      previous = time;
      invalidate();
    };

    const start = () => {
      if (frame === 0) frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const onVisibilityChange = () => (document.hidden ? stop() : start());

    document.addEventListener("visibilitychange", onVisibilityChange);
    start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [invalidate]);

  return null;
}

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
        // Teto de 1.5 no device pixel ratio. O custo de preenchimento do
        // bloom cresce com o quadrado dessa escala, e acima disso o ganho
        // visual não se percebe.
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6], fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
        // Sempre sob demanda: quem decide quando desenhar é o FrameDriver.
        // Com movimento reduzido ele nem monta, e a cena fica num frame só.
        frameloop="demand"
        onCreated={() => setReady(true)}
      >
        <Suspense fallback={null}>
          {!prefersReducedMotion && <FrameDriver />}
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
