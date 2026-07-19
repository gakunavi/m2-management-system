'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RewardSettingInput } from '@/components/features/business/reward-setting-input';
import type { RewardSlots, RewardSetting } from '@/lib/reward-slots';

// ============================================
// 代理店×事業リンクの報酬設定（4スロット + 支払いタイミング特例）
// ============================================
// 事業デフォルトへの上書き。チェックを外したスロットは事業デフォルトにフォールバックする。

type PaymentTiming = 'same' | 'next' | 'next2' | 'closing';

const PAYMENT_TIMING_LABELS: Record<PaymentTiming, string> = {
  same: '当月（確定と同じ月）',
  next: '翌月',
  next2: '翌々月',
  closing: '締め日基準',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkId: number;
  businessName: string;
  currentSlots: RewardSlots | null;
  currentPaymentTiming: string | null;
  currentClosingDay: number | null;
  onSave: (data: {
    rewardSlots: RewardSlots;
    paymentTiming: PaymentTiming | null;
    closingDay: number | null;
  }) => void;
  isSaving?: boolean;
}

export function LinkRewardSettingsDialog({
  open,
  onOpenChange,
  businessName,
  currentSlots,
  currentPaymentTiming,
  currentClosingDay,
  onSave,
  isSaving,
}: Props) {
  const [slots, setSlots] = useState<RewardSlots>(currentSlots ?? {});
  const [useTimingOverride, setUseTimingOverride] = useState(currentPaymentTiming != null);
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>(
    (currentPaymentTiming as PaymentTiming) ?? 'same',
  );
  const [closingDay, setClosingDay] = useState<number | null>(currentClosingDay);

  // ダイアログを開くたびに現在値へリセット
  useEffect(() => {
    if (open) {
      setSlots(currentSlots ?? {});
      setUseTimingOverride(currentPaymentTiming != null);
      setPaymentTiming((currentPaymentTiming as PaymentTiming) ?? 'same');
      setClosingDay(currentClosingDay);
    }
  }, [open, currentSlots, currentPaymentTiming, currentClosingDay]);

  const updateSlot = (kind: 'shot' | 'stock', side: 'direct' | 'indirect', value: RewardSetting | undefined) => {
    setSlots((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], [side]: value },
    }));
  };

  const handleSave = () => {
    onSave({
      rewardSlots: slots,
      paymentTiming: useTimingOverride ? paymentTiming : null,
      closingDay: useTimingOverride && paymentTiming === 'closing' ? closingDay : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>報酬設定（{businessName}）</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            チェックを外した項目は事業デフォルトの設定にフォールバックします。
          </p>

          <div>
            <h4 className="text-sm font-medium mb-1">ショット報酬（契約確定時に1回）</h4>
            <div className="pl-2">
              <RewardSettingInput
                label="直紹介"
                value={slots.shot?.direct}
                onChange={(v) => updateSlot('shot', 'direct', v)}
                unsetHint="事業デフォルトを使用"
              />
              <RewardSettingInput
                label="間接（上位代理店）"
                value={slots.shot?.indirect}
                onChange={(v) => updateSlot('shot', 'indirect', v)}
                unsetHint="事業デフォルトを使用"
              />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-1">ストック報酬（契約継続中は毎月）</h4>
            <div className="pl-2">
              <RewardSettingInput
                label="直紹介"
                value={slots.stock?.direct}
                onChange={(v) => updateSlot('stock', 'direct', v)}
                unsetHint="事業デフォルトを使用"
              />
              <RewardSettingInput
                label="間接（上位代理店）"
                value={slots.stock?.indirect}
                onChange={(v) => updateSlot('stock', 'indirect', v)}
                unsetHint="事業デフォルトを使用"
              />
            </div>
          </div>

          <div className="border-t pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useTimingOverride}
                onChange={(e) => setUseTimingOverride(e.target.checked)}
              />
              この代理店だけ支払い対象月を変更する
            </label>
            {useTimingOverride && (
              <div className="pl-6 mt-2 space-y-2">
                <select
                  className="border rounded px-2 py-1 text-sm w-full"
                  value={paymentTiming}
                  onChange={(e) => setPaymentTiming(e.target.value as PaymentTiming)}
                >
                  {Object.entries(PAYMENT_TIMING_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {paymentTiming === 'closing' && (
                  <div>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className="border rounded px-2 py-1 text-sm w-24"
                      value={closingDay ?? ''}
                      onChange={(e) => setClosingDay(e.target.value ? Number(e.target.value) : null)}
                    />
                    <span className="text-sm text-muted-foreground ml-2">日締め</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

