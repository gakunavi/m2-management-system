'use client';

import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Star,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { SavedTableView } from '@/types/config';

/** インラインで表示するタブの最大数（それ以降はドロップダウンに格納） */
const MAX_INLINE_TABS = 4;

interface ViewTabBarProps {
  views: SavedTableView[];
  activeViewId: number | null;
  onSelectView: (id: number | null) => void;
  onSaveClick: () => void;
  onRenameView: (id: number) => void;
  onDeleteView: (id: number) => void;
  onSetDefault: (id: number) => void;
  onDuplicateView: (id: number) => void;
  isLoading: boolean;
  atLimit: boolean;
}

export function ViewTabBar({
  views,
  activeViewId,
  onSelectView,
  onSaveClick,
  onRenameView,
  onDeleteView,
  onSetDefault,
  onDuplicateView,
  isLoading,
  atLimit,
}: ViewTabBarProps) {
  const inlineTabs = views.slice(0, MAX_INLINE_TABS);
  const overflowTabs = views.slice(MAX_INLINE_TABS);
  const hasOverflow = overflowTabs.length > 0;
  const overflowHasActive =
    activeViewId !== null && overflowTabs.some((v) => v.id === activeViewId);

  return (
    <div className="flex items-center gap-1 border-b">
      {/* 「すべて」タブ */}
      <TabButton
        label="すべて"
        isActive={activeViewId === null}
        isDefault={false}
        onClick={() => onSelectView(null)}
      />

      {/* インライン表示のビュータブ */}
      {!isLoading &&
        inlineTabs.map((view) => (
          <ViewTab
            key={view.id}
            view={view}
            isActive={activeViewId === view.id}
            onSelect={() => onSelectView(view.id)}
            onRename={() => onRenameView(view.id)}
            onDelete={() => onDeleteView(view.id)}
            onSetDefault={() => onSetDefault(view.id)}
            onDuplicate={() => onDuplicateView(view.id)}
          />
        ))}

      {/* 溢れドロップダウン */}
      {hasOverflow && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 px-2 text-muted-foreground',
                overflowHasActive && 'text-foreground font-medium',
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
              {overflowHasActive && (
                <span className="ml-1 text-xs">
                  {overflowTabs.find((v) => v.id === activeViewId)?.viewName}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {overflowTabs.map((view) => (
              <div key={view.id} className="group relative">
                <DropdownMenuItem
                  className={cn(
                    'pr-8',
                    activeViewId === view.id && 'font-medium bg-accent',
                  )}
                  onClick={() => onSelectView(view.id)}
                >
                  {view.isDefault && (
                    <Star className="mr-1.5 h-3 w-3 text-amber-500" />
                  )}
                  {view.viewName}
                </DropdownMenuItem>
                {/* サブメニュー用のネストされたドロップダウン */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        'absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded flex items-center justify-center',
                        'opacity-0 group-hover:opacity-100 transition-opacity',
                        'text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" className="w-44">
                    <DropdownMenuItem onClick={() => onRenameView(view.id)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      名前を変更
                    </DropdownMenuItem>
                    {!view.isDefault && (
                      <DropdownMenuItem onClick={() => onSetDefault(view.id)}>
                        <Star className="mr-2 h-3.5 w-3.5" />
                        デフォルトに設定
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onDuplicateView(view.id)}>
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      複製
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDeleteView(view.id)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      削除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* 「+」保存ボタン */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-muted-foreground hover:text-foreground"
        onClick={onSaveClick}
        title={
          atLimit
            ? '保存上限（10件）に達しています'
            : '現在の状態をビューとして保存'
        }
        disabled={isLoading || atLimit}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ============================================
// 内部コンポーネント
// ============================================

function TabButton({
  label,
  isActive,
  isDefault,
  onClick,
}: {
  label: string;
  isActive: boolean;
  isDefault: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-1 h-8 px-3 text-sm rounded-t-md transition-colors whitespace-nowrap',
        'hover:bg-muted/50',
        isActive
          ? 'text-foreground font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
          : 'text-muted-foreground',
      )}
    >
      {isDefault && <Star className="h-3 w-3 text-amber-500" />}
      {label}
    </button>
  );
}

function ViewTab({
  view,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onSetDefault,
  onDuplicate,
}: {
  view: SavedTableView;
  isActive: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="relative group flex items-center">
      <TabButton
        label={view.viewName}
        isActive={isActive}
        isDefault={view.isDefault}
        onClick={onSelect}
      />
      {/* ホバー時に表示される操作メニュー */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'absolute right-0 top-1 h-6 w-5 rounded flex items-center justify-center',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            名前を変更
          </DropdownMenuItem>
          {!view.isDefault && (
            <DropdownMenuItem onClick={onSetDefault}>
              <Star className="mr-2 h-3.5 w-3.5" />
              デフォルトに設定
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            複製
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            削除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
