import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Typewriter } from "@/components/ui/Typewriter";
import { siteConfig } from "@/content/site.config";

export function Hero() {
  const t = useTranslations("hero");
  const tCommon = useTranslations("common");

  const words = t.raw("typewriter") as string[];

  return (
    <section
      id="hero"
      aria-labelledby="hero-title"
      className="relative flex min-h-[100svh] items-center pt-[var(--header-h)]"
    >
      <div className="container-x">
        <div className="flex max-w-3xl flex-col items-start gap-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--glass)] px-4 py-1.5 font-mono text-xs text-muted backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-glow opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-glow" />
            </span>
            {t("badge")}
          </span>

          <h1
            id="hero-title"
            className="text-balance font-display text-[clamp(2.5rem,7vw,4.75rem)] font-bold leading-[1.05] tracking-tight"
          >
            {t("titlePrefix")}{" "}
            <Typewriter words={words} />
          </h1>

          <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
            {t("subtitle")}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button href="#projects">{t("ctaProjects")}</Button>
            <Button href="#contact" variant="outline">
              {t("ctaQuote")}
            </Button>
            <Button
              href={siteConfig.resume}
              variant="ghost"
              download
              unavailableLabel={tCommon("soon")}
              unavailableHint={tCommon("soonHint")}
            >
              {t("ctaResume")}
            </Button>
          </div>
        </div>
      </div>

      <a
        href="#about"
        className="absolute inset-x-0 bottom-8 mx-auto flex w-fit flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
      >
        {t("scrollHint")}
        <span aria-hidden="true" className="h-10 w-px bg-gradient-to-b from-glow to-transparent" />
      </a>
    </section>
  );
}
