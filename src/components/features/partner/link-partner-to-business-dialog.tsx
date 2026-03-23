'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Link2, Building2, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

// ============================================
// 型定義
// ============================================

interface PartnerCandidate {
  id: number;
  partnerCode: string;
  partnerName: string;
  partnerTier: string | null;
  partnerTierNumber: string | null;
}

interface Props {
  businessId: number;
  businessName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

// ============================================
// コンポーネント
// ============================================

export function LinkPartnerToBusinessDialog({
  businessId,
  businessName,
  open,
  onOpenChange,
  onComplete,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // --- ステップ1: 代理店選択 ---
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partnerCandidates, setPartnerCandidates] = useState<PartnerCandidate[]>([]);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<PartnerCandidate | null>(null);

  // --- ステップ2: 親代理店選択 ---
  const [parentSearch, setParentSearch] = useState('');
  const [parentCandidates, setParentCandidates] = useState<PartnerCandidate[]>([]);
  const [parentLoading, setParentLoading] = useState(false);
  const [selectedParent, setSelectedParent] = useState<PartnerCandidate | null>(null);
  const [asPrimary, setAsPrimary] = useState(false);

  // --- 追加情報 ---
  const [commissionRate, setCommissionRate] = useState('');
  const [contactPerson, setContactPerson] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const parentDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ダイアログを閉じたらリセット
  useEffect(() => {
    if (!open) {
      setPartnerSearch('');
      setPartnerCandidates([]);
      setSelectedPartner(null);
      setParentSearch('');
      setParentCandidates([]);
      setSelectedParent(null);
      setAsPrimary(false);
      setCommissionRate('');
      setContactPerson('');
    }
  }, [open]);

  // 代理店候補検索（事業に未紐付けの代理店）
  const fetchPartnerCandidates = useCallback(
    async (query: string) => {
      setPartnerLoading(true);
      try {
        const params = new URLSearchParams({ businessId: String(businessId) });
        if (query) params.set('search', query);
        params.set('unlinked', 'true');

        const res = await fetch(`/api/v1/partners/candidates/for-business-link?${params}`);
        if (!res.ok) return;
        const json = await res.json();
        setPartnerCandidates(json.data ?? []);
      } finally {
        setPartnerLoading(false);
      }
    },
    [businessId],
  );

  // 親代理店候補検索（既に事業に紐付いている代理店）
  const fetchParentCandidates = useCallback(
    async (query: string) => {
      if (!selectedPartner) return;
      setParentLoading(true);
      try {
        const params = new URLSearchParams({
          businessId: String(businessId),
          exclude: String(selectedPartner.id),
        });
        if (query) params.set('search', query);

        const res = await fetch(`/api/v1/partners/candidates?${params}`);
        if (!res.ok) return;
        const json = await res.json();
        setParentCandidates(json.data ?? []);
      } finally {
        setParentLoading(false);
      }
    },
    [businessId, selectedPartner],
  );

  // デバウンス: 代理店検索
  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPartnerCandidates(partnerSearch), 300);
    return () => clearTimeout(debounceRef.current);
  }, [partnerSearch, open, fetchPartnerCandidates]);

  // デバウンス: 親代理店検索
  useEffect(() => {
    if (!open || !selectedPartner) return;
    clearTimeout(parentDebounceRef.current);
    parentDebounceRef.current = setTimeout(() => fetchParentCandidates(parentSearch), 300);
    return () => clearTimeout(parentDebounceRef.current);
  }, [parentSearch, open, selectedPartner, fetchParentCandidates]);

  // 紐付け実行
  const handleSubmit = async () => {
    if (!selectedPartner) return;

    setSubmitting(true);
    try {
      // 1. 事業リンク作成
      const linkRes = await fetch(`/api/v1/partners/${selectedPartner.id}/business-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          linkStatus: 'active',
          commissionRate: commissionRate ? parseFloat(commissionRate) : null,
          contactPerson: contactPerson || null,
        }),
      });

      if (!linkRes.ok) {
        const errJson = await linkRes.json().catch(() => null);
        throw new Error(errJson?.error ?? '紐付けに失敗しました');
      }

      const linkData = await linkRes.json();
      const linkId = linkData.data?.id;

      // 2. 親代理店 or 1次代理店設定
      if (linkId && (selectedParent || asPrimary)) {
        const patchBody: Record<string, unknown> = {};
        if (asPrimary) {
          // 1次代理店として設定
          patchBody.businessTier = '1次代理店';
          patchBody.businessParentId = null;
        } else if (selectedParent) {
          // 親代理店を指定（tierはAPI側で自動算出）
          patchBody.businessParentId = selectedParent.id;
        }

        const patchRes = await fetch(
          `/api/v1/partners/${selectedPartner.id}/business-links/${linkId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchBody),
          },
        );
        if (!patchRes.ok) {
          // リンクは作成済み。親設定だけ失敗
          toast({ message: '紐付けは完了しましたが、親代理店の設定に失敗しました', type: 'warning' });
        }
      }

      toast({ message: `${selectedPartner.partnerName} を ${businessName} に紐付けました`, type: 'success' });

      // キャッシュ無効化
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          typeof query.queryKey[0] === 'string' &&
          (query.queryKey[0] as string).includes('/partners'),
      });

      onComplete();
      onOpenChange(false);
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : '紐付けに失敗しました', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            事業に代理店を紐付け
          </DialogTitle>
          <DialogDescription>
            <Badge variant="secondary" className="mt-1">{businessName}</Badge>
            {' '}に既存の代理店を紐付けます
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ===== ステップ1: 代理店選択 ===== */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              代理店を選択 <span className="text-destructive">*</span>
            </Label>

            {selectedPartner ? (
              <div className="flex items-center gap-2 rounded-md border p-2.5">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{selectedPartner.partnerName}</div>
                  <div className="text-xs text-muted-foreground">{selectedPartner.partnerCode}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedPartner(null);
                    setSelectedParent(null);
                    setAsPrimary(false);
                  }}
                >
                  変更
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={partnerSearch}
                    onChange={(e) => setPartnerSearch(e.target.value)}
                    placeholder="代理店名・コードで検索..."
                    className="pl-9"
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto rounded-md border">
                  {partnerLoading ? (
                    <div className="p-3 text-center text-sm text-muted-foreground">検索中...</div>
                  ) : partnerCandidates.length === 0 ? (
                    <div className="p-3 text-center text-sm text-muted-foreground">
                      {partnerSearch ? '該当する代理店がありません' : 'この事業に未紐付けの代理店がありません'}
                    </div>
                  ) : (
                    partnerCandidates.map((c) => (
                      <button
                        key={c.id}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent border-b last:border-b-0"
                        onClick={() => setSelectedPartner(c)}
                      >
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1">{c.partnerName}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{c.partnerCode}</span>
                        {c.partnerTier && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {c.partnerTier.replace('代理店', '')}
                          </Badge>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ===== ステップ2: 事業内の親代理店選択 ===== */}
          {selectedPartner && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                事業内の親代理店（任意）
              </Label>
              <p className="text-xs text-muted-foreground">
                未選択の場合は階層なしで紐付けます。1次代理店として設定することもできます。
              </p>

              {selectedParent ? (
                <div className="flex items-center gap-2 rounded-md border p-2.5">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{selectedParent.partnerName}</div>
                    <div className="text-xs text-muted-foreground">{selectedParent.partnerCode}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedParent(null)}
                  >
                    変更
                  </Button>
                </div>
              ) : asPrimary ? (
                <div className="flex items-center gap-2 rounded-md border p-2.5">
                  <Badge variant="secondary" className="text-xs">1次代理店</Badge>
                  <span className="text-sm text-muted-foreground">親なし（1次代理店として設定）</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setAsPrimary(false)}
                  >
                    変更
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={parentSearch}
                      onChange={(e) => setParentSearch(e.target.value)}
                      placeholder="親代理店を検索..."
                      className="pl-9"
                    />
                  </div>
                  <div className="max-h-[160px] overflow-y-auto rounded-md border">
                    {/* 1次代理店オプション */}
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent border-b font-medium"
                      onClick={() => { setAsPrimary(true); setSelectedParent(null); }}
                    >
                      <Badge variant="secondary" className="text-[10px] shrink-0">1次</Badge>
                      <span>親なし（1次代理店として設定）</span>
                    </button>

                    {parentLoading ? (
                      <div className="p-3 text-center text-sm text-muted-foreground">検索中...</div>
                    ) : parentCandidates.length === 0 ? (
                      <div className="p-3 text-center text-sm text-muted-foreground">
                        この事業に階層設定済みの代理店がありません
                      </div>
                    ) : (
                      parentCandidates.map((c) => (
                        <button
                          key={c.id}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent border-b last:border-b-0"
                          onClick={() => { setSelectedParent(c); setAsPrimary(false); }}
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
                          <span className="truncate flex-1">{c.partnerName}</span>
                          <span className="text-xs text-muted-foreground shrink-0">({c.partnerCode})</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== 追加情報 ===== */}
          {selectedPartner && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">手数料率（%）</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  placeholder="例: 10.00"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">担当者</Label>
                <Input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="担当者名"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {/* ===== 送信ボタン ===== */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedPartner || submitting}
            >
              <Plus className="mr-2 h-4 w-4" />
              {submitting ? '処理中...' : '紐付ける'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
