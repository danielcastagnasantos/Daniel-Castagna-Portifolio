import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderPlan } from "../../shared/schemas";
import { fontStack } from "../fonts";
import { withAlpha } from "../util";

/** Elementos fixos de identidade: marca d'água, barra de progresso e cartão final. */
export const Chrome: React.FC<{ plan: RenderPlan }> = ({ plan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { brand } = plan;
  const progress = frame / Math.max(1, plan.totalFrames - 1);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: withAlpha(brand.palette.text, 0.14) }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", background: brand.palette.accent }} />
      </div>
      {brand.watermark ? (
        <div
          style={{
            position: "absolute",
            top: 74,
            left: 56,
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: fontStack(brand),
            fontWeight: 800,
            fontSize: 34,
            letterSpacing: 4,
            color: withAlpha(brand.palette.text, 0.85),
          }}
        >
          <span style={{ width: 16, height: 16, borderRadius: 4, background: brand.palette.accent, display: "inline-block" }} />
          {brand.watermark}
        </div>
      ) : null}
      {plan.outro ? <Outro plan={plan} frame={frame} fps={fps} /> : null}
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ plan: RenderPlan; frame: number; fps: number }> = ({ plan, frame, fps }) => {
  const o = plan.outro!;
  const local = frame - o.startFrame;
  if (local < -12) return null;
  const { brand } = plan;
  const fade = interpolate(local, [-12, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pop = spring({ frame: local, fps, config: { damping: 13, stiffness: 150, mass: 0.7 } });
  return (
    <AbsoluteFill
      style={{
        opacity: fade,
        background: `linear-gradient(180deg, ${withAlpha(brand.palette.background, 0.0)} 0%, ${withAlpha(brand.palette.background, 0.86)} 45%, ${withAlpha(brand.palette.background, 0.92)} 100%)`,
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 330,
        fontFamily: fontStack(brand),
      }}
    >
      <div style={{ transform: `scale(${0.85 + 0.15 * Math.min(1, pop)})`, opacity: Math.min(1, pop), textAlign: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 92, letterSpacing: 6, color: brand.palette.text, textTransform: "uppercase" }}>{brand.name}</div>
        <div style={{ margin: "22px auto", width: 180, height: 12, borderRadius: 6, background: brand.palette.accent }} />
        {o.text ? <div style={{ fontWeight: 700, fontSize: 44, color: brand.palette.textMuted, padding: "0 90px" }}>{o.text}</div> : null}
      </div>
    </AbsoluteFill>
  );
};
