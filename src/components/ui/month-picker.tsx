'use client';

interface MonthPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MonthPicker({ value, onChange, placeholder, disabled, className }: MonthPickerProps) {
  return (
    <input
      type="month"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder={placeholder}
      disabled={disabled}
      className={
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors ' +
        'file:border-0 file:bg-transparent file:text-sm file:font-medium ' +
        'placeholder:text-muted-foreground ' +
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
        'disabled:cursor-not-allowed disabled:opacity-50 ' +
        (className ?? '')
      }
    />
  );
}
