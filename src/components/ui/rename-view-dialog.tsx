'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface RenameViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onSave: (newName: string) => Promise<void>;
  isSaving: boolean;
}

export function RenameViewDialog({
  open,
  onOpenChange,
  currentName,
  onSave,
  isSaving,
}: RenameViewDialogProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError('');
    }
  }, [open, currentName]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('ビュー名を入力してください');
      return;
    }
    setError('');
    try {
      await onSave(trimmed);
      onOpenChange(false);
    } catch {
      setError('名前の変更に失敗しました。もう一度お試しください。');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ビュー名を変更</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5 py-2">
          <Label htmlFor="rename-view">ビュー名</Label>
          <Input
            id="rename-view"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            maxLength={100}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSaving) handleSave();
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
