import { setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";

type PageParams = { locale: string };

export default async function HomePage({ params }: { params: Promise<PageParams> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <PageContent />;
}

function PageContent() {
  const t = useTranslations("hero");

  return (
    <main className="container-x section-py">
      <h1 className="font-display text-5xl font-bold">{t("titlePrefix")}</h1>
      <p className="mt-4 max-w-2xl text-muted">{t("subtitle")}</p>
    </main>
  );
}
