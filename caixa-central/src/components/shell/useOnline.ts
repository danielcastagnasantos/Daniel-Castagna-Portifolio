"use client";
import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};
/** true quando o navegador acredita estar online (a confirmação real é sempre a resposta do servidor). */
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
