'use client';

import { useState, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import type { ChecklistItem } from '@/types/task';

interface TaskChecklistProps {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

export function TaskChecklist({ items, onChange }: TaskChecklistProps) {
  const [newItemText, setNewItemText] = useState('');

  const handleToggle = useCallback(
    (id: string) => {
      const updated = items.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item,
      );
      onChange(updated);
    },
    [items, onChange],
  );

  const handleAddItem = useCallback(() => {
    if (!newItemText.trim()) return;
    const newItem: ChecklistItem = {
      id: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: newItemText.trim(),
      checked: false,
    };
    onChange([...items, newItem]);
    setNewItemText('');
  }, [items, onChange, newItemText]);

  const handleRemoveItem = useCallback(
    (id: string) => {
      onChange(items.filter((item) => item.id !== id));
    },
    [items, onChange],
  );

  const handleUpdateText = useCallback(
    (id: string, text: string) => {
      const updated = items.map((item) =>
        item.id === id ? { ...item, text } : item,
      );
      onChange(updated);
    },
    [items, onChange],
  );

  const doneCount = items.filter((i) => i.checked).length;

  return (
    <div className="space-y-1">
      {/* 進捗バー */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${items.length > 0 ? (doneCount / items.length) * 100 : 0}%` }}
            />
          </div>
          <span>{doneCount}/{items.length}</span>
        </div>
      )}

      {/* チェック項目一覧 */}
      {items.map((item) => (
        <div key={item.id} className="group flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={() => handleToggle(item.id)}
            className="h-4 w-4 accent-primary"
          />
          <input
            type="text"
            value={item.text}
            onChange={(e) => handleUpdateText(item.id, e.target.value)}
            className={`flex-1 bg-transparent text-sm outline-none ${item.checked ? 'line-through text-muted-foreground' : ''}`}
          />
          <button
            onClick={() => handleRemoveItem(item.id)}
            className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-muted transition-opacity"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      ))}

      {/* 新規追加 */}
      <div className="flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleAddItem(); }
          }}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="項目を追加..."
        />
      </div>
    </div>
  );
}
