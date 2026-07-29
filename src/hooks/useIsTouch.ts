"use client";

import { useMediaQuery } from "./useMediaQuery";

/** True em dispositivos cujo apontador primário é toque. */
export function useIsTouch(): boolean {
  return useMediaQuery("(hover: none), (pointer: coarse)");
}
