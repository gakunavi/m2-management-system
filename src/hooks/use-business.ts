'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/api-client';

interface Business {
  id: number;
  businessCode: string;
  businessName: string;
}

// 選択状態の永続化ストア（null = グループ全体/全て）
interface BusinessStore {
  selectedId: number | null;
  setSelectedId: (id: number | null) => void;
}

const useBusinessStore = create<BusinessStore>()(
  persist(
    (set) => ({
      selectedId: null,
      setSelectedId: (id) => set({ selectedId: id }),
    }),
    { name: 'business-selection' },
  ),
);

/** localStorage からの hydration が完了したか */
function useHasHydrated() {
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    const unsub = useBusinessStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });
    // すでに hydration 済みの場合
    if (useBusinessStore.persist.hasHydrated()) {
      setHasHydrated(true);
    }
    return unsub;
  }, []);
  return hasHydrated;
}

export function useBusiness() {
  const { selectedId, setSelectedId } = useBusinessStore();
  const hasHydrated = useHasHydrated();

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ['businesses'],
    queryFn: async () => {
      const result = await apiClient.getList<Business>('/businesses');
      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5分キャッシュ
  });

  // 選択中の事業（null = 全体表示）
  const currentBusiness =
    selectedId !== null
      ? (businesses.find((b) => b.id === selectedId) ?? null)
      : null;

  // 事業切り替え（null で全体表示に戻す）
  const switchBusiness = (businessId: number | null) => {
    setSelectedId(businessId);
  };

  /** 個別事業が選択されているか（案件管理等の表示判定用） */
  const hasSelectedBusiness = selectedId !== null && currentBusiness !== null;

  return {
    currentBusiness,
    selectedBusinessId: selectedId,
    businesses,
    switchBusiness,
    hasSelectedBusiness,
    hasHydrated,
    isLoading,
  };
}
