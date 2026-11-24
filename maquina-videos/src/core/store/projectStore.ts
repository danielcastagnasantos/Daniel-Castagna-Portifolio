/**
 * Persistência de projetos em disco (um JSON por projeto + pastas de arquivos).
 *
 *   data/projects/<id>/project.json   estado completo (fonte da verdade)
 *   data/projects/<id>/audio|images|videos|render/...
 *   data/projects/<id>/events.log     log do projeto (JSONL)
 *
 * Todas as alterações passam por `update()`, que serializa por projeto, valida com o
 * schema e grava de forma atômica — um travamento no meio nunca corrompe o projeto.
 */
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NotFoundError, ValidationError } from "../errors";
import { createLogger } from "../logger";
import { atomicWriteJson, ensureDir, exists, readJson } from "../util/fs";
import { ProjectSchema, type Project, type StepId } from "../../shared/schemas";

const log = createLogger();

export interface ProjectSummary {
  id: string;
  theme: string;
  brandId: string;
  status: Project["status"];
  testMode: boolean;
  targetDurationSec: number;
  createdAt: string;
  updatedAt: string;
  title?: string;
  hasVideo: boolean;
}

export type NewProjectInput = Pick<Project, "brandId" | "theme" | "targetDurationSec" | "testMode"> &
  Partial<Pick<Project, "visualMode" | "references" | "language">>;

export class ProjectStore extends EventEmitter<{ changed: [Project] }> {
  readonly projectsDir: string;
  private locks = new Map<string, Promise<unknown>>();

  constructor(readonly dataDir: string) {
    super();
    this.projectsDir = path.join(dataDir, "projects");
  }

  projectDir(id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new ValidationError("Identificador de projeto inválido.");
    return path.join(this.projectsDir, id);
  }
  private file(id: string): string {
    return path.join(this.projectDir(id), "project.json");
  }

  async init(): Promise<void> {
    await ensureDir(this.projectsDir);
  }

  newId(): string {
    const d = new Date();
    const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
    return `p-${stamp}-${randomBytes(3).toString("hex")}`;
  }

  async create(input: NewProjectInput): Promise<Project> {
    const now = new Date().toISOString();
    const project = ProjectSchema.parse({
      id: this.newId(),
      brandId: input.brandId,
      theme: input.theme.trim(),
      targetDurationSec: input.targetDurationSec,
      testMode: input.testMode,
      visualMode: input.visualMode ?? "graphics",
      language: input.language ?? "pt-BR",
      references: input.references ?? [],
      createdAt: now,
      updatedAt: now,
      status: "draft",
    });
    await ensureDir(this.projectDir(project.id));
    await atomicWriteJson(this.file(project.id), project);
    this.emit("changed", project);
    return project;
  }

  async get(id: string): Promise<Project | undefined> {
    const f = this.file(id);
    if (!(await exists(f))) return undefined;
    const raw = await readJson(f);
    const parsed = ProjectSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        `project.json de ${id} está inválido: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    }
    return parsed.data;
  }

  async require(id: string): Promise<Project> {
    const p = await this.get(id);
    if (!p) throw new NotFoundError(`Projeto ${id}`);
    return p;
  }

  async list(): Promise<ProjectSummary[]> {
    await this.init();
    const entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
    const out: ProjectSummary[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      try {
        const p = await this.get(e.name);
        if (!p) continue;
        out.push({
          id: p.id,
          theme: p.theme,
          brandId: p.brandId,
          status: p.status,
          testMode: p.testMode,
          targetDurationSec: p.targetDurationSec,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          title: p.script?.title,
          hasVideo: Boolean(p.artifacts.render),
        });
      } catch (err) {
        log.warn(`Projeto ignorado na listagem (${e.name}): ${(err as Error).message}`);
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Altera o projeto de forma serializada. O mutador pode alterar o objeto recebido
   * (ele é uma cópia) ou devolver um novo.
   */
  async update(id: string, mutate: (p: Project) => void | Project | Promise<void | Project>): Promise<Project> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(async () => {
      const current = await this.require(id);
      const draft = structuredClone(current);
      const result = await mutate(draft);
      const next = ProjectSchema.parse({ ...(result ?? draft), updatedAt: new Date().toISOString() });
      await atomicWriteJson(this.file(id), next);
      this.emit("changed", next);
      return next;
    });
    this.locks.set(id, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(id) === run) this.locks.delete(id);
    }
  }

  async patchStep(id: string, step: StepId, patch: Partial<Project["steps"][StepId]> & object): Promise<Project> {
    return this.update(id, (p) => {
      const cur = p.steps[step] ?? { status: "pending" as const, attempts: 0 };
      p.steps[step] = { ...cur, ...patch };
    });
  }

  async remove(id: string): Promise<void> {
    const dir = this.projectDir(id);
    if (!(await exists(dir))) throw new NotFoundError(`Projeto ${id}`);
    const archive = path.join(this.dataDir, "archive");
    await ensureDir(archive);
    // Não apagamos de verdade: movemos para data/archive (reversível).
    await fs.rename(dir, path.join(archive, `${id}-${Date.now()}`));
  }
}
