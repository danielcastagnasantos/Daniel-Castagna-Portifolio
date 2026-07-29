"use client";

import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { BloomEffect } from "postprocessing";
import { liveConfig } from "@/lib/sceneConfig";

/**
 * Bloom seletivo — o que transforma materiais emissivos em luz volumétrica e
 * neon. É o efeito mais caro da cena e o responsável pelo visual pedido.
 *
 * `mipmapBlur` faz o desfoque em cadeia de mipmaps em vez de múltiplos passes
 * em resolução cheia: mesmo resultado, fração do custo de preenchimento.
 */
export function Effects() {
  const bloomRef = useRef<BloomEffect>(null);

  useFrame(() => {
    const bloom = bloomRef.current;
    if (!bloom) return;

    bloom.intensity += (liveConfig.bloomIntensity - bloom.intensity) * 0.05;
  });

  return (
    <EffectComposer enableNormalPass={false}>
      <Bloom
        ref={bloomRef}
        intensity={1.1}
        luminanceThreshold={0.25}
        luminanceSmoothing={0.85}
        mipmapBlur
      />
    </EffectComposer>
  );
}
