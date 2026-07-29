import { Reveal } from "./Reveal";

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Precisa casar com o aria-labelledby da <section> que contém o heading. */
  id: string;
  align?: "left" | "center";
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  id,
  align = "center",
}: SectionHeadingProps) {
  const alignment = align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <Reveal className={`flex flex-col gap-4 ${alignment}`}>
      <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-glow">
        <span aria-hidden="true" className="h-px w-6 bg-primary" />
        {eyebrow}
      </span>

      <h2
        id={id}
        className="max-w-3xl text-balance font-display text-4xl font-bold leading-[1.1] sm:text-5xl"
      >
        {title}
      </h2>

      {subtitle && <p className="max-w-2xl text-pretty text-base text-muted sm:text-lg">{subtitle}</p>}
    </Reveal>
  );
}
