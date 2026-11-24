import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlanCaptionPage, RenderPlan } from "../../shared/schemas";
import { fontStack } from "../fonts";
import { clamp } from "../util";

/** Acha a página de legenda visível no frame (as páginas estão ordenadas e sem sobreposição). */
export function pageAt(pages: readonly PlanCaptionPage[], frame: number): PlanCaptionPage | undefined {
  let lo = 0;
  let hi = pages.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = pages[mid]!;
    if (frame < p.startFrame) hi = mid - 1;
    else if (frame >= p.endFrame) lo = mid + 1;
    else return p;
  }
  return undefined;
}

/** Índice da palavra falada no frame (a última cujo início já passou). -1 = nenhuma ainda. */
export function activeWordIndex(page: PlanCaptionPage, frame: number): number {
  let idx = -1;
  for (let i = 0; i < page.words.length; i++) if (page.words[i]!.startFrame <= frame) idx = i;
  return idx;
}

/** Legendas animadas, palavra por palavra, sincronizadas com a narração. */
export const Captions: React.FC<{ plan: RenderPlan }> = ({ plan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { brand } = plan;
  const c = brand.captions;
  const page = pageAt(plan.captions, frame);
  if (!page) return null;
  const active = activeWordIndex(page, frame);
  const enter = spring({ frame: frame - page.startFrame, fps, config: { damping: 16, stiffness: 220, mass: 0.5 } });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: `${c.positionPercent}%`,
          left: 64,
          right: 64,
          transform: `translateY(-50%) scale(${0.9 + 0.1 * clamp(enter, 0, 1.15)})`,
          opacity: clamp(enter * 1.6),
          textAlign: "center",
          fontFamily: fontStack(brand),
          fontWeight: c.weight,
          fontSize: c.fontSize,
          lineHeight: 1.12,
          textTransform: c.uppercase ? "uppercase" : "none",
          letterSpacing: -1,
        }}
      >
        {page.words.map((w, i) => {
          const isActive = i === active;
          const pop = isActive ? spring({ frame: frame - w.startFrame, fps, config: { damping: 11, stiffness: 260, mass: 0.45 } }) : 1;
          const scale = isActive ? 1 + 0.16 * clamp(pop, 0, 1.3) : 1;
          return (
            <span
              key={`${i}-${w.startFrame}`}
              style={{
                display: "inline-block",
                margin: "0 0.2em",
                color: isActive ? c.activeColor : c.inactiveColor,
                transform: `scale(${scale}) translateY(${isActive ? -4 * clamp(pop) : 0}px)`,
                WebkitTextStroke: `${c.strokeWidth}px ${c.strokeColor}`,
                paintOrder: "stroke fill",
                textShadow: `0 8px 24px rgba(0,0,0,0.45)`,
                opacity: i > active && active >= 0 ? 0.92 : 1,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
