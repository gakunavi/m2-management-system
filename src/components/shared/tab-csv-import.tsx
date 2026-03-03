'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CsvImportModal } from '@/components/ui/csv-import-modal';
import type { CsvTemplateDef } from '@/lib/csv-helpers';

// ============================================
// Props
// ============================================

interface TabCsvImportProps {
  /** API endpoint (例: '/businesses/5/status-definitions/csv') */
  endpoint: string;
  /** テンプレート列定義 */
  templateColumns: readonly CsvTemplateDef[];
  /** インポート完了時コールバック */
  onImportComplete: () => void;
  /** ボタンラベル（デフォルト: 'CSVインポート'） */
  buttonLabel?: string;
}

// ============================================
// コンポーネント
// ============================================

export function TabCsvImport({
  endpoint,
  templateColumns,
  onImportComplete,
  buttonLabel = 'CSVインポート',
}: TabCsvImportProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Upload className="mr-1 h-4 w-4" />
        {buttonLabel}
      </Button>

      <CsvImportModal
        open={open}
        onOpenChange={setOpen}
        endpoint={endpoint}
        templateColumns={[...templateColumns]}
        onImportComplete={onImportComplete}
      />
    </>
  );
}
