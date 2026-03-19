'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, UserPlus } from 'lucide-react';

interface UserOption {
  id: number;
  userName: string;
}

interface TaskAssigneeSelectProps {
  selectedUserIds: number[];
  onChange: (ids: number[]) => void;
  /** 編集時: 既存の担当者情報（名前付き） */
  existingAssignees?: { id: number; userName: string }[];
}

export function TaskAssigneeSelect({
  selectedUserIds,
  onChange,
  existingAssignees = [],
}: TaskAssigneeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 選択済みユーザーの名前解決用マップ（existingAssigneesとAPI結果をマージ）
  const [userMap, setUserMap] = useState<Map<number, string>>(() => {
    const map = new Map<number, string>();
    for (const a of existingAssignees) {
      map.set(a.id, a.userName);
    }
    return map;
  });

  // existingAssignees変更時にマップ更新
  useEffect(() => {
    setUserMap((prev) => {
      const next = new Map(prev);
      for (const a of existingAssignees) {
        next.set(a.id, a.userName);
      }
      return next;
    });
  }, [existingAssignees]);

  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 1) {
      setUsers([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/v1/users?search=${encodeURIComponent(q)}&pageSize=20`);
      const json = await res.json();
      const fetched: UserOption[] = (json.data ?? []).map((u: { id: number; userName: string }) => ({
        id: u.id,
        userName: u.userName,
      }));
      setUsers(fetched);
      // マップに追加
      setUserMap((prev) => {
        const next = new Map(prev);
        for (const u of fetched) {
          next.set(u.id, u.userName);
        }
        return next;
      });
    } catch {
      setUsers([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // ドロップダウンを開いた時に初期検索
  useEffect(() => {
    if (isOpen && searchText === '') {
      searchUsers('');
      // 全ユーザーを取得（空文字検索）
      fetch('/api/v1/users?pageSize=50')
        .then((res) => res.json())
        .then((json) => {
          const fetched: UserOption[] = (json.data ?? []).map((u: { id: number; userName: string }) => ({
            id: u.id,
            userName: u.userName,
          }));
          setUsers(fetched);
          setUserMap((prev) => {
            const next = new Map(prev);
            for (const u of fetched) {
              next.set(u.id, u.userName);
            }
            return next;
          });
        })
        .catch(() => {});
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (q: string) => {
    setSearchText(q);
    searchUsers(q);
  };

  const handleSelect = (userId: number) => {
    if (!selectedUserIds.includes(userId)) {
      onChange([...selectedUserIds, userId]);
    }
    setSearchText('');
    inputRef.current?.focus();
  };

  const handleRemove = (userId: number) => {
    onChange(selectedUserIds.filter((id) => id !== userId));
  };

  // 未選択のユーザーのみドロップダウンに表示
  const filteredUsers = users.filter((u) => !selectedUserIds.includes(u.id));

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 選択済みチップ + 入力エリア */}
      <div
        className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 min-h-[36px] cursor-text"
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
      >
        {selectedUserIds.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[9px]">
              {(userMap.get(id) ?? '?').charAt(0)}
            </span>
            {userMap.get(id) ?? `User#${id}`}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(id);
              }}
              className="rounded-full p-1 sm:p-0.5 hover:bg-primary/20 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="relative flex-1 min-w-[80px]">
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setIsOpen(true)}
            placeholder={selectedUserIds.length === 0 ? '担当者を検索...' : '追加...'}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {selectedUserIds.length === 0 && (
          <UserPlus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}
      </div>

      {/* ドロップダウン */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[220px] max-h-[200px] overflow-y-auto rounded-md border bg-popover shadow-md">
            {isSearching && (
              <div className="px-3 py-2 text-xs text-muted-foreground">検索中...</div>
            )}
            {!isSearching && filteredUsers.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {searchText ? '該当するユーザーがありません' : 'ユーザーを検索してください'}
              </div>
            )}
            {filteredUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => handleSelect(u.id)}
                className="flex w-full items-center gap-2 px-3 py-2.5 sm:py-2 text-sm hover:bg-accent transition-colors min-h-[44px] sm:min-h-0"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary flex-shrink-0">
                  {u.userName.charAt(0)}
                </div>
                <span className="truncate">{u.userName}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
