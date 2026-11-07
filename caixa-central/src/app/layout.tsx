import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { PwaClient } from "@/components/shell/PwaClient";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Caixa Central", template: "%s · Caixa Central" },
  description: "Controle de caixa por turno, contas a pagar e financeiro da distribuidora.",
  applicationName: "Caixa Central",
  appleWebApp: { capable: true, title: "Caixa Central", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f7f9" }, { media: "(prefers-color-scheme: dark)", color: "#0b0d12" }],
};

// Define o tema antes da primeira pintura (evita "flash" branco no modo escuro).
const themeScript = `try{var m=localStorage.getItem('theme')||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-dvh">
        <PwaClient />
        {children}
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: "!font-sans" }} />
      </body>
    </html>
  );
}
