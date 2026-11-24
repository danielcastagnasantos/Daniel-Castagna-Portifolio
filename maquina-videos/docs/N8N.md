# n8n — orquestração e agendamento

O n8n não faz parte do núcleo (é a “fase posterior”): a Máquina de Vídeos expõe uma **API REST** e dispara um **webhook de saída**; o n8n usa os dois. As **aprovações humanas continuam obrigatórias** (interface web ou Telegram) — nenhum fluxo aprova roteiro/vídeo sozinho.

## 1. Alcançar a Máquina a partir do n8n
- n8n **no mesmo computador, fora do Docker**: use `http://127.0.0.1:8787`.
- n8n **em Docker** no mesmo computador: use `http://host.docker.internal:8787` e inicie a Máquina com `HOST=0.0.0.0` **e** `API_TOKEN=<segredo longo>` no `.env` (sem token o servidor se recusa a subir fora do localhost).
- n8n **na nuvem**: a Máquina precisa estar acessível por HTTPS (túnel/VPN/proxy reverso) **e** com `API_TOKEN`. Não exponha a porta direto na internet.

Autenticação: header `Authorization: Bearer <API_TOKEN>` (também aceita `?token=`). Escritas exigem `Content-Type: application/json` (no nó *HTTP Request*: Body Content Type = JSON; mesmo sem corpo, envie `{}`).

## 2. API (resumo)
| Método e caminho | O que faz |
|---|---|
| `GET /api/health` | versão, ferramentas e quais chaves estão configuradas |
| `POST /api/ideas` `{brandId, count, topic?, testMode?}` | sugere temas (Claude; exemplos no modo de teste) |
| `POST /api/projects` `{brandId, theme, targetDurationSec, testMode?, visualMode?, references?}` | cria o projeto |
| `POST /api/projects/:id/generate-script` | gera o roteiro (assíncrono → **202**) |
| `POST /api/projects/:id/approve-script` | aprova e inicia a produção (**você decide quando chamar**) |
| `POST /api/projects/:id/revise-script` `{instruction, sceneIds?}` | pede ajuste à IA |
| `POST /api/projects/:id/scene-changes` `{changes:[{sceneId, instruction}]}` | altera cenas e regera só o necessário |
| `POST /api/projects/:id/approve-video` · `/export` · `/resume` · `/cancel` | aprovação, exportação, retomada, cancelamento |
| `GET /api/projects/:id` | estado completo (`status`, `steps`, `artifacts`, `urls`) |
| `GET /api/projects/:id/download` | baixa o MP4 final |
| `GET /api/projects/:id/events` | SSE (tempo real) |

`status` possíveis: `draft · generating_script · awaiting_script_approval · producing · awaiting_video_approval · approved · failed · cancelled`. Erros: `{"error":{"code","message"}}`.

> **Votação (Hipótese X):** quando o modo for implementado, o registro do resultado da enquete exigirá confirmação humana explícita (veja `PENDENCIAS.md`). Nenhum endpoint escolhe resultado sozinho.

## 3. Webhook de saída
Defina `WEBHOOK_URL` (URL de produção do nó *Webhook* do n8n) e, opcionalmente, `WEBHOOK_SECRET`. A cada marco o servidor faz `POST` JSON:

```json
{ "event": "script_ready | video_ready | failed | approved | exported",
  "projectId": "p-20261124-0511-2b86c9", "at": "2026-11-24T05:11:34Z",
  "status": "awaiting_script_approval", "title": "…", "testMode": true,
  "message": "(só em failed)",
  "links": { "project": "…/api/projects/<id>", "download": "…/download", "ui": "…/#/p/<id>" } }
```

Com `WEBHOOK_SECRET`, vai o header `X-Signature: sha256=<HMAC-SHA256(corpo, segredo)>`. Falhas 5xx/429 são repetidas (3×); 4xx não.

## 4. Modelos de fluxo (em `docs/n8n/`)
- `ideia-para-roteiro.json` — agenda (seg/qua/sex 9h) → pede ideias → cria projeto → gera roteiro. Depois disso você aprova pela interface/Telegram.
- `receber-avisos.json` — recebe os eventos do webhook (ligue a Slack/Drive/e-mail).

> ⚠ **Não foram importados em uma instância n8n real.** São JSON no formato de exportação do n8n 1.x (nós `scheduleTrigger` 1.2, `httpRequest` 4.2, `code` 2, `webhook` 2). Ao importar, confira cada nó, troque `COLE_AQUI_…` pelo seu token e ajuste a URL. Se um campo divergir na sua versão, o caminho é simples de refazer pelo editor usando a tabela da seção 2.

## 5. Agendamento sem n8n
Para algo simples (ex.: todo dia 9h) o Agendador de Tarefas do Windows pode rodar `npm run produzir -- "tema" --duracao 45` — mas sem aprovação humana ele só cria o roteiro (a produção exige `--aprovar`).
