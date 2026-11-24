import { useState } from "react";
import { api } from "../api";
import type { VisualMode } from "../sharedTypes";
import type { BrandInfo, Health } from "../types";
import { Toast } from "../components/bits";

const DURATIONS = [15, 30, 45, 60, 90];
const VISUAL_MODES: { id: VisualMode; label: string; hint: string; needsRunway?: boolean }[] = [
  { id: "graphics", label: "Gráficos animados", hint: "Fundos animados da marca. Sem arquivos, sem custo." },
  { id: "library", label: "Minha biblioteca", hint: "Usa imagens/vídeos de assets/library (por palavras-chave)." },
  { id: "generated-images", label: "Imagens geradas (Runway)", hint: "Gera uma imagem por cena. Consome créditos Runway.", needsRunway: true },
  { id: "generated-video", label: "Vídeos gerados (Runway)", hint: "Imagem + animação por cena. Consome mais créditos.", needsRunway: true },
];

export function NewProject({ brands, health, onCreated }: { brands: BrandInfo[]; health: Health | null; onCreated: (id: string) => void }) {
  const [brandId, setBrandId] = useState("versao-x");
  const [theme, setTheme] = useState("");
  const [duration, setDuration] = useState(30);
  const [testMode, setTestMode] = useState<boolean | null>(null);
  const [visualMode, setVisualMode] = useState<VisualMode>("graphics");
  const [refs, setRefs] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const test = testMode ?? health?.defaultTestMode ?? true;
  const keysOk = Boolean(health?.providers.anthropic && health?.providers.elevenlabs);
  const runwayOk = Boolean(health?.providers.runway);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const references = refs.trim() ? refs.split(/\n-{3,}\n/).map((t, i) => ({ title: `Referência ${i + 1}`, text: t.trim() })).filter((r) => r.text) : undefined;
      const p = await api<{ id: string }>("/projects", { method: "POST", body: { brandId, theme: theme.trim(), targetDurationSec: duration, testMode: test, visualMode, references } });
      await api(`/projects/${p.id}/generate-script`, { method: "POST" });
      onCreated(p.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="container" onSubmit={submit}>
      <div>
        <h1 style={{ fontSize: 26 }}>Novo vídeo</h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>Escolha o perfil, descreva o tema e a duração. A IA escreve o roteiro e você aprova antes de qualquer produção.</p>
      </div>

      <div className="card">
        <h2>1. Perfil</h2>
        <div className="brandchips" style={{ marginTop: 12 }}>
          {brands.map((b) => (
            <button type="button" key={b.id} className={`chip ${brandId === b.id ? "on" : ""}`} disabled={!b.implemented} onClick={() => setBrandId(b.id)}>
              <b>{b.name}</b>
              <small className="muted">{b.implemented ? b.tagline : "em breve (veja docs/PENDENCIAS.md)"}</small>
              <span className="swatch">{[b.palette.background, b.palette.primary, b.palette.accent].map((c) => <i key={c} style={{ background: c, border: "1px solid #fff3" }} />)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 14 }}>
        <h2>2. Tema e duração</h2>
        <label>
          Tema do vídeo
          <textarea value={theme} onChange={(e) => setTheme(e.target.value)} rows={3} placeholder="Ex.: Por que o tempo parece passar mais rápido quando ficamos mais velhos?" required minLength={3} />
        </label>
        <label>
          Duração aproximada: <span style={{ color: "var(--accent)" }}>{duration}s</span>
          <input type="range" min={15} max={90} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} list="durs" />
          <div className="row" style={{ gap: 6 }}>
            {DURATIONS.map((d) => <button type="button" key={d} className={`btn sm ${duration === d ? "primary" : ""}`} onClick={() => setDuration(d)}>{d}s</button>)}
          </div>
        </label>
        <details>
          <summary>Referências autorizadas (opcional)</summary>
          <label style={{ marginTop: 10 }}>
            Cole textos/transcrições de vídeos que você tem permissão para usar como referência. Separe várias com uma linha contendo <code>---</code>.
            <small>A IA só analisa o padrão de narrativa e retenção — o roteiro é sempre original.</small>
            <textarea value={refs} onChange={(e) => setRefs(e.target.value)} rows={5} />
          </label>
        </details>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <h2>3. Visuais e modo</h2>
        <label>
          De onde vêm as imagens/vídeos das cenas
          <select value={visualMode} onChange={(e) => setVisualMode(e.target.value as VisualMode)}>
            {VISUAL_MODES.map((m) => <option key={m.id} value={m.id} disabled={!test && m.needsRunway && !runwayOk}>{m.label}{!test && m.needsRunway && !runwayOk ? " (sem chave Runway)" : ""}</option>)}
          </select>
          <small>{VISUAL_MODES.find((m) => m.id === visualMode)?.hint}</small>
        </label>
        <label className="row" style={{ gap: 10, fontWeight: 600 }}>
          <input type="checkbox" checked={test} onChange={(e) => setTestMode(e.target.checked)} style={{ width: 18, height: 18 }} />
          Modo de teste — nenhuma chamada paga
        </label>
        {test ? (
          <div className="banner test">
            <b>Modo de teste ligado</b>
            Roteiro, voz e imagens são gerados localmente (sem Claude, sem ElevenLabs, sem Runway). Serve para testar o fluxo inteiro e a renderização em 1080×1920 @ 60fps sem gastar nada. O conteúdo é genérico — não publique.
          </div>
        ) : keysOk ? (
          <div className="banner err">
            <b>Modo ao vivo: vai gerar custo</b>
            Claude escreve o roteiro agora; a narração (ElevenLabs){visualMode.startsWith("generated") ? " e os visuais (Runway)" : ""} só são gerados depois que você aprovar o roteiro.
          </div>
        ) : (
          <div className="banner err">
            <b>Faltam chaves de API</b>
            Preencha <code>ANTHROPIC_API_KEY</code>, <code>ELEVENLABS_API_KEY</code> e <code>ELEVENLABS_VOICE_ID</code> no arquivo <code>.env</code> e reinicie, ou volte ao modo de teste.
          </div>
        )}
      </div>

      <div className="row">
        <button className="btn primary" disabled={busy || theme.trim().length < 3 || (!test && !keysOk)}>{busy ? "Criando…" : "Gerar roteiro"}</button>
        <small className="muted">Nada é produzido até você aprovar o roteiro.</small>
      </div>
      {error && <Toast message={error} onClose={() => setError(null)} />}
    </form>
  );
}
