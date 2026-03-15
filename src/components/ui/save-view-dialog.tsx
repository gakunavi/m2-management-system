'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface SaveViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, setAsDefault: boolean, isShared: boolean) => Promise<void>;
  isSaving: boolean;
  atLimit: boolean;
}

export function SaveViewDialog({
  open,
  onOpenChange,
  onSave,
  isSaving,
  atLimit,
}: SaveViewDialogProps) {
  const [name, setName] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('ビュー名を入力してください');
      return;
    }
    setError('');
    try {
      await onSave(trimmed, setAsDefault, isShared);
      setName('');
      setSetAsDefault(false);
      setIsShared(false);
      onOpenChange(false);
    } catch {
      setError('保存に失敗しました。もう一度お試しください。');
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName('');
      setSetAsDefault(false);
      setIsShared(false);
      setError('');
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ビューを保存</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="view-name">ビュー名</Label>
            <Input
              id="view-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="例：有効な法人のみ"
              maxLength={100}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !atLimit && !isSaving) handleSave();
              }}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="set-default"
              checked={setAsDefault}
              onCheckedChange={(v) => setSetAsDefault(v === true)}
            />
            <Label
              htmlFor="set-default"
              className="text-sm font-normal cursor-pointer"
            >
              デフォルトビューに設定する
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="set-shared"
              checked={isShared}
              onCheckedChange={(v) => setIsShared(v === true)}
            />
            <Label
              htmlFor="set-shared"
              className="text-sm font-normal cursor-pointer"
            >
              チームに共有する
            </Label>
          </div>
          {atLimit && (
            <p className="text-xs text-muted-foreground">
              保存上限（10件）に達しています。古いビューを削除してから保存してください。
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSaving}
          >
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={isSaving || atLimit}>
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
