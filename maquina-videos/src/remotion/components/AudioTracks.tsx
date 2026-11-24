import React from "react";
import { Html5Audio, Sequence } from "remotion";
import type { RenderPlan } from "../../shared/schemas";
import { musicVolumeAt } from "../../shared/audio";
import { assetUrl } from "../util";

/** Narração (uma faixa por cena, no frame exato), trilha com ducking e efeitos sonoros. */
export const AudioTracks: React.FC<{ plan: RenderPlan }> = ({ plan }) => {
  const music = plan.audio.music;
  const tail = Math.round(plan.fps * 0.15);
  return (
    <>
      {music ? (
        <Html5Audio
          src={assetUrl(plan, music.src)}
          loop
          volume={(f) => musicVolumeAt(f, music, plan.audio.speech, plan.totalFrames)}
        />
      ) : null}
      {plan.scenes.map((s) => (
        <Sequence key={`nar-${s.id}`} from={s.narration.startFrame} durationInFrames={s.narration.durationFrames + tail} layout="none">
          <Html5Audio src={assetUrl(plan, s.narration.src)} />
        </Sequence>
      ))}
      {plan.audio.sfx.map((e, i) => (
        <Sequence key={`sfx-${i}`} from={e.atFrame} layout="none">
          <Html5Audio src={assetUrl(plan, e.src)} volume={e.volume} />
        </Sequence>
      ))}
    </>
  );
};
