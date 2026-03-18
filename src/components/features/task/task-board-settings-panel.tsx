'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, UserPlus, Trash2, LogOut, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useTaskBoardDetail, useTaskBoardMutations } from '@/hooks/use-tasks';

interface TaskBoardSettingsPanelProps {
  boardId: number;
  onClose: () => void;
  onDeleted: () => void;
}

export function TaskBoardSettingsPanel({ boardId, onClose, onDeleted }: TaskBoardSettingsPanelProps) {
  const { user } = useAuth();
  const { data: board, isLoading } = useTaskBoardDetail(boardId);
  const { updateBoard, deleteBoard, addMember, removeMember } = useTaskBoardMutations();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');

  if (isLoading || !board) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-lg bg-background p-8 shadow-xl">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        </div>
      </div>
    );
  }

  const isOwner = board.createdById === user?.id;
  const isAdmin = user?.role === 'admin';
  const canManage = isOwner || isAdmin;

  const handleUpdateName = async () => {
    if (!editName.trim()) return;
    await updateBoard.mutateAsync({ id: boardId, name: editName.trim() });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm(`ボード「${board.name}」を削除しますか？ボード内のタスクは全社タスクに移動されます。`)) return;
    await deleteBoard.mutateAsync(boardId);
    onDeleted();
  };

  const handleRemoveMember = async (userId: number) => {
    const member = board.members.find((m) => m.userId === userId);
    const isSelf = userId === user?.id;
    const msg = isSelf
      ? `このボードから退出しますか？`
      : `${member?.userName}をボードから除外しますか？`;
    if (!confirm(msg)) return;
    await removeMember.mutateAsync({ boardId, userId });
    if (isSelf) onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-background shadow-xl max-h-[80vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">ボード設定</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* ボード名 */}
          <div>
            <label className="mb-1 block text-sm font-medium">ボード名</label>
            {isEditing ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateName(); if (e.key === 'Escape') setIsEditing(false); }}
                />
                <Button size="sm" onClick={handleUpdateName}>保存</Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>取消</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm">{board.name}</span>
                {canManage && (
                  <button
                    onClick={() => { setEditName(board.name); setIsEditing(true); }}
                    className="text-xs text-primary hover:underline"
                  >
                    編集
                  </button>
                )}
              </div>
            )}
          </div>

          {/* メンバー一覧 */}
          <div>
            <label className="mb-2 block text-sm font-medium">メンバー ({board.members.length})</label>
            <div className="space-y-1">
              {board.members.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {member.userName.charAt(0)}
                    </div>
                    <span className="text-sm">{member.userName}</span>
                    {member.role === 'owner' && (
                      <span title="オーナー"><Crown className="h-3.5 w-3.5 text-amber-500" /></span>
                    )}
                  </div>
                  {/* 自分なら退出、管理者なら除外 */}
                  {(member.userId === user?.id || canManage) && member.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title={member.userId === user?.id ? '退出' : '除外'}
                    >
                      {member.userId === user?.id ? <LogOut className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* メンバー招待（ユーザー名検索） */}
          <UserSearchInvite
            boardId={boardId}
            existingMemberIds={board.members.map((m) => m.userId)}
            onInvite={async (userId) => {
              await addMember.mutateAsync({ boardId, userId });
            }}
          />

          {/* ボード削除 */}
          {canManage && (
            <div className="border-t pt-3">
              <Button variant="destructive" size="sm" onClick={handleDelete} className="w-full">
                このボードを削除
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// ユーザー名検索による招待コンポーネント
// ============================================

function UserSearchInvite({
  existingMemberIds,
  onInvite,
}: {
  boardId: number;
  existingMemberIds: number[];
  onInvite: (userId: number) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const { data: users } = useUserSearch(search);

  // 既存メンバーを除外
  const filteredUsers = (users ?? []).filter((u) => !existingMemberIds.includes(u.id));

  const handleInvite = async (userId: number) => {
    setIsInviting(true);
    try {
      await onInvite(userId);
      setSearch('');
      setIsOpen(false);
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">メンバーを招待</label>
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <UserPlus className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
              onFocus={() => search.length >= 1 && setIsOpen(true)}
              className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm"
              placeholder="ユーザー名で検索..."
              disabled={isInviting}
            />
          </div>
        </div>

        {/* 検索結果ドロップダウン */}
        {isOpen && search.length >= 1 && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 w-full max-h-[200px] overflow-y-auto rounded-md border bg-popover shadow-md">
              {filteredUsers.length > 0 ? (
                <div className="p-1">
                  {filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleInvite(u.id)}
                      disabled={isInviting}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        {u.userName.charAt(0)}
                      </div>
                      <div className="text-left">
                        <div className="font-medium">{u.userName}</div>
                        <div className="text-xs text-muted-foreground">{u.userEmail}</div>
                      </div>
                      <span className="ml-auto text-xs text-muted-foreground">{u.userRole}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-center text-sm text-muted-foreground">
                  該当するユーザーが見つかりません
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ユーザー検索フック
function useUserSearch(query: string) {
  return useQuery<{ id: number; userName: string; userEmail: string; userRole: string }[]>({
    queryKey: ['users-search', query],
    queryFn: async () => {
      const res = await fetch(`/api/v1/users?search=${encodeURIComponent(query)}&pageSize=10`);
      const json = await res.json();
      return (json.data ?? []).map((u: { id: number; userName: string; userEmail: string; userRole: string }) => ({
        id: u.id,
        userName: u.userName,
        userEmail: u.userEmail,
        userRole: u.userRole,
      }));
    },
    enabled: query.length >= 1,
  });
}
