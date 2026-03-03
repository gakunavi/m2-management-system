'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBusiness } from '@/hooks/use-business';

interface GroupTreeNode {
  id: number;
  partnerCode: string;
  partnerName: string;
  partnerTier: string | null;
  partnerTierNumber: string | null;
  parentId: number | null;
  partnerIsActive: boolean;
}

interface TreeItem extends GroupTreeNode {
  children: TreeItem[];
  depth: number;
}

interface PartnerGroupTabProps {
  entityId: number;
}

export function PartnerGroupTab({ entityId }: PartnerGroupTabProps) {
  const [nodes, setNodes] = useState<GroupTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const router = useRouter();
  const { businesses, selectedBusinessId } = useBusiness();
  const [treeBusinessId, setTreeBusinessId] = useState<string>(
    selectedBusinessId ? String(selectedBusinessId) : '__master__'
  );

  useEffect(() => {
    const fetchTree = async () => {
      setIsLoading(true);
      try {
        let data: GroupTreeNode[];
        if (treeBusinessId === '__master__') {
          // マスタ階層ツリー
          data = await apiClient.get<GroupTreeNode[]>(
            `/partners/${entityId}/group-tree`
          );
        } else {
          // 事業別階層ツリー
          data = await apiClient.get<GroupTreeNode[]>(
            `/partners/${entityId}/business-group-tree?businessId=${treeBusinessId}`
          );
        }
        setNodes(data);
        // デフォルト全展開
        setExpandedIds(new Set(data.map((n) => n.id)));
      } catch {
        setNodes([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTree();
  }, [entityId, treeBusinessId]);

  // フラット配列からツリーを構築
  const tree = useMemo(() => {
    const nodeMap = new Map<number, TreeItem>();
    const roots: TreeItem[] = [];

    // まずすべてのノードをマップに登録
    for (const node of nodes) {
      nodeMap.set(node.id, { ...node, children: [], depth: 0 });
    }

    // 親子関係を構築
    for (const item of Array.from(nodeMap.values())) {
      if (item.parentId && nodeMap.has(item.parentId)) {
        const parent = nodeMap.get(item.parentId)!;
        parent.children.push(item);
      } else {
        roots.push(item);
      }
    }

    // depth を設定
    const setDepth = (items: TreeItem[], depth: number) => {
      for (const item of items) {
        item.depth = depth;
        setDepth(item.children, depth + 1);
      }
    };
    setDepth(roots, 0);

    return roots;
  }, [nodes]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isEmpty = !isLoading && nodes.length <= 1;
  const noBusinessTree = !isLoading && treeBusinessId !== '__master__' && nodes.length === 0;

  return (
    <div className="p-4 space-y-4">
      {/* 事業セレクタ */}
      {businesses.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">階層表示:</span>
          <Select value={treeBusinessId} onValueChange={setTreeBusinessId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__master__">マスタ階層</SelectItem>
              {businesses.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.businessName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : noBusinessTree ? (
        <div className="p-6 text-center text-muted-foreground">
          この代理店はこの事業で階層が設定されていません。
          <br />
          関連事業タブで事業別階層を設定してください。
        </div>
      ) : isEmpty ? (
        <div className="p-6 text-center text-muted-foreground">
          この代理店はグループに属していません（親子関係が設定されていません）
        </div>
      ) : (
        <div className="rounded-lg border">
          {tree.map((root) => (
            <TreeNodeRow
              key={root.id}
              item={root}
              currentId={entityId}
              expandedIds={expandedIds}
              onToggle={toggleExpand}
              onNavigate={(id) => router.push(`/partners/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNodeRow({
  item,
  currentId,
  expandedIds,
  onToggle,
  onNavigate,
}: {
  item: TreeItem;
  currentId: number;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
  onNavigate: (id: number) => void;
}) {
  const isCurrent = item.id === currentId;
  const hasChildren = item.children.length > 0;
  const isExpanded = expandedIds.has(item.id);

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors cursor-pointer border-b last:border-b-0',
          isCurrent && 'bg-primary/10 border-l-2 border-l-primary',
        )}
        style={{ paddingLeft: `${item.depth * 24 + 12}px` }}
        onClick={() => {
          if (isCurrent) return;
          onNavigate(item.id);
        }}
      >
        {/* 展開/折りたたみボタン */}
        {hasChildren ? (
          <button
            type="button"
            className="p-0.5 rounded hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(item.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* 階層番号 */}
        {item.partnerTierNumber && (
          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {item.partnerTierNumber}
          </span>
        )}

        {/* 代理店コード */}
        <span className="text-sm text-muted-foreground">{item.partnerCode}</span>

        {/* 代理店名 */}
        <span className={cn('text-sm font-medium', isCurrent && 'text-primary font-semibold')}>
          {item.partnerName}
        </span>

        {/* 階層ラベル */}
        {item.partnerTier && (
          <span className="text-xs text-muted-foreground ml-auto">
            {item.partnerTier}
          </span>
        )}

        {/* 無効の場合 */}
        {!item.partnerIsActive && (
          <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
            無効
          </span>
        )}
      </div>

      {/* 子ノード */}
      {hasChildren && isExpanded && (
        item.children.map((child) => (
          <TreeNodeRow
            key={child.id}
            item={child}
            currentId={currentId}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onNavigate={onNavigate}
          />
        ))
      )}
    </>
  );
}
