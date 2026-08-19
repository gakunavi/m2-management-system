'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { RewardSettingInput } from '@/components/features/business/reward-setting-input';
import { useAuth } from '@/hooks/use-auth';
import { isoToJstDateInput, jstDateInputToIso } from '@/lib/jst-date';
import type { RewardSlots, RewardSetting } from '@/lib/reward-slots';
import type { CompanyShare } from '@/lib/company-share';
import type { RewardSnapshot } from '@/lib/reward-snapshot';

// ============================================
// 案件の代理店支払手数料（収益確定・解約日・案件別上書き）
// ============================================
// 収益確定日はステータス変更で自動セットされる（ラッチ）。ここでは
// 誤セットの訂正・過去日での確定・手動リセットのみを扱う。
//
// 収益確定と同時に、その時点の実効料率が案件へ凍結される（rewardSnapshot）。
// 凍結後はマスタや案件別上書きを変えても金額が動かないため、確定済み案件の
// 料率訂正はスナップショットを直接編集する（管理者のみ）。
//
// 日付は JST 基準で扱う（計算エンジンの toJstMonthDay と揃える）。UTC素朴処理だと
// JST早朝帯に確定した案件で計上月がズレるため、jst-date の共有ヘルパーを使う。

interface ProjectData {
  id: number;
  version: number;
  revenueConfirmedAt: string | null;
  cancelledAt: string | null;
  rewardOverride: RewardSlots | null;
  companyShareOverride: CompanyShare | null;
  /** 収益確定時に凍結された実効料率。null＝未凍結（マスタから毎回計算） */
  rewardSnapshot: RewardSnapshot | null;
  /** 凍結値の代理店IDに対応する代理店名（表示用） */
  rewardSnapshotPartnerNames: Record<number, string>;
  /** この案件を含む確定済み（発行済み）の支払明細があるか */
  hasConfirmedRewardStatement: boolean;
  // 収益（確認用の実効値。API が計算して返す）
  companyShareShotLabel: string | null;
  companyShareStockLabel: string | null;
  companyRevenueShot: number | null;
  companyRevenueStock: number | null;
  grossProfitShot: number | null;
  grossProfitStock: number | null;
  grossMarginShot: number | null;
  grossMarginStock: number | null;
  rewardShotDirect: number | null;
  rewardShotIndirect: number | null;
  rewardStockDirect: number | null;
  rewardStockIndirect: number | null;
}

/**
 * capturedAt / capturedBy はサーバが打ち直すので比較・送信の対象から外す。
 * 含めたまま比較すると、開いただけで「変更あり」と判定されてしまう。
 */
function stripSnapshotMeta(s: RewardSnapshot) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で2キーを落とすためのプレースホルダ
  const { capturedAt, capturedBy, ...rest } = s;
  return rest;
}

function snapshotIsDirty(saved: RewardSnapshot | null, edited: RewardSnapshot | null): boolean {
  if (!saved && !edited) return false;
  if (!saved || !edited) return true;
  return JSON.stringify(stripSnapshotMeta(saved)) !== JSON.stringify(stripSnapshotMeta(edited));
}

const yen = (v: number | null) => (v != null ? `¥${v.toLocaleString()}` : '-');
const pct = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : '-');

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
  const [shareOverride, setShareOverride] = useState<CompanyShare>({});
  // 確定済み案件の料率訂正（管理者のみ）。null は「凍結されていない」を表す
  const [snapshot, setSnapshot] = useState<RewardSnapshot | null>(null);
  const { isAdmin } = useAuth();

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
    setShareOverride(project.companyShareOverride ?? {});
    setSnapshot(project.rewardSnapshot ?? null);
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!project) throw new Error('データが読み込まれていません');
      return apiClient.patch(`/projects/${entityId}`, { ...data, version: project.version });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', String(entityId)] });
      toast({ message: '手数料設定を保存しました', type: 'success' });
    },
    onError: (error: Error) => {
      toast({ message: error.message, type: 'error' });
    },
  });

  const isDirty =
    project &&
    (toDateInputValue(project.revenueConfirmedAt) !== revenueConfirmedDate ||
      toDateInputValue(project.cancelledAt) !== cancelledDate ||
      JSON.stringify(project.rewardOverride ?? {}) !== JSON.stringify(override) ||
      JSON.stringify(project.companyShareOverride ?? {}) !== JSON.stringify(shareOverride) ||
      snapshotIsDirty(project.rewardSnapshot, snapshot));

  const handleSave = () => {
    updateMutation.mutate({
      revenueConfirmedAt: dateInputToIso(revenueConfirmedDate),
      cancelledAt: dateInputToIso(cancelledDate),
      rewardOverride: Object.keys(override).length > 0 ? override : null,
      companyShareOverride: Object.keys(shareOverride).length > 0 ? shareOverride : null,
      // 凍結値を触っていないときはキー自体を送らない（送ると capturedBy が
      // 'manual' に書き換わり、確定時の自動凍結だったことが分からなくなる）
      ...(project && snapshotIsDirty(project.rewardSnapshot, snapshot)
        ? { rewardSnapshot: snapshot ? stripSnapshotMeta(snapshot) : null }
        : {}),
    });
  };

  /** 凍結値の1スロットを書き換える（管理者の訂正） */
  const updateSnapshotNode = (
    partnerId: number,
    kind: 'shot' | 'stock',
    value: RewardSetting | undefined,
  ) => {
    setSnapshot((prev) =>
      prev
        ? {
            ...prev,
            chain: prev.chain.map((n) =>
              n.partnerId === partnerId ? { ...n, [kind]: value } : n,
            ),
          }
        : prev,
    );
  };

  const updateSnapshotShare = (kind: 'shot' | 'stock', value: RewardSetting | undefined) => {
    setSnapshot((prev) =>
      prev ? { ...prev, companyShare: { ...prev.companyShare, [kind]: value } } : prev,
    );
  };

  const updateSlot = (kind: 'shot' | 'stock', side: 'direct' | 'indirect', value: RewardSetting | undefined) => {
    setOverride((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], [side]: value },
    }));
  };

  const updateShare = (kind: 'shot' | 'stock', value: RewardSetting | undefined) => {
    setShareOverride((prev) => ({ ...prev, [kind]: value }));
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
          設定すると、ストック手数料（毎月発生）はこの月までで停止します。
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

      {snapshot && (
        <div className="border rounded-md p-3 bg-muted/40">
          <h4 className="text-sm font-medium mb-1">確定済み手数料（凍結中）</h4>
          <p className="text-xs text-muted-foreground mb-2">
            この案件は収益確定時（
            {new Date(snapshot.capturedAt).toLocaleDateString('ja-JP')}
            {snapshot.capturedBy === 'backfill' && '・移行時に一括付与'}
            {snapshot.capturedBy === 'manual' && '・手動訂正済み'}
            ）の料率で固定されています。事業マスタや代理店の料率を改定しても、
            この案件の金額は変わりません。下の「この案件だけの上書き」も、
            凍結中は金額に影響しません。
          </p>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground mb-2">
              訂正できるのは管理者のみです。
            </p>
          )}
          {isAdmin && project.hasConfirmedRewardStatement && (
            <p className="text-xs text-amber-700 dark:text-amber-500 mb-2">
              ⚠️ この案件は既に確定済みの支払明細に含まれています。ここで料率を訂正しても
              発行済みの明細書は書き換わらないため、差額は次月以降の明細で調整してください。
            </p>
          )}

          <div className="pl-2">
            <div className="text-xs font-medium text-muted-foreground mb-0.5">
              自社受取率（メーカーから自社に入る販売手数料）
            </div>
            <RewardSettingInput
              label="ショット"
              value={snapshot.companyShare.shot}
              onChange={(v) => updateSnapshotShare('shot', v)}
              unsetHint="受取なし（自社売上に計上しません）"
              disabled={!isAdmin}
            />
            <RewardSettingInput
              label="ストック"
              value={snapshot.companyShare.stock}
              onChange={(v) => updateSnapshotShare('stock', v)}
              unsetHint="受取なし（自社売上に計上しません）"
              disabled={!isAdmin}
            />

            {snapshot.chain.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-2">
                代理店が紐づいていない案件のため、支払手数料はありません。
              </p>
            ) : (
              snapshot.chain.map((node) => (
                <div key={node.partnerId} className="mt-2">
                  <div className="text-xs font-medium text-muted-foreground mb-0.5">
                    代理店支払手数料 ―{' '}
                    {project.rewardSnapshotPartnerNames[node.partnerId] ?? `代理店ID ${node.partnerId}`}
                    <span className="ml-1 font-normal">
                      （{node.isAssigned ? '担当代理店' : '上位代理店'}）
                    </span>
                  </div>
                  <RewardSettingInput
                    label="ショット"
                    value={node.shot}
                    onChange={(v) => updateSnapshotNode(node.partnerId, 'shot', v)}
                    unsetHint="この代理店には支払いません"
                    disabled={!isAdmin}
                  />
                  <RewardSettingInput
                    label="ストック"
                    value={node.stock}
                    onChange={(v) => updateSnapshotNode(node.partnerId, 'stock', v)}
                    unsetHint="この代理店には支払いません"
                    disabled={!isAdmin}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium mb-1">この案件だけの手数料上書き</h4>
        <p className="text-xs text-muted-foreground mb-2">
          チェックを外した項目は、代理店リンク設定・事業デフォルトの順にフォールバックします。
          {snapshot && (
            <>
              {' '}
              <strong className="text-foreground">
                この案件は凍結中のため、ここの設定は金額に反映されません
              </strong>
              （訂正は上の「確定済み手数料」で行ってください）。
            </>
          )}
        </p>
        <div className="pl-2">
          <div className="text-xs font-medium text-muted-foreground mb-0.5">ショット手数料</div>
          <RewardSettingInput
            label="担当代理店"
            value={override.shot?.direct}
            onChange={(v) => updateSlot('shot', 'direct', v)}
            unsetHint="リンク/事業デフォルトを使用"
          />
          <RewardSettingInput
            label="上位代理店"
            value={override.shot?.indirect}
            onChange={(v) => updateSlot('shot', 'indirect', v)}
            unsetHint="リンク/事業デフォルトを使用"
          />
          <div className="text-xs font-medium text-muted-foreground mb-0.5 mt-2">ストック手数料</div>
          <RewardSettingInput
            label="担当代理店"
            value={override.stock?.direct}
            onChange={(v) => updateSlot('stock', 'direct', v)}
            unsetHint="リンク/事業デフォルトを使用"
          />
          <RewardSettingInput
            label="上位代理店"
            value={override.stock?.indirect}
            onChange={(v) => updateSlot('stock', 'indirect', v)}
            unsetHint="リンク/事業デフォルトを使用"
          />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-1">この案件だけの自社取り分上書き</h4>
        <p className="text-xs text-muted-foreground mb-2">
          取扱高のうち自社の売上になる割合です。チェックを外すと
          1次代理店（代理店グループ）の設定 → 事業マスタの「自社取り分」設定の順に
          フォールバックします。（例: 通常は販売額の20%だがこの契約だけ15%）
          {snapshot && (
            <>
              {' '}
              <strong className="text-foreground">
                この案件は凍結中のため、ここの設定は金額に反映されません。
              </strong>
            </>
          )}
        </p>
        <div className="pl-2">
          <RewardSettingInput
            label="ショット（1回）"
            value={shareOverride.shot}
            onChange={(v) => updateShare('shot', v)}
            unsetHint="事業デフォルトを使用"
          />
          <RewardSettingInput
            label="ストック（毎月）"
            value={shareOverride.stock}
            onChange={(v) => updateShare('stock', v)}
            unsetHint="事業デフォルトを使用"
          />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-1">この案件の収益（保存済みの内容で計算）</h4>
        <p className="text-xs text-muted-foreground mb-2">
          粗利 = 自社売上 − 代理店支払手数料（担当代理店＋上位代理店、税抜）。
          金額は売上KPIの対象ステータス・計上月に合致する案件でのみ表示されます
          （合致しない場合は「-」）。
        </p>
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal py-1 pr-6"> </th>
                <th className="text-right font-normal py-1 pr-6">ショット</th>
                <th className="text-right font-normal py-1">ストック（月額）</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="py-1 pr-6">自社取り分</td>
                <td className="py-1 pr-6 text-right">{project.companyShareShotLabel ?? '-'}</td>
                <td className="py-1 text-right">{project.companyShareStockLabel ?? '-'}</td>
              </tr>
              <tr className="border-t">
                <td className="py-1 pr-6">自社売上</td>
                <td className="py-1 pr-6 text-right">{yen(project.companyRevenueShot)}</td>
                <td className="py-1 text-right">{yen(project.companyRevenueStock)}</td>
              </tr>
              <tr className="border-t">
                <td className="py-1 pr-6">代理店支払手数料（担当代理店）</td>
                <td className="py-1 pr-6 text-right">{yen(project.rewardShotDirect)}</td>
                <td className="py-1 text-right">{yen(project.rewardStockDirect)}</td>
              </tr>
              <tr className="border-t">
                <td className="py-1 pr-6">代理店支払手数料（上位代理店）</td>
                <td className="py-1 pr-6 text-right">{yen(project.rewardShotIndirect)}</td>
                <td className="py-1 text-right">{yen(project.rewardStockIndirect)}</td>
              </tr>
              <tr className="border-t font-medium">
                <td className="py-1 pr-6">粗利</td>
                <td className="py-1 pr-6 text-right">{yen(project.grossProfitShot)}</td>
                <td className="py-1 text-right">{yen(project.grossProfitStock)}</td>
              </tr>
              <tr className="border-t">
                <td className="py-1 pr-6">粗利率</td>
                <td className="py-1 pr-6 text-right">{pct(project.grossMarginShot)}</td>
                <td className="py-1 text-right">{pct(project.grossMarginStock)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Button onClick={handleSave} disabled={!isDirty || updateMutation.isPending}>
        {updateMutation.isPending ? '保存中...' : '保存'}
      </Button>
    </div>
  );
}
