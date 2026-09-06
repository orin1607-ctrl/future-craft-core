import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { TriInspectionMetaCard } from '@/components/vehicles/TriInspectionMetaCard';
import { TriInspectionNotesField } from '@/components/vehicles/TriInspectionNotesField';

/**
 * תצוגת פיתוח — מסך בדיקת תלת בלי התחברות, לבדיקת Desktop/Mobile.
 * פתיחה: /dev/tri-inspection
 */
export default function DevTriInspectionPreview() {
  const [notes, setNotes] = useState(
    'זוהי הערת פתיחה ארוכה שצריך לראות במלואה בזמן ההקלדה במחשב, בטאבלט ובטלפון בלי לאבד את תחילת המשפט.',
  );
  const [itemNotes, setItemNotes] = useState('התחלה של הערת סעיף שנמשכת גם כשהמקלדת פתוחה בטלפון.');

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3 text-center shadow-md">
        תצוגת פיתוח · בדיקת תלת · לא נשמר ל-DB
      </div>
      <div className="max-w-3xl mx-auto p-4 pb-24 space-y-6">
        <div className="flex items-center gap-3">
          <ClipboardCheck size={28} className="text-primary" />
          <h1 className="text-2xl font-bold">בדיקה תלת / חצי לרכב פרטי</h1>
        </div>

        <div>
          <label className="block text-base font-medium mb-1.5">רכב מס׳ *</label>
          <div className="w-full p-3 text-base rounded-xl border-2 border-input bg-muted">
            12-345-67 - טויוטה היילקס
          </div>
        </div>

        <TriInspectionMetaCard
          lastInspectionDate="2026-03-12"
          internalNumber="OC-17"
          year={2019}
        />

        <div className="border border-border rounded-xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-[minmax(0,1.2fr)_60px_60px_minmax(0,1.4fr)] bg-muted/70 text-sm font-bold border-b border-border">
            <div className="p-2.5 border-l border-border">בדיקה</div>
            <div className="p-2.5 text-center border-l border-border">תקין</div>
            <div className="p-2.5 text-center border-l border-border">לא תקין</div>
            <div className="p-2.5">הערות לסעיף</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.2fr)_60px_60px_minmax(0,1.4fr)]">
            <div className="col-span-2 sm:col-span-1 p-2.5 text-sm font-medium sm:border-l border-border flex items-center">
              בדיקה חזותית לרכב
            </div>
            <div className="p-2.5 sm:border-l border-border flex items-center justify-center gap-2">
              <span className="sm:hidden text-xs text-muted-foreground">תקין</span>
              <span className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg border-2 flex items-center justify-center bg-success/20 border-success text-success">✓</span>
            </div>
            <div className="p-2.5 sm:border-l border-border flex items-center justify-center gap-2">
              <span className="sm:hidden text-xs text-muted-foreground">לא תקין</span>
              <span className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg border-2 flex items-center justify-center border-input text-transparent">✗</span>
            </div>
            <div className="col-span-2 sm:col-span-1 p-2">
              <textarea
                value={itemNotes}
                onChange={(e) => setItemNotes(e.target.value)}
                rows={2}
                dir="rtl"
                className="w-full min-h-[3.5rem] p-2 text-base leading-relaxed rounded-lg border border-input bg-background focus:border-primary focus:outline-none whitespace-pre-wrap break-words resize-y"
              />
            </div>
          </div>
        </div>

        <TriInspectionNotesField value={notes} onChange={setNotes} />
      </div>
    </div>
  );
}
