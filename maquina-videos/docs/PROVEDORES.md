# Provedores externos — o que é usado e como foi verificado

Sem acesso às páginas de documentação durante o desenvolvimento, **cada endpoint foi conferido no código-fonte dos SDKs/tipos oficiais** instalados do npm. Nenhum endpoint foi inventado. Como não havia chaves, **nenhuma chamada real foi feita**: os testes usam servidores falsos que imitam o formato conferido. Na primeira vez com chave real, rode `npm run doctor -- --online` e produza um vídeo curto.

## Anthropic (Claude) — roteiro, ideias, revisão, análise de referências
- **Como:** SDK oficial `@anthropic-ai/sdk` 1.13 (`client.messages.parse` com `output_config.format` = schema Zod → saída estruturada validada).
- **Modelo:** `claude-opus-5-5` (padrão do `.env.example`, `ANTHROPIC_MODEL`).
- **Parâmetros respeitando as regras atuais:** sem `temperature`, sem `budget_tokens`, sem `tool_choice` forçado, sem prefill; `output_config.effort = "high"`.
- **Fallback de recusa:** com `ANTHROPIC_FALLBACKS=default` (padrão), usa o beta `server-side-fallback-2026-07-01` com `fallbacks: "default"` (o servidor tenta um modelo de reserva em caso de recusa de segurança). `off` desliga.
- **Verificado:** formato de requisição (modelo, `output_config`, ausência de parâmetros removidos, beta header), tratamento de `refusal`, 401, validação do JSON → `Script`, e que revisões parciais não alteram cenas não pedidas.
- **Não verificado:** resposta real do modelo; qualidade dos roteiros; custo real.
- **Custo:** um roteiro ≈ alguns milhares de tokens de saída. Confira preços atuais em https://platform.claude.com.

## ElevenLabs — narração
- **Endpoint:** `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128`
- **Header:** `xi-api-key`.
- **Corpo:** `text`, `model_id` (padrão `eleven_multilingual_v2`), `voice_settings{stability, similarity_boost, style, use_speaker_boost, speed}`, `previous_text`/`next_text` (continuidade de entonação entre cenas).
- **Resposta:** `audio_base64`, `alignment{characters, character_start_times_seconds, character_end_times_seconds}` → convertido em tempo de cada palavra (`wordsFromCharAlignment`, testado).
- **Chave:** `GET /v1/user` (gratuito) usado só pelo `doctor`.
- **Observações:** uma chamada **por cena**; a duração final vem do `ffprobe`. Sem alinhamento na resposta, cai em distribuição proporcional (com aviso no log).
- **Não verificado:** voz/prosódia reais em pt-BR (**escolha e ouça a voz**; defina `ELEVENLABS_VOICE_ID`); limites do seu plano.

## Runway — imagens e vídeos (opcional)
- **Base:** `https://api.dev.runwayml.com`; headers `Authorization: Bearer <chave>` e `X-Runway-Version: 2024-11-06`.
- **Imagem:** `POST /v1/text_to_image` `{model: "gen4_image", promptText, ratio: "1080:1920"}` → `{id}`.
- **Vídeo:** `POST /v1/image_to_video` `{model: "gen4_turbo", promptImage, promptText, ratio: "720:1280", duration: 5}` → `{id}`.
- **Resultado:** `GET /v1/tasks/{id}` até `SUCCEEDED` (`output: string[]`), `FAILED` (`failure`), `CANCELLED`; a documentação pede ≥ 5 s entre consultas.
- **Modelos** configuráveis (`RUNWAY_IMAGE_MODEL`, `RUNWAY_VIDEO_MODEL`) porque a Runway muda a lista com frequência.
- **Chave/créditos:** `GET /v1/organization` → `creditBalance` (usado pelo `doctor`).
- **Custo:** consome créditos por geração; por isso só roda se você escolher “Imagens/Vídeos gerados” no projeto.
- **Não verificado:** a resposta real; limites de moderação; qualidade das imagens com os prompts do Claude.

## Telegram — avisos e aprovação
- **Base:** `https://api.telegram.org/bot<TOKEN>/<método>`.
- **Métodos:** `sendMessage`, `sendVideo` (multipart; limite de 50 MB por arquivo — a prévia 540×960 é pequena), `getUpdates` (long polling, `allowed_updates: [message, callback_query]`), `answerCallbackQuery`, `editMessageReplyMarkup`, `getMe`.
- **Autorização:** só o chat de `TELEGRAM_CHAT_ID` aprova/altera; qualquer outro recebe apenas seu próprio `chat_id` em resposta a `/start`.
- **Fluxo:** roteiro pronto → mensagem com botões ✅ Aprovar / ✏️ Pedir ajuste → vídeo pronto (prévia no chat) → ✅ Aprovar / ✏️ Pedir alterações (responda “cena 3: …”) → falha → ↻ Retomar.
- **Não verificado:** contra o Telegram real. Um bot com webhook ativo não recebe `getUpdates` (o app avisa no log).

## Remotion + FFmpeg
- **Remotion 4.0.546** (`@remotion/bundler`, `@remotion/renderer`): `bundle()` (cache por hash do código), `selectComposition()`, `renderMedia()` com `codec: "h264"`, `pixelFormat: "yuv420p"`, `colorSpace: "bt709"`, `audioCodec: "aac"`, `enforceAudioTrack`. ✅ Verificado de verdade.
- **FFmpeg/ffprobe do sistema:** medir duração/áudio, verificação, prévia, capa, sincronia. Caminhos via `FFMPEG_PATH`/`FFPROBE_PATH`.
- **Chrome:** o Remotion baixa o Chrome Headless Shell na 1ª renderização, ou use `BROWSER_EXECUTABLE`.
