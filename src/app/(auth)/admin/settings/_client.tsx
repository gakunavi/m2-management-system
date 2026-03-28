'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Eye, EyeOff, Save, Loader2, Users, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GlobalCustomFieldsTab } from '@/components/features/settings/global-custom-fields-tab';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';

interface SettingItem {
  key: string;
  label: string;
  description: string;
  isSecret: boolean;
  value: string;
  hasValue: boolean;
  updatedAt: string | null;
}

const MODEL_OPTIONS = [
  { value: 'auto', label: '自動切替（推奨）' },
  { value: 'gpt-4o-mini', label: 'GPT-4o-mini（高速・低コスト）' },
  { value: 'gpt-4o', label: 'GPT-4o（高品質）' },
];

export function SystemSettingsClient() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // フォーム状態
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // 設定一覧取得
  const { data: settings = [], isLoading } = useQuery<SettingItem[]>({
    queryKey: ['system-settings'],
    queryFn: () => apiClient.get('/system-settings'),
  });

  // 初期値をフォームにセット
  useEffect(() => {
    if (settings.length > 0) {
      const initial: Record<string, string> = {};
      for (const s of settings) {
        initial[s.key] = s.value;
      }
      setFormValues(initial);
      setIsDirty(false);
    }
  }, [settings]);

  // 更新ミューテーション
  const updateMutation = useMutation({
    mutationFn: (settingsPayload: Array<{ key: string; value: string }>) =>
      apiClient.put('/system-settings', { settings: settingsPayload }),
    onSuccess: () => {
      toast({ message: '設定を保存しました', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      setIsDirty(false);
    },
    onError: () => {
      toast({ message: '設定の保存に失敗しました', type: 'error' });
    },
  });

  const handleChange = useCallback((key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    const payload = Object.entries(formValues).map(([key, value]) => ({ key, value }));
    updateMutation.mutate(payload);
  }, [formValues, updateMutation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6 px-3 py-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Settings className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">システム設定</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">AIアシスタントの接続設定を管理します</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI設定</CardTitle>
          <CardDescription>
            OpenAI APIの接続情報とモデル設定を行います。
            未設定の場合、AIアシスタント機能は利用できません。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* APIキー */}
          <div className="space-y-2">
            <label className="text-sm font-medium">OpenAI APIキー</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={formValues['openai_api_key'] ?? ''}
                  onChange={(e) => handleChange('openai_api_key', e.target.value)}
                  placeholder="sk-proj-..."
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              APIキーは暗号化して保存されます。変更しない場合はそのままにしてください。
            </p>
            {settings.find((s) => s.key === 'openai_api_key')?.hasValue && (
              <p className="text-xs text-green-600">✓ 設定済み</p>
            )}
          </div>

          {/* モデル選択 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">AIモデル設定</label>
            <Select
              value={formValues['openai_model'] || 'auto'}
              onValueChange={(value) => handleChange('openai_model', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              「自動切替」はAIが質問内容に応じてモデルを自動選択します。
              データ照会は軽量モデル、分析・レポートは高性能モデルを使用します。
            </p>
          </div>

          {/* コスト目安 */}
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">コスト目安（GPT-4o-mini）</p>
            <p>1回: 約$0.0006（約0.1円）<span className="hidden sm:inline">/ </span><br className="sm:hidden" />月100回: 約$0.06</p>
            <p className="font-medium text-foreground">コスト目安（GPT-4o）</p>
            <p>1回: 約$0.012（約1.8円）<span className="hidden sm:inline">/ </span><br className="sm:hidden" />月100回: 約$1.20</p>
          </div>
        </CardContent>
      </Card>

      {/* 保存ボタン */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!isDirty || updateMutation.isPending} className="w-full sm:w-auto">
          {updateMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          設定を保存
        </Button>
      </div>

      {/* グローバルカスタムフィールド */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            顧客カスタムフィールド（グループ共通）
          </CardTitle>
          <CardDescription>
            全事業共通で顧客に表示するカスタムフィールドを定義します。
            事業ごとの固有フィールドは各事業の設定で管理してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GlobalCustomFieldsTab entityType="customer" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            代理店カスタムフィールド（グループ共通）
          </CardTitle>
          <CardDescription>
            全事業共通で代理店に表示するカスタムフィールドを定義します。
            事業ごとの固有フィールドは各事業の設定で管理してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GlobalCustomFieldsTab entityType="partner" />
        </CardContent>
      </Card>
    </div>
  );
}
