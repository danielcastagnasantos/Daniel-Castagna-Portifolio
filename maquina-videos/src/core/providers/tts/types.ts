import type { WordTiming } from "../../../shared/schemas";

export interface VoiceConfig {
  voiceId: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  useSpeakerBoost: boolean;
}

export interface TtsRequest {
  text: string;
  voice: VoiceConfig;
  /** Texto da cena anterior/seguinte: ajuda a manter a entonação entre cenas. */
  previousText?: string;
  nextText?: string;
  /** Caminho absoluto SEM extensão onde gravar o áudio. */
  outBase: string;
  seed: number;
  signal?: AbortSignal;
}

export interface TtsResult {
  /** Caminho absoluto do arquivo gerado (com extensão). */
  file: string;
  /** Duração informada pelo provedor (o pipeline confirma com ffprobe quando disponível). */
  durationSec: number;
  /** Tempo de cada palavra, em segundos desde o início deste áudio. */
  words: WordTiming[];
  characters: number;
}

export interface TtsProvider {
  readonly id: string;
  /** true = os tempos das palavras vêm do provedor (alinhamento real). */
  readonly realAlignment: boolean;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}
