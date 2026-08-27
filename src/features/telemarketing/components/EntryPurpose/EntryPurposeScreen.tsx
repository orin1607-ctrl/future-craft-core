import { employeeFirstName } from '@/features/telemarketing/lib/teleEntryMode';

export function EntryPurposeScreen({
  displayName,
  onWork,
  onInspect,
}: {
  displayName: string;
  onWork: () => void;
  onInspect: () => void;
}) {
  const firstName = employeeFirstName(displayName);
  const hello = firstName ? `שלום ${firstName} 👋` : 'שלום 👋';

  return (
    <div className="mx-auto max-w-lg px-4 py-8" data-testid="tele-entry-purpose" dir="rtl">
      <h1 className="text-2xl font-black">{hello}</h1>
      <p className="mt-2 text-base font-semibold text-foreground">שמחים שחזרת. איך תרצי להיכנס למערכת?</p>
      <p className="mt-1 text-sm text-muted-foreground">מטרת הכניסה למערכת</p>
      <div className="mt-6 space-y-3">
        <button
          type="button"
          data-testid="tele-entry-work"
          onClick={onWork}
          className="flex min-h-16 w-full flex-col items-start justify-center rounded-2xl bg-emerald-600 px-4 py-4 text-right text-white active:scale-[0.99]"
        >
          <span className="text-lg font-black">🟢 כניסה לעבודה</span>
          <span className="mt-1 text-sm font-medium text-white/90">התחלת עבודה והמשך טיפול בלידים.</span>
        </button>
        <button
          type="button"
          data-testid="tele-entry-inspect"
          onClick={onInspect}
          className="flex min-h-16 w-full flex-col items-start justify-center rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-4 text-right active:scale-[0.99] dark:bg-amber-950/40"
        >
          <span className="text-lg font-black">🧪 כניסה לבדיקה</span>
          <span className="mt-1 text-sm font-medium text-muted-foreground">צפייה ובדיקה בלבד — ללא שיחות וללא רישום זמן עבודה.</span>
        </button>
      </div>
    </div>
  );
}
