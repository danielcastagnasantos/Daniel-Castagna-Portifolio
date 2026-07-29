import { useTranslations } from "next-intl";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";

/** Chaves de messages.differentials.items com o traçado do ícone de cada uma. */
const DIFFERENTIALS = [
  { key: "performance", path: "M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" },
  { key: "seo", path: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4" },
  { key: "cleanCode", path: "M8 6 3 12l5 6M16 6l5 6-5 6M14 4l-4 16" },
  { key: "design", path: "M12 3l2.6 5.6 6.4.8-4.7 4.3 1.2 6.3L12 17l-5.5 3 1.2-6.3L3 9.4l6.4-.8L12 3Z" },
  { key: "responsive", path: "M3 5h13v11H3zM16 9h5v10h-5zM7 20h6" },
  { key: "scalable", path: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { key: "practices", path: "M6 3v12a3 3 0 0 0 3 3h6M18 3v6M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" },
  { key: "accessibility", path: "M12 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM4 8l8 1.5L20 8M12 9.5V15m0 0-3 6.5M12 15l3 6.5" },
  { key: "support", path: "M4 14v-3a8 8 0 1 1 16 0v3M4 14a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2Zm16 0a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2Z" },
] as const;

export function Differentials() {
  const t = useTranslations("differentials");

  return (
    <section id="differentials" aria-labelledby="differentials-title" className="section-py">
      <div className="container-x flex flex-col gap-12">
        <SectionHeading id="differentials-title" eyebrow={t("eyebrow")} title={t("title")} />

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DIFFERENTIALS.map((item, index) => (
            <Reveal as="li" key={item.key} delay={(index % 3) * 0.08}>
              <GlassCard className="h-full">
                <div className="flex h-full flex-col gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--glass)]">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-glow"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={item.path} />
                    </svg>
                  </span>
                  <h3 className="font-display text-lg font-semibold">
                    {t(`items.${item.key}.title`)}
                  </h3>
                  <p className="text-pretty text-sm leading-relaxed text-muted">
                    {t(`items.${item.key}.description`)}
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
