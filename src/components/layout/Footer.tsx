"use client";

import { useTranslations } from "next-intl";
import { ChannelIcon } from "@/components/ui/ChannelIcon";
import { CONTACT_ORDER, getLinkHref, siteConfig } from "@/content/site.config";

export function Footer() {
  const t = useTranslations("footer");
  const tA11y = useTranslations("a11y");
  const tContact = useTranslations("contact.channels");
  const tIdentity = useTranslations("identity");

  // Ano calculado na renderização: nunca envelhece sozinho no código.
  const year = new Date().getFullYear();

  const activeChannels = CONTACT_ORDER.map((key) => ({ key, href: getLinkHref(key) })).filter(
    (channel): channel is { key: (typeof CONTACT_ORDER)[number]; href: string } =>
      channel.href !== null,
  );

  return (
    <footer className="relative border-t border-[var(--line)]">
      <div className="container-x flex flex-col gap-10 py-14">
        <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-start">
          <div className="flex flex-col gap-2">
            <span className="font-display text-lg font-bold tracking-tight">
              {siteConfig.brand}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              {tIdentity("role")}
            </span>
            <span className="font-mono text-[10px] text-muted/70">{tIdentity("study")}</span>
            <p className="mt-2 max-w-xs text-pretty text-sm text-muted">{t("tagline")}</p>
          </div>

          <div className="flex flex-col items-start gap-4 sm:items-end">
            {activeChannels.length > 0 && (
              <nav aria-label={tA11y("socialNav")}>
                <ul className="flex items-center gap-2">
                  {activeChannels.map(({ key, href }) => (
                    <li key={key}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={tContact(key)}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] text-muted transition-colors duration-300 hover:border-primary hover:text-ink"
                      >
                        <ChannelIcon channel={key} />
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            <a
              href="#hero"
              className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:text-ink"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
              {tA11y("backToTop")}
            </a>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-[var(--line)]/60 pt-6 text-xs text-muted sm:flex-row">
          <p>
            © {year} {siteConfig.name}. {t("rights")}
          </p>
          <p className="font-mono">{t("builtWith")}</p>
        </div>
      </div>
    </footer>
  );
}
