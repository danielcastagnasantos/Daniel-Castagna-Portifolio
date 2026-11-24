import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlanScene, RenderPlan } from "../../shared/schemas";
import { withAlpha, clamp, easeOutCubic } from "../util";
import { fontStack } from "../fonts";
import { MediaLayer } from "./MediaLayer";

/**
 * Uma cena. O Sequence começa `transitionFrames` ANTES do início lógico da cena:
 * nesse trecho a cena entra por cima da anterior (a fala só começa depois da entrada).
 */
export const SceneView: React.FC<{ plan: RenderPlan; scene: PlanScene }> = ({ plan, scene }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const { brand } = plan;
  const T = scene.transitionFrames;
  const total = scene.durationFrames + T;
  const e = T > 0 ? easeOutCubic(frame / T) : 1;

  let style: React.CSSProperties = {};
  switch (scene.transition) {
    case "fade":
      style = { opacity: e };
      break;
    case "slide":
      style = { transform: `translateY(${(1 - e) * height}px)` };
      break;
    case "zoom":
      style = { opacity: clamp(e * 1.4), transform: `scale(${1.28 - 0.28 * e})` };
      break;
    case "wipe":
      style = { clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` };
      break;
    default:
      style = {};
  }

  // Texto na tela: entra junto com o início da fala.
  const speechLocal = scene.narration.startFrame - (scene.startFrame - T);
  const pop = spring({ frame: frame - speechLocal, fps, config: { damping: 14, stiffness: 140, mass: 0.7 } });
  const out = interpolate(frame, [total - 10, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={style}>
      <MediaLayer plan={plan} scene={scene} totalLocalFrames={total} />
      {/* Escurece para as legendas lerem bem sobre qualquer imagem */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${withAlpha(brand.palette.background, 0.45)} 0%, ${withAlpha(brand.palette.background, 0.05)} 30%, ${withAlpha(brand.palette.background, 0.1)} 55%, ${withAlpha(brand.palette.background, 0.62)} 100%)`,
        }}
      />
      {scene.onScreenText ? (
        <div
          style={{
            position: "absolute",
            top: "24%",
            left: 70,
            right: 70,
            textAlign: "center",
            opacity: clamp(pop) * out,
            transform: `scale(${0.7 + 0.3 * clamp(pop, 0, 1.2)}) translateY(${(1 - clamp(pop)) * 40}px)`,
          }}
        >
          <div
            style={{
              display: "inline-block",
              fontFamily: fontStack(brand),
              fontWeight: 900,
              fontSize: 112,
              lineHeight: 1.04,
              letterSpacing: -2,
              textTransform: "uppercase",
              color: brand.palette.text,
              textShadow: `0 6px 30px ${withAlpha(brand.palette.background, 0.8)}`,
            }}
          >
            {scene.onScreenText}
          </div>
          <div style={{ margin: "26px auto 0", width: 220, height: 12, borderRadius: 6, background: brand.palette.accent }} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
