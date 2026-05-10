import { create } from "zustand";

type AppState = {
  activeScanId: number | null;
  setActiveScanId: (value: number | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  activeScanId: null,
  setActiveScanId: (value) => set({ activeScanId: value }),
}));
