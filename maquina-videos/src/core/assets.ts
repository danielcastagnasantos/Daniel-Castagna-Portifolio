/**
 * Caminhos de assets. Em project.json guardamos "caminhos de URL" portáveis:
 *   data/projects/<id>/audio/...   → dentro de DATA_DIR
 *   assets/library/...             → dentro de assets/ (biblioteca do usuário)
 * O mesmo caminho serve para o disco (verificação) e para o servidor de assets (render/UI).
 */
import path from "node:path";
import { resolveInside, toPosixRelative } from "./util/fs";

export class AssetPaths {
  constructor(
    readonly dataDir: string,
    readonly assetsDir: string,
  ) {}

  toDisk(urlPath: string): string | null {
    const clean = urlPath.replace(/^\/+/, "");
    if (clean.startsWith("data/")) return resolveInside(this.dataDir, clean.slice(5));
    if (clean.startsWith("assets/")) return resolveInside(this.assetsDir, clean.slice(7));
    return null;
  }

  fromDisk(abs: string): string {
    const resolved = path.resolve(abs);
    if (resolved.startsWith(path.resolve(this.dataDir) + path.sep)) return `data/${toPosixRelative(this.dataDir, resolved)}`;
    if (resolved.startsWith(path.resolve(this.assetsDir) + path.sep)) return `assets/${toPosixRelative(this.assetsDir, resolved)}`;
    throw new Error(`Arquivo fora das pastas de assets: ${abs}`);
  }
}
