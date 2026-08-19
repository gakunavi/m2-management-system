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
import {
  formatRewardSetting,
  unsetHintFor,
  type RewardSlots,
  type RewardSetting,
} from '@/lib/reward-slots';
import type { CompanyShare } from '@/lib/company-share';

// ============================================
// 代理店×事業リンクの手数料設定
// ============================================
// 2種類の手数料をここで設定する。向きが逆なので画面上も明確に分ける。
//   支払手数料（RewardSlots）  … 自社 → 代理店。4スロット + 支払いタイミング特例
//   自社受取率（CompanyShare） … メーカー → 自社。ショット/ストックの2スロット
//
// 自社受取率を代理店リンクに置くのは、メーカーとの手数料が
// 「どの代理店グループ経由の案件か」で変わるため。値を持てるのは1次代理店だけで、
// 2次・3次の画面では継承元と実効値を読み取り表示する。

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
  /** 事業デフォルトの実際の値。チェックを外したスロットのフォールバック先を具体的に示す */
  businessDefaults: RewardSlots;
  currentSlots: RewardSlots | null;
  currentPaymentTiming: string | null;
  currentClosingDay: number | null;
  /** この代理店が代理店グループの頂点（1次代理店）か。false なら受取率は読み取り専用 */
  companyShareIsEditable: boolean;
  /** このリンク自身に設定されている受取率（1次代理店のみ意味を持つ） */
  currentCompanyShare: CompanyShare | null;
  /** 事業デフォルトの受取率。チェックを外したときのフォールバック先 */
  businessDefaultCompanyShare: CompanyShare;
  /** 実際に効いている受取率（事業デフォルト → 1次代理店） */
  effectiveCompanyShare: CompanyShare;
  /** 受取率の決め手になっている1次代理店名（読み取り表示用） */
  companyShareGroupPartnerName: string | null;
  onSave: (data: {
    rewardSlots: RewardSlots;
    /** 1次代理店のときだけ送る。未指定＝この画面では受取率を触っていない */
    companyShareSlots?: CompanyShare | null;
    paymentTiming: PaymentTiming | null;
    closingDay: number | null;
  }) => void;
  isSaving?: boolean;
}

export function LinkRewardSettingsDialog({
  open,
  onOpenChange,
  businessName,
  businessDefaults,
  currentSlots,
  currentPaymentTiming,
  currentClosingDay,
  companyShareIsEditable,
  currentCompanyShare,
  businessDefaultCompanyShare,
  effectiveCompanyShare,
  companyShareGroupPartnerName,
  onSave,
  isSaving,
}: Props) {
  const [slots, setSlots] = useState<RewardSlots>(currentSlots ?? {});
  const [companyShare, setCompanyShare] = useState<CompanyShare>(currentCompanyShare ?? {});
  const [useTimingOverride, setUseTimingOverride] = useState(currentPaymentTiming != null);
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>(
    (currentPaymentTiming as PaymentTiming) ?? 'same',
  );
  const [closingDay, setClosingDay] = useState<number | null>(currentClosingDay);

  // ダイアログを開くたびに現在値へリセット
  useEffect(() => {
    if (open) {
      setSlots(currentSlots ?? {});
      setCompanyShare(currentCompanyShare ?? {});
      setUseTimingOverride(currentPaymentTiming != null);
      setPaymentTiming((currentPaymentTiming as PaymentTiming) ?? 'same');
      setClosingDay(currentClosingDay);
    }
  }, [open, currentSlots, currentCompanyShare, currentPaymentTiming, currentClosingDay]);

  const updateSlot = (kind: 'shot' | 'stock', side: 'direct' | 'indirect', value: RewardSetting | undefined) => {
    setSlots((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], [side]: value },
    }));
  };

  const handleSave = () => {
    // 1次代理店以外は受取率のキー自体を送らない（API 側でも弾かれる）。
    // 全スロット未設定なら null＝「設定なし」として事業デフォルトへ戻す
    const hasAnyShare = companyShare.shot !== undefined || companyShare.stock !== undefined;
    onSave({
      rewardSlots: slots,
      ...(companyShareIsEditable ? { companyShareSlots: hasAnyShare ? companyShare : null } : {}),
      paymentTiming: useTimingOverride ? paymentTiming : null,
      closingDay: useTimingOverride && paymentTiming === 'closing' ? closingDay : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>手数料設定（{businessName}）</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            チェックを外した項目は事業デフォルトの設定にフォールバックします。
          </p>
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">担当代理店</strong>＝この代理店が担当する案件で
            この代理店へ支払う分。
            <strong className="text-foreground">上位代理店</strong>＝この代理店の
            <strong className="text-foreground">配下代理店</strong>が担当した案件で、
            上位であるこの代理店へ支払う分。
          </p>
          <p className="text-xs text-muted-foreground">
            手数料は案件の代理店から最上位まで階層を遡り、料率が設定されている段の分を
            全て合計します。該当欄が未記入の場合はもう一方の欄の値を使い、
            どちらも未記入なら0として上位へ遡ります。
          </p>

          <div>
            <h4 className="text-sm font-medium mb-1">ショット手数料（契約確定時に1回）</h4>
            <div className="pl-2">
              <RewardSettingInput
                label="担当代理店"
                value={slots.shot?.direct}
                onChange={(v) => updateSlot('shot', 'direct', v)}
                unsetHint={unsetHintFor(businessDefaults.shot?.direct)}
              />
              <RewardSettingInput
                label="上位代理店"
                value={slots.shot?.indirect}
                onChange={(v) => updateSlot('shot', 'indirect', v)}
                unsetHint={unsetHintFor(businessDefaults.shot?.indirect)}
              />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-1">ストック手数料（契約継続中は毎月）</h4>
            <div className="pl-2">
              <RewardSettingInput
                label="担当代理店"
                value={slots.stock?.direct}
                onChange={(v) => updateSlot('stock', 'direct', v)}
                unsetHint={unsetHintFor(businessDefaults.stock?.direct)}
              />
              <RewardSettingInput
                label="上位代理店"
                value={slots.stock?.indirect}
                onChange={(v) => updateSlot('stock', 'indirect', v)}
                unsetHint={unsetHintFor(businessDefaults.stock?.indirect)}
              />
            </div>
          </div>

          {/* --- 自社受取率（メーカー → 自社）--- */}
          <div className="border-t pt-3">
            <h4 className="text-sm font-medium mb-1">自社受取率（メーカーから自社に入る販売手数料）</h4>
            <p className="text-xs text-muted-foreground mb-2">
              代理店へ<strong className="text-foreground">支払う</strong>額ではなく、
              この代理店グループ経由の案件で自社が
              <strong className="text-foreground">受け取る</strong>率です。
              メーカーとの手数料は代理店グループ単位で決まるため、
              <strong className="text-foreground">1次代理店にのみ設定</strong>し、
              配下の2次・3次代理店が担当した案件にも同じ値が適用されます。
            </p>
            {companyShareIsEditable ? (
              <div className="pl-2">
                <RewardSettingInput
                  label="ショット"
                  value={companyShare.shot}
                  onChange={(v) => setCompanyShare((prev) => ({ ...prev, shot: v }))}
                  unsetHint={unsetHintFor(businessDefaultCompanyShare.shot)}
                />
                <RewardSettingInput
                  label="ストック"
                  value={companyShare.stock}
                  onChange={(v) => setCompanyShare((prev) => ({ ...prev, stock: v }))}
                  unsetHint={unsetHintFor(businessDefaultCompanyShare.stock)}
                />
              </div>
            ) : (
              <div className="pl-2 text-sm text-muted-foreground space-y-1">
                <p>
                  この代理店は1次代理店ではないため、ここでは編集できません
                  {companyShareGroupPartnerName && `（1次代理店: ${companyShareGroupPartnerName}）`}。
                </p>
                <p>
                  適用中: ショット{' '}
                  <strong className="text-foreground">
                    {effectiveCompanyShare.shot ? formatRewardSetting(effectiveCompanyShare.shot) : '未設定'}
                  </strong>
                  {' / '}ストック{' '}
                  <strong className="text-foreground">
                    {effectiveCompanyShare.stock ? formatRewardSetting(effectiveCompanyShare.stock) : '未設定'}
                  </strong>
                </p>
              </div>
            )}
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

