"use client";

import dynamic from "next/dynamic";

/**
 * Ponto de montagem da cena 3D, carregado somente no cliente.
 *
 * Um canvas WebGL não tem o que renderizar no servidor: não existe GPU, nem
 * contexto gráfico, nem DOM. Renderizá-lo no servidor produz markup vazio e,
 * pior, coloca objetos three.js — que têm referência circular entre `parent` e
 * `children` — no caminho de serialização do React Server Components e do
 * overlay de erro do Next, que tentam convertê-los para JSON e estouram com
 * "Converting circular structure to JSON".
 *
 * `ssr: false` exige um componente cliente no App Router; daí este invólucro
 * existir separado de Scene.
 */
const Scene = dynamic(() => import("./Scene").then((module) => module.Scene), {
  ssr: false,
});

export function SceneMount() {
  return <Scene />;
}
