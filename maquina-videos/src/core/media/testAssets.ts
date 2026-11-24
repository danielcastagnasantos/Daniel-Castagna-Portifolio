import path from "node:path";
import { atomicWrite, exists } from "../util/fs";
import { encodeWav, synthMusic, synthPop, synthWhoosh } from "./synth";

export const TEST_ASSETS_REL = "cache/test-assets";

export interface TestAssets {
  /** Caminhos relativos a DATA_DIR (servidos em /data/...). */
  music: string;
  sfx: Record<string, string>;
}

/** Gera (uma única vez) trilha e efeitos sintéticos para o modo de teste. */
export async function ensureTestAssets(dataDir: string): Promise<TestAssets> {
  const dir = path.join(dataDir, TEST_ASSETS_REL);
  const defs: [string, () => Float32Array][] = [
    ["music-loop.wav", () => synthMusic()],
    ["whoosh.wav", () => synthWhoosh()],
    ["pop.wav", () => synthPop()],
  ];
  for (const [name, make] of defs) {
    const f = path.join(dir, name);
    if (!(await exists(f))) await atomicWrite(f, encodeWav(make(), 24000));
  }
  return {
    music: `${TEST_ASSETS_REL}/music-loop.wav`,
    sfx: { whoosh: `${TEST_ASSETS_REL}/whoosh.wav`, pop: `${TEST_ASSETS_REL}/pop.wav` },
  };
}
