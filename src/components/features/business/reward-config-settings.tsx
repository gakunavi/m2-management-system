'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { RewardSettingInput } from './reward-setting-input';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';
import type { RewardSlots, RewardSetting } from '@/lib/reward-slots';
import type { CompanyShareConfig } from '@/lib/company-share';

// ============================================
// 型定義
// ============================================

type PaymentTiming = 'same' | 'next' | 'next2' | 'closing';

interface RewardConfig {
  defaults: RewardSlots;
  shotBaseField?: string | null;
  stockBaseField?: string | null;
  taxRate: number;
  paymentTiming: PaymentTiming;
  closingDay?: number | null;
  companyShare?: CompanyShareConfig;
}

interface BusinessData {
  id: number;
  version: number;
  businessConfig: {
    projectFields?: ProjectFieldDefinition[];
    rewardConfig?: RewardConfig | null;
  } | null;
}

interface Props {
  entityId: number;
}

const DEFAULT_CONFIG: RewardConfig = {
  defaults: {},
  shotBaseField: null,
  stockBaseField: null,
  taxRate: 10,
  paymentTiming: 'same',
  closingDay: null,
  companyShare: {},
};

const PAYMENT_TIMING_LABELS: Record<PaymentTiming, string> = {
  same: '当月（確定と同じ月）',
  next: '翌月',
  next2: '翌々月',
  closing: '締め日基準',
};

// ============================================
// メインコンポーネント
// ============================================

export function RewardConfigSettings({ entityId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<RewardConfig>(DEFAULT_CONFIG);

  const { data: businessData, isLoading } = useQuery({
    queryKey: ['business', entityId],
    queryFn: () => apiClient.get<BusinessData>(`/businesses/${entityId}`),
    enabled: !!entityId,
  });

  useEffect(() => {
    if (!businessData) return;
    const rc = businessData.businessConfig?.rewardConfig;
    setConfig(rc ? { ...DEFAULT_CONFIG, ...rc } : DEFAULT_CONFIG);
  }, [businessData]);

  const projectFields: ProjectFieldDefinition[] = businessData?.businessConfig?.projectFields ?? [];
  const numberFields = projectFields.filter((f) => f.type === 'number' || f.type === 'formula');

  const updateSlot = (kind: 'shot' | 'stock', side: 'direct' | 'indirect', value: RewardSetting | undefined) => {
    setConfig((prev) => ({
      ...prev,
      defaults: {
        ...prev.defaults,
        [kind]: { ...prev.defaults[kind], [side]: value },
      },
    }));
  };

  const updateCompanyShare = (kind: 'shot' | 'stock', value: RewardSetting | undefined) => {
    setConfig((prev) => ({
      ...prev,
      companyShare: { ...prev.companyShare, [kind]: value },
    }));
  };

  const updateCompanyShareBaseField = (kind: 'shot' | 'stock', field: string | null) => {
    setConfig((prev) => ({
      ...prev,
      companyShare: {
        ...prev.companyShare,
        [kind === 'shot' ? 'shotBaseField' : 'stockBaseField']: field,
      },
    }));
  };

  const companyShare = config.companyShare ?? {};

  const handleSave = async () => {
    if (!businessData) return;
    setSaving(true);
    try {
      await apiClient.patch(`/businesses/${entityId}`, {
        businessConfig: { rewardConfig: config },
        version: businessData.version,
      });
      queryClient.invalidateQueries({ queryKey: ['business', entityId] });
      toast({ message: '代理店報酬設定を保存しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '保存に失敗しました';
      toast({ message: msg, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">読み込み中...</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        代理店への報酬の事業デフォルトを設定します。代理店ごと・案件ごとに個別の上書きが可能です。
      </p>

      <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
        <p>
          <strong className="text-foreground">直紹介</strong>: 案件に紐づく担当代理店へ支払う分。
          通常はこちらに設定します。
        </p>
        <p>
          <strong className="text-foreground">間接（上位代理店）</strong>: 担当代理店の
          <strong className="text-foreground">親代理店</strong>へ支払う分（代理店階層の二次報酬）。
          親代理店が設定されていない場合は発生しません。
        </p>
        <p>
          ダッシュボードの「代理店報酬」で直紹介が¥0・間接だけに金額が出ている場合、
          直紹介に入れるべき料率が間接の欄に入っている可能性があります。
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium mb-2">ショット報酬（契約確定時に1回）</h4>
          <div className="pl-2 space-y-1">
            <RewardSettingInput
              label="直紹介"
              value={config.defaults.shot?.direct}
              onChange={(v) => updateSlot('shot', 'direct', v)}
            />
            <RewardSettingInput
              label="間接（上位代理店）"
              value={config.defaults.shot?.indirect}
              onChange={(v) => updateSlot('shot', 'indirect', v)}
            />
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">ストック報酬（契約継続中は毎月）</h4>
          <div className="pl-2 space-y-1">
            <RewardSettingInput
              label="直紹介"
              value={config.defaults.stock?.direct}
              onChange={(v) => updateSlot('stock', 'direct', v)}
            />
            <RewardSettingInput
              label="間接（上位代理店）"
              value={config.defaults.stock?.indirect}
              onChange={(v) => updateSlot('stock', 'indirect', v)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <label className="text-sm font-medium block mb-1">ショット報酬の基準金額フィールド</label>
            <select
              className="border rounded px-2 py-1 text-sm w-full"
              value={config.shotBaseField ?? ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, shotBaseField: e.target.value || null }))}
            >
              <option value="">（未設定＝プライマリKPIを使用）</option>
              {numberFields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">ストック報酬の基準金額フィールド（月額）</label>
            <select
              className="border rounded px-2 py-1 text-sm w-full"
              value={config.stockBaseField ?? ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, stockBaseField: e.target.value || null }))}
            >
              <option value="">未設定</option>
              {numberFields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">消費税率（%）</label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="border rounded px-2 py-1 text-sm w-full"
              value={config.taxRate}
              onChange={(e) => setConfig((prev) => ({ ...prev, taxRate: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">支払い対象月</label>
            <select
              className="border rounded px-2 py-1 text-sm w-full"
              value={config.paymentTiming}
              onChange={(e) => setConfig((prev) => ({ ...prev, paymentTiming: e.target.value as PaymentTiming }))}
            >
              {Object.entries(PAYMENT_TIMING_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {config.paymentTiming === 'closing' && (
          <div>
            <label className="text-sm font-medium block mb-1">締め日（この日までの確定分は当月払い）</label>
            <input
              type="number"
              min="1"
              max="31"
              className="border rounded px-2 py-1 text-sm w-32"
              value={config.closingDay ?? ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, closingDay: e.target.value ? Number(e.target.value) : null }))}
            />
            <span className="text-sm text-muted-foreground ml-2">日締め</span>
          </div>
        )}
      </div>

      {/* ── 自社取り分（レベニューシェア）── */}
      <div className="space-y-4 border-t pt-6">
        <div>
          <h4 className="text-sm font-medium">自社取り分（レベニューシェア）</h4>
          <p className="text-xs text-muted-foreground mt-1">
            取扱高（顧客が支払う総額）のうち、自社の売上になる割合を設定します。
            ダッシュボードの「自社売上」「粗利（自社売上 − 代理店報酬）」はこの設定で計算されます。
            案件ごとの個別条件は案件詳細の「報酬」タブで上書きできます。
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            未設定のままだと自社売上は計上されず、ダッシュボードに収益カードは表示されません。
          </p>
        </div>

        <div className="pl-2 space-y-1">
          <RewardSettingInput
            label="ショット（1回）"
            value={companyShare.shot}
            onChange={(v) => updateCompanyShare('shot', v)}
            unsetHint="未設定（自社売上に計上しません）"
          />
          <RewardSettingInput
            label="ストック（毎月）"
            value={companyShare.stock}
            onChange={(v) => updateCompanyShare('stock', v)}
            unsetHint="未設定（自社売上に計上しません）"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">取り分の基準金額フィールド（ショット）</label>
            <select
              className="border rounded px-2 py-1 text-sm w-full"
              value={companyShare.shotBaseField ?? ''}
              onChange={(e) => updateCompanyShareBaseField('shot', e.target.value || null)}
            >
              <option value="">（未設定＝ショット報酬の基準と同じ）</option>
              {numberFields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">取り分の基準金額フィールド（ストック）</label>
            <select
              className="border rounded px-2 py-1 text-sm w-full"
              value={companyShare.stockBaseField ?? ''}
              onChange={(e) => updateCompanyShareBaseField('stock', e.target.value || null)}
            >
              <option value="">（未設定＝ストック報酬の基準と同じ）</option>
              {numberFields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          率（%）で設定する場合、基準フィールドが金額であることを確認してください。
          台数などの数量フィールドを基準にすると、率をかけた結果が金額になりません。
          その場合は固定額（円）を選ぶか、金額フィールドを基準に指定してください。
        </p>
      </div>

      {isAdmin && (
        <Button onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
      )}
    </div>
  );
}
