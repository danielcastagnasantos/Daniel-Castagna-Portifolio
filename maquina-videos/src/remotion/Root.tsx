import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { MainVideo, type MainVideoProps } from "./MainVideo";
import { samplePlan } from "./samplePlan";

const calculateMetadata: CalculateMetadataFunction<MainVideoProps> = ({ props }) => ({
  durationInFrames: props.plan.totalFrames,
  fps: props.plan.fps,
  width: props.plan.width,
  height: props.plan.height,
});

export const COMPOSITION_ID = "MainVideo";

export const RemotionRoot: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={MainVideo}
    durationInFrames={samplePlan.totalFrames}
    fps={samplePlan.fps}
    width={samplePlan.width}
    height={samplePlan.height}
    defaultProps={{ plan: samplePlan }}
    calculateMetadata={calculateMetadata}
  />
);
