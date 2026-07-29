"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { siteConfig } from "@/content/site.config";
import { useSceneStore } from "@/store/scene";

const NAV_ITEMS = [
  { id: "about", key: "about" },
  { id: "tech", key: "tech" },
  { id: "services", key: "services" },
  { id: "projects", key: "projects" },
  { id: "process", key: "process" },
  { id: "contact", key: "contact" },
] as const;

export function Header() {
  const t = useTranslations("nav");
  const tA11y = useTranslations("a11y");
  const locale = useLocale();
  const pathname = usePathname();
  const activeSection = useSceneStore((state) => state.activeSection);

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Trava o corpo enquanto o menu mobile ocupa a tela inteira.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const otherLocale = locale === "pt" ? "en" : "pt";

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-50 h-[var(--header-h)] transition-colors duration-500",
        scrolled ? "border-b border-[var(--line)] bg-bg/70 backdrop-blur-xl" : "bg-transparent",
      ].join(" ")}
    >
      <div className="container-x flex h-full items-center justify-between gap-6">
        <a href="#hero" className="group flex flex-col leading-none">
          <span className="font-display text-base font-bold tracking-tight">
            {siteConfig.brand}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted transition-colors group-hover:text-glow">
            {siteConfig.role}
          </span>
        </a>

        <nav aria-label={tA11y("mainNav")} className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={activeSection === item.id ? "true" : undefined}
              className={[
                "relative rounded-full px-4 py-2 text-sm transition-colors duration-300",
                activeSection === item.id ? "text-ink" : "text-muted hover:text-ink",
              ].join(" ")}
            >
              {activeSection === item.id && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 -z-10 rounded-full border border-[var(--line)] bg-[var(--glass)]"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              {t(item.key)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={pathname}
            locale={otherLocale}
            aria-label={tA11y("switchLanguage")}
            className="rounded-full border border-[var(--line)] px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:border-primary hover:text-ink"
          >
            {otherLocale}
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? tA11y("closeMenu") : tA11y("openMenu")}
            className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-full border border-[var(--line)] lg:hidden"
          >
            <span
              className={`block h-px w-4 bg-ink transition-transform duration-300 ${menuOpen ? "translate-y-[3px] rotate-45" : ""}`}
            />
            <span
              className={`block h-px w-4 bg-ink transition-transform duration-300 ${menuOpen ? "-translate-y-[3px] -rotate-45" : ""}`}
            />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            id="mobile-menu"
            aria-label={tA11y("mainNav")}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="border-b border-[var(--line)] bg-bg/95 backdrop-blur-xl lg:hidden"
          >
            <ul className="container-x flex flex-col py-4">
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={() => setMenuOpen(false)}
                    className="block border-b border-[var(--line)]/40 py-4 font-display text-lg text-muted transition-colors hover:text-ink"
                  >
                    {t(item.key)}
                  </a>
                </li>
              ))}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
