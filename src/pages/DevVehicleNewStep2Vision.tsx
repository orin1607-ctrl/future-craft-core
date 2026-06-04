import type { ReactNode } from 'react';
import { ArrowRight, Search, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import VehicleAccordionSection from '@/components/vehicles/VehicleAccordionSection';
import { VehiclePlateLine } from '@/components/vehicles/vehiclePlateDisplay';

const hubInput =
  'w-full p-2.5 text-sm rounded-lg border border-input bg-background focus:border-primary focus:outline-none';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-muted-foreground text-sm block mb-1">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
    </div>
  );
}

function SectionSaveButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="w-full mt-4 py-3 rounded-xl text-sm font-bold border-2 border-primary/30 bg-primary/5 text-primary"
    >
      {label}
    </button>
  );
}

/** תצוגת הבנה — מעטפת Hub + כפתור שמירה בכל סעיף + שמור רכב בסוף */
export default function DevVehicleNewStep2Vision() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="sticky top-0 z-50 bg-amber-500 text-amber-950 px-4 py-3 text-center shadow-md">
        <p className="font-bold text-sm">תצוגת הבנה — שלב 2 · Hub + שמירה נקודתית + שמירה מלאה</p>
        <p className="text-xs mt-1 opacity-90">אותה לוגיקת persistVehicle · ללא כפילות · ללא שמירה כפולה</p>
      </div>

      <div className="max-w-3xl mx-auto px-3 py-4 pb-24 animate-fade-in">
        <button type="button" className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
          <ArrowRight size={20} /> חזרה לשלב 1
        </button>

        <div className="card-elevated mb-4 p-3 flex items-center justify-between gap-3">
          <div>
            <VehiclePlateLine plate="12-345-67" internal="VH-099" className="font-bold text-base" />
            <p className="text-sm text-muted-foreground mt-1">טויוטה קורולה</p>
          </div>
          <span className="status-badge bg-primary/10 text-primary shrink-0">טיוטה</span>
        </div>

        <div className="card-elevated overflow-hidden">
          <div className="p-3 border-b border-border bg-primary/5">
            <p className="text-sm text-muted-foreground">
              מילוי נתונים · סעיפים <strong className="text-foreground">1–6</strong>
            </p>
          </div>

          <VehicleAccordionSection title="1. פרטי הרכב" defaultOpen sectionId="s1">
            <div className="grid grid-cols-2 gap-y-4 gap-x-3">
              <Field label="מספר רכב (רישוי)" required>
                <input readOnly value="12-345-67" className={hubInput} dir="ltr" />
              </Field>
              <Field label="מספר פנימי">
                <input readOnly value="VH-099" className={hubInput} />
              </Field>
              <Field label="יצרן">
                <input readOnly value="טויוטה" className={hubInput} />
              </Field>
              <Field label="דגם">
                <input readOnly value="קורולה" className={hubInput} />
              </Field>
            </div>
            <SectionSaveButton label="שמור פרטי רכב" />
          </VehicleAccordionSection>

          <VehicleAccordionSection title="2. בעלות, ליסינג ומימון" sectionId="s2">
            <p className="text-sm text-muted-foreground mb-2">בחירת מסלול + שדות מותנים</p>
            <SectionSaveButton label="שמור בעלות ומימון" />
          </VehicleAccordionSection>

          <VehicleAccordionSection title="3. ביטוחים ורישיונות" sectionId="s3">
            <Field label="תוקף טסט (רישוי)" required>
              <input type="date" readOnly value="2026-08-15" className={hubInput} />
            </Field>
            <SectionSaveButton label="שמור ביטוחים ורישיונות" />
          </VehicleAccordionSection>

          <VehicleAccordionSection title="4. ציוד וכלים מיוחדים" sectionId="s4">
            <p className="text-sm text-muted-foreground">אין שדה ב-vehicles — לאחר שמירה</p>
            <SectionSaveButton label="שמור ציוד וכלים מיוחדים" />
          </VehicleAccordionSection>

          <VehicleAccordionSection title="5. טיפולים ותחזוקה" sectionId="s5">
            <Field label="טיפול הבא">
              <input type="date" className={hubInput} />
            </Field>
            <SectionSaveButton label="שמור טיפולים ותחזוקה" />
          </VehicleAccordionSection>

          <VehicleAccordionSection title="6. מסמכים וקבצים" sectionId="s6">
            <div className="space-y-2 text-sm">
              {['רישיון רכב', 'ביטוח חובה', 'ביטוח מקיף'].map((doc) => (
                <div key={doc} className="p-3 rounded-xl border border-dashed border-border flex justify-between">
                  <span>{doc}</span>
                  <span className="text-primary text-xs font-bold">העלאה</span>
                </div>
              ))}
            </div>
            <SectionSaveButton label="שמור מסמך" />
          </VehicleAccordionSection>
        </div>

        <button type="button" className="w-full mt-4 py-4 rounded-xl bg-primary text-primary-foreground text-base font-bold">
          שמור רכב
        </button>
        <p className="text-xs text-center text-muted-foreground mt-2">
          שמירה מלאה → פותח כרטיס VehicleHub (onDone)
        </p>

        <Link
          to="/vehicle-import"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border font-bold text-primary mt-2 text-sm"
        >
          <Upload size={16} /> יבוא רכבים
        </Link>

        <div className="mt-8 p-4 rounded-xl border-2 border-dashed border-amber-500/50 bg-amber-500/5 text-sm space-y-2">
          <p className="font-bold text-amber-900">לוגיקת שמירה (ללא כפילות)</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>פונקציה אחת: <code className="text-xs">persistVehicle(scope)</code></li>
            <li>שמירת סעיף → update רק שדות הסעיף · נשאר בטופס</li>
            <li>סעיף 1 ברכב חדש → insert ראשון · <code className="text-xs">draftVehicleId</code></li>
            <li>שמור רכb → אותה לוגיקה + validation מלא + onDone → Hub</li>
            <li>ללא insert כפול · ללא alerts כפולים</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
