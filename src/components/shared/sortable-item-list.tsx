'use client';

import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export interface SortableItemColumn<T> {
  key: string;
  label: string;
  width?: number;
  render?: (value: unknown, item: T) => React.ReactNode;
}

export interface SortableItemFormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'color' | 'textarea';
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  description?: string;
  /** 他のフィールドの値によって表示/非表示を切り替える */
  visibleWhen?: (formData: Record<string, unknown>) => boolean;
  /** フィールド入力の下に追加UIを描画（例: 計算式のフィールド参照ボタン） */
  renderAddon?: (params: {
    value: unknown;
    formData: Record<string, unknown>;
    setField: (key: string, value: unknown) => void;
    items: unknown[];
    editItemId: string | number | null;
  }) => React.ReactNode;
  /** ラベルとインプットの間に追加UIを描画（例: AI自動生成ボタン） */
  renderAfterLabel?: (params: {
    value: unknown;
    formData: Record<string, unknown>;
    setField: (key: string, value: unknown) => void;
    isEditing: boolean;
  }) => React.ReactNode;
}

interface SortableItemListProps<T extends { id: string | number }> {
  items: T[];
  isLoading: boolean;
  columns: SortableItemColumn<T>[];
  addLabel: string;
  formFields: SortableItemFormField[];
  formTitle: { create: string; edit: string };
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string | number, data: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string | number) => Promise<void>;
  onReorder: (orderedIds: (string | number)[]) => Promise<void>;
  disabledOnEditKeys?: string[];
  deleteConfirmMessage?: (item: T) => string;
  /** 追加ボタンの横に配置する追加アクション（例: CSVインポートボタン） */
  headerActions?: React.ReactNode;
}

export function SortableItemList<T extends { id: string | number }>({
  items,
  isLoading,
  columns,
  addLabel,
  formFields,
  formTitle,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  disabledOnEditKeys = [],
  deleteConfirmMessage,
  headerActions,
}: SortableItemListProps<T>) {
  const [localItems, setLocalItems] = useState<T[]>(items);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<T | null>(null);
  const [deleteItem, setDeleteItem] = useState<T | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // items prop が更新されたら localItems も更新
  React.useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localItems.findIndex((item) => item.id === active.id);
    const newIndex = localItems.findIndex((item) => item.id === over.id);
    const newItems = arrayMove(localItems, oldIndex, newIndex);
    setLocalItems(newItems);

    await onReorder(newItems.map((item) => item.id));
  };

  const openCreateModal = () => {
    setEditItem(null);
    const initData: Record<string, unknown> = {};
    formFields.forEach((f) => {
      if (f.type === 'checkbox') initData[f.key] = false;
      else if (f.type === 'number') initData[f.key] = 0;
      else initData[f.key] = '';
    });
    setFormData(initData);
    setModalOpen(true);
  };

  const openEditModal = (item: T) => {
    setEditItem(item);
    const initData: Record<string, unknown> = {};
    formFields.forEach((f) => {
      let value = (item as Record<string, unknown>)[f.key];
      // textarea に配列が入る場合（例: select型フィールドの options）は改行区切り文字列に変換
      if (f.type === 'textarea' && Array.isArray(value)) {
        value = value.join('\n');
      }
      initData[f.key] = value ?? (f.type === 'checkbox' ? false : '');
    });
    setFormData(initData);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editItem) {
        await onUpdate(editItem.id, formData);
      } else {
        await onCreate(formData);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      await onDelete(deleteItem.id);
      setDeleteItem(null);
    } finally {
      setDeleting(false);
    }
  };

  const setField = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {headerActions}
        <Button size="sm" onClick={openCreateModal}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </div>

      {localItems.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          データがありません
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* ヘッダー */}
          <div className="grid bg-muted/50 border-b text-xs font-medium text-muted-foreground"
            style={{
              gridTemplateColumns: `40px ${columns.map((c) => c.width ? `${c.width}px` : '1fr').join(' ')} 80px`,
            }}>
            <div className="px-3 py-2" />
            {columns.map((col) => (
              <div key={col.key} className="px-3 py-2">{col.label}</div>
            ))}
            <div className="px-3 py-2 text-center">操作</div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={localItems.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {localItems.map((item) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  columns={columns}
                  onEdit={() => openEditModal(item)}
                  onDelete={() => setDeleteItem(item)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* 追加/編集モーダル */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editItem ? formTitle.edit : formTitle.create}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {formFields.map((field) => {
              const isVisible = field.visibleWhen ? field.visibleWhen(formData) : true;
              if (!isVisible) return null;

              const isDisabledOnEdit = editItem !== null && disabledOnEditKeys.includes(field.key);
              const value = formData[field.key];

              return (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={field.key}>
                      {field.label}
                      {field.required && <span className="ml-1 text-destructive">*</span>}
                    </Label>
                    {field.renderAfterLabel && field.renderAfterLabel({
                      value,
                      formData,
                      setField,
                      isEditing: editItem !== null,
                    })}
                  </div>

                  {field.type === 'checkbox' ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={field.key}
                        checked={!!value}
                        onCheckedChange={(checked) => setField(field.key, !!checked)}
                        disabled={isDisabledOnEdit}
                      />
                      {field.description && (
                        <span className="text-sm text-muted-foreground">{field.description}</span>
                      )}
                    </div>
                  ) : field.type === 'textarea' ? (
                    <Textarea
                      id={field.key}
                      value={(value as string) ?? ''}
                      onChange={(e) => setField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      disabled={isDisabledOnEdit}
                      rows={3}
                    />
                  ) : field.type === 'select' ? (
                    <Select
                      value={(value as string) || '__none__'}
                      onValueChange={(v) => setField(field.key, v === '__none__' ? null : v)}
                      disabled={isDisabledOnEdit}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={field.placeholder ?? '選択...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {!field.required && (
                          <SelectItem value="__none__">
                            <span className="text-muted-foreground">未選択</span>
                          </SelectItem>
                        )}
                        {field.options?.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'color' ? (
                    <ColorPresetPicker
                      value={(value as string) ?? ''}
                      onChange={(v) => setField(field.key, v)}
                      disabled={isDisabledOnEdit}
                    />
                  ) : (
                    <Input
                      id={field.key}
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={value != null ? String(value) : ''}
                      onChange={(e) => {
                        if (field.type === 'number') {
                          setField(field.key, e.target.value !== '' ? Number(e.target.value) : null);
                        } else {
                          setField(field.key, e.target.value);
                        }
                      }}
                      placeholder={field.placeholder}
                      disabled={isDisabledOnEdit}
                    />
                  )}

                  {field.description && field.type !== 'checkbox' && (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  )}

                  {field.renderAddon && field.renderAddon({
                    value,
                    formData,
                    setField,
                    items: localItems,
                    editItemId: editItem?.id ?? null,
                  })}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <ConfirmModal
        open={!!deleteItem}
        onOpenChange={(open) => { if (!open) setDeleteItem(null); }}
        title="削除の確認"
        description={
          deleteItem && deleteConfirmMessage
            ? deleteConfirmMessage(deleteItem)
            : 'このアイテムを削除しますか？この操作は取り消せません。'
        }
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deleting}
      />
    </div>
  );
}

// ============================================
// ソート可能な行コンポーネント
// ============================================

function SortableRow<T extends { id: string | number }>({
  item,
  columns,
  onEdit,
  onDelete,
}: {
  item: T;
  columns: SortableItemColumn<T>[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        gridTemplateColumns: `40px ${columns.map((c) => c.width ? `${c.width}px` : '1fr').join(' ')} 80px`,
      }}
      className="grid items-center border-b last:border-b-0 bg-background hover:bg-muted/30 transition-colors"
    >
      <div
        {...attributes}
        {...listeners}
        className="px-3 py-2 cursor-grab active:cursor-grabbing flex items-center justify-center text-muted-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      {columns.map((col) => (
        <div key={col.key} className="px-3 py-2 text-sm truncate">
          {col.render
            ? col.render((item as Record<string, unknown>)[col.key], item)
            : renderDefaultValue((item as Record<string, unknown>)[col.key])}
        </div>
      ))}
      <div className="px-3 py-2 flex items-center justify-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ============================================
// カラープリセットピッカー
// ============================================

const COLOR_PRESETS = [
  { value: '#3b82f6', label: '青' },
  { value: '#22c55e', label: '緑' },
  { value: '#ef4444', label: '赤' },
  { value: '#f59e0b', label: '黄' },
  { value: '#8b5cf6', label: '紫' },
  { value: '#ec4899', label: 'ピンク' },
  { value: '#06b6d4', label: 'シアン' },
  { value: '#f97316', label: 'オレンジ' },
  { value: '#6b7280', label: 'グレー' },
  { value: '#1e293b', label: '濃紺' },
] as const;

function ColorPresetPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const isPreset = COLOR_PRESETS.some((p) => p.value === value);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            title={preset.label}
            disabled={disabled}
            onClick={() => onChange(preset.value)}
            className="relative h-7 w-7 rounded-full border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: preset.value,
              borderColor: value === preset.value ? '#000' : 'transparent',
              boxShadow: value === preset.value ? '0 0 0 2px white, 0 0 0 4px ' + preset.value : 'none',
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#6b7280'}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-8 w-10 rounded border border-input cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#6b7280"
          disabled={disabled}
          className="flex-1 h-8 text-sm"
          maxLength={20}
        />
        {!isPreset && value && (
          <span
            className="inline-block h-5 w-5 rounded-full border border-border flex-shrink-0"
            style={{ backgroundColor: value }}
          />
        )}
      </div>
    </div>
  );
}

function renderDefaultValue(value: unknown): React.ReactNode {
  if (value == null) return '-';
  if (typeof value === 'boolean') return value ? '✓' : '-';
  return String(value);
}
