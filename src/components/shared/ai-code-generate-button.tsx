'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AiCodeGenerateButtonProps {
  /** 生成元となるラベル値 */
  label: string;
  /** 生成コンテキスト（フィールドキー or ステップコード） */
  context: 'field_key' | 'step_code';
  /** 生成結果を受け取るコールバック */
  onGenerated: (code: string) => void;
  /** 編集モード時は非表示 */
  disabled?: boolean;
}

export function AiCodeGenerateButton({
  label,
  context,
  onGenerated,
  disabled,
}: AiCodeGenerateButtonProps) {
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch('/api/v1/ai/status')
      .then((res) => res.json())
      .then((data) => {
        setAiConfigured(data.success ? data.data.configured : false);
      })
      .catch(() => setAiConfigured(false));
  }, []);

  // 編集モード時や設定未読み込み中は非表示
  if (disabled || aiConfigured === null) return null;

  const handleGenerate = async () => {
    if (!label.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/v1/ai/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), context }),
      });
      const data = await res.json();
      if (data.success && data.data?.code) {
        onGenerated(data.data.code);
      }
    } catch {
      // エラー時は何もしない（手動入力にフォールバック）
    } finally {
      setGenerating(false);
    }
  };

  if (!aiConfigured) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs text-muted-foreground border-dashed"
                disabled
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                AIで自動生成
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>システム設定でAI APIキーを設定してください</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2.5 text-xs border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
      onClick={handleGenerate}
      disabled={generating || !label.trim()}
    >
      {generating ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
      )}
      {generating ? '生成中...' : 'AIで自動生成'}
    </Button>
  );
}
