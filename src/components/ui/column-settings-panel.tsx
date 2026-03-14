'use client';

import { Pin, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Table } from '@tanstack/react-table';

interface ColumnSettingsPanelProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: Table<any>;
  onReset: () => void;
  /** 左固定中の列IDリスト */
  pinnedCols?: string[];
  /** ピン留めトグルハンドラ */
  onTogglePin?: (colId: string) => void;
}

export function ColumnSettingsPanel({
  table,
  onReset,
  pinnedCols = [],
  onTogglePin,
}: ColumnSettingsPanelProps) {
  // テーブルの現在の columnOrder に合わせて列設定パネルの表示順序を統一
  const columnOrder = table.getState().columnOrder;
  const allColumns = table.getAllColumns().filter((col) => col.getCanHide());
  const columns = columnOrder.length > 0
    ? [...allColumns].sort((a, b) => {
        const ai = columnOrder.indexOf(a.id);
        const bi = columnOrder.indexOf(b.id);
        return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
      })
    : allColumns;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="h-4 w-4" />
          列設定
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>列の表示/非表示</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => {
          const isPinned = pinnedCols.includes(column.id);
          return (
            <DropdownMenuCheckboxItem
              key={column.id}
              className="capitalize"
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
              onSelect={(e) => e.preventDefault()}
            >
              <span className="flex items-center gap-2 w-full">
                <span className="flex-1 truncate">
                  {typeof column.columnDef.header === 'string'
                    ? column.columnDef.header
                    : column.id}
                </span>
                {onTogglePin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onTogglePin(column.id);
                    }}
                    className={
                      isPinned
                        ? 'text-primary hover:text-primary/80'
                        : 'text-muted-foreground/40 hover:text-muted-foreground'
                    }
                    title={isPinned ? '固定解除' : '列を固定'}
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <div
          className="p-1 flex gap-1"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => table.toggleAllColumnsVisible(true)}
          >
            全て表示
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => table.toggleAllColumnsVisible(false)}
          >
            全て解除
          </Button>
        </div>
        <div
          className="p-1 pt-0"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={onReset}
          >
            デフォルトに戻す
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
