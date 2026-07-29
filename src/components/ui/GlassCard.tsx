import type { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  /** Acende a borda e o glow no hover. Desligue em cards não interativos. */
  interactive?: boolean;
}

/**
 * Superfície de vidro com borda roxa — a unidade visual base do site.
 *
 * O glow no hover é feito com pseudo-elemento em `opacity`, não com
 * `box-shadow` animado: shadow força repaint, opacity é composta na GPU.
 */
export function GlassCard({ children, className = "", interactive = true }: GlassCardProps) {
  return (
    <div
      className={[
        "group relative overflow-hidden rounded-2xl bg-card/80 p-6",
        "border border-[var(--line)] backdrop-blur-xl",
        "transition-[border-color,transform] duration-500 ease-[var(--ease-out-expo)]",
        interactive && "hover:-translate-y-1 hover:border-primary/60",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {interactive && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, rgba(124,58,237,.18) 0%, transparent 70%)",
          }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
