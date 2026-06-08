import { X } from 'lucide-react';

export function EntityContextBanner({
  label,
  onClear,
  strict,
}: {
  label: string;
  onClear?: () => void;
  /** When true (vehicle hub entry), hide "show all" — data isolation */
  strict?: boolean;
}) {
  return (
    <div className="mb-4 p-3 rounded-xl border-2 border-primary/30 bg-primary/5 flex items-center justify-between gap-2">
      <p className="text-sm font-medium">
        מסונן לפי: <span className="font-bold">{label}</span>
      </p>
      {onClear && !strict && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
        >
          <X size={14} /> הצג הכל
        </button>
      )}
    </div>
  );
}
