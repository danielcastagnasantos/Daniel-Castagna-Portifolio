import { useTranslations } from "next-intl";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";

/** Chaves de messages.services.items, na ordem de exibição. */
const SERVICE_KEYS = [
  "institutional",
  "landing",
  "portfolio",
  "systems",
  "integrations",
  "seo",
  "hosting",
  "domain",
  "maintenance",
  "optimization",
  "consulting",
] as const;

export function Services() {
  const t = useTranslations("services");

  return (
    <section id="services" aria-labelledby="services-title" className="section-py">
      <div className="container-x flex flex-col gap-12">
        <SectionHeading
          id="services-title"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_KEYS.map((key, index) => (
            <Reveal as="li" key={key} delay={(index % 3) * 0.08}>
              <GlassCard className="h-full">
                <div className="flex h-full flex-col gap-3">
                  <span
                    aria-hidden="true"
                    className="font-mono text-xs text-primary transition-colors duration-300 group-hover:text-glow"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-display text-lg font-semibold">
                    {t(`items.${key}.title`)}
                  </h3>
                  <p className="text-pretty text-sm leading-relaxed text-muted">
                    {t(`items.${key}.description`)}
                  </p>
                </div>
              </GlassCard>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
