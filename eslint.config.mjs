import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // O three.js é uma biblioteca fundamentalmente mutável: animar significa
    // escrever em `mesh.position`, `material.opacity` e `camera.rotation`
    // dentro do loop de renderização, sessenta vezes por segundo. Criar
    // objetos novos a cada frame para satisfazer a regra geraria lixo
    // constante e engasgo visível.
    //
    // A regra permanece ativa em todo o resto do projeto; a exceção é
    // limitada aos componentes que falam diretamente com o renderer.
    files: ["src/components/three/**/*.tsx"],
    rules: {
      "react-hooks/immutability": "off",
    },
  },
]);

export default eslintConfig;
