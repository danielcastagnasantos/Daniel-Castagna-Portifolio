import { describe, expect, it } from "vitest";
import en from "./en.json";
import pt from "./pt.json";

type Json = string | string[] | { [key: string]: Json };

/** Achata o objeto em caminhos como "hero.ctaProjects" para comparação. */
function flatten(value: Json, prefix = ""): string[] {
  if (typeof value === "string" || Array.isArray(value)) return [prefix];

  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("translation files", () => {
  const ptKeys = flatten(pt as Json).sort();
  const enKeys = flatten(en as Json).sort();

  it("define exactly the same keys in both languages", () => {
    // Quebra que este teste pega: adicionar copy só em pt.json faz a chave
    // aparecer literalmente na tela em inglês ("hero.badge"), e o build passa
    // sem reclamar.
    const missingInEnglish = ptKeys.filter((key) => !enKeys.includes(key));
    const missingInPortuguese = enKeys.filter((key) => !ptKeys.includes(key));

    expect({ missingInEnglish, missingInPortuguese }).toEqual({
      missingInEnglish: [],
      missingInPortuguese: [],
    });
  });

  it("has no empty string anywhere", () => {
    // Quebra que este teste pega: uma entrada esvaziada por acidente vira um
    // botão ou título em branco no site.
    const empties: string[] = [];

    const walk = (node: Json, path: string) => {
      if (typeof node === "string") {
        if (node.trim() === "") empties.push(path);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach((item, index) => {
          if (item.trim() === "") empties.push(`${path}[${index}]`);
        });
        return;
      }
      Object.entries(node).forEach(([key, child]) => walk(child, path ? `${path}.${key}` : key));
    };

    walk(pt as Json, "");
    walk(en as Json, "");

    expect(empties).toEqual([]);
  });

  it("keeps the typewriter word lists non-empty in both languages", () => {
    // Quebra que este teste pega: lista vazia deixa o h1 do hero terminando
    // numa preposição solta — "Transformando ideias em".
    expect(pt.hero.typewriter.length).toBeGreaterThan(0);
    expect(en.hero.typewriter.length).toBeGreaterThan(0);
  });
});
