'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { RewardSettingInput } from '@/components/features/business/reward-setting-input';
import { isoToJstDateInput, jstDateInputToIso } from '@/lib/jst-date';
import type { RewardSlots, RewardSetting } from '@/lib/reward-slots';

// ============================================
// 案件の代理店報酬（収益確定・解約日・案件別上書き）
// ============================================
// 収益確定日はステータス変更で自動セットされる（ラッチ）。ここでは
// 誤セットの訂正・過去日での確定・手動リセットのみを扱う。
//
// 日付は JST 基準で扱う（計算エンジンの toJstMonthDay と揃える）。UTC素朴処理だと
// JST早朝帯に確定した案件で計上月がズレるため、jst-date の共有ヘルパーを使う。

interface ProjectData {
  id: number;
  version: number;
  revenueConfirmedAt: string | null;
  cancelledAt: string | null;
  rewardOverride: RewardSlots | null;
}

interface Props {
  entityId: number;
}

const toDateInputValue = isoToJstDateInput;
const dateInputToIso = jstDateInputToIso;

export function ProjectRewardTab({ entityId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [revenueConfirmedDate, setRevenueConfirmedDate] = useState('');
  const [cancelledDate, setCancelledDate] = useState('');
  const [override, setOverride] = useState<RewardSlots>({});

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', String(entityId)],
    queryFn: () => apiClient.get<ProjectData>(`/projects/${entityId}`),
    enabled: !!entityId,
  });

  useEffect(() => {
    if (!project) return;
    setRevenueConfirmedDate(toDateInputValue(project.revenueConfirmedAt));
    setCancelledDate(toDateInputValue(project.cancelledAt));
    setOverride(project.rewardOverride ?? {});
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!project) throw new Error('データが読み込まれていません');
      return apiClient.patch(`/projects/${entityId}`, { ...data, version: project.version });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', String(entityId)] });
      toast({ message: '報酬設定を保存しました', type: 'success' });
    },
    onError: (error: Error) => {
      toast({ message: error.message, type: 'error' });
    },
  });

  const isDirty =
    project &&
    (toDateInputValue(project.revenueConfirmedAt) !== revenueConfirmedDate ||
      toDateInputValue(project.cancelledAt) !== cancelledDate ||
      JSON.stringify(project.rewardOverride ?? {}) !== JSON.stringify(override));

  const handleSave = () => {
    updateMutation.mutate({
      revenueConfirmedAt: dateInputToIso(revenueConfirmedDate),
      cancelledAt: dateInputToIso(cancelledDate),
      rewardOverride: Object.keys(override).length > 0 ? override : null,
    });
  };

  const updateSlot = (kind: 'shot' | 'stock', side: 'direct' | 'indirect', value: RewardSetting | undefined) => {
    setOverride((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], [side]: value },
    }));
  };

  if (isLoading || !project) {
    return <div className="text-sm text-muted-foreground py-4">読み込み中...</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h4 className="text-sm font-medium mb-1">収益確定日</h4>
        <p className="text-xs text-muted-foreground mb-2">
          営業ステータスが「収益確定」に設定されているステータスへ変わると自動でセットされます。
          誤って確定した場合や、過去分を手動で登録する場合はここで訂正できます。
        </p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm"
            value={revenueConfirmedDate}
            onChange={(e) => setRevenueConfirmedDate(e.target.value)}
          />
          {revenueConfirmedDate && (
            <Button variant="outline" size="sm" onClick={() => setRevenueConfirmedDate('')}>
              リセット（未確定に戻す）
            </Button>
          )}
        </div>
        {!revenueConfirmedDate && (
          <p className="text-xs text-muted-foreground mt-1">未確定（報酬の計算対象外）</p>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium mb-1">解約日</h4>
        <p className="text-xs text-muted-foreground mb-2">
          設定すると、ストック報酬（毎月発生）はこの月までで停止します。
        </p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm"
            value={cancelledDate}
            onChange={(e) => setCancelledDate(e.target.value)}
          />
          {cancelledDate && (
            <Button variant="outline" size="sm" onClick={() => setCancelledDate('')}>
              クリア（継続中に戻す）
            </Button>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-1">この案件だけの報酬上書き</h4>
        <p className="text-xs text-muted-foreground mb-2">
          チェックを外した項目は、代理店リンク設定・事業デフォルトの順にフォールバックします。
        </p>
        <div className="pl-2">
          <div className="text-xs font-medium text-muted-foreground mb-0.5">ショット報酬</div>
          <RewardSettingInput
            label="直紹介"
            value={override.shot?.direct}
            onChange={(v) => updateSlot('shot', 'direct', v)}
            unsetHint="リンク/事業デフォルトを使用"
          />
          <RewardSettingInput
            label="間接（上位代理店）"
            value={override.shot?.indirect}
            onChange={(v) => updateSlot('shot', 'indirect', v)}
            unsetHint="リンク/事業デフォルトを使用"
          />
          <div className="text-xs font-medium text-muted-foreground mb-0.5 mt-2">ストック報酬</div>
          <RewardSettingInput
            label="直紹介"
            value={override.stock?.direct}
            onChange={(v) => updateSlot('stock', 'direct', v)}
            unsetHint="リンク/事業デフォルトを使用"
          />
          <RewardSettingInput
            label="間接（上位代理店）"
            value={override.stock?.indirect}
            onChange={(v) => updateSlot('stock', 'indirect', v)}
            unsetHint="リンク/事業デフォルトを使用"
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={!isDirty || updateMutation.isPending}>
        {updateMutation.isPending ? '保存中...' : '保存'}
      </Button>
    </div>
  );
}
