'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useTaskTags, useTaskTagSuggest, useTaskTagMutations } from '@/hooks/use-tasks';
import { useAuth } from '@/hooks/use-auth';
import type { TaskTagItem } from '@/types/task';

interface TaskTagInputProps {
  selectedTagIds: number[];
  onChange: (tagIds: number[]) => void;
}

const DEFAULT_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];

export function TaskTagInput({ selectedTagIds, onChange }: TaskTagInputProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLORS[0]);
  const [newTagScope, setNewTagScope] = useState<'shared' | 'personal'>('shared');
  const [editingTag, setEditingTag] = useState<{ id: number; name: string; color: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTags } = useTaskTags();
  const { data: suggestedTags } = useTaskTagSuggest(query);
  const { createTag, updateTag, deleteTag } = useTaskTagMutations();

  const sharedTags = (allTags ?? []).filter((t) => t.scope === 'shared');
  const personalTags = (allTags ?? []).filter((t) => t.scope === 'personal');
  const availableTags = query.length >= 1
    ? (suggestedTags ?? []).filter((t) => !selectedTagIds.includes(t.id))
    : (allTags ?? []).filter((t) => !selectedTagIds.includes(t.id));

  const handleToggleTag = (tagId: number) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  const handleAddTag = (tagId: number) => {
    onChange([...selectedTagIds, tagId]);
    setQuery('');
    setIsOpen(false);
  };

  const handleCreateTag = async () => {
    if (!query.trim()) return;
    try {
      const newTag = await createTag.mutateAsync({
        name: query.trim(),
        color: newTagColor,
        scope: newTagScope,
      });
      onChange([...selectedTagIds, (newTag as unknown as TaskTagItem).id]);
      setQuery('');
      setShowNewTagForm(false);
      setIsOpen(false);
    } catch {
      // エラーはミューテーションが処理
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!confirm('このタグを削除しますか？全タスクからこのタグが外れます。')) return;
    await deleteTag.mutateAsync(tagId);
    onChange(selectedTagIds.filter((id) => id !== tagId));
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !editingTag.name.trim()) return;
    await updateTag.mutateAsync({ id: editingTag.id, name: editingTag.name.trim(), color: editingTag.color });
    setEditingTag(null);
  };

  const canEditTag = (tag: TaskTagItem) => {
    return tag.ownerId === user?.id || user?.role === 'admin';
  };

  useEffect(() => {
    if (!isOpen) setShowNewTagForm(false);
  }, [isOpen]);

  // タグチップ一覧レンダリング
  const renderTagChips = (tags: TaskTagItem[], label: string) => {
    if (tags.length === 0) return null;
    return (
      <div className="space-y-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id);
            const editable = canEditTag(tag);

            // 編集中の場合
            if (editingTag?.id === tag.id) {
              return (
                <div key={tag.id} className="flex items-center gap-1 rounded-md border bg-muted p-1">
                  <input
                    type="text"
                    value={editingTag.name}
                    onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                    className="w-20 rounded border px-1 py-0.5 text-xs"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleUpdateTag(); if (e.key === 'Escape') setEditingTag(null); }}
                  />
                  <div className="flex gap-0.5">
                    {DEFAULT_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditingTag({ ...editingTag, color: c })}
                        className={`h-6 w-6 sm:h-3.5 sm:w-3.5 rounded-full border ${editingTag.color === c ? 'border-foreground' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <button onClick={handleUpdateTag} className="rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">保存</button>
                  <button onClick={() => setEditingTag(null)} className="text-[10px] text-muted-foreground">取消</button>
                </div>
              );
            }

            return (
              <div key={tag.id} className="group relative inline-flex items-center">
                <button
                  type="button"
                  onClick={() => handleToggleTag(tag.id)}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-all ${
                    isSelected
                      ? 'text-white ring-2 ring-offset-1 ring-offset-background'
                      : 'text-white opacity-50 hover:opacity-80'
                  }`}
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </button>
                {/* 編集・削除ボタン（ホバー表示） */}
                {editable && (
                  <div className="ml-0.5 flex sm:hidden items-center gap-0.5 sm:group-hover:flex">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingTag({ id: tag.id, name: tag.name, color: tag.color }); }}
                      className="rounded p-1.5 sm:p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted min-h-[44px] sm:min-h-0"
                    >
                      <Pencil className="h-3.5 w-3.5 sm:h-2.5 sm:w-2.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id); }}
                      className="rounded p-1.5 sm:p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 min-h-[44px] sm:min-h-0"
                    >
                      <Trash2 className="h-3.5 w-3.5 sm:h-2.5 sm:w-2.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative space-y-2">
      {/* 共通タグ チップ一覧 */}
      {renderTagChips(sharedTags, '共通タグ')}

      {/* 個人タグ チップ一覧 */}
      {renderTagChips(personalTags, '個人タグ')}

      {/* 検索入力 + 新規作成 */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          placeholder="タグを検索・新規作成..."
        />

        {/* ドロップダウン */}
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] max-h-[200px] overflow-y-auto rounded-md border bg-popover shadow-md">
              {availableTags.length > 0 ? (
                <div className="p-1">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => handleAddTag(tag.id)}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {tag.scope === 'shared' ? '共通' : '個人'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : query.length > 0 ? (
                <div className="p-2 text-sm text-muted-foreground">一致するタグがありません</div>
              ) : null}

              {/* 類似タグサジェスト */}
              {query.length > 0 && availableTags.length > 0 && (
                <div className="border-t px-2 py-1.5 text-xs text-muted-foreground">似たタグがあります</div>
              )}

              {/* 新規作成 */}
              {query.length > 0 && (
                <div className="border-t p-2">
                  {!showNewTagForm ? (
                    <button
                      onClick={() => setShowNewTagForm(true)}
                      className="flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      「{query}」を新規作成
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">色:</span>
                        <div className="flex gap-1">
                          {DEFAULT_COLORS.map((c) => (
                            <button
                              key={c}
                              onClick={() => setNewTagColor(c)}
                              className={`h-7 w-7 sm:h-5 sm:w-5 rounded-full border-2 ${newTagColor === c ? 'border-foreground' : 'border-transparent'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">種類:</span>
                        <select
                          value={newTagScope}
                          onChange={(e) => setNewTagScope(e.target.value as 'shared' | 'personal')}
                          className="rounded border px-1.5 py-0.5 text-xs"
                        >
                          <option value="shared">共通タグ</option>
                          <option value="personal">個人タグ</option>
                        </select>
                      </div>
                      <button
                        onClick={handleCreateTag}
                        className="w-full rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 min-h-[44px] sm:min-h-0"
                      >
                        作成
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
