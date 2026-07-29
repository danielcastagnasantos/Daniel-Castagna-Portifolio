"use client";

import { EffectComposer } from "@react-three/postprocessing";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BloomEffect } from "postprocessing";
import { liveConfig } from "@/lib/sceneConfig";

/**
 * Bloom seletivo — o que transforma materiais emissivos em luz volumétrica e
 * neon. É o efeito mais caro da cena e o responsável pelo visual pedido.
 *
 * O efeito é instanciado à mão e entregue por `<primitive>`, em vez de usar o
 * componente `<Bloom>` de @react-three/postprocessing. Motivo concreto, não
 * preferência de estilo: aquele componente memoiza seus argumentos com
 * `useMemo(..., [JSON.stringify(props)])`, e no React 19 `ref` deixou de ser
 * uma prop especial e passou a chegar junto das demais. Assim que o ref era
 * preenchido com o objeto do three.js, o `JSON.stringify` encontrava a
 * referência circular entre `parent` e `children` e derrubava a página com
 * "Converting circular structure to JSON". A versão 3.0.4 é a mais recente
 * publicada, então não há atualização que resolva.
 *
 * O `EffectComposer` monta seus passes varrendo os filhos em busca de
 * instâncias de `Effect` — que é exatamente o que um `<primitive>` entrega.
 * Como resultado, ainda dá para animar a intensidade por frame, agora
 * mutando o objeto diretamente.
 *
 * `mipmapBlur` faz o desfoque em cadeia de mipmaps em vez de múltiplos passes
 * em resolução cheia: mesmo resultado, fração do custo de preenchimento.
 */
export function Effects() {
  const bloom = useMemo(
    () =>
      new BloomEffect({
        intensity: 1.1,
        luminanceThreshold: 0.25,
        luminanceSmoothing: 0.85,
        mipmapBlur: true,
      }),
    [],
  );

  useEffect(() => () => bloom.dispose(), [bloom]);

  useFrame(() => {
    bloom.intensity += (liveConfig.bloomIntensity - bloom.intensity) * 0.05;
  });

  return (
    <EffectComposer enableNormalPass={false}>
      <primitive object={bloom} />
    </EffectComposer>
  );
}
