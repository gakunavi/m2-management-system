'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { CsvImportMode } from '@/types/config';

interface ExportOptions {
  endpoint: string;
  filename?: string;
  /** 現在の検索・フィルター条件をクエリパラメータとして渡す */
  params?: Record<string, string>;
}

interface ImportOptions {
  endpoint: string;
  mode?: CsvImportMode;
  dryRun?: boolean;
  onSuccess?: (result: ImportResult) => void;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  dryRun?: boolean;
}

// ============================================
// xlsx/xls → CSV File 変換
// ============================================

async function convertExcelToFile(file: File): Promise<File> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (!workbook.SheetNames.length) {
    throw new Error('Excelファイルにシートが含まれていません');
  }
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) {
    throw new Error('Excelファイルの最初のシートが読み取れません');
  }
  const csvString = XLSX.utils.sheet_to_csv(firstSheet);
  const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8' });
  return new File([blob], file.name.replace(/\.xlsx?$/i, '.csv'), { type: 'text/csv' });
}

export function useEntityExport() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // ============================================
  // CSV エクスポート
  // ============================================

  const exportCSV = async (options: ExportOptions) => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams(options.params ?? {});
      const qs = params.toString();
      const separator = options.endpoint.includes('?') ? '&' : '?';
      const url = `/api/v1${options.endpoint}${qs ? `${separator}${qs}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.error?.message ?? 'エクスポートに失敗しました');
      }

      const blob = await response.blob();

      // Content-Disposition からファイル名を取得
      const disposition = response.headers.get('content-disposition') ?? '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const downloadName = filenameMatch?.[1] ?? options.filename ?? 'export.csv';

      // ダウンロードトリガー
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);

      toast({ title: 'エクスポート完了', message: `${downloadName} をダウンロードしました`, type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'エクスポートに失敗しました';
      toast({ title: 'エクスポートエラー', message, type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  // ============================================
  // テンプレート ダウンロード
  // ============================================

  const downloadTemplate = async (options: { endpoint: string; filename?: string }) => {
    setIsDownloadingTemplate(true);
    try {
      // endpoint に ?param=value が含まれる場合、/template をパス部分に挿入
      const [basePath, queryString] = options.endpoint.split('?');
      const url = `/api/v1${basePath}/template${queryString ? `?${queryString}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.error?.message ?? 'テンプレートのダウンロードに失敗しました');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const downloadName = filenameMatch?.[1] ?? options.filename ?? 'template.csv';

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);

      toast({ title: 'テンプレートDL完了', message: `${downloadName} をダウンロードしました`, type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'テンプレートのダウンロードに失敗しました';
      toast({ title: 'テンプレートエラー', message, type: 'error' });
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // ============================================
  // CSV インポート
  // ============================================

  const importCSV = async (file: File, options: ImportOptions) => {
    setIsImporting(true);
    try {
      // Excel ファイルの場合は CSV に変換
      const ext = file.name.split('.').pop()?.toLowerCase();
      const csvFile = (ext === 'xlsx' || ext === 'xls') ? await convertExcelToFile(file) : file;

      const formData = new FormData();
      formData.append('file', csvFile);
      if (options.mode) {
        formData.append('mode', options.mode);
      }
      if (options.dryRun) {
        formData.append('dryRun', 'true');
      }

      const response = await fetch(`/api/v1${options.endpoint}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error?.message ?? 'インポートに失敗しました');
      }

      const result = json.data as ImportResult;
      options.onSuccess?.(result);

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'インポートに失敗しました';
      toast({ title: 'インポートエラー', message, type: 'error' });
      return null;
    } finally {
      setIsImporting(false);
    }
  };

  return {
    isExporting,
    isImporting,
    isDownloadingTemplate,
    exportCSV,
    importCSV,
    downloadTemplate,
  };
}
