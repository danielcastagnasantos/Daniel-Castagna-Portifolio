import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Caixa Central — Distribuidora",
    short_name: "Caixa Central",
    description: "Caixa por turno, boletos e financeiro da distribuidora.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "pt-BR",
    background_color: "#f6f7f9",
    theme_color: "#4f46e5",
    categories: ["business", "finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Caixa", url: "/caixa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Boletos", url: "/boletos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
