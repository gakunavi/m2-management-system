'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { useTaskTags, useTaskTagSuggest, useTaskTagMutations } from '@/hooks/use-tasks';
import type { TaskTagItem } from '@/types/task';

interface TaskTagInputProps {
  selectedTagIds: number[];
  onChange: (tagIds: number[]) => void;
}

const DEFAULT_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];

export function TaskTagInput({ selectedTagIds, onChange }: TaskTagInputProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLORS[0]);
  const [newTagScope, setNewTagScope] = useState<'shared' | 'personal'>('shared');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTags } = useTaskTags();
  const { data: suggestedTags } = useTaskTagSuggest(query);
  const { createTag } = useTaskTagMutations();

  const selectedTags = (allTags ?? []).filter((t) => selectedTagIds.includes(t.id));
  const availableTags = query.length >= 1
    ? (suggestedTags ?? []).filter((t) => !selectedTagIds.includes(t.id))
    : (allTags ?? []).filter((t) => !selectedTagIds.includes(t.id));

  const handleAddTag = (tagId: number) => {
    onChange([...selectedTagIds, tagId]);
    setQuery('');
    setIsOpen(false);
  };

  const handleRemoveTag = (tagId: number) => {
    onChange(selectedTagIds.filter((id) => id !== tagId));
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

  useEffect(() => {
    if (!isOpen) setShowNewTagForm(false);
  }, [isOpen]);

  const sharedTags = (allTags ?? []).filter((t) => t.scope === 'shared');
  const handleToggleTag = (tagId: number) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  return (
    <div className="relative">
      {/* 共通タグ チップ一覧（クリックでトグル付与/解除） */}
      {sharedTags.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {sharedTags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleToggleTag(tag.id)}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-all ${
                  isSelected
                    ? 'text-white ring-2 ring-offset-1 ring-offset-background'
                    : 'text-white opacity-50 hover:opacity-80'
                }`}
                style={{
                  backgroundColor: tag.color,
                  ...(isSelected ? { ringColor: tag.color } : {}),
                }}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}

      {/* 選択済みタグ + 入力 */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 min-h-[36px]">
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: tag.color }}
          >
            {tag.name}
            <button onClick={() => handleRemoveTag(tag.id)} className="hover:opacity-70">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          className="flex-1 bg-transparent text-sm outline-none min-w-[80px]"
          placeholder={selectedTags.length === 0 ? 'タグを追加...' : ''}
        />
      </div>

      {/* ドロップダウン */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] max-h-[240px] overflow-y-auto rounded-md border bg-popover shadow-md">
            {availableTags.length > 0 ? (
              <div className="p-1">
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => handleAddTag(tag.id)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {tag.scope === 'shared' ? '共通' : '個人'}
                    </span>
                  </button>
                ))}
              </div>
            ) : query.length > 0 ? (
              <div className="p-2 text-sm text-muted-foreground">
                一致するタグがありません
              </div>
            ) : null}

            {/* 類似タグサジェスト */}
            {query.length > 0 && availableTags.length > 0 && (
              <div className="border-t px-2 py-1.5 text-xs text-muted-foreground">
                似たタグがあります
              </div>
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
                            className={`h-5 w-5 rounded-full border-2 ${newTagColor === c ? 'border-foreground' : 'border-transparent'}`}
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
                      className="w-full rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
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
  );
}
