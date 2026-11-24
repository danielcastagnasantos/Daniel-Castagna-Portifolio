import React from "react";
import { AbsoluteFill, Img, Loop, OffthreadVideo, useCurrentFrame } from "remotion";
import type { Motion, PlanScene, RenderPlan } from "../../shared/schemas";
import { assetUrl, clamp } from "../util";
import { GraphicBackground } from "./GraphicBackground";

/** Movimento de câmera (Ken Burns) ao longo de TODA a cena. */
function motionTransform(motion: Motion, p: number): string {
  const e = clamp(p);
  switch (motion) {
    case "zoom-in":
      return `scale(${1.02 + 0.12 * e})`;
    case "zoom-out":
      return `scale(${1.14 - 0.12 * e})`;
    case "pan-left":
      return `scale(1.14) translateX(${4 - 8 * e}%)`;
    case "pan-right":
      return `scale(1.14) translateX(${-4 + 8 * e}%)`;
    case "pan-up":
      return `scale(1.14) translateY(${3 - 6 * e}%)`;
    case "pan-down":
      return `scale(1.14) translateY(${-3 + 6 * e}%)`;
    default:
      return "none";
  }
}

export const MediaLayer: React.FC<{ plan: RenderPlan; scene: PlanScene; totalLocalFrames: number }> = ({ plan, scene, totalLocalFrames }) => {
  const frame = useCurrentFrame();
  const { visual } = scene;
  const transform = motionTransform(scene.motion, frame / Math.max(1, totalLocalFrames));
  const fill: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", transform, transformOrigin: "50% 45%" };

  if (visual.kind === "image" && visual.src) {
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img src={assetUrl(plan, visual.src)} style={fill} />
      </AbsoluteFill>
    );
  }
  if (visual.kind === "video" && visual.src) {
    const loopLen = visual.clipFrames && visual.clipFrames > 1 ? visual.clipFrames : totalLocalFrames;
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Loop durationInFrames={Math.max(1, loopLen)}>
          <OffthreadVideo src={assetUrl(plan, visual.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Loop>
      </AbsoluteFill>
    );
  }
  return <GraphicBackground variant={visual.graphic} brand={plan.brand} seed={scene.seed} />;
};
