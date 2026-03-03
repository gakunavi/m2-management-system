'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ============================================
// 型定義
// ============================================

interface Candidate {
  id: number;
  partnerCode: string;
  partnerName: string;
  partnerTier: string | null;
  partnerTierNumber: string | null;
}

interface Props {
  businessId: number;
  excludePartnerId: number;
  /** 現在の businessParentId */
  value: number | null;
  valueName?: string | null;
  valueCode?: string | null;
  /** 現在の businessTier（表示用） */
  currentTier: string | null;
  /** 親代理店を選択した */
  onSelectParent: (parentId: number) => void;
  /** 1次代理店（親なし）として設定 */
  onSetAsPrimary: () => void;
  /** 階層設定をクリア */
  onClear: () => void;
}

// ============================================
// コンポーネント
// ============================================

export function BusinessParentPartnerSelect({
  businessId,
  excludePartnerId,
  value,
  valueName,
  valueCode,
  currentTier,
  onSelectParent,
  onSetAsPrimary,
  onClear,
}: Props) {
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // 外側クリックで閉じる（ポータル分も考慮）
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 候補検索（tier 指定なし → 全階層代理店を取得）
  const fetchCandidates = useCallback(
    async (query: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          businessId: String(businessId),
          exclude: String(excludePartnerId),
        });
        if (query) params.set('search', query);

        const res = await fetch(`/api/v1/partners/candidates?${params}`);
        if (!res.ok) return;
        const json = await res.json();
        setCandidates(json.data ?? []);
      } finally {
        setIsLoading(false);
      }
    },
    [businessId, excludePartnerId],
  );

  // デバウンス検索
  useEffect(() => {
    if (!isOpen) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCandidates(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, isOpen, fetchCandidates]);

  // ─── 状態1: 1次代理店（親なし） ───
  if (currentTier === '1次代理店' && !value) {
    return (
      <div className="flex items-center gap-1 text-sm">
        <Badge variant="outline" className="text-xs font-normal">
          なし（1次代理店）
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={onClear}
          aria-label="階層設定をクリア"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // ─── 状態2: 親代理店設定済み ───
  if (value) {
    return (
      <div className="flex items-center gap-1 text-sm">
        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="truncate max-w-[140px]" title={`${valueCode ?? ''} ${valueName ?? ''}`}>
          {valueName || `ID:${value}`}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={onClear}
          aria-label="親代理店をクリア"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // ドロップダウンの位置を計算（ポータルで body 直下に描画するため）
  const getDropdownStyle = (): React.CSSProperties => {
    if (!containerRef.current) return { display: 'none' };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: 280,
      zIndex: 9999,
    };
  };

  // ─── 状態3: 未設定 → 検索入力 + ドロップダウン ───
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder="親代理店を検索..."
          className="h-7 w-[180px] pl-6 text-xs"
        />
      </div>
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={getDropdownStyle()}
          className="rounded-md border bg-popover shadow-md"
        >
          <div className="max-h-[240px] overflow-y-auto p-1">
            {/* 1次代理店（親なし）オプション */}
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent font-medium border-b mb-1 pb-1.5"
              onClick={() => {
                onSetAsPrimary();
                setIsOpen(false);
                setSearch('');
              }}
            >
              <Badge variant="secondary" className="text-[10px] shrink-0">1次</Badge>
              <span>親なし（1次代理店として設定）</span>
            </button>

            {/* 候補一覧 */}
            {isLoading ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">検索中...</div>
            ) : candidates.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                候補がありません（事業別階層が設定済みの代理店のみ表示）
              </div>
            ) : (
              candidates.map((c) => (
                <button
                  key={c.id}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => {
                    onSelectParent(c.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                >
                  {c.partnerTier && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {c.partnerTier.replace('代理店', '')}
                    </Badge>
                  )}
                  {c.partnerTierNumber && (
                    <span className="shrink-0 font-mono text-muted-foreground text-[10px]">
                      [{c.partnerTierNumber}]
                    </span>
                  )}
                  <span className="truncate">{c.partnerName}</span>
                  <span className="shrink-0 text-muted-foreground">({c.partnerCode})</span>
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
