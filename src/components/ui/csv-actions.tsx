'use client';

import { useState } from 'react';
import { Download, Upload, Loader2, Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CsvImportModal } from '@/components/ui/csv-import-modal';
import { useEntityExport } from '@/hooks/use-entity-export';
import type { CsvTemplateColumn } from '@/types/config';

interface CsvActionsProps {
  endpoint: string;
  importEnabled: boolean;
  exportEnabled: boolean;
  /** エクスポート時に付与する現在の検索/フィルター条件 */
  exportParams?: Record<string, string>;
  onImportComplete?: () => void;
  templateColumns?: CsvTemplateColumn[];
  /** 現在の表示列キー（列順を反映）。指定時は「表示列のみ」選択肢を表示 */
  visibleColumnKeys?: string[];
}

export function CsvActions({
  endpoint,
  importEnabled,
  exportEnabled,
  exportParams,
  onImportComplete,
  templateColumns,
  visibleColumnKeys,
}: CsvActionsProps) {
  const [importModalOpen, setImportModalOpen] = useState(false);
  const { isExporting, exportCSV } = useEntityExport();

  const handleExportAll = () => {
    exportCSV({ endpoint, params: exportParams });
  };

  const handleExportVisible = () => {
    if (!visibleColumnKeys?.length) return;
    exportCSV({
      endpoint,
      params: {
        ...exportParams,
        columns: visibleColumnKeys.join(','),
      },
    });
  };

  const hasVisibleColumns = visibleColumnKeys && visibleColumnKeys.length > 0;

  // インポートのみの場合はシングルボタン
  if (!exportEnabled && importEnabled) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setImportModalOpen(true)}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          インポート
        </Button>
        <CsvImportModal
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
          endpoint={endpoint}
          templateColumns={templateColumns}
          onImportComplete={onImportComplete}
        />
      </>
    );
  }

  // エクスポートのみ（表示列選択なし）
  if (exportEnabled && !importEnabled && !hasVisibleColumns) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportAll}
        disabled={isExporting}
      >
        {isExporting ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-1.5 h-4 w-4" />
        )}
        CSVエクスポート
      </Button>
    );
  }

  // ドロップダウン（エクスポート選択肢 + インポート）
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            CSV
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {exportEnabled && hasVisibleColumns && (
            <DropdownMenuItem
              onClick={handleExportVisible}
              disabled={isExporting}
            >
              <Columns3 className="mr-2 h-4 w-4" />
              表示列のみエクスポート
            </DropdownMenuItem>
          )}
          {exportEnabled && (
            <DropdownMenuItem onClick={handleExportAll} disabled={isExporting}>
              <Download className="mr-2 h-4 w-4" />
              全列エクスポート
            </DropdownMenuItem>
          )}
          {importEnabled && exportEnabled && <DropdownMenuSeparator />}
          {importEnabled && (
            <DropdownMenuItem onClick={() => setImportModalOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              インポート
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CsvImportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        endpoint={endpoint}
        templateColumns={templateColumns}
        onImportComplete={onImportComplete}
      />
    </>
  );
}
