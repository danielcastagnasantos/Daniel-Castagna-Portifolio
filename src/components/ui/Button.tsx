import type { ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost";

interface ButtonProps {
  children: ReactNode;
  /** `null` renderiza o botão desabilitado com a dica de indisponível. */
  href: string | null;
  variant?: Variant;
  /** Texto exibido e anunciado quando `href` é null. */
  unavailableLabel?: string;
  unavailableHint?: string;
  external?: boolean;
  download?: boolean;
  className?: string;
}

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium " +
  "transition-[transform,background-color,border-color,box-shadow] duration-300 " +
  "ease-[var(--ease-out-expo)] focus-visible:outline-offset-4";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-ink hover:-translate-y-0.5 hover:bg-secondary hover:shadow-[0_0_32px_-8px_var(--color-secondary)]",
  outline:
    "border border-[var(--line)] bg-[var(--glass)] text-ink backdrop-blur hover:-translate-y-0.5 hover:border-primary",
  ghost: "text-muted hover:text-ink",
};

/**
 * Botão que degrada para estado desabilitado quando o destino não existe.
 *
 * Um link morto num portfólio custa mais credibilidade do que um botão
 * declaradamente indisponível: o primeiro parece descuido, o segundo parece
 * uma seção ainda em preparo. Por isso `href` null nunca gera âncora.
 */
export function Button({
  children,
  href,
  variant = "primary",
  unavailableLabel,
  unavailableHint,
  external = false,
  download = false,
  className = "",
}: ButtonProps) {
  const classes = `${BASE} ${VARIANTS[variant]} ${className}`;

  if (href === null) {
    return (
      <span
        className={`${BASE} ${VARIANTS[variant]} ${className} cursor-not-allowed opacity-40`}
        aria-disabled="true"
        title={unavailableHint}
      >
        {children}
        {unavailableLabel && (
          <span className="font-mono text-[10px] uppercase tracking-wider">
            ({unavailableLabel})
          </span>
        )}
      </span>
    );
  }

  return (
    <a
      href={href}
      className={classes}
      download={download || undefined}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
