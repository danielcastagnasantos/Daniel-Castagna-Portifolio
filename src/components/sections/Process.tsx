import { useTranslations } from "next-intl";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";

/** Chaves de messages.process.steps, na ordem da timeline. */
const STEP_KEYS = [
  "planning",
  "design",
  "development",
  "testing",
  "launch",
  "support",
] as const;

export function Process() {
  const t = useTranslations("process");

  return (
    <section id="process" aria-labelledby="process-title" className="section-py">
      <div className="container-x flex flex-col gap-12">
        <SectionHeading
          id="process-title"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <ol className="relative flex flex-col gap-8">
          {/* Trilho vertical da timeline */}
          <span
            aria-hidden="true"
            className="absolute left-[19px] top-2 hidden h-[calc(100%-1rem)] w-px bg-gradient-to-b from-primary via-[var(--line)] to-transparent sm:block"
          />

          {STEP_KEYS.map((key, index) => (
            <Reveal as="li" key={key} delay={index * 0.06}>
              <div className="flex gap-5">
                <span className="relative z-10 hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-card font-mono text-xs text-glow sm:flex">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="flex flex-col gap-1.5 pb-2">
                  <h3 className="flex items-center gap-3 font-display text-xl font-semibold">
                    <span className="font-mono text-xs text-glow sm:hidden">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {t(`steps.${key}.title`)}
                  </h3>
                  <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted">
                    {t(`steps.${key}.description`)}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
