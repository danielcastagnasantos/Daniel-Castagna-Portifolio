"use client";
import { useEffect, useState } from "react";
import { Download, WifiOff, X } from "lucide-react";
import { useOnline } from "./useOnline";

/** Registra o service worker (somente produção) e mostra faixa de "sem conexão". */
export function PwaClient() {
  const online = useOnline();
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  if (online) return null;
  return (
    <div role="status" className="no-print sticky top-0 z-50 flex items-center justify-center gap-2 bg-warning px-3 py-2 text-center text-xs font-medium text-white">
      <WifiOff size={14} aria-hidden />
      Sem conexão. Nada será salvo até a internet voltar — os botões de salvar ficam bloqueados para evitar lançamentos perdidos.
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

/** Convite de instalação (Chrome/Android). No iPhone: Compartilhar > Adicionar à Tela de Início. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem("install-dismissed")) return; } catch { /* ignora */ }
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent); setHidden(false); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (hidden || !evt) return null;
  return (
    <div className="no-print mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-primary-soft px-4 py-3 text-sm">
      <span className="flex items-center gap-2"><Download size={16} aria-hidden /> Instale o Caixa Central na tela inicial do celular.</span>
      <span className="flex items-center gap-1">
        <button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary"
          onClick={async () => { await evt.prompt(); setHidden(true); }}>Instalar</button>
        <button type="button" aria-label="Dispensar" className="rounded-lg p-1.5 hover:bg-surface"
          onClick={() => { setHidden(true); try { localStorage.setItem("install-dismissed", "1"); } catch { /* ignora */ } }}><X size={14} /></button>
      </span>
    </div>
  );
}
