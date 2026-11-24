import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { Brand, GraphicVariant } from "../../shared/schemas";
import { rng } from "../../shared/timing";
import { withAlpha } from "../util";

interface Props {
  variant: GraphicVariant;
  brand: Brand;
  seed: number;
}

/** Fundos procedurais (sem arquivos): usados quando a cena não tem imagem/vídeo. 100% da identidade da marca. */
export const GraphicBackground: React.FC<Props> = ({ variant, brand, seed }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const { background, backgroundAlt, primary, accent } = brand.palette;
  const base = (
    <AbsoluteFill style={{ background: `linear-gradient(165deg, ${backgroundAlt} 0%, ${background} 70%)` }} />
  );
  const r = rng(seed);

  if (variant === "orbs") {
    const orbs = Array.from({ length: 6 }, (_, i) => {
      const size = 520 + r() * 640;
      const x0 = r() * width;
      const y0 = r() * height;
      const sp = 0.25 + r() * 0.35;
      const ph = r() * Math.PI * 2;
      const color = i % 3 === 0 ? accent : primary;
      return { size, x: x0 + Math.sin(t * sp + ph) * 140, y: y0 + Math.cos(t * sp * 0.8 + ph) * 160, color, a: 0.22 + r() * 0.18 };
    });
    return (
      <AbsoluteFill>
        {base}
        {orbs.map((o, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: o.x - o.size / 2,
              top: o.y - o.size / 2,
              width: o.size,
              height: o.size,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${withAlpha(o.color, o.a)} 0%, ${withAlpha(o.color, 0)} 68%)`,
            }}
          />
        ))}
      </AbsoluteFill>
    );
  }

  if (variant === "grid") {
    const offset = (t * 90) % 120;
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {base}
        <div
          style={{
            position: "absolute",
            left: -width,
            right: -width,
            top: height * 0.38,
            bottom: -height * 0.5,
            transform: "perspective(900px) rotateX(62deg)",
            transformOrigin: "50% 0%",
            backgroundImage: `linear-gradient(${withAlpha(primary, 0.55)} 3px, transparent 3px), linear-gradient(90deg, ${withAlpha(primary, 0.55)} 3px, transparent 3px)`,
            backgroundSize: "120px 120px",
            backgroundPosition: `0 ${offset}px`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: height * 0.3,
            height: 420,
            background: `radial-gradient(ellipse at 50% 100%, ${withAlpha(accent, 0.35)} 0%, transparent 70%)`,
          }}
        />
        <AbsoluteFill style={{ background: `linear-gradient(180deg, ${background} 0%, transparent 38%)` }} />
      </AbsoluteFill>
    );
  }

  if (variant === "rays") {
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {base}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "42%",
            width: 2600,
            height: 2600,
            marginLeft: -1300,
            marginTop: -1300,
            transform: `rotate(${t * 6 + r() * 360}deg)`,
            background: `repeating-conic-gradient(from 0deg, ${withAlpha(primary, 0.2)} 0deg 12deg, transparent 12deg 30deg)`,
            maskImage: "radial-gradient(circle, black 0%, transparent 62%)",
            WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 62%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "42%",
            width: 640,
            height: 640,
            marginLeft: -320,
            marginTop: -320,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${withAlpha(accent, 0.45)} 0%, transparent 70%)`,
          }}
        />
      </AbsoluteFill>
    );
  }

  if (variant === "waves") {
    const layers = [0, 1, 2, 3].map((i) => {
      const amp = 70 + i * 26;
      const freq = 0.0042 - i * 0.0006;
      const speed = 0.7 + i * 0.25;
      const y0 = height * (0.36 + i * 0.12);
      const pts: string[] = [];
      for (let x = 0; x <= width; x += 24) pts.push(`${x},${y0 + Math.sin(x * freq + t * speed + i) * amp}`);
      return { crest: `M${pts.join(" L")}`, d: `M0,${height} L${pts.join(" L")} L${width},${height} Z`, a: 0.1 + i * 0.07 };
    });
    return (
      <AbsoluteFill>
        {base}
        <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
          {layers.map((l, i) => (
            <g key={i}>
              <path d={l.d} fill={withAlpha(primary, l.a)} />
              <path d={l.crest} fill="none" stroke={withAlpha(i === 3 ? accent : primary, i === 3 ? 0.7 : 0.45)} strokeWidth={i === 3 ? 5 : 3} />
            </g>
          ))}
        </svg>
      </AbsoluteFill>
    );
  }

  // blocks
  const blocks = Array.from({ length: 9 }, (_, i) => {
    const w = 260 + r() * 360;
    const h = 120 + r() * 220;
    const x = r() * (width - w);
    const y = 120 + r() * (height * 0.7);
    const sp = 0.3 + r() * 0.5;
    const ph = r() * Math.PI * 2;
    return { w, h, x, y: y + Math.sin(t * sp + ph) * 50, rot: Math.sin(t * sp * 0.6 + ph) * 6, color: i % 3 === 0 ? accent : primary, a: 0.1 + r() * 0.16 };
  });
  return (
    <AbsoluteFill>
      {base}
      {blocks.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.x,
            top: b.y,
            width: b.w,
            height: b.h,
            borderRadius: 36,
            transform: `rotate(${b.rot}deg)`,
            background: withAlpha(b.color, b.a),
            border: `3px solid ${withAlpha(b.color, b.a + 0.18)}`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
