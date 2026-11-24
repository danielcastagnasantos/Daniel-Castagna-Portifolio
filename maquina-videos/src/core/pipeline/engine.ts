/**
 * Motor do pipeline. Responsabilidades:
 *  - máquina de estados do projeto (rascunho → roteiro → produção → aprovação);
 *  - executar as etapas em ordem, de forma idempotente e retomável;
 *  - cancelar, retomar após falha/reinício e registrar tudo no log;
 *  - nunca rodar duas tarefas ao mesmo tempo no mesmo projeto, nem duas renderizações juntas.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  AppError,
  CancelledError,
  ConflictError,
  NotFoundError,
  ValidationError,
  isAbortError,
  toErrorInfo,
} from "../errors";
import { createLogger, type Logger } from "../logger";
import { ensureDir } from "../util/fs";
import { hashOf } from "../util/hash";
import type { NewProjectInput } from "../store/projectStore";
import {
  PRODUCTION_STEPS,
  type ProductionStep,
  ScriptSchema,
  STEP_LABELS,
  type Project,
  type Script,
  type StepId,
} from "../../shared/schemas";
import { renumberScenes } from "../../shared/script";
import type { PipelineDeps, StepContext } from "./context";
import { composeStep } from "./steps/compose";
import { narrationStep } from "./steps/narration";
import { previewStep } from "./steps/preview";
import { renderStep } from "./steps/render";
import { verifyStep } from "./steps/verify";
import { visualsStep } from "./steps/visuals";

const STEP_FUNCTIONS: Record<ProductionStep, (ctx: StepContext) => Promise<void>> = {
  narration: narrationStep,
  visuals: visualsStep,
  compose: composeStep,
  render: renderStep,
  verify: verifyStep,
  preview: previewStep,
};

export const scriptHash = (s: Script): string => hashOf(s);

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 50) || "video";

export interface SceneChange {
  sceneId: string;
  instruction: string;
}

export class Engine {
  private active = new Map<string, AbortController>();
  /** Fila global: só uma produção pesada (narração/render) por vez. */
  private heavy: Promise<unknown> = Promise.resolve();
  private log = createLogger();

  constructor(private deps: PipelineDeps) {}

  // ─── Consultas ──────────────────────────────────────────────────────────────
  isBusy(id: string): boolean {
    return this.active.has(id);
  }

  // ─── Criação ────────────────────────────────────────────────────────────────
  async createProject(input: NewProjectInput): Promise<Project> {
    const brand = this.deps.brands.get(input.brandId);
    if (!brand) throw new ValidationError(`Marca desconhecida: ${input.brandId}`);
    if (!brand.implemented) {
      throw new ValidationError(
        `O modo "${brand.name}" ainda não foi implementado nesta versão (veja docs/PENDENCIAS.md). Use "Versão X".`,
      );
    }
    if (!input.theme.trim()) throw new ValidationError("Informe o tema do vídeo.");
    const visualMode = input.visualMode ?? "graphics";
    // Falha cedo (antes de gastar qualquer coisa) se faltar chave no modo ao vivo.
    this.deps.providersFor({ testMode: input.testMode, visualMode } as Project);
    return this.deps.store.create({ ...input, visualMode });
  }

  async deleteProject(id: string): Promise<void> {
    if (this.active.has(id)) throw new ConflictError("Cancele a tarefa em andamento antes de arquivar o projeto.");
    await this.deps.store.remove(id);
  }

  // ─── Roteiro ────────────────────────────────────────────────────────────────
  async generateScript(id: string): Promise<Project> {
    const project = await this.deps.store.require(id);
    this.assertIdle(id);
    if (project.status === "producing") throw new ConflictError("O projeto está em produção.");
    const p = await this.deps.store.update(id, (d) => {
      d.status = "generating_script";
      d.lastError = undefined;
      d.scriptApprovedHash = undefined;
      d.steps.script = { status: "running", startedAt: new Date().toISOString(), attempts: (d.steps.script?.attempts ?? 0) + 1 };
      d.steps.references = d.references.length
        ? { status: "running", startedAt: new Date().toISOString(), attempts: (d.steps.references?.attempts ?? 0) + 1 }
        : { status: "skipped", attempts: d.steps.references?.attempts ?? 0 };
    });
    const previousStatus = project.status === "generating_script" ? "awaiting_script_approval" : project.status;
    this.launch(id, "roteiro", async (signal, log) => {
      const brand = this.brandOf(p);
      const providers = this.deps.providersFor(p);
      let analysis = p.referenceAnalysis;
      if (p.references.length > 0) {
        log.info(`Analisando ${p.references.length} referência(s)…`);
        analysis = await providers.llm.analyzeReferences({ brand, theme: p.theme, references: p.references }, { signal });
        await this.finishStep(id, "references");
      }
      log.info(`Gerando roteiro (${providers.llm.id}) para "${p.theme}" (~${p.targetDurationSec}s)…`);
      const script = await providers.llm.generateScript(
        { brand, theme: p.theme, targetDurationSec: p.targetDurationSec, language: p.language, analysis },
        { signal },
      );
      await this.deps.store.update(id, (d) => {
        d.script = script;
        d.referenceAnalysis = analysis;
        d.status = "awaiting_script_approval";
        d.artifacts = { scenes: {} };
        d.steps = { references: d.steps.references, script: d.steps.script };
      });
      await this.finishStep(id, "script");
      log.info(`Roteiro pronto: ${script.scenes.length} cenas. Aguardando sua aprovação.`);
      this.deps.bus.emit("milestone", { type: "script_ready", projectId: id });
    }, { failStep: "script", restore: previousStatus });
    return p;
  }

  /** Edição manual do roteiro pelo usuário. Invalida a aprovação anterior. */
  async saveScript(id: string, input: unknown): Promise<Project> {
    this.assertIdle(id);
    const parsed = ScriptSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        `Roteiro inválido: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    }
    const script = this.normalizeScript(parsed.data);
    return this.deps.store.update(id, (d) => {
      if (d.status === "producing" || d.status === "generating_script") throw new ConflictError("Aguarde a tarefa atual terminar.");
      d.script = script;
      d.scriptApprovedHash = undefined;
      d.status = "awaiting_script_approval";
      d.videoApprovedAt = undefined;
    });
  }

  /** Pede à IA para reescrever o roteiro inteiro (ou cenas específicas). */
  async reviseScript(id: string, instruction: string, sceneIds: string[] = []): Promise<Project> {
    this.assertIdle(id);
    const project = await this.deps.store.require(id);
    if (!project.script) throw new ValidationError("Ainda não há roteiro para revisar.");
    if (!instruction.trim()) throw new ValidationError("Descreva o ajuste desejado.");
    const known = new Set(project.script.scenes.map((s) => s.id));
    for (const s of sceneIds) if (!known.has(s)) throw new NotFoundError(`Cena ${s}`);
    const previousStatus = project.status;
    const p = await this.deps.store.update(id, (d) => {
      d.status = "generating_script";
      d.lastError = undefined;
    });
    this.launch(id, "revisão do roteiro", async (signal, log) => {
      const providers = this.deps.providersFor(p);
      log.info(`Revisando roteiro: "${instruction}"${sceneIds.length ? ` (cenas ${sceneIds.join(", ")})` : ""}`);
      const revised = await providers.llm.reviseScript(
        { brand: this.brandOf(p), script: project.script!, instruction, sceneIds, targetDurationSec: p.targetDurationSec, language: p.language },
        { signal },
      );
      const script = this.normalizeScript(revised);
      await this.deps.store.update(id, (d) => {
        d.script = script;
        d.scriptApprovedHash = undefined;
        d.status = "awaiting_script_approval";
      });
      log.info("Revisão aplicada. Confira e aprove novamente.");
    }, { failStep: "script", restore: previousStatus });
    return p;
  }

  async approveScript(id: string): Promise<Project> {
    this.assertIdle(id);
    const project = await this.deps.store.require(id);
    if (!project.script) throw new ValidationError("Não há roteiro para aprovar.");
    if (!["awaiting_script_approval", "awaiting_video_approval", "approved", "failed", "cancelled"].includes(project.status)) {
      throw new ConflictError(`Não é possível aprovar o roteiro no estado "${project.status}".`);
    }
    return this.startProduction(id, project.script);
  }

  // ─── Produção ───────────────────────────────────────────────────────────────
  private async prepareProduction(id: string, script: Script): Promise<Project> {
    const hash = scriptHash(script);
    const p = await this.deps.store.update(id, (d) => {
      d.scriptApprovedHash = hash;
      d.status = "producing";
      d.lastError = undefined;
      d.videoApprovedAt = undefined;
      for (const step of PRODUCTION_STEPS) {
        d.steps[step] = { status: "pending", attempts: d.steps[step]?.attempts ?? 0 };
      }
    });
    await ensureDir(this.deps.store.projectDir(id));
    return p;
  }

  private async startProduction(id: string, script: Script): Promise<Project> {
    const p = await this.prepareProduction(id, script);
    this.launch(id, "produção", (signal, log) => this.runProduction(id, signal, log), {});
    return p;
  }

  /** Retoma após falha, cancelamento ou reinício do servidor. Só refaz o que ficou pendente. */
  async resume(id: string): Promise<Project> {
    this.assertIdle(id);
    const project = await this.deps.store.require(id);
    if (!project.script) return this.generateScript(id);
    if (project.scriptApprovedHash !== scriptHash(project.script)) {
      throw new ConflictError("O roteiro mudou desde a última aprovação. Aprove-o novamente.");
    }
    if (!["failed", "cancelled", "producing"].includes(project.status)) {
      throw new ConflictError(`Nada para retomar no estado "${project.status}".`);
    }
    this.log.info(`Retomando produção do projeto ${id}`);
    return this.startProduction(id, project.script);
  }

  cancel(id: string): boolean {
    const ctrl = this.active.get(id);
    if (!ctrl) return false;
    ctrl.abort(new CancelledError());
    return true;
  }

  /** Alterações em cenas específicas (via IA) → regera só o que mudou → renderiza de novo. */
  async requestSceneChanges(id: string, changes: SceneChange[]): Promise<Project> {
    this.assertIdle(id);
    const project = await this.deps.store.require(id);
    if (!project.script) throw new ValidationError("Não há roteiro.");
    if (changes.length === 0) throw new ValidationError("Nenhuma alteração informada.");
    const known = new Set(project.script.scenes.map((s) => s.id));
    for (const c of changes) {
      if (!known.has(c.sceneId)) throw new NotFoundError(`Cena ${c.sceneId}`);
      if (!c.instruction.trim()) throw new ValidationError(`Descreva a alteração da cena ${c.sceneId}.`);
    }
    const reqs = changes.map((c) => ({
      id: `cr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      sceneIds: [c.sceneId],
      instruction: c.instruction.trim(),
      status: "pending" as const,
    }));
    const previousStatus = project.status;
    const p = await this.deps.store.update(id, (d) => {
      d.changeRequests.push(...reqs);
      d.status = "generating_script";
      d.lastError = undefined;
    });
    this.launch(id, "alterações de cena", async (signal, log) => {
      const providers = this.deps.providersFor(p);
      let script = project.script!;
      for (const r of reqs) {
        log.info(`Alterando cena ${r.sceneIds[0]}: "${r.instruction}"`);
        try {
          const revised = await providers.llm.reviseScript(
            { brand: this.brandOf(p), script, instruction: r.instruction, sceneIds: r.sceneIds, targetDurationSec: p.targetDurationSec, language: p.language },
            { signal },
          );
          script = this.normalizeScript(revised);
          await this.markChange(id, r.id, "applied");
        } catch (e) {
          await this.markChange(id, r.id, "failed", toErrorInfo(e).message);
          throw e;
        }
      }
      // O usuário pediu estas mudanças sobre um roteiro já aprovado: reaprova e regera só o que mudou.
      await this.deps.store.update(id, (d) => {
        d.script = script;
      });
      await this.prepareProduction(id, script);
      await this.runProduction(id, signal, log);
    }, { failStep: "script", restore: previousStatus });
    return p;
  }

  async approveVideo(id: string): Promise<Project> {
    const project = await this.deps.store.require(id);
    if (project.status !== "awaiting_video_approval" && project.status !== "approved") {
      throw new ConflictError("O vídeo ainda não está pronto para aprovação.");
    }
    if (!project.artifacts.verification?.ok) throw new ConflictError("O vídeo não passou na verificação automática.");
    const p = await this.deps.store.update(id, (d) => {
      d.status = "approved";
      d.videoApprovedAt = new Date().toISOString();
    });
    this.deps.bus.emit("milestone", { type: "approved", projectId: id });
    return p;
  }

  async exportVideo(id: string): Promise<{ project: Project; file: string }> {
    const project = await this.deps.store.require(id);
    const render = project.artifacts.render;
    const src = render ? this.deps.assets.toDisk(render.file) : null;
    if (!render || !src) throw new ConflictError("Ainda não há vídeo renderizado.");
    if (!project.artifacts.verification?.ok) throw new ConflictError("O vídeo não passou na verificação automática.");
    const dir = path.join(this.deps.config.dataDir, "exports");
    await ensureDir(dir);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
    const name = `${slug(project.script?.title ?? project.theme)}-${stamp}${project.testMode ? "-TESTE" : ""}.mp4`;
    const dest = path.join(dir, name);
    await fs.copyFile(src, dest);
    const size = (await fs.stat(dest)).size;
    const updated = await this.deps.store.update(id, (d) => {
      d.exports.push({ at: new Date().toISOString(), file: this.deps.assets.fromDisk(dest), sizeBytes: size });
    });
    this.log.info(`Exportado: ${dest}`);
    this.deps.bus.emit("milestone", { type: "exported", projectId: id, file: dest });
    return { project: updated, file: dest };
  }

  /** Chamado na inicialização: projetos que estavam rodando quando o servidor caiu. */
  async recoverInterrupted(autoResume: boolean): Promise<string[]> {
    const resumed: string[] = [];
    for (const s of await this.deps.store.list()) {
      if (s.status !== "producing" && s.status !== "generating_script") continue;
      if (this.active.has(s.id)) continue;
      const id = s.id;
      await this.deps.store.update(id, (d) => {
        for (const [k, st] of Object.entries(d.steps)) {
          if (st?.status === "running") d.steps[k as StepId] = { ...st, status: "interrupted" };
        }
        d.lastError = { code: "INTERRUPTED", message: "A tarefa foi interrompida (o servidor foi reiniciado).", at: new Date().toISOString() };
        d.status = d.status === "generating_script" ? (d.script ? "awaiting_script_approval" : "failed") : "failed";
      });
      if (s.status === "producing" && autoResume) {
        try {
          await this.resume(id);
          resumed.push(id);
        } catch (e) {
          this.log.warn(`Não foi possível retomar ${id}: ${toErrorInfo(e).message}`);
        }
      }
    }
    return resumed;
  }

  // ─── Internos ───────────────────────────────────────────────────────────────
  private assertIdle(id: string): void {
    if (this.active.has(id)) throw new ConflictError("Já existe uma tarefa em andamento neste projeto. Aguarde ou cancele.");
  }

  private brandOf(p: Project) {
    const b = this.deps.brands.get(p.brandId);
    if (!b) throw new NotFoundError(`Marca ${p.brandId}`);
    return b;
  }

  /** Garante ids únicos e não vazios (renumera tudo se algo estiver faltando/duplicado). */
  private normalizeScript(next: Script): Script {
    const ids = new Set(next.scenes.map((s) => s.id));
    const ok = ids.size === next.scenes.length && next.scenes.every((s) => s.id.trim() !== "");
    return ok ? next : renumberScenes(next);
  }

  private async markChange(id: string, crId: string, status: "applied" | "failed", error?: string): Promise<void> {
    await this.deps.store.update(id, (d) => {
      const r = d.changeRequests.find((x) => x.id === crId);
      if (r) {
        r.status = status;
        r.error = error;
      }
    });
  }

  private async finishStep(id: string, step: StepId): Promise<void> {
    await this.deps.store.update(id, (d) => {
      const cur = d.steps[step];
      d.steps[step] = { ...(cur ?? { attempts: 1 }), status: "done", progress: 1, finishedAt: new Date().toISOString(), attempts: cur?.attempts ?? 1, error: undefined };
    });
  }

  /** Executa uma tarefa em segundo plano com tratamento uniforme de erro/cancelamento. */
  private launch(
    id: string,
    label: string,
    fn: (signal: AbortSignal, log: Logger) => Promise<void>,
    opts: { failStep?: StepId; restore?: Project["status"] },
  ): void {
    const ctrl = new AbortController();
    this.active.set(id, ctrl);
    const log = createLogger({ projectId: id });
    void (async () => {
      try {
        await fn(ctrl.signal, log);
      } catch (e) {
        const info = toErrorInfo(e);
        const cancelled = isAbortError(e) || ctrl.signal.aborted;
        if (cancelled) log.warn(`Tarefa "${label}" cancelada.`);
        else log.error(`Falha em "${label}": ${info.message}`, { code: info.code });
        try {
          await this.deps.store.update(id, (d) => {
            if (d.status === "producing") d.status = cancelled ? "cancelled" : "failed";
            else if (d.status === "generating_script") {
              const back = opts.restore && opts.restore !== "producing" && opts.restore !== "generating_script" ? opts.restore : "awaiting_script_approval";
              d.status = d.script ? back : cancelled ? "draft" : "failed";
            }
            d.lastError = cancelled
              ? { code: "CANCELLED", message: "Cancelado pelo usuário.", at: new Date().toISOString() }
              : { code: info.code, message: info.message, at: new Date().toISOString() };
            if (opts.failStep && d.steps[opts.failStep]?.status === "running") {
              const cur = d.steps[opts.failStep]!;
              d.steps[opts.failStep] = { ...cur, status: cancelled ? "interrupted" : "failed", error: cancelled ? undefined : info };
            }
          });
        } catch (inner) {
          log.error(`Não foi possível registrar a falha: ${(inner as Error).message}`);
        }
        if (!cancelled) this.deps.bus.emit("milestone", { type: "failed", projectId: id, message: info.message });
      } finally {
        this.active.delete(id);
      }
    })();
  }

  private async runProduction(id: string, signal: AbortSignal, log: Logger): Promise<void> {
    // Fila global: espera a vez se outro projeto estiver renderizando.
    const run = this.heavy.catch(() => undefined).then(async () => {
      for (const step of PRODUCTION_STEPS) {
        if (signal.aborted) throw new CancelledError();
        await this.runStep(id, step, signal, log);
      }
    });
    this.heavy = run.catch(() => undefined);
    await run;
    await this.deps.store.update(id, (d) => {
      d.status = "awaiting_video_approval";
      d.lastError = undefined;
    });
    log.info("Vídeo pronto para aprovação.");
    this.deps.bus.emit("milestone", { type: "video_ready", projectId: id });
  }

  private async runStep(id: string, step: ProductionStep, signal: AbortSignal, log: Logger): Promise<void> {
    const project = await this.deps.store.update(id, (d) => {
      const cur = d.steps[step];
      d.steps[step] = { status: "running", startedAt: new Date().toISOString(), progress: 0, attempts: (cur?.attempts ?? 0) + 1 };
    });
    const brand = this.brandOf(project);
    const providers = this.deps.providersFor(project);
    const stepLog = log.child({ step });
    let lastPersist = 0;
    let lastDetail: string | undefined;
    const ctx: StepContext = {
      deps: this.deps,
      projectId: id,
      projectDir: this.deps.store.projectDir(id),
      brand,
      providers,
      signal,
      log: stepLog,
      progress: (fraction, detail) => {
        const f = Math.max(0, Math.min(1, fraction));
        lastDetail = detail ?? lastDetail;
        this.deps.bus.emit("progress", { projectId: id, step, progress: f, detail: lastDetail });
        const now = Date.now();
        if (now - lastPersist > 2000) {
          lastPersist = now;
          void this.deps.store
            .update(id, (d) => {
              const cur = d.steps[step];
              if (cur?.status === "running") d.steps[step] = { ...cur, progress: f, detail: lastDetail };
            })
            .catch(() => undefined);
        }
      },
    };
    stepLog.info(`▶ ${STEP_LABELS[step]}`);
    const started = Date.now();
    try {
      await STEP_FUNCTIONS[step](ctx);
      await this.deps.store.update(id, (d) => {
        const cur = d.steps[step];
        d.steps[step] = { ...(cur ?? { attempts: 1 }), status: "done", progress: 1, detail: lastDetail, finishedAt: new Date().toISOString(), attempts: cur?.attempts ?? 1, error: undefined };
      });
      stepLog.info(`✔ ${STEP_LABELS[step]} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (e) {
      const info = toErrorInfo(e);
      const cancelled = isAbortError(e) || signal.aborted;
      await this.deps.store.update(id, (d) => {
        const cur = d.steps[step];
        d.steps[step] = { ...(cur ?? { attempts: 1 }), status: cancelled ? "interrupted" : "failed", error: cancelled ? undefined : info, attempts: cur?.attempts ?? 1 };
      });
      if (cancelled) throw new CancelledError();
      throw e instanceof AppError ? e : new AppError(info.code, info.message, { cause: e });
    }
  }
}
