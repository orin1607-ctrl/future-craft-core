import { useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * General remarks for a tri/semi inspection. Checkmarks stay on checklist items only.
 * Sized for long notes on desktop, tablet and phone; wraps so the start of the
 * sentence stays visible while typing.
 */
export function TriInspectionNotesField({
  value,
  onChange,
  id = 'tri-inspection-notes',
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="space-y-2" data-testid="tri-inspection-notes">
      <label htmlFor={id} className="block text-base font-medium">
        הערות
      </label>
      <p className="text-sm text-muted-foreground">
        אזור לכתיבה חופשית. סימוני תקין / לא תקין שייכים לסעיפי הבדיקה למעלה.
      </p>
      <textarea
        ref={ref}
        id={id}
        dir="rtl"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          window.setTimeout(() => {
            ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 250);
        }}
        rows={8}
        placeholder="כתבו כאן הערות ארוכות..."
        className={cn(
          'w-full min-h-[10rem] sm:min-h-[12rem] md:min-h-[14rem]',
          'p-4 text-base leading-relaxed rounded-xl border-2 border-input bg-background',
          'focus:border-primary focus:outline-none',
          'whitespace-pre-wrap break-words overflow-y-auto resize-y',
          'scroll-mt-24',
        )}
      />
    </div>
  );
}
