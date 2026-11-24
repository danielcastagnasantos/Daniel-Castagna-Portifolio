import fs from "node:fs";
import path from "node:path";
import { BrandSchema, type Brand } from "../shared/schemas";

export class BrandRegistry {
  private brands = new Map<string, Brand>();

  constructor(configDir: string) {
    const dir = path.join(configDir, "brands");
    if (!fs.existsSync(dir)) throw new Error(`Pasta de marcas não encontrada: ${dir}`);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const file = path.join(dir, f);
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e) {
        throw new Error(`Marca inválida (${f}): JSON malformado — ${(e as Error).message}`);
      }
      const parsed = BrandSchema.safeParse(raw);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Error(`Marca inválida (${f}): ${msg}`);
      }
      this.brands.set(parsed.data.id, parsed.data);
    }
    if (this.brands.size === 0) throw new Error(`Nenhuma marca em ${dir}`);
  }

  list(): Brand[] {
    return [...this.brands.values()];
  }
  get(id: string): Brand | undefined {
    return this.brands.get(id);
  }
}
