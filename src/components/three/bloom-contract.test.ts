import { describe, expect, it } from "vitest";
import { BloomEffect, Effect } from "postprocessing";

/**
 * Effects.tsx instancia o BloomEffect à mão e o entrega via `<primitive>`,
 * contornando o componente `<Bloom>` da lib, que quebra no React 19 ao
 * serializar props contendo ref (referência circular parent/children).
 *
 * Esse contorno depende de duas garantias da biblioteca `postprocessing`.
 * Estes testes as travam: se uma atualização quebrar qualquer uma, o bloom
 * some da cena silenciosamente, sem erro no console e sem falha de build.
 */
describe("contrato do BloomEffect usado por Effects.tsx", () => {
  it("aceita as opções exatas passadas em Effects.tsx", () => {
    // Quebra que este teste pega: renomear ou remover uma opção faz o efeito
    // ser criado com o padrão errado, e o visual muda sem aviso.
    const bloom = new BloomEffect({
      intensity: 1.1,
      luminanceThreshold: 0.25,
      luminanceSmoothing: 0.85,
      mipmapBlur: true,
    });

    expect(bloom.intensity).toBeCloseTo(1.1);
  });

  it("é uma instância de Effect, que é como o EffectComposer o coleta", () => {
    // Quebra que este teste pega: o EffectComposer monta seus passes varrendo
    // os filhos e testando `instanceof Effect`. Se essa herança mudar, o
    // <primitive> deixa de ser coletado e a cena perde o bloom por completo,
    // sem nenhum erro visível.
    const bloom = new BloomEffect({ intensity: 1.1 });

    expect(bloom).toBeInstanceOf(Effect);
  });

  it("expõe intensity como propriedade mutável", () => {
    // Quebra que este teste pega: se `intensity` virar somente-leitura ou
    // getter sem setter, a animação por frame em useFrame para de funcionar
    // silenciosamente — o bloom congela na intensidade inicial.
    const bloom = new BloomEffect({ intensity: 1.1 });

    bloom.intensity = 1.6;

    expect(bloom.intensity).toBeCloseTo(1.6);
  });

  it("expõe dispose, chamado no cleanup do efeito", () => {
    const bloom = new BloomEffect({ intensity: 1.1 });

    expect(typeof bloom.dispose).toBe("function");
  });
});
