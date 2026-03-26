'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { X, Search, Loader2 } from 'lucide-react';
import type { PartnerSelectConfig } from '@/types/config';

interface Candidate {
  id: number;
  partnerCode: string;
  partnerName: string;
  partnerTier: string | null;
  partnerTierNumber: string | null;
}

interface ParentPartnerSelectFieldProps {
  id: string;
  value: number | null;
  onChange: (value: unknown) => void;
  config: PartnerSelectConfig;
  formData?: Record<string, unknown>;
  disabled?: boolean;
  placeholder?: string;
  /** 他のフィールドを更新するコールバック（partnerTier 自動セット用） */
  onSetField?: (key: string, value: unknown) => void;
}

/**
 * 階層ラベルから深さを取得するヘルパー
 */
function getTierDepth(tierLabel: string): number | null {
  const match = tierLabel.match(/^(\d+)次代理店$/);
  return match ? parseInt(match[1], 10) : null;
}

export function ParentPartnerSelectField({
  id,
  value,
  onChange,
  config,
  formData,
  disabled,
  placeholder,
  onSetField,
}: ParentPartnerSelectFieldProps) {
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // parentTierMapping が空 = N次対応モード（tier 制限なし）
  const isAutoTierMode = Object.keys(config.parentTierMapping).length === 0;

  // 旧モード: フォームの partnerTier から親の階層を決定
  const currentTier = (formData?.partnerTier as string) ?? '';
  const parentTier = isAutoTierMode ? '' : (config.parentTierMapping[currentTier] ?? '');

  // 選択済みの候補を取得（初回ロード or value変更時）
  useEffect(() => {
    if (!value) {
      setSelectedCandidate(null);
      return;
    }

    // 既にロード済みなら不要
    if (selectedCandidate?.id === value) return;

    const fetchSelected = async () => {
      try {
        const params = new URLSearchParams();
        if (!isAutoTierMode && parentTier) params.set('tier', parentTier);
        // 編集時、自身のIDを除外
        const excludeId = formData?.id as number | undefined;
        if (excludeId) params.set('exclude', String(excludeId));

        const candidates = await apiClient.get<Candidate[]>(
          `${config.candidatesEndpoint}?${params.toString()}`
        );
        const found = candidates.find((c) => c.id === value);
        if (found) setSelectedCandidate(found);
      } catch {
        // ignore
      }
    };
    if (isAutoTierMode || parentTier) fetchSelected();
  }, [value, parentTier, isAutoTierMode, config.candidatesEndpoint, selectedCandidate?.id, formData?.id]);

  // 旧モード: 階層変更時に親代理店をクリア
  useEffect(() => {
    if (isAutoTierMode) return;
    if (!parentTier && value) {
      onChange(null);
      setSelectedCandidate(null);
    }
  }, [parentTier, value, onChange, isAutoTierMode]);

  // 候補を検索
  const fetchCandidates = useCallback(
    async (query: string) => {
      if (!isAutoTierMode && !parentTier) return;
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (!isAutoTierMode && parentTier) params.set('tier', parentTier);
        if (query) params.set('search', query);
        // 編集時、自身のIDを除外
        const excludeId = formData?.id as number | undefined;
        if (excludeId) params.set('exclude', String(excludeId));

        const data = await apiClient.get<Candidate[]>(
          `${config.candidatesEndpoint}?${params.toString()}`
        );
        setCandidates(data);
      } catch {
        setCandidates([]);
      } finally {
        setIsLoading(false);
      }
    },
    [parentTier, isAutoTierMode, config.candidatesEndpoint, formData?.id],
  );

  // デバウンス検索
  const handleSearchChange = (query: string) => {
    setSearch(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCandidates(query), 300);
  };

  // ドロップダウン開閉
  const handleFocus = () => {
    setIsOpen(true);
    fetchCandidates(search);
  };

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 候補を選択
  const handleSelect = (candidate: Candidate) => {
    // 自己参照防止
    const excludeId = formData?.id as number | undefined;
    if (excludeId && candidate.id === excludeId) return;

    onChange(candidate.id);
    setSelectedCandidate(candidate);
    setIsOpen(false);
    setSearch('');

    // N次対応: 親の階層から子の階層を自動セット
    if (isAutoTierMode && onSetField && candidate.partnerTier) {
      const parentDepth = getTierDepth(candidate.partnerTier);
      if (parentDepth) {
        onSetField('partnerTier', `${parentDepth + 1}次代理店`);
      }
    }
  };

  // 選択解除
  const handleClear = () => {
    onChange(null);
    setSelectedCandidate(null);
    setSearch('');

    // N次対応: 親をクリアしたら1次代理店に戻す
    if (isAutoTierMode && onSetField) {
      onSetField('partnerTier', '1次代理店');
    }
  };

  // 旧モード: parentTier が決まらない場合は非表示
  if (!isAutoTierMode && !parentTier) return null;

  return (
    <div ref={containerRef} className="relative">
      {selectedCandidate ? (
        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="flex-1">
            {selectedCandidate.partnerTier && (
              <Badge variant="outline" className="text-[10px] mr-1.5">
                {selectedCandidate.partnerTier.replace('代理店', '')}
              </Badge>
            )}
            {selectedCandidate.partnerTierNumber && (
              <span className="text-muted-foreground mr-1">[{selectedCandidate.partnerTierNumber}]</span>
            )}
            {selectedCandidate.partnerName}
            <span className="text-muted-foreground ml-1">({selectedCandidate.partnerCode})</span>
          </span>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={handleClear}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id={id}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={handleFocus}
            placeholder={placeholder ?? (isAutoTierMode ? '親代理店を検索（未選択 = 1次代理店）' : `${parentTier}を検索...`)}
            disabled={disabled}
            className="pl-9"
          />
        </div>
      )}

      {isOpen && !selectedCandidate && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">検索中...</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              候補が見つかりません
            </div>
          ) : (
            candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                onClick={() => handleSelect(c)}
              >
                {c.partnerTier && (
                  <Badge variant="outline" className="text-[10px] mr-1.5">
                    {c.partnerTier.replace('代理店', '')}
                  </Badge>
                )}
                {c.partnerTierNumber && (
                  <span className="text-muted-foreground mr-1">[{c.partnerTierNumber}]</span>
                )}
                {c.partnerName}
                <span className="text-muted-foreground ml-1">({c.partnerCode})</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
