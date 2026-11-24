import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { RenderPlan } from "../shared/schemas";
import { AudioTracks } from "./components/AudioTracks";
import { Captions } from "./components/Captions";
import { Chrome } from "./components/Chrome";
import { SceneView } from "./components/SceneView";
import { fontStack, useBrandFonts } from "./fonts";

export interface MainVideoProps extends Record<string, unknown> {
  plan: RenderPlan;
}

export const MainVideo: React.FC<MainVideoProps> = ({ plan }) => {
  useBrandFonts(plan.brand);
  return (
    <AbsoluteFill style={{ backgroundColor: plan.brand.palette.background, fontFamily: fontStack(plan.brand) }}>
      {plan.scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame - scene.transitionFrames}
          durationInFrames={scene.durationFrames + scene.transitionFrames}
        >
          <SceneView plan={plan} scene={scene} />
        </Sequence>
      ))}
      <Captions plan={plan} />
      <Chrome plan={plan} />
      <AudioTracks plan={plan} />
    </AbsoluteFill>
  );
};
