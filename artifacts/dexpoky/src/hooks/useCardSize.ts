import { useState } from "react";

const STORAGE_KEY = "dexpoky:cardSize";
const DEFAULT_SIZE = 3;

export const CARD_GRID_COLS = [
  "grid-cols-4 sm:grid-cols-5 lg:grid-cols-6",  // 1 — tiny, most visible
  "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5",  // 2
  "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",  // 3 — default
  "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3",  // 4
  "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2",  // 5 — largest
] as const;

export function useCardSize() {
  const [cardSize, setCardSize] = useState<number>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      const n = v ? parseInt(v, 10) : NaN;
      return Number.isFinite(n) && n >= 1 && n <= 5 ? n : DEFAULT_SIZE;
    } catch {
      return DEFAULT_SIZE;
    }
  });

  function updateCardSize(n: number) {
    setCardSize(n);
    try { localStorage.setItem(STORAGE_KEY, String(n)); } catch { /* ignore */ }
  }

  return [cardSize, updateCardSize, CARD_GRID_COLS[cardSize - 1]] as const;
}
