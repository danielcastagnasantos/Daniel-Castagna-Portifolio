import { useTranslations } from "next-intl";
import { ChannelIcon } from "@/components/ui/ChannelIcon";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CONTACT_ORDER, getLinkHref } from "@/content/site.config";

export function Contact() {
  const t = useTranslations("contact");
  const tCommon = useTranslations("common");

  return (
    <section id="contact" aria-labelledby="contact-title" className="section-py">
      <div className="container-x flex flex-col gap-12">
        <SectionHeading
          id="contact-title"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONTACT_ORDER.map((channel, index) => {
            const href = getLinkHref(channel);
            const label = t(`channels.${channel}`);
            const hint = t(`channelHints.${channel}`);

            const inner = (
              <>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--glass)] transition-colors duration-300 group-hover:border-primary group-hover:text-glow">
                  <ChannelIcon channel={channel} className="h-5 w-5" />
                </span>

                <span className="flex min-w-0 flex-col">
                  <span className="font-display text-lg font-semibold">{label}</span>
                  <span className="truncate text-xs text-muted">
                    {href ? hint : tCommon("soonHint")}
                  </span>
                </span>

                {href && (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="ml-auto h-5 w-5 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-1 group-hover:text-ink"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </>
            );

            const shared =
              "group flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-card/70 p-5 backdrop-blur transition-[transform,border-color] duration-500 ease-[var(--ease-out-expo)]";

            return (
              <Reveal as="li" key={channel} delay={index * 0.06}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${shared} h-full hover:-translate-y-1 hover:border-primary/70`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div
                    aria-disabled="true"
                    title={tCommon("soonHint")}
                    className={`${shared} h-full cursor-not-allowed opacity-45`}
                  >
                    {inner}
                  </div>
                )}
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
