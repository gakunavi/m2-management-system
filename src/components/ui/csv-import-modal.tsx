'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronRight,
  FileWarning,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEntityExport, type ImportResult } from '@/hooks/use-entity-export';
import { parseCSVLine } from '@/lib/csv-helpers';
import type { CsvTemplateColumn, CsvImportMode } from '@/types/config';

// ============================================
// 型定義
// ============================================

type ImportStep = 'file-select' | 'preview' | 'result';

interface CsvImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: string;
  templateColumns?: CsvTemplateColumn[];
  onImportComplete?: () => void;
}

// ============================================
// ステップインジケーター
// ============================================

function StepIndicator({ currentStep }: { currentStep: ImportStep }) {
  const steps: { key: ImportStep; label: string }[] = [
    { key: 'file-select', label: 'ファイル選択' },
    { key: 'preview', label: 'プレビュー' },
    { key: 'result', label: '結果' },
  ];

  return (
    <div className="flex items-center gap-1 mb-5">
      {steps.map((s, idx) => (
        <div key={s.key} className="flex items-center gap-1">
          {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <div
            className={cn(
              'flex items-center gap-1.5 text-sm',
              currentStep === s.key ? 'text-primary font-medium' : 'text-muted-foreground'
            )}
          >
            <div
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium',
                currentStep === s.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {idx + 1}
            </div>
            <span className="hidden sm:inline">{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// エラーレポート CSV ダウンロード
// ============================================

function downloadErrorReport(errors: string[]) {
  const bom = '\uFEFF';
  const csv = [
    '行番号,エラー内容',
    ...errors.map((err) => {
      const match = err.match(/^行(\d+): (.+)$/);
      if (match) {
        return `${match[1]},"${match[2].replace(/"/g, '""')}"`;
      }
      return `,"${err.replace(/"/g, '""')}"`;
    }),
  ].join('\r\n');

  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `import_errors_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// メインコンポーネント
// ============================================

export function CsvImportModal({
  open,
  onOpenChange,
  endpoint,
  templateColumns,
  onImportComplete,
}: CsvImportModalProps) {
  const { importCSV, downloadTemplate, isImporting, isDownloadingTemplate } = useEntityExport();

  const [step, setStep] = useState<ImportStep>('file-select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [importMode, setImportMode] = useState<CsvImportMode>('create_only');
  const [isDryRun, setIsDryRun] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // モーダル開閉時に全状態リセット
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep('file-select');
      setSelectedFile(null);
      setPreviewHeaders([]);
      setPreviewRows([]);
      setTotalRows(0);
      setImportMode('create_only');
      setIsDryRun(false);
      setImportResult(null);
      setIsDragOver(false);
      setFileError(null);
    }
    onOpenChange(nextOpen);
  };

  // ============================================
  // ファイル処理
  // ============================================

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const handleFileSelect = useCallback(async (file: File) => {
    setFileError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext ?? '')) {
      setFileError('対応ファイル形式: .csv / .xlsx / .xls');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError(`ファイルサイズが上限（${MAX_FILE_SIZE / 1024 / 1024}MB）を超えています`);
      return;
    }

    setSelectedFile(file);

    try {
      let rows: string[][];

      if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        if (!workbook.SheetNames.length) {
          setFileError('Excelファイルにシートが含まれていません');
          setSelectedFile(null);
          return;
        }
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) {
          setFileError('Excelファイルの最初のシートが読み取れません');
          setSelectedFile(null);
          return;
        }
        const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
        rows = (data as string[][]).filter((r) => r.some((v) => v !== ''));
      } else {
        const text = await file.text();
        const content = text.startsWith('\uFEFF') ? text.slice(1) : text;
        rows = content
          .split(/\r?\n/)
          .filter((l) => l.trim() !== '')
          .map((line) => parseCSVLine(line));
      }

      // Numbers等がシート名を先頭行に挿入するケースに対応
      // カンマが含まれない行（= 1列のみ）はスキップしてヘッダー行を探す
      let headerRowIndex = 0;
      while (headerRowIndex < rows.length && rows[headerRowIndex].length <= 1) {
        headerRowIndex++;
      }

      const dataRows = rows.slice(headerRowIndex);
      if (dataRows.length < 2) {
        setFileError('データ行が存在しません（ヘッダー行と1行以上のデータが必要です）');
        setSelectedFile(null);
        return;
      }

      // ヘッダーから * マークを除去して保持
      const rawHeaders = dataRows[0].map((h) => h.replace(/\s*\*\s*$/, '').trim());
      setPreviewHeaders(rawHeaders);
      setPreviewRows(dataRows.slice(1, 6)); // 先頭5行
      setTotalRows(dataRows.length - 1); // データ行数（ヘッダー除く）
    } catch (err) {
      const detail = err instanceof Error ? `（${err.message}）` : '';
      setFileError(`ファイルの読み取りに失敗しました${detail}`);
      setSelectedFile(null);
    }
  }, []);

  // ============================================
  // D&D ハンドラー
  // ============================================

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  // ============================================
  // 必須項目チェック
  // ============================================

  const requiredCheck = useMemo(() => {
    if (!templateColumns) return [];
    return templateColumns
      .filter((c) => c.required)
      .map((c) => ({
        label: c.label,
        found: previewHeaders.includes(c.label),
      }));
  }, [templateColumns, previewHeaders]);

  const hasRequiredError = requiredCheck.some((c) => !c.found);

  // ============================================
  // インポート実行
  // ============================================

  const handleImport = async () => {
    if (!selectedFile) return;
    const result = await importCSV(selectedFile, {
      endpoint,
      mode: importMode,
      dryRun: isDryRun,
      onSuccess: () => {
        // ドライランの場合はonImportCompleteを呼ばない（実データ変更なし）
        if (!isDryRun) {
          onImportComplete?.();
        }
      },
    });
    if (result) {
      setImportResult(result);
      setStep('result');
    }
  };

  // ドライラン結果から本番実行に切り替え
  const handleExecuteAfterDryRun = () => {
    setIsDryRun(false);
    setImportResult(null);
    setStep('preview');
  };

  // ============================================
  // レンダリング: ステップ1 - ファイル選択
  // ============================================

  const renderFileSelect = () => (
    <div className="space-y-4">
      {/* D&D エリア */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('csv-file-input')?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
        )}
      >
        {selectedFile ? (
          <>
            <FileSpreadsheet className="h-10 w-10 text-primary" />
            <div>
              <p className="font-medium text-sm">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalRows.toLocaleString()} 行のデータ
              </p>
            </div>
            <p className="text-xs text-muted-foreground">クリックして別のファイルを選択</p>
          </>
        ) : (
          <>
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">ファイルをドラッグ＆ドロップ</p>
              <p className="text-xs text-muted-foreground mt-0.5">またはクリックして選択</p>
            </div>
            <p className="text-xs text-muted-foreground">対応形式: .csv / .xlsx / .xls</p>
          </>
        )}
      </div>
      <input
        id="csv-file-input"
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = '';
        }}
      />

      {/* ファイルエラー */}
      {fileError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {fileError}
        </div>
      )}

      {/* テンプレートDL */}
      {templateColumns && templateColumns.length > 0 && (
        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">インポート用テンプレート</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              必須項目と入力例付きのCSVをダウンロードできます
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              downloadTemplate({ endpoint });
            }}
            disabled={isDownloadingTemplate}
          >
            {isDownloadingTemplate ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            テンプレートDL
          </Button>
        </div>
      )}
    </div>
  );

  // ============================================
  // レンダリング: ステップ2 - プレビュー+設定
  // ============================================

  const renderPreview = () => (
    <div className="space-y-4">
      {/* ファイル情報 */}
      <div className="flex items-center gap-2 text-sm">
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{selectedFile?.name}</span>
        <span className="text-muted-foreground">— {totalRows.toLocaleString()} 行</span>
      </div>

      {/* 動作モード選択 */}
      <div className="space-y-2">
        <p className="text-sm font-medium">動作モード</p>
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setImportMode('create_only')}
            className={cn(
              'flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors',
              importMode === 'create_only'
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border hover:bg-muted/50'
            )}
          >
            <div
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors',
                importMode === 'create_only'
                  ? 'border-primary bg-primary'
                  : 'border-muted-foreground'
              )}
            />
            <div>
              <p className="font-medium">新規のみ（推奨）</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                既存のコードと一致する行はスキップします。既存データは一切変更されません。
                初めて一括登録する場合に適しています。
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setImportMode('upsert')}
            className={cn(
              'flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors',
              importMode === 'upsert'
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border hover:bg-muted/50'
            )}
          >
            <div
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors',
                importMode === 'upsert' ? 'border-primary bg-primary' : 'border-muted-foreground'
              )}
            />
            <div>
              <p className="font-medium">上書き更新</p>
              <p className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                <span className="block">
                  既存のコードと一致する行はCSVの内容で上書き更新します。
                </span>
                <span className="block text-muted-foreground/80">
                  ・CSVに含まれない列は変更されません（既存値を保持）
                </span>
                <span className="block text-muted-foreground/80">
                  ・有効フラグ列がCSVにない場合、無効→有効の自動変更は行いません
                </span>
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* ドライラン（テスト実行）オプション */}
      <label
        className={cn(
          'flex items-start gap-3 rounded-md border p-3 cursor-pointer text-sm transition-colors',
          isDryRun
            ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'
            : 'border-border hover:bg-muted/50'
        )}
      >
        <input
          type="checkbox"
          checked={isDryRun}
          onChange={(e) => setIsDryRun(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-muted-foreground"
        />
        <div>
          <p className="font-medium flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            テスト実行（ドライラン）
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            データを実際に変更せず、処理結果のみを確認できます。まず結果を確認してから本番実行することを推奨します。
          </p>
        </div>
      </label>

      {/* 必須項目チェック */}
      {requiredCheck.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">必須項目チェック</p>
          <div className="rounded-md border divide-y text-sm">
            {requiredCheck.map((c) => (
              <div key={c.label} className="flex items-center gap-2 px-3 py-2">
                {c.found ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
                <span className={c.found ? 'text-foreground' : 'text-destructive'}>
                  {c.label}
                </span>
                {!c.found && (
                  <span className="ml-auto text-xs text-destructive">列が見つかりません</span>
                )}
              </div>
            ))}
          </div>
          {hasRequiredError && (
            <p className="text-xs text-destructive">
              必須列が不足しています。テンプレートを確認してください。
            </p>
          )}
        </div>
      )}

      {/* プレビューテーブル */}
      {previewHeaders.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">
            プレビュー
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              （先頭 {Math.min(previewRows.length, 5)} 行）
            </span>
          </p>
          <div className="overflow-x-auto overflow-y-auto rounded-md border max-h-44">
            <table className="text-xs w-max">
              <thead className="bg-muted sticky top-0">
                <tr>
                  {previewHeaders.map((h, idx) => (
                    <th
                      key={idx}
                      className="whitespace-nowrap border-b px-3 py-2 text-left font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {previewRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-muted/20">
                    {previewHeaders.map((_, cIdx) => (
                      <td key={cIdx} className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                        {row[cIdx] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ============================================
  // レンダリング: ステップ3 - 結果
  // ============================================

  const renderResult = () => {
    if (!importResult) return null;
    const hasErrors = importResult.errors.length > 0;
    const wasDryRun = importResult.dryRun === true;

    return (
      <div className="space-y-4">
        {/* ドライラン通知 */}
        {wasDryRun && (
          <div className="flex items-center gap-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
            <Eye className="h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium">テスト実行の結果です</span>
              <span className="ml-1">— データは変更されていません。</span>
            </div>
          </div>
        )}

        {/* サマリーカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: wasDryRun ? '新規作成予定' : '新規作成', value: importResult.created, color: 'text-green-600' },
            { label: wasDryRun ? '更新予定' : '更新', value: importResult.updated, color: 'text-blue-600' },
            { label: 'スキップ', value: importResult.skipped, color: 'text-gray-500' },
            { label: 'エラー', value: importResult.errors.length, color: 'text-destructive' },
          ].map((item) => (
            <div key={item.label} className="rounded-md border p-3 text-center">
              <div className={cn('text-2xl font-bold', item.color)}>{item.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>

        {/* 成功メッセージ */}
        {!hasErrors && !wasDryRun && (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            インポートが完了しました
          </div>
        )}

        {/* エラー詳細 */}
        {hasErrors && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                エラー詳細（{importResult.errors.length} 件）
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadErrorReport(importResult.errors)}
                className="text-xs h-7"
              >
                <FileWarning className="mr-1 h-3.5 w-3.5" />
                エラーレポートDL
              </Button>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-md border divide-y text-sm">
              {importResult.errors.map((err, idx) => (
                <div key={idx} className="flex items-start gap-2 px-3 py-2">
                  <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{err}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // フッターボタン
  // ============================================

  const renderFooter = () => {
    if (step === 'file-select') {
      return (
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            キャンセル
          </Button>
          <Button
            onClick={() => setStep('preview')}
            disabled={!selectedFile || !!fileError}
          >
            次へ
          </Button>
        </DialogFooter>
      );
    }

    if (step === 'preview') {
      return (
        <DialogFooter>
          <Button variant="outline" onClick={() => setStep('file-select')}>
            戻る
          </Button>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleImport} disabled={isImporting || hasRequiredError}>
            {isImporting ? (
              <span className="flex items-center">
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                <span>
                  {isDryRun ? 'テスト実行中…' : 'インポート中…'}
                  <span className="ml-1 text-xs font-normal opacity-75">
                    （{totalRows.toLocaleString()} 行）
                  </span>
                </span>
              </span>
            ) : isDryRun ? (
              <>
                <Eye className="mr-1.5 h-4 w-4" />
                テスト実行
              </>
            ) : (
              'インポート実行'
            )}
          </Button>
        </DialogFooter>
      );
    }

    // 結果画面のフッター
    const wasDryRun = importResult?.dryRun === true;
    return (
      <DialogFooter>
        {wasDryRun && (
          <Button variant="default" onClick={handleExecuteAfterDryRun}>
            本番実行に進む
          </Button>
        )}
        <Button variant={wasDryRun ? 'outline' : 'default'} onClick={() => handleOpenChange(false)}>
          閉じる
        </Button>
      </DialogFooter>
    );
  };

  // ============================================
  // メインレンダリング
  // ============================================

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            CSVインポート
            {importResult?.dryRun && (
              <span className="ml-2 text-sm font-normal text-amber-600">（テスト結果）</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <StepIndicator currentStep={step} />

        <div className="flex-1 overflow-y-auto min-h-0">
          {step === 'file-select' && renderFileSelect()}
          {step === 'preview' && renderPreview()}
          {step === 'result' && renderResult()}
        </div>

        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}
