'use client';

import type { RewardSetting, RewardType } from '@/lib/reward-slots';

// ============================================
// 報酬1件（率/固定額）の入力コントロール
// ============================================
// 事業デフォルト設定・代理店リンク別上書き・案件別上書きの
// いずれの画面でも共通で使う。

interface Props {
  label: string;
  value: RewardSetting | undefined;
  onChange: (next: RewardSetting | undefined) => void;
  /** 上書き画面向け: チェックを外すと「未設定＝上位層にフォールバック」を意味することを示す */
  unsetHint?: string;
}

export function RewardSettingInput({ label, value, onChange, unsetHint }: Props) {
  const enabled = value !== undefined;
  const type: RewardType = value?.type ?? 'rate';
  const rawValue = value?.value ?? 0;

  return (
    <div className="flex items-center gap-2 py-1.5">
      <label className="flex items-center gap-2 w-36 shrink-0 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            if (e.target.checked) {
              onChange({ type: 'rate', value: 0 });
            } else {
              onChange(undefined);
            }
          }}
        />
        {label}
      </label>
      {enabled ? (
        <>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={type}
            onChange={(e) => onChange({ type: e.target.value as RewardType, value: rawValue })}
          >
            <option value="rate">率（%）</option>
            <option value="fixed">固定額（円）</option>
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            className="border rounded px-2 py-1 text-sm w-28"
            value={rawValue}
            onChange={(e) => onChange({ type, value: Number(e.target.value) })}
          />
          <span className="text-sm text-muted-foreground">{type === 'rate' ? '%' : '円'}</span>
        </>
      ) : (
        unsetHint && <span className="text-xs text-muted-foreground">{unsetHint}</span>
      )}
    </div>
  );
}
