'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { MasterSelectConfig } from '@/types/config';

interface MasterItem {
  id: number;
  [key: string]: unknown;
}

interface MasterManageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: MasterSelectConfig;
}

export function MasterManageModal({ open, onOpenChange, config }: MasterManageModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: items = [], isLoading } = useQuery<MasterItem[]>({
    queryKey: ['master-manage', config.endpoint],
    queryFn: async () => {
      const res = await fetch(`/api/v1${config.endpoint}?includeInactive=false`);
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json = await res.json() as { data: MasterItem[] };
      return json.data;
    },
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['master-manage', config.endpoint] });
    queryClient.invalidateQueries({ queryKey: ['master-options', config.endpoint] });
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsAdding(true);
    try {
      await apiClient.create(config.endpoint, { [config.labelField]: name });
      setNewName('');
      invalidate();
      toast({ message: '追加しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof ApiClientError ? error.message : '追加に失敗しました';
      toast({ message: msg, type: 'error' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditStart = (item: MasterItem) => {
    setEditingId(item.id);
    setEditingName(String(item[config.labelField] ?? ''));
  };

  const handleEditSave = async (id: number) => {
    const name = editingName.trim();
    if (!name) return;
    try {
      await apiClient.patch(`${config.endpoint}/${id}`, { [config.labelField]: name });
      setEditingId(null);
      invalidate();
      toast({ message: '更新しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof ApiClientError ? error.message : '更新に失敗しました';
      toast({ message: msg, type: 'error' });
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await apiClient.remove(config.endpoint, id);
      invalidate();
      toast({ message: '削除しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof ApiClientError ? error.message : '削除に失敗しました';
      toast({ message: msg, type: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{config.modalTitle}</DialogTitle>
        </DialogHeader>

        {/* 新規追加 */}
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新しい名前を入力"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button onClick={handleAdd} disabled={isAdding || !newName.trim()} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            追加
          </Button>
        </div>

        {/* 一覧 */}
        <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">読み込み中...</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">データがありません</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                {editingId === item.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-7 text-sm flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave(item.id);
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleEditSave(item.id)}
                      aria-label="保存"
                    >
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={handleEditCancel}
                      aria-label="キャンセル"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{String(item[config.labelField] ?? '')}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleEditStart(item)}
                      aria-label="編集"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      aria-label="削除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
