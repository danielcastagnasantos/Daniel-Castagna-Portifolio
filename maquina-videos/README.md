# Máquina de Vídeos — Versão X / Hipótese X

Sistema local para produzir vídeos curtos verticais **do tema ao MP4 pronto**:
**roteiro (Claude) → aprovação → narração (ElevenLabs) → visuais → montagem e legendas palavra a palavra (Remotion) → render 1080×1920 · 60 fps · H.264 → verificação automática → prévia → aprovação → exportação.**

Roda no seu computador (Windows 11), com interface web em `http://localhost:8787`. Tudo é persistido em disco e retomável.

> **Modo de teste:** por padrão **nenhuma API paga é chamada** (roteiro, voz e imagens de teste são gerados localmente).
> A renderização, as legendas, a sincronia e a verificação são as **reais** — então você testa o fluxo inteiro sem gastar nada.

---

## Começando (Windows 11)

Pré-requisitos (uma vez):

1. **Node.js 22 ou mais novo** — https://nodejs.org (versão LTS).
2. **FFmpeg** — abra o PowerShell e rode: `winget install Gyan.FFmpeg` (depois feche e reabra o terminal).
3. Internet na primeira renderização (o Remotion baixa um Chrome Headless Shell, ~100 MB).

Instalar e iniciar:

```text
1. Dê dois cliques em  instalar.bat   (instala, compila a interface, cria o .env e roda o diagnóstico)
2. Dê dois cliques em  iniciar.bat    (abre http://localhost:8787)
```

Ou pelo terminal, dentro da pasta `maquina-videos`:

```bash
npm install
npm run build:web
npm run doctor         # diagnóstico do ambiente
npm start              # http://localhost:8787
```

### Primeiro teste (sem custo)

1. Abra `http://localhost:8787` → **Novo vídeo**.
2. Perfil **Versão X**, escreva um tema, duração **30s**, deixe **Modo de teste** ligado → **Gerar roteiro**.
3. Edite o que quiser nas cenas → **Aprovar roteiro e produzir**.
4. Acompanhe as 7 etapas. Em ~1–3 min aparece a **prévia**, a **verificação automática** e os botões **Aprovar vídeo / Baixar MP4 final**.

Também dá para fazer tudo sem a interface:

```bash
npm run produzir -- "Por que o tempo parece passar mais rápido com a idade" --duracao 30 --aprovar
```

---

## Passando para o modo ao vivo (gera custo)

1. Copie `.env.example` para `.env` e preencha:

   | Variável | Para quê |
   |---|---|
   | `ANTHROPIC_API_KEY` | Roteiros, ideias e revisões (Claude). Modelo padrão `claude-opus-5-5` (`ANTHROPIC_MODEL`). |
   | `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | Narração e tempo de cada palavra. A voz também pode ser definida por marca em `config/brands/*.json` (`voice.voiceId`). |
   | `RUNWAYML_API_SECRET` | (opcional) imagens/vídeos gerados por IA. |
   | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | (opcional) avisos e aprovação pelo celular. |
   | `WEBHOOK_URL` | (opcional) avisos para o n8n. |

2. Rode `npm run doctor -- --online` — confere cada chave com chamadas **gratuitas**.
3. Na criação do projeto, **desligue** “Modo de teste”.

**Controle de custo:** só o roteiro (Claude) é gerado antes da sua aprovação. Narração e visuais pagos só rodam **depois** de você aprovar o roteiro, e **só o que mudou** é refeito quando você edita uma cena. Os visuais gerados (Runway) só são usados se você escolher esse modo no projeto.

---

## O que está pronto e o que foi verificado

Legenda: ✅ testado de verdade · 🟡 implementado conforme a documentação oficial e testado contra um servidor **falso** local (ainda **não** contra a API real: não havia chave) · ⬜ não implementado.

| Função | Status | Como foi verificado |
|---|---|---|
| Interface web local (projeto, tema, duração, roteiro editável, progresso, resultado, alterações por cena, exportação) | ✅ | Dirigida num navegador real (Playwright) + testes de API |
| Pipeline completo em modo de teste | ✅ | Testes automáticos + render real |
| Render Remotion 1080×1920 · 60 fps · H.264 (yuv420p, BT.709) + AAC | ✅ | `ffprobe` do MP4 gerado (teste de ponta a ponta) |
| Legendas animadas palavra a palavra | ✅ | Quadros renderizados inspecionados; invariantes testadas com 200 casos aleatórios |
| Sincronia áudio × cena × legenda | ✅ | **Medida** no MP4 final (correlação do áudio com as palavras: pico em 0 ms) e checada em toda verificação |
| Verificação (duração, codec, FPS, áudio mudo, arquivos ausentes, legendas, sincronia) | ✅ | Testes + render real |
| Persistência, retomada após falha/cancelamento/reinício, reaproveitamento por cena | ✅ | Testes do motor |
| Roteiro/ideias/revisão com Claude (SDK oficial, saída estruturada) | 🟡 | Requisições conferidas contra o SDK; resposta simulada |
| Narração ElevenLabs com alinhamento por caractere → palavra | 🟡 | Endpoint e campos conferidos no SDK oficial; resposta simulada |
| Imagens/vídeos Runway (`text_to_image`, `image_to_video`, `tasks`) | 🟡 | Endpoints conferidos no SDK oficial; servidor falso |
| Biblioteca local de imagens/vídeos/trilhas/efeitos | ✅ | Testes |
| Telegram (aviso + aprovação por botão + pedido de alteração) | 🟡 | Métodos conferidos nos tipos do grammY; servidor falso |
| Webhook de saída para n8n (assinado) + API para n8n | ✅ / 🟡 | Webhook e API testados; o **modelo de fluxo n8n** não foi importado numa instância real |
| Windows 11 | 🟡 | Desenvolvido e testado em **Linux**; sem caminhos/shell específicos de SO (spawn sem shell, caminhos via `path`), lockfile inclui o binário do Remotion para Windows. **Falta você rodar no Windows.** |
| Modo Hipótese X (séries, bíblia, enquetes) | ⬜ | Só existem o perfil visual/voz/estilo e o bloqueio explícito. Veja `docs/PENDENCIAS.md`. |

Detalhes e fontes de cada API: [`docs/PROVEDORES.md`](docs/PROVEDORES.md).

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Servidor + interface (http://localhost:8787) |
| `npm run dev` | Desenvolvimento com recarga (API na 8787, interface em http://localhost:5173) |
| `npm run doctor` | Diagnóstico do ambiente (`-- --online` confere chaves; `-- --baixar-navegador` baixa o Chrome do Remotion) |
| `npm run produzir -- "tema" --duracao 30 --aprovar` | Produção pela linha de comando |
| `npm run studio` | Remotion Studio: pré-visualiza/edita a composição visual |
| `npm run still -- <idProjeto> 30 300 900` | Renderiza quadros (PNG) de um projeto para inspecionar o visual |
| `npm test` | 80+ testes unitários/integração (rápidos, sem rede) |
| `npm run test:e2e` | Teste de ponta a ponta com render real (alguns minutos) |
| `npm run typecheck` | Verificação de tipos |

## Onde ficam as coisas

```text
config/brands/*.json     identidade de cada perfil: cores, fonte, legenda, voz, trilha, efeitos, guia de estilo do roteiro
assets/library/          SUA mídia (imagens, vídeos, trilhas, efeitos) — veja assets/library/README.md
public/fonts/            fontes (Montserrat, Anton — licença OFL)
data/                    (criada sozinha) projetos, áudios, renders, logs, exports, projetos arquivados
  projects/<id>/project.json     estado completo do projeto (fonte da verdade)
  projects/<id>/events.log       log do projeto
  exports/                       MP4s finais exportados
  logs/app.log                   log geral
```

## Estrutura do código

```text
src/shared/     contratos (zod), timeline, legendas, plano de render, sincronia — puro, usado por servidor, UI e Remotion
src/core/       motor: pipeline/ (etapas + engine), providers/ (llm, tts, visual), integrations/ (Telegram, webhook),
                render/ (Remotion + servidor de arquivos), media/ (ffmpeg), store/ (persistência), config, logger, erros
src/remotion/   a composição de vídeo (cenas, transições, legendas, áudio, identidade visual)
src/server/     API HTTP (Hono) + SSE + integrações
src/cli/        doctor, produzir, still
web/            interface (React + Vite)
tests/e2e/      teste de ponta a ponta
docs/           arquitetura, provedores, n8n, pendências
```

Arquitetura, decisões e como estender: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Limites e avisos honestos

- **Licença do Remotion:** é gratuito para pessoas físicas, empresas com até 3 funcionários e organizações sem fins lucrativos (inclusive uso comercial); empresas maiores precisam de licença paga. Texto completo em `node_modules/remotion/LICENSE.md` e https://www.remotion.dev/docs/license/faq — confira se se aplica a você.
- **Referências:** o app só analisa **textos/transcrições que você cola** (e tem direito de usar). Ele **não** baixa nem raspa vídeos de terceiros, e o roteiro é sempre gerado como obra original.
- **Conteúdo gerado por IA:** revise sempre. O prompt proíbe inventar estatísticas/estudos/citações, mas isso não substitui sua checagem.
- **Música e imagens:** use apenas arquivos que você tem direito de usar em `assets/library/`.
- **Tempo de render:** vídeos de ~20–50 s levaram de ~1,5 a ~3 min numa máquina de 4 núcleos (Linux). No seu PC varia com CPU/RAM; ajuste `RENDER_CONCURRENCY` se necessário.
- **Segurança:** o servidor só escuta em `127.0.0.1`, recusa `Host` estranho e exige JSON nas escritas. Se expuser na rede (`HOST=0.0.0.0`), `API_TOKEN` passa a ser obrigatório.
