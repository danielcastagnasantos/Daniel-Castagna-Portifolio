import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SectionTracker } from "@/components/layout/SectionTracker";
import { SmoothScroll } from "@/components/providers/SmoothScroll";
import { JsonLd } from "@/components/seo/JsonLd";
import { SceneMount } from "@/components/three/SceneMount";
import { Cursor } from "@/components/ui/Cursor";
import { Preloader } from "@/components/ui/Preloader";
import { siteConfig } from "@/content/site.config";
import { routing } from "@/i18n/routing";
import "../globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

type LayoutParams = { locale: string };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LayoutParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  const title = t("title");
  const description = t("description");
  const canonical = `${siteConfig.url}/${locale}`;

  return {
    metadataBase: new URL(siteConfig.url),
    title,
    description,
    applicationName: siteConfig.brand,
    authors: [{ name: siteConfig.name, url: siteConfig.url }],
    creator: siteConfig.name,
    keywords: [
      "desenvolvedor full stack",
      "full stack developer",
      "Next.js",
      "React",
      "TypeScript",
      "criação de sites",
      "landing page",
      "sistemas web",
      siteConfig.location.city,
    ],
    alternates: {
      canonical,
      languages: Object.fromEntries(
        routing.locales.map((code) => [
          code === "pt" ? "pt-BR" : "en",
          `${siteConfig.url}/${code}`,
        ]),
      ),
    },
    openGraph: {
      type: "website",
      siteName: siteConfig.brand,
      title,
      description,
      url: canonical,
      locale: locale === "pt" ? "pt_BR" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<LayoutParams>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "a11y" });
  const tMeta = await getTranslations({ locale, namespace: "meta" });

  return (
    <html
      lang={locale === "pt" ? "pt-BR" : "en"}
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <JsonLd locale={locale} description={tMeta("description")} />
        <NextIntlClientProvider>
          <SmoothScroll>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[300] focus:rounded-full focus:bg-primary focus:px-5 focus:py-3 focus:text-sm focus:text-ink"
            >
              {t("skipToContent")}
            </a>

            <Preloader brand={siteConfig.brand} />
            <SceneMount />
            <Cursor />
            <SectionTracker />

            {/* Ruído e vinheta sobre a cena, abaixo do conteúdo */}
            <div
              aria-hidden="true"
              className="noise pointer-events-none fixed inset-0 -z-[9]"
              style={{
                background:
                  "radial-gradient(120% 80% at 50% 0%, transparent 40%, rgba(5,5,5,.75) 100%)",
              }}
            />

            <Header />
            {children}
            <Footer />
          </SmoothScroll>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
