import { useEffect, useMemo, useState } from "react";
import { estimateSpeechSeconds } from "@shared/timing";
import { sceneId } from "@shared/script";
import type { Motion, Scene, Script, Transition } from "../sharedTypes";
import type { ProjectView } from "../types";

const MOTIONS: Motion[] = ["zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up", "pan-down", "none"];
const TRANSITIONS: Transition[] = ["cut", "fade", "slide", "zoom", "wipe"];
const MOTION_PT: Record<string, string> = { "zoom-in": "Aproximar", "zoom-out": "Afastar", "pan-left": "Panorâmica ←", "pan-right": "Panorâmica →", "pan-up": "Panorâmica ↑", "pan-down": "Panorâmica ↓", none: "Parado" };
const TRANS_PT: Record<string, string> = { cut: "Corte seco", fade: "Fade", slide: "Deslizar", zoom: "Zoom", wipe: "Cortina" };

interface Props {
  project: ProjectView;
  wordsPerSecond: number;
  disabled: boolean;
  onSave: (script: Script) => Promise<void>;
  onRequestChange: (sceneId: string, instruction: string) => Promise<void>;
  onDirty?: (dirty: boolean) => void;
}

export function ScriptEditor({ project, wordsPerSecond, disabled, onSave, onRequestChange, onDirty }: Props) {
  const [draft, setDraft] = useState<Script | null>(project.script ?? null);
  const [dirty, setDirty] = useState(false);
  const [asks, setAsks] = useState<Record<string, string>>({});

  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);

  // Atualiza o rascunho quando o servidor muda o roteiro (e o usuário não está editando).
  useEffect(() => {
    if (!dirty) setDraft(project.script ?? null);
  }, [project.script, dirty]);

  const total = useMemo(() => (draft ? draft.scenes.reduce((n, s) => n + estimateSpeechSeconds(s.narration, wordsPerSecond) + 0.4, 0) : 0), [draft, wordsPerSecond]);
  if (!draft) return null;

  const edit = (fn: (s: Script) => void) => {
    const next = structuredClone(draft);
    fn(next);
    setDraft(next);
    setDirty(true);
  };
  const patchScene = (i: number, p: Partial<Scene>) => edit((s) => void Object.assign(s.scenes[i]!, p));
  const patchVisual = (i: number, p: Partial<Scene["visual"]>) => edit((s) => void Object.assign(s.scenes[i]!.visual, p));

  const newId = (s: Script) => {
    const used = new Set(s.scenes.map((x) => x.id));
    for (let n = s.scenes.length + 1; ; n++) if (!used.has(sceneId(n - 1))) return sceneId(n - 1);
  };
  const addScene = (after: number) =>
    edit((s) => {
      s.scenes.splice(after + 1, 0, {
        id: newId(s),
        narration: "Nova cena: escreva aqui o que será narrado.",
        visual: { description: "Descreva o visual desta cena.", kind: "auto", motion: "zoom-in", libraryTags: [] },
        transition: "fade",
        sfx: [],
        targetSec: 5,
      });
    });
  const move = (i: number, d: -1 | 1) =>
    edit((s) => {
      const j = i + d;
      if (j < 0 || j >= s.scenes.length) return;
      [s.scenes[i], s.scenes[j]] = [s.scenes[j]!, s.scenes[i]!];
    });
  const remove = (i: number) => edit((s) => void (s.scenes.length > 1 && s.scenes.splice(i, 1)));

  async function save() {
    await onSave(draft!);
    setDirty(false);
  }
  const hasVideo = Boolean(project.artifacts.render);

  return (
    <div className="card" style={{ display: "grid", gap: 14 }}>
      <div className="row between">
        <div>
          <h2>Roteiro e cenas</h2>
          <p>{draft.scenes.length} cenas · duração estimada ~{Math.round(total)}s (alvo {project.targetDurationSec}s) · gerado por <code>{draft.generator}</code></p>
        </div>
        <div className="row">
          {dirty && <span className="pill warn">alterações não salvas</span>}
          <button className="btn" disabled={!dirty || disabled} onClick={save}>Salvar edições</button>
        </div>
      </div>

      <div className="grid2">
        <label>Título (interno)<input type="text" value={draft.title} onChange={(e) => edit((s) => void (s.title = e.target.value))} disabled={disabled} /></label>
        <label>Chamada para ação final (CTA)<input type="text" value={draft.cta ?? ""} onChange={(e) => edit((s) => void (s.cta = e.target.value || undefined))} disabled={disabled} /></label>
      </div>

      {project.warnings.length > 0 && (
        <ul className="warnlist">
          {project.warnings.map((w, i) => <li key={i} className={w.level}>{w.sceneId ? `[${w.sceneId}] ` : ""}{w.message}</li>)}
        </ul>
      )}

      {draft.scenes.map((s, i) => {
        const nar = project.artifacts.scenes[s.id]?.narration;
        const est = estimateSpeechSeconds(s.narration, wordsPerSecond);
        return (
          <div className="scene" key={s.id}>
            <div className="head">
              <div className="row"><span className="num">{i + 1}</span><b>{s.id}</b><small>~{est.toFixed(1)}s{nar ? ` · áudio real ${nar.durationSec.toFixed(1)}s` : ""}</small></div>
              <div className="row">
                <button className="btn sm" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Subir">↑</button>
                <button className="btn sm" disabled={disabled || i === draft.scenes.length - 1} onClick={() => move(i, 1)} aria-label="Descer">↓</button>
                <button className="btn sm" disabled={disabled} onClick={() => addScene(i)}>＋ cena depois</button>
                <button className="btn sm danger" disabled={disabled || draft.scenes.length <= 1} onClick={() => remove(i)}>Remover</button>
              </div>
            </div>
            <label>Narração (texto exato que será falado e legendado)
              <textarea value={s.narration} rows={3} onChange={(e) => patchScene(i, { narration: e.target.value })} disabled={disabled} />
            </label>
            {nar && project.urls.narration[s.id] && <audio controls preload="none" src={project.urls.narration[s.id]} />}
            <div className="grid2">
              <label>Texto na tela (opcional)<input type="text" value={s.onScreenText ?? ""} maxLength={60} onChange={(e) => patchScene(i, { onScreenText: e.target.value || undefined })} disabled={disabled} /></label>
              <label>Visual<input type="text" value={s.visual.description} onChange={(e) => patchVisual(i, { description: e.target.value })} disabled={disabled} /></label>
            </div>
            <details>
              <summary>Opções avançadas da cena</summary>
              <div className="grid2" style={{ marginTop: 10 }}>
                <label>Transição de entrada
                  <select value={s.transition} onChange={(e) => patchScene(i, { transition: e.target.value as Transition })} disabled={disabled}>{TRANSITIONS.map((t) => <option key={t} value={t}>{TRANS_PT[t]}</option>)}</select>
                </label>
                <label>Movimento de câmera
                  <select value={s.visual.motion} onChange={(e) => patchVisual(i, { motion: e.target.value as Motion })} disabled={disabled}>{MOTIONS.map((t) => <option key={t} value={t}>{MOTION_PT[t]}</option>)}</select>
                </label>
                <label>Tipo de visual
                  <select value={s.visual.kind} onChange={(e) => patchVisual(i, { kind: e.target.value as Scene["visual"]["kind"] })} disabled={disabled}>
                    <option value="auto">Automático (segue o modo do projeto)</option><option value="graphic">Gráfico animado</option><option value="image">Imagem</option><option value="video">Vídeo</option>
                  </select>
                </label>
                <label>Palavras-chave da biblioteca (vírgula)
                  <input type="text" value={s.visual.libraryTags.join(", ")} onChange={(e) => patchVisual(i, { libraryTags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} disabled={disabled} />
                </label>
              </div>
              <label style={{ marginTop: 10 }}>Prompt para gerador de imagem/vídeo (inglês)
                <textarea rows={2} value={s.visual.prompt ?? ""} onChange={(e) => patchVisual(i, { prompt: e.target.value || undefined })} disabled={disabled} />
              </label>
            </details>
            {(hasVideo || project.scriptApproved) && !dirty && (
              <div className="row" style={{ alignItems: "flex-end" }}>
                <label style={{ flex: 1 }}>Pedir alteração desta cena à IA
                  <input type="text" placeholder="Ex.: deixe mais curta e dê um exemplo do dia a dia" value={asks[s.id] ?? ""} onChange={(e) => setAsks({ ...asks, [s.id]: e.target.value })} disabled={disabled} />
                </label>
                <button className="btn blue" disabled={disabled || (asks[s.id] ?? "").trim().length < 3} onClick={async () => { await onRequestChange(s.id, asks[s.id]!.trim()); setAsks({ ...asks, [s.id]: "" }); }}>Aplicar e regerar</button>
              </div>
            )}
          </div>
        );
      })}
      <div className="row">
        <button className="btn" disabled={disabled} onClick={() => addScene(draft.scenes.length - 1)}>＋ Adicionar cena no fim</button>
      </div>
    </div>
  );
}
