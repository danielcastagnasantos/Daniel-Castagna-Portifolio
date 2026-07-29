import { create } from "zustand";

export const SECTION_IDS = [
  "hero",
  "about",
  "stats",
  "tech",
  "services",
  "projects",
  "differentials",
  "process",
  "contact",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

interface SceneState {
  /** Seção atualmente na viewport. Muda raramente — seguro para o React. */
  activeSection: SectionId;
  /** Vira true quando os assets terminam de carregar e o preloader sai. */
  ready: boolean;
  setActiveSection: (id: SectionId) => void;
  setReady: (ready: boolean) => void;
}

export const useSceneStore = create<SceneState>((set) => ({
  activeSection: "hero",
  ready: false,
  setActiveSection: (activeSection) => set({ activeSection }),
  setReady: (ready) => set({ ready }),
}));
