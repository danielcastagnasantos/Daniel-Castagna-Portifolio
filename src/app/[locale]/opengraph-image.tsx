import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { siteConfig } from "@/content/site.config";
import { routing } from "@/i18n/routing";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Imagem de compartilhamento, uma por idioma.
 *
 * É o que aparece quando o link cai no WhatsApp, LinkedIn ou X — na prática, a
 * primeira impressão do site para quem ainda não clicou.
 */
export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const tIdentity = await getTranslations({ locale, namespace: "identity" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#050505",
          backgroundImage:
            "radial-gradient(900px 500px at 78% 12%, rgba(124,58,237,.45) 0%, transparent 62%)",
          color: "#FFFFFF",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 22,
            color: "#C084FC",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          <div style={{ width: 40, height: 2, background: "#7C3AED" }} />
          {tIdentity("role")}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 82,
            fontWeight: 700,
            lineHeight: 1.05,
            marginTop: 28,
            letterSpacing: -2,
          }}
        >
          {siteConfig.name}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: "#C084FC",
            marginTop: 18,
          }}
        >
          {tIdentity("study")}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#A1A1AA",
            marginTop: 22,
            maxWidth: 900,
            lineHeight: 1.35,
          }}
        >
          {t("description")}
        </div>
      </div>
    ),
    size,
  );
}
