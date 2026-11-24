import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const mk = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-store-"));
  const s = new ProjectStore(dir);
  return { dir, s };
};

describe("ProjectStore", () => {
  it("cria, lê e lista projetos com defaults aplicados", async () => {
    const { s } = mk();
    await s.init();
    const p = await s.create({ brandId: "versao-x", theme: "  Tema  ", targetDurationSec: 30, testMode: true });
    expect(p.theme).toBe("Tema");
    expect(p.status).toBe("draft");
    expect(p.visualMode).toBe("graphics");
    expect((await s.get(p.id))!.id).toBe(p.id);
    expect((await s.list()).map((x) => x.id)).toEqual([p.id]);
  });

  it("atualizações concorrentes são serializadas (nenhuma se perde)", async () => {
    const { s } = mk();
    const p = await s.create({ brandId: "versao-x", theme: "T", targetDurationSec: 30, testMode: true });
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        s.update(p.id, (d) => {
          d.references.push({ id: `r${i}`, title: "", text: "x" });
        }),
      ),
    );
    expect((await s.require(p.id)).references).toHaveLength(25);
  });

  it("uma falha no mutador não corrompe nem trava o projeto", async () => {
    const { s } = mk();
    const p = await s.create({ brandId: "versao-x", theme: "T", targetDurationSec: 30, testMode: true });
    await expect(s.update(p.id, () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await s.update(p.id, (d) => { d.theme = "Depois"; });
    expect((await s.require(p.id)).theme).toBe("Depois");
  });

  it("valida o resultado: dado inválido é rejeitado e o arquivo continua íntegro", async () => {
    const { s } = mk();
    const p = await s.create({ brandId: "versao-x", theme: "T", targetDurationSec: 30, testMode: true });
    await expect(s.update(p.id, (d) => { d.targetDurationSec = 5; })).rejects.toThrow();
    expect((await s.require(p.id)).targetDurationSec).toBe(30);
  });

  it("projeto corrompido em disco não derruba a listagem", async () => {
    const { s, dir } = mk();
    const ok = await s.create({ brandId: "versao-x", theme: "T", targetDurationSec: 30, testMode: true });
    fs.mkdirSync(path.join(dir, "projects", "quebrado"), { recursive: true });
    fs.writeFileSync(path.join(dir, "projects", "quebrado", "project.json"), "{ nao eh json");
    expect((await s.list()).map((x) => x.id)).toEqual([ok.id]);
  });

  it("recusa identificadores com '../' (path traversal)", async () => {
    const { s } = mk();
    expect(() => s.projectDir("../etc")).toThrow();
  });

  it("arquivar move para data/archive (reversível) em vez de apagar", async () => {
    const { s, dir } = mk();
    const p = await s.create({ brandId: "versao-x", theme: "T", targetDurationSec: 30, testMode: true });
    await s.remove(p.id);
    expect(await s.get(p.id)).toBeUndefined();
    expect(fs.readdirSync(path.join(dir, "archive"))).toHaveLength(1);
  });
});
