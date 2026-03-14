'use client';

interface MonthPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function getCurrentYear(): number {
  return new Date().getFullYear();
}

function parseYearMonth(value: string | null): { year: string; month: string } {
  if (!value) {
    const y = getCurrentYear();
    return { year: String(y), month: '01' };
  }
  const [y, m] = value.split('-');
  return { year: y, month: m };
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: `${i + 1}月`,
}));

function getYearOptions(): { value: string; label: string }[] {
  const currentYear = getCurrentYear();
  const years: { value: string; label: string }[] = [];
  for (let y = currentYear - 2; y <= currentYear + 5; y++) {
    years.push({ value: String(y), label: `${y}年` });
  }
  return years;
}

const selectClass =
  'flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

export function MonthPicker({ value, onChange, disabled, className }: MonthPickerProps) {
  const { year, month } = parseYearMonth(value);
  const yearOptions = getYearOptions();

  const handleChange = (newYear: string, newMonth: string) => {
    onChange(`${newYear}-${newMonth}`);
  };

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <select
        value={value ? year : ''}
        onChange={(e) => {
          if (e.target.value) {
            handleChange(e.target.value, value ? month : '01');
          } else {
            onChange(null);
          }
        }}
        disabled={disabled}
        className={selectClass}
      >
        <option value="">--</option>
        {yearOptions.map((y) => (
          <option key={y.value} value={y.value}>
            {y.label}
          </option>
        ))}
      </select>
      <select
        value={value ? month : ''}
        onChange={(e) => {
          if (e.target.value) {
            handleChange(value ? year : String(getCurrentYear()), e.target.value);
          } else {
            onChange(null);
          }
        }}
        disabled={disabled}
        className={selectClass}
      >
        <option value="">--</option>
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
