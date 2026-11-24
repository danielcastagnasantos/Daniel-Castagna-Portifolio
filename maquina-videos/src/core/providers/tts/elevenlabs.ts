/**
 * Narração real via ElevenLabs.
 *
 * Endpoint (verificado no SDK oficial @elevenlabs/elevenlabs-js):
 *   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128
 *   header  xi-api-key: <chave>
 *   corpo   { text, model_id, voice_settings{stability,similarity_boost,style,use_speaker_boost,speed},
 *             previous_text?, next_text? }
 *   resposta { audio_base64, alignment{characters[], character_start_times_seconds[],
 *              character_end_times_seconds[]}, normalized_alignment{...} }
 *
 * O alinhamento por caractere vira tempo de cada palavra (legendas palavra por palavra).
 */
import { z } from "zod";
import { AppError, ExternalApiError } from "../../errors";
import { createLogger } from "../../logger";
import { atomicWrite } from "../../util/fs";
import { request, wrapHttpError, HttpStatusError, type FetchLike } from "../../util/http";
import { withRetry } from "../../util/retry";
import { distributeWords, wordsFromCharAlignment } from "../../../shared/timing";
import type { TtsProvider, TtsRequest, TtsResult } from "./types";

const log = createLogger();

const AlignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number()),
  character_end_times_seconds: z.array(z.number()),
});
const ResponseSchema = z.object({
  audio_base64: z.string().min(10),
  alignment: AlignmentSchema.nullish(),
  normalized_alignment: AlignmentSchema.nullish(),
});

export interface ElevenLabsOptions {
  apiKey: string;
  baseUrl?: string;
  outputFormat?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export class ElevenLabsTts implements TtsProvider {
  readonly id = "elevenlabs";
  readonly realAlignment = true;
  private baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(private opts: ElevenLabsOptions) {
    this.baseUrl = (opts.baseUrl ?? "https://api.elevenlabs.io").replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    if (!req.voice.voiceId) {
      throw new AppError("MISSING_CONFIG", "Voz da ElevenLabs não definida: preencha ELEVENLABS_VOICE_ID no .env (ou voice.voiceId na marca).", { httpStatus: 412 });
    }
    const format = this.opts.outputFormat ?? "mp3_44100_128";
    const url = `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(req.voice.voiceId)}/with-timestamps?output_format=${encodeURIComponent(format)}`;
    const body = {
      text: req.text,
      model_id: req.voice.modelId,
      voice_settings: {
        stability: req.voice.stability,
        similarity_boost: req.voice.similarityBoost,
        style: req.voice.style,
        use_speaker_boost: req.voice.useSpeakerBoost,
        speed: req.voice.speed,
      },
      ...(req.previousText ? { previous_text: req.previousText.slice(-400) } : {}),
      ...(req.nextText ? { next_text: req.nextText.slice(0, 400) } : {}),
    };

    const json = await withRetry(
      async () => {
        try {
          const res = await request(this.fetchImpl, url, {
            method: "POST",
            headers: { "xi-api-key": this.opts.apiKey, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body),
            timeoutMs: this.opts.timeoutMs ?? 120_000,
            signal: req.signal,
          });
          return (await res.json()) as unknown;
        } catch (e) {
          if (e instanceof HttpStatusError) wrapHttpError("ElevenLabs", e);
          throw e;
        }
      },
      {
        retries: 3,
        signal: req.signal,
        shouldRetry: (e) => (e instanceof ExternalApiError ? e.retryable : e instanceof TypeError),
        delayFor: (e) => {
          const cause = e instanceof ExternalApiError ? e.cause : undefined;
          return cause instanceof HttpStatusError ? cause.retryAfterMs : undefined;
        },
        onRetry: (e, attempt, delay) => log.warn(`ElevenLabs: nova tentativa ${attempt} em ${delay}ms`, { error: (e as Error).message }),
      },
    );

    const parsed = ResponseSchema.safeParse(json);
    if (!parsed.success) throw new ExternalApiError("ElevenLabs", "Resposta inesperada (formato do JSON mudou?).");

    const audio = Buffer.from(parsed.data.audio_base64, "base64");
    const ext = format.startsWith("mp3") ? "mp3" : format.startsWith("opus") ? "opus" : format.startsWith("wav") ? "wav" : "mp3";
    const file = `${req.outBase}.${ext}`;
    await atomicWrite(file, audio);

    // Alinhamento do texto ORIGINAL (o normalizado pode ter números por extenso etc.).
    const al = parsed.data.alignment ?? parsed.data.normalized_alignment;
    let words = al ? wordsFromCharAlignment(al.characters, al.character_start_times_seconds, al.character_end_times_seconds) : [];
    const lastEnd = al?.character_end_times_seconds.at(-1) ?? 0;
    if (words.length === 0) {
      // Sem alinhamento: reserva proporcional — registramos para o usuário saber.
      log.warn("ElevenLabs não devolveu alinhamento; legendas serão distribuídas proporcionalmente.");
      words = distributeWords(req.text, Math.max(lastEnd, req.text.length / 14));
    }
    return { file, durationSec: Math.max(lastEnd, words.at(-1)?.end ?? 0), words, characters: req.text.length };
  }
}

