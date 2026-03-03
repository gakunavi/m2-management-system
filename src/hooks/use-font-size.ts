'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FontSizeKey = 'small' | 'medium' | 'large';

const FONT_SIZE_MAP: Record<FontSizeKey, string> = {
  small: '16px',
  medium: '18px',
  large: '20px',
};

interface FontSizeStore {
  fontSize: FontSizeKey;
  setFontSize: (size: FontSizeKey) => void;
}

export const useFontSizeStore = create<FontSizeStore>()(
  persist(
    (set) => ({
      fontSize: 'medium',
      setFontSize: (size) => set({ fontSize: size }),
    }),
    { name: 'font-size-preference' },
  ),
);

/**
 * フォントサイズ設定フック
 * useEffect で <html> の font-size を同期する
 */
export function useFontSize() {
  const { fontSize, setFontSize } = useFontSizeStore();

  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZE_MAP[fontSize];
  }, [fontSize]);

  return { fontSize, setFontSize };
}
