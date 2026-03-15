'use client';

import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Star,
  Copy,
  Share2,
  Users,
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
  onToggleShare?: (id: number, isShared: boolean) => void;
  onCopySharedView?: (view: SavedTableView) => void;
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
  onToggleShare,
  onCopySharedView,
  isLoading,
  atLimit,
}: ViewTabBarProps) {
  // 自分のビューと共有ビューを分離
  const myViews = views.filter((v) => !v.ownerName);
  const sharedViews = views.filter((v) => !!v.ownerName);

  const inlineTabs = myViews.slice(0, MAX_INLINE_TABS);
  const overflowTabs = myViews.slice(MAX_INLINE_TABS);
  const hasOverflow = overflowTabs.length > 0 || sharedViews.length > 0;
  const overflowHasActive =
    activeViewId !== null &&
    [...overflowTabs, ...sharedViews].some((v) => v.id === activeViewId);

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
            onToggleShare={onToggleShare}
          />
        ))}

      {/* 溢れドロップダウン（自分の追加ビュー + 共有ビュー） */}
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
                  {[...overflowTabs, ...sharedViews].find((v) => v.id === activeViewId)?.viewName}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {/* 自分の溢れビュー */}
            {overflowTabs.map((view) => (
              <OverflowOwnViewItem
                key={view.id}
                view={view}
                isActive={activeViewId === view.id}
                onSelect={() => onSelectView(view.id)}
                onRename={() => onRenameView(view.id)}
                onDelete={() => onDeleteView(view.id)}
                onSetDefault={() => onSetDefault(view.id)}
                onDuplicate={() => onDuplicateView(view.id)}
                onToggleShare={onToggleShare}
              />
            ))}

            {/* 共有ビューセクション */}
            {sharedViews.length > 0 && (
              <>
                {overflowTabs.length > 0 && <DropdownMenuSeparator />}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  共有ビュー
                </div>
                {sharedViews.map((view) => (
                  <SharedViewItem
                    key={view.id}
                    view={view}
                    isActive={activeViewId === view.id}
                    onSelect={() => onSelectView(view.id)}
                    onCopy={onCopySharedView ? () => onCopySharedView(view) : undefined}
                  />
                ))}
              </>
            )}
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
  isShared,
  ownerName,
  onClick,
}: {
  label: string;
  isActive: boolean;
  isDefault: boolean;
  isShared?: boolean;
  ownerName?: string;
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
      {isShared && !ownerName && <Share2 className="h-3 w-3 text-blue-500" />}
      {label}
      {ownerName && (
        <span className="text-[10px] text-muted-foreground ml-0.5">
          ({ownerName})
        </span>
      )}
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
  onToggleShare,
}: {
  view: SavedTableView;
  isActive: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onDuplicate: () => void;
  onToggleShare?: (id: number, isShared: boolean) => void;
}) {
  return (
    <div className="relative group flex items-center">
      <TabButton
        label={view.viewName}
        isActive={isActive}
        isDefault={view.isDefault}
        isShared={view.isShared}
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
          {onToggleShare && (
            <DropdownMenuItem onClick={() => onToggleShare(view.id, !view.isShared)}>
              <Share2 className="mr-2 h-3.5 w-3.5" />
              {view.isShared ? '共有を解除' : 'チームに共有'}
            </DropdownMenuItem>
          )}
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

/** 溢れドロップダウン内の自分のビュー */
function OverflowOwnViewItem({
  view,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onSetDefault,
  onDuplicate,
  onToggleShare,
}: {
  view: SavedTableView;
  isActive: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onDuplicate: () => void;
  onToggleShare?: (id: number, isShared: boolean) => void;
}) {
  return (
    <div className="group relative">
      <DropdownMenuItem
        className={cn(
          'pr-8',
          isActive && 'font-medium bg-accent',
        )}
        onClick={onSelect}
      >
        {view.isDefault && (
          <Star className="mr-1.5 h-3 w-3 text-amber-500" />
        )}
        {view.isShared && !view.isDefault && (
          <Share2 className="mr-1.5 h-3 w-3 text-blue-500" />
        )}
        {view.viewName}
      </DropdownMenuItem>
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
          {onToggleShare && (
            <DropdownMenuItem onClick={() => onToggleShare(view.id, !view.isShared)}>
              <Share2 className="mr-2 h-3.5 w-3.5" />
              {view.isShared ? '共有を解除' : 'チームに共有'}
            </DropdownMenuItem>
          )}
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

/** 共有ビューアイテム（読み取り専用、コピーのみ可能） */
function SharedViewItem({
  view,
  isActive,
  onSelect,
  onCopy,
}: {
  view: SavedTableView;
  isActive: boolean;
  onSelect: () => void;
  onCopy?: () => void;
}) {
  return (
    <div className="group relative">
      <DropdownMenuItem
        className={cn(
          'pr-8 flex items-center gap-1',
          isActive && 'font-medium bg-accent',
        )}
        onClick={onSelect}
      >
        <span className="truncate">{view.viewName}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          ({view.ownerName})
        </span>
      </DropdownMenuItem>
      {onCopy && (
        <button
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded flex items-center justify-center',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          title="自分のビューにコピー"
        >
          <Copy className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
