import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ステータス値 → 色のマッピング（後方互換のためフォールバック用）
const DEFAULT_COLOR_MAP: Record<string, string> = {
  '1.購入済み': 'bg-green-100 text-green-800 border-green-300',
  '2.入金確定': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  '3.契約締結中': 'bg-orange-100 text-orange-800 border-orange-300',
  '4.Aヨミ(申請中)': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  '5.Bヨミ': 'bg-blue-100 text-blue-800 border-blue-300',
  '6.アポ中': 'bg-slate-100 text-slate-800 border-slate-300',
  '7.失注': 'bg-red-100 text-red-800 border-red-300',
  '確認済み': 'bg-green-100 text-green-800 border-green-300',
  '未確認': 'bg-gray-100 text-gray-800 border-gray-300',
  '確認中': 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

interface StatusBadgeProps {
  /** ラベルテキスト（status の代替として label も使用可） */
  status?: string;
  label?: string;
  /** hex カラーコード（指定時は colorMap より優先） */
  color?: string | null;
  colorMap?: Record<string, string>;
}

export function StatusBadge({ status, label, color, colorMap }: StatusBadgeProps) {
  const displayLabel = label ?? status ?? '';

  // hex カラーが指定されている場合はインラインスタイルで表示
  if (color) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {displayLabel}
      </span>
    );
  }

  // 従来のクラスベース表示
  const colors = colorMap ?? DEFAULT_COLOR_MAP;
  const colorClass = colors[displayLabel] ?? 'bg-gray-100 text-gray-800 border-gray-300';

  return (
    <Badge variant="outline" className={cn('font-normal', colorClass)}>
      {displayLabel}
    </Badge>
  );
}
