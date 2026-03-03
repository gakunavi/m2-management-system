import type { MovementStatus } from '@/lib/validations/movement';
import type {
  MovementOverviewResponse,
  DetailMovement,
} from '@/types/movement';

export type { MovementOverviewResponse, DetailMovement };

/** ガントチャートに描画するバー1本 */
export interface GanttBar {
  id: string;
  movementId: number;
  projectId: number;
  label: string;
  status: MovementStatus;
  startDate: Date | null;
  endDate: Date | null;
  stepName: string;
  stepNumber: number;
}

/** ガントチャートの1行（案件単位 or ステップ単位） */
export interface GanttRow {
  id: string;
  label: string;
  subLabel?: string;
  projectId: number;
  bars: GanttBar[];
  /** 受注予定月（YYYY-MM 形式）。一覧モードで目標線として描画 */
  expectedCloseMonth?: string | null;
}

// ---------- ユーティリティ ----------

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  return new Date(iso);
}

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 日付を YYYY/MM/DD 形式でフォーマット */
export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

// ---------- 時間軸の計算 ----------

export interface TimelineColumn {
  label: string;
  startDate: Date;
  endDate: Date;
}

/** 月単位のタイムライン列を生成 */
export function buildMonthColumns(
  minDate: Date,
  maxDate: Date
): TimelineColumn[] {
  const cols: TimelineColumn[] = [];
  const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  // maxDate の月末まで
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const monthEnd = new Date(y, m + 1, 0);
    cols.push({
      label: `${y}/${String(m + 1).padStart(2, '0')}`,
      startDate: new Date(y, m, 1),
      endDate: monthEnd,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return cols;
}

/** 週単位のタイムライン列を生成 */
export function buildWeekColumns(
  minDate: Date,
  maxDate: Date
): TimelineColumn[] {
  const cols: TimelineColumn[] = [];
  // minDate の週の月曜日から開始
  const cur = new Date(minDate);
  const dayOfWeek = cur.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 月曜始まり
  cur.setDate(cur.getDate() - diff);
  cur.setHours(0, 0, 0, 0);

  while (cur <= maxDate) {
    const weekEnd = new Date(cur);
    weekEnd.setDate(weekEnd.getDate() + 6);
    cols.push({
      label: `${cur.getMonth() + 1}/${cur.getDate()}〜`,
      startDate: new Date(cur),
      endDate: weekEnd,
    });
    cur.setDate(cur.getDate() + 7);
  }
  return cols;
}

/** 日単位のタイムライン列を生成 */
export function buildDayColumns(
  minDate: Date,
  maxDate: Date
): TimelineColumn[] {
  const cols: TimelineColumn[] = [];
  const cur = new Date(minDate);
  cur.setHours(0, 0, 0, 0);

  while (cur <= maxDate) {
    const dayEnd = new Date(cur);
    dayEnd.setHours(23, 59, 59, 999);
    cols.push({
      label: `${cur.getMonth() + 1}/${cur.getDate()}`,
      startDate: new Date(cur),
      endDate: dayEnd,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return cols;
}

/** バーの日付範囲からタイムライン全体の最小/最大日付を算出（前後に余白） */
export function getDateRange(rows: GanttRow[]): { minDate: Date; maxDate: Date } {
  let min = Infinity;
  let max = -Infinity;
  const now = today().getTime();

  for (const row of rows) {
    for (const bar of row.bars) {
      if (bar.startDate) {
        min = Math.min(min, bar.startDate.getTime());
      }
      if (bar.endDate) {
        max = Math.max(max, bar.endDate.getTime());
      } else if (bar.startDate && bar.status === 'started') {
        max = Math.max(max, now);
      }
    }

    // 受注予定月もタイムライン範囲に含める
    if (row.expectedCloseMonth) {
      const [y, m] = row.expectedCloseMonth.split('-').map(Number);
      // 月末日
      const closeDate = new Date(y, m, 0);
      max = Math.max(max, closeDate.getTime());
    }
  }

  // 今日の日付を必ず範囲に含める
  min = Math.min(min, now);
  max = Math.max(max, now);

  if (!isFinite(min)) min = now;
  if (!isFinite(max)) max = now;

  const minDate = new Date(min);
  const maxDate = new Date(max);

  // 前後2週間の余白
  minDate.setDate(minDate.getDate() - 14);
  maxDate.setDate(maxDate.getDate() + 14);

  return { minDate, maxDate };
}

/** タイムライン全体のピクセル幅に対するバーの left% と width% を計算 */
export function calcBarPosition(
  bar: GanttBar,
  timelineStart: Date,
  timelineEnd: Date
): { leftPercent: number; widthPercent: number } | null {
  if (!bar.startDate) return null;

  const totalMs = timelineEnd.getTime() - timelineStart.getTime();
  if (totalMs <= 0) return null;

  const startMs = bar.startDate.getTime() - timelineStart.getTime();

  let endMs: number;
  if (bar.endDate) {
    endMs = bar.endDate.getTime() - timelineStart.getTime();
  } else if (bar.status === 'started') {
    endMs = today().getTime() - timelineStart.getTime();
  } else {
    // 日付1日分のバー
    endMs = startMs + 86400000;
  }

  // start == end の場合、最低1日分を保証
  if (endMs <= startMs) {
    endMs = startMs + 86400000;
  }

  const leftPercent = (startMs / totalMs) * 100;
  const widthPercent = ((endMs - startMs) / totalMs) * 100;

  return {
    leftPercent: Math.max(0, leftPercent),
    widthPercent: Math.max(0.5, Math.min(widthPercent, 100 - leftPercent)),
  };
}

// ---------- データ変換 ----------

/** 一覧モード: 案件ごとに1行、各ステップをバーとして描画 */
export function toGanttRowsForList(
  response: MovementOverviewResponse
): GanttRow[] {
  return response.data.map((project) => ({
    id: String(project.id),
    label: project.customerName ?? project.projectNo,
    subLabel: project.projectNo,
    projectId: project.id,
    expectedCloseMonth: project.projectExpectedCloseMonth,
    bars: project.movements
      .filter((m) => m.movementStartedAt)
      .map((m) => ({
        id: `${project.id}-${m.id}`,
        movementId: m.id,
        projectId: project.id,
        label: m.stepName,
        status: m.movementStatus,
        startDate: parseDate(m.movementStartedAt),
        endDate:
          m.movementStatus === 'started'
            ? today()
            : parseDate(m.movementCompletedAt),
        stepName: m.stepName,
        stepNumber: m.stepNumber,
      })),
  }));
}

/** 案件詳細モード: ステップごとに1行 */
export function toGanttRowsForDetail(
  movements: DetailMovement[]
): GanttRow[] {
  return movements.map((m) => {
    const bar: GanttBar = {
      id: String(m.id),
      movementId: m.id,
      projectId: m.projectId,
      label: m.template.stepName,
      status: m.movementStatus,
      startDate: parseDate(m.movementStartedAt),
      endDate:
        m.movementStatus === 'started'
          ? today()
          : parseDate(m.movementCompletedAt),
      stepName: m.template.stepName,
      stepNumber: m.template.stepNumber,
    };

    return {
      id: String(m.id),
      label: m.template.stepName,
      projectId: m.projectId,
      bars: m.movementStartedAt ? [bar] : [],
    };
  });
}

/** ステータスに応じたバーの色クラスを返す */
export function getBarColorClasses(status: MovementStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500';
    case 'started':
      return 'bg-blue-500';
    case 'skipped':
      return 'bg-gray-300 border border-dashed border-gray-400';
    default:
      return 'bg-gray-200';
  }
}

/** ステータスのラベル */
export function getStatusLabel(status: MovementStatus): string {
  switch (status) {
    case 'completed': return '完了';
    case 'started': return '進行中';
    case 'skipped': return 'スキップ';
    default: return '未着手';
  }
}
