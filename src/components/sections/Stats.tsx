import { useTranslations } from "next-intl";
import { Counter } from "@/components/ui/Counter";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TECH_COUNT } from "@/content/technologies";

/**
 * Valor do Lighthouse exibido no card.
 *
 * Preenchido com a medição real do build de produção. Enquanto não medido, o
 * card fica fora da grade — número de performance inventado num site cuja
 * proposta é performance seria a pior contradição possível.
 */
const MEASURED_LIGHTHOUSE: number | null = null;

const MONTHS_BUILDING = 9;

export function Stats() {
  const t = useTranslations("stats");

  const items = [
    { key: "technologies", value: TECH_COUNT, suffix: "" },
    { key: "months", value: MONTHS_BUILDING, suffix: "" },
    ...(MEASURED_LIGHTHOUSE !== null
      ? [{ key: "lighthouse", value: MEASURED_LIGHTHOUSE, suffix: "" }]
      : []),
    { key: "responsive", value: 100, suffix: "%" },
  ] as const;

  return (
    <section id="stats" aria-labelledby="stats-title" className="section-py">
      <div className="container-x flex flex-col gap-12">
        <SectionHeading id="stats-title" eyebrow={t("eyebrow")} title={t("title")} />

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => (
            <Reveal as="li" key={item.key} delay={index * 0.08}>
              <GlassCard className="h-full">
                <div className="flex flex-col gap-2">
                  <span className="font-display text-5xl font-bold leading-none text-gradient">
                    <Counter to={item.value} suffix={item.suffix} />
                  </span>
                  <span className="text-sm text-muted">{t(item.key)}</span>
                </div>
              </GlassCard>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
