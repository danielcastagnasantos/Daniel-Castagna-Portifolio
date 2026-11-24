import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import type { Brand } from "../shared/schemas";

const loaded = new Map<string, Promise<void>>();

function loadOne(family: string, weight: string, file: string): Promise<void> {
  const key = `${family}:${weight}:${file}`;
  let p = loaded.get(key);
  if (!p) {
    const face = new FontFace(family, `url(${staticFile(file)})`, { weight });
    p = face.load().then((f) => {
      document.fonts.add(f);
    });
    loaded.set(key, p);
  }
  return p;
}

/** Carrega as fontes da marca e segura o render até estarem prontas (sem texto "piscando" em fonte errada). */
export function useBrandFonts(brand: Brand): void {
  const [handle] = useState(() => delayRender("Carregando fontes da marca"));
  useEffect(() => {
    let alive = true;
    Promise.all(Object.entries(brand.fonts.files).map(([w, f]) => loadOne(brand.fonts.family, w, f)))
      .catch((e) => console.warn("Falha ao carregar fonte (usando reserva):", e))
      .finally(() => {
        if (alive) continueRender(handle);
      });
    return () => {
      alive = false;
    };
  }, [brand, handle]);
}

export const fontStack = (brand: Brand) => `"${brand.fonts.family}", "Montserrat", "Segoe UI", Arial, sans-serif`;
