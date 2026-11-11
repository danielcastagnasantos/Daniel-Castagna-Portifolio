import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Caixa Simples", short_name: "Caixa", description: "Entradas e saídas do caixa: dinheiro e cartão.",
    start_url: "/", scope: "/", display: "standalone", orientation: "portrait-primary", lang: "pt-BR",
    background_color: "#f6f7f9", theme_color: "#4f46e5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
