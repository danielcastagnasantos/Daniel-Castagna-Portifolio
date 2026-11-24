# Arquitetura

## Visão geral

```text
┌──────────────┐   HTTP/SSE    ┌──────────────────────────── Servidor (Node 22, Hono) ───────────────────────────┐
│ Interface    │◄─────────────►│  API REST  ──►  Engine (máquina de estados)  ──►  Etapas do pipeline           │
│ web (React)  │               │                    │                                  │                          │
└──────────────┘               │                    ▼                                  ▼                          │
┌──────────────┐  webhook/API  │            ProjectStore (JSON em disco)      Provedores (LLM · TTS · Visual)    │
│ n8n / outros │◄─────────────►│                    ▲                          │ real ◄─ chaves do .env          │
└──────────────┘               │  EventBus ─► SSE · Telegram · Webhook         │ teste ◄─ local, sem custo       │
┌──────────────┐  long polling │                                               ▼                                  │
│ Telegram     │◄─────────────►│            Renderer (Remotion + Chromium) ◄── servidor de arquivos (Range)     │
└──────────────┘               └──────────────────────────────────────────────────────────────────────────────────┘
```

Uma linguagem só (**TypeScript**) em todo o sistema. Motivo: o Remotion é React/TypeScript; manter servidor, interface, composição e testes na mesma linguagem e no mesmo `package.json` simplifica a instalação no Windows (sem Python/venv). Python continua uma opção futura para serviços específicos (ex.: alinhamento forçado com Whisper) chamados pelo servidor.

## O pipeline

| # | Etapa | Entrada → saída | Idempotência (o que evita refazer) |
|---|---|---|---|
| 1 | `references` | textos colados → análise de padrões | só roda se houver referências |
| 2 | `script` | tema/duração/marca → roteiro em cenas | — (você aprova/edita depois) |
| ⛔ | **aprovação do roteiro** | | `scriptApprovedHash` = hash do roteiro; qualquer edição invalida |
| 3 | `narration` | texto da cena → áudio + tempo de cada palavra | arquivo nomeado por **hash** (texto+voz+provedor): mudou a fala de 1 cena, só ela é regerada |
| 4 | `visuals` | cena → gráfico/imagem/vídeo | idem, por hash (descrição, prompt, modo, paleta) |
| 5 | `compose` | tudo → **plano de render** (`render/plan.json`) | função pura e determinística |
| 6 | `render` | plano → MP4 1080×1920 · 60 fps · H.264 + AAC | `video-<hash do plano>.mp4`: plano igual → reaproveita o arquivo |
| 7 | `verify` | MP4 → relatório de checagens | sempre roda após render novo |
| 8 | `preview` | MP4 → prévia 540×960@30 + capa | por hash do render |
| ⛔ | **aprovação do vídeo** | | exige verificação sem falhas |

Estados do projeto: `draft → generating_script → awaiting_script_approval → producing → awaiting_video_approval → approved` (+ `failed`, `cancelled`). Cada etapa tem `pending | running | done | failed | interrupted | skipped`.

### Retomada
- Falha ou cancelamento: botão **Retomar** (ou `POST /resume`) refaz só o que falta; os artefatos já gerados ficam.
- Queda do servidor/energia: ao subir, `recoverInterrupted()` marca etapas `running` como `interrupted` e (com `AUTO_RESUME`, padrão ligado) retoma a produção. Roteiro interrompido volta para o estado anterior.
- O render em si recomeça do zero se interrompido (o Remotion não retoma no meio); todo o resto é reaproveitado.

### Alterações em cenas específicas
Duas vias, ambas refazendo apenas o necessário:
1. **Editar o texto** da cena e aprovar de novo → só aquela narração é regerada, depois o render.
2. **Pedido em linguagem natural** (“deixe mais curta”) → o Claude reescreve **só aquela cena** (as outras voltam idênticas — o código garante, mesmo que a IA mexa nelas) → produção automática se o roteiro já estava aprovado.

## Sincronização áudio ↔ cena ↔ legenda
- A narração é gerada **por cena**. A duração vem do arquivo (ffprobe) e o tempo de cada palavra vem do alinhamento por caractere do provedor (ElevenLabs `with-timestamps`).
- `buildTimeline` (puro) posiciona as cenas em **frames inteiros**: `início da cena + atraso → fala`, cena = fala + respiro (mínimo 1,6 s). A transição entra *antes* do início lógico da cena (sobre a anterior), então a fala nunca é cortada.
- Palavras → frames globais → `buildCaptionPages` (poucas palavras por vez, quebra em fim de frase/pausa). Invariantes testadas: cada palavra em exatamente uma página, ordem, sem sobreposição.
- A trilha usa **ducking** calculado dos mesmos intervalos de fala (`musicVolumeAt`).
- Toda verificação **mede** a sincronia no MP4 final (correlação entre a energia do áudio e as palavras da legenda).

## Persistência
`data/projects/<id>/project.json` é a fonte da verdade (validado com zod a cada gravação, gravação atômica via arquivo temporário + rename, com retentativa para o antivírus do Windows). Alterações passam por `ProjectStore.update()`, serializado por projeto. Arquivar move para `data/archive/` (nada é apagado). Um JSON por projeto é legível, versionável e à prova de corrupção parcial; se um dia precisar de consultas/histórico, troque `ProjectStore` por SQLite sem mexer no resto (a interface é pequena).

## Modo de teste vs. ao vivo
`createProviders(config, {testMode, visualMode})` é a **única** fábrica de provedores:

| | teste | ao vivo |
|---|---|---|
| Roteiro/ideias/revisão | `MockLlm` (texto de exemplo rotulado “[TESTE]”) | `AnthropicLlm` |
| Narração | `MockTts` (rajadas sintéticas por palavra) | `ElevenLabsTts` |
| Visuais | gráficos procedurais; PNG/clipe de teste | gráficos · biblioteca · `RunwayVisuals` |
| Trilha/efeitos | sintetizados localmente | seus arquivos em `assets/` |
| Render, legendas, verificação, prévia | **reais** | **reais** |

A escolha é **por projeto** e fica gravada. Modo ao vivo sem chave falha na criação do projeto (antes de gastar qualquer coisa).

## Identidade visual por perfil
`config/brands/<id>.json` (validado por `BrandSchema`): paleta, fonte (woff2 em `public/fonts`), estilo e posição das legendas, marca d’água, cartão final, voz, trilha, efeitos e **guia de estilo enviado ao Claude**. Trocar cores/fontes/legendas não exige tocar em código. A composição (`src/remotion`) lê tudo do plano.

## Servidor, segurança e erros
- Erros tipados (`AppError` com `code` estável) → JSON `{error:{code,message}}` em português; falhas de API externa traduzidas (chave inválida, limite 429 com `Retry-After`, etc.) e **chaves nunca aparecem em logs/erros** (mascaramento).
- Retentativas com backoff apenas onde é seguro (429/5xx/rede); 4xx não é repetido.
- Logs estruturados: console, `data/logs/app.log`, `data/projects/<id>/events.log` e tempo real na interface (SSE).
- Servidor de arquivos só expõe `data/projects`, `data/exports`, `data/cache/test-assets` e `assets/`; bloqueia `..`; suporta `Range`.

## Como estender

**Nova marca** — copie `config/brands/versao-x.json`, mude `id`, cores, fonte, guia de estilo. Aparece sozinha na interface.

**Novo provedor de TTS/imagem/LLM** — implemente a interface (`TtsProvider`, `VisualProvider`, `LlmProvider` em `src/core/providers/*/types.ts`), registre em `src/core/providers/index.ts`. Nada mais muda.

**Nova etapa no pipeline** — crie `src/core/pipeline/steps/<etapa>.ts`, adicione a `STEP_IDS`/`PRODUCTION_STEPS` (`src/shared/schemas.ts`) e ao mapa em `engine.ts`. Siga o padrão: calcular um hash da entrada, reaproveitar se já existe.

**Novo visual/transição** — `src/remotion/components/*`; mude `RENDER_VERSION` em `compose.ts` se quiser invalidar renders em cache (o bundle do Remotion é refeito sozinho quando o código muda).

**Modo Hipótese X** — veja `docs/PENDENCIAS.md` (o que falta e como encaixar: `Project.series`, bíblia da série, registro de enquetes com confirmação humana).
