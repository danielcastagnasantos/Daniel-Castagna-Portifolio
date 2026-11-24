/**
 * Voz do MODO DE TESTE: sintetiza um áudio local (rajadas por palavra), sem rede.
 * O tempo das palavras é DISTRIBUÍDO por comprimento — não é alinhamento real.
 */
import { atomicWrite } from "../../util/fs";
import { distributeWords, estimateSpeechSeconds } from "../../../shared/timing";
import { encodeWav, synthBabble } from "../../media/synth";
import type { TtsProvider, TtsRequest, TtsResult } from "./types";

export class MockTts implements TtsProvider {
  readonly id = "teste";
  readonly realAlignment = false;

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const durationSec = Math.max(0.8, estimateSpeechSeconds(req.text, 2.9) + 0.25);
    const timings = distributeWords(req.text, durationSec);
    const sampleRate = 24000;
    const samples = synthBabble(timings, durationSec, req.seed, sampleRate);
    const file = `${req.outBase}.wav`;
    await atomicWrite(file, encodeWav(samples, sampleRate));
    return { file, durationSec: samples.length / sampleRate, words: timings, characters: req.text.length };
  }
}
