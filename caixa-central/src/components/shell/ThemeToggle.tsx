"use client";
import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Mode = "system" | "light" | "dark";
const ORDER: Mode[] = ["system", "light", "dark"];
const LABEL: Record<Mode, string> = { system: "Tema: automático", light: "Tema: claro", dark: "Tema: escuro" };

const listeners = new Set<() => void>();
function read(): Mode {
  try { return (localStorage.getItem("theme") as Mode) || "system"; } catch { return "system"; }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => { if (read() === "system") applyTheme("system"); };
  mq.addEventListener("change", onSystem);
  return () => { listeners.delete(cb); mq.removeEventListener("change", onSystem); };
}

export function applyTheme(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeToggle({ className }: { className?: string }) {
  const mode = useSyncExternalStore(subscribe, read, () => "system" as Mode);
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  return (
    <button
      type="button" className={className} title={LABEL[mode]} aria-label={LABEL[mode]}
      onClick={() => {
        const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
        try { localStorage.setItem("theme", next); } catch { /* armazenamento bloqueado: vale só nesta visita */ }
        applyTheme(next);
        listeners.forEach((l) => l());
      }}
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}
