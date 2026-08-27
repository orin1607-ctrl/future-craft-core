export function InspectBanner({
  variant,
  onSwitchToWork,
  onTurnOffAdmin,
}: {
  variant: 'agent' | 'admin';
  onSwitchToWork?: () => void;
  onTurnOffAdmin?: () => void;
}) {
  const label = variant === 'admin'
    ? '🧪 מצב בדיקת מנהל־על'
    : '🧪 מצב בדיקה — הפעילות אינה נחשבת כעבודה';

  return (
    <div
      data-testid="tele-inspect-banner"
      className="sticky top-0 z-40 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm font-bold dark:bg-amber-950/50"
    >
      <p>{label}</p>
      {variant === 'agent' && onSwitchToWork && (
        <button
          type="button"
          data-testid="tele-switch-to-work"
          onClick={onSwitchToWork}
          className="mt-2 min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-2 font-black text-white"
        >
          מעבר למצב עבודה
        </button>
      )}
      {variant === 'admin' && onTurnOffAdmin && (
        <button
          type="button"
          data-testid="tele-admin-inspect-off"
          onClick={onTurnOffAdmin}
          className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-4 py-2 font-bold"
        >
          כיבוי מצב בדיקה
        </button>
      )}
    </div>
  );
}
