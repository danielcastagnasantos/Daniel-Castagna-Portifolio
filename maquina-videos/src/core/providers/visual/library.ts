/**
 * Biblioteca local do usuário: arquivos em assets/library/images e assets/library/videos.
 * Opcionalmente, assets/library/library.json descreve cada arquivo:
 *   [{ "file": "images/mercado.jpg", "tags": ["mercado", "dinheiro"] }]
 * Sem índice, as tags saem do nome do arquivo (ex.: "mercado-dinheiro-01.jpg").
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createLogger } from "../../logger";
import type { VisualProvider, VisualRequest, VisualResult } from "./types";

const log = createLogger();

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov"]);

const IndexSchema = z.array(z.object({ file: z.string(), tags: z.array(z.string()).default([]) }));

export interface LibraryItem {
  abs: string;
  kind: "image" | "video";
  tags: string[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

export function scanLibrary(libraryDir: string): LibraryItem[] {
  const items: LibraryItem[] = [];
  let index = new Map<string, string[]>();
  const indexFile = path.join(libraryDir, "library.json");
  if (fs.existsSync(indexFile)) {
    try {
      const parsed = IndexSchema.parse(JSON.parse(fs.readFileSync(indexFile, "utf8")));
      index = new Map(parsed.map((e) => [e.file.replace(/\\/g, "/"), e.tags]));
    } catch (e) {
      log.warn(`library.json inválido (ignorado): ${(e as Error).message}`);
    }
  }
  for (const sub of ["images", "videos"] as const) {
    const dir = path.join(libraryDir, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const ext = path.extname(name).toLowerCase();
      const kind = IMAGE_EXT.has(ext) ? "image" : VIDEO_EXT.has(ext) ? "video" : undefined;
      if (!kind) continue;
      const rel = `${sub}/${name}`;
      const tags = [...(index.get(rel) ?? []), ...words(path.basename(name, ext))].map(norm);
      items.push({ abs: path.join(dir, name), kind, tags });
    }
  }
  return items;
}

export class LibraryVisuals implements VisualProvider {
  readonly id = "biblioteca";
  constructor(private libraryDir: string) {}

  async resolve(req: VisualRequest): Promise<VisualResult | undefined> {
    const items = scanLibrary(this.libraryDir);
    if (items.length === 0) return undefined;
    const wanted = new Set([
      ...req.scene.visual.libraryTags.map(norm),
      ...words(req.scene.onScreenText ?? ""),
      ...words(req.scene.visual.description),
    ]);
    const wantKind = req.scene.visual.kind === "auto" ? undefined : req.scene.visual.kind === "graphic" ? undefined : req.scene.visual.kind;
    const scored = items
      .filter((it) => !wantKind || it.kind === wantKind)
      .map((it) => ({ it, score: it.tags.filter((t) => wanted.has(t)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.it.abs.localeCompare(b.it.abs));
    const fresh = scored.find((x) => !req.usedLibraryFiles.has(x.it.abs)) ?? scored[0];
    if (!fresh) return undefined;
    req.usedLibraryFiles.add(fresh.it.abs);
    return { kind: fresh.it.kind, file: fresh.it.abs, provider: this.id };
  }
}
