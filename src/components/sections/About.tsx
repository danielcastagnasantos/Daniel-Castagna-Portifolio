import Image from "next/image";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/content/site.config";

export function About() {
  const t = useTranslations("about");
  const tIdentity = useTranslations("identity");

  return (
    <section id="about" aria-labelledby="about-title" className="section-py">
      <div className="container-x flex flex-col gap-14">
        <SectionHeading id="about-title" eyebrow={t("eyebrow")} title={t("title")} align="left" />

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-16">
          <Reveal>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-[var(--line)] bg-card">
              {siteConfig.photo ? (
                <Image
                  src={siteConfig.photo}
                  alt={t("photoAlt")}
                  fill
                  sizes="(max-width: 1024px) 100vw, 320px"
                  className="object-cover"
                  priority={false}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-10 w-10 opacity-40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  >
                    <circle cx="12" cy="8.5" r="3.5" />
                    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
                  </svg>
                  <span className="font-mono text-xs uppercase tracking-widest">
                    {t("photoPlaceholder")}
                  </span>
                </div>
              )}

              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/5"
              />
            </div>
          </Reveal>

          <div className="flex flex-col gap-6">
            <Reveal delay={0.1}>
              <div className="flex flex-col gap-1.5">
                <h3 className="font-display text-2xl font-bold">{t("name")}</h3>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-glow">
                  {tIdentity("role")}
                </p>
                <p className="text-sm text-muted">{tIdentity("study")}</p>
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <p className="text-pretty leading-relaxed text-muted">{t("p1")}</p>
            </Reveal>

            <Reveal delay={0.2}>
              <p className="text-pretty leading-relaxed text-muted">{t("p2")}</p>
            </Reveal>

            <Reveal delay={0.25}>
              <p className="flex items-center gap-2 font-mono text-xs text-muted/80">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0 text-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M12 21s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                {t("location")}
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
