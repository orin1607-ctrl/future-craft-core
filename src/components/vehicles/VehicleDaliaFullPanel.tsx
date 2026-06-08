import { useMemo } from 'react';
import VehicleAccordionSection from '@/components/vehicles/VehicleAccordionSection';
import {
  EMPTY_FIELD_LABEL,
  getAllDisplayFields,
  groupDisplayFieldsBySection,
} from '@/lib/daliaVehicleLoad';

const SECTION_ORDER = [
  '1. פרטי רכב',
  '2. בעלות',
  '3. ביטוחים',
  '4. ציוד',
  '5. תחזוקה',
  '6. מסמכים',
];

function FieldCell({ label, value }: { label: string; value: string }) {
  const empty = value === EMPTY_FIELD_LABEL;
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className={`font-medium text-sm ${empty ? 'text-muted-foreground italic' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

export default function VehicleDaliaFullPanel({
  vehicleRow,
  onEdit,
  isManager,
}: {
  vehicleRow: Record<string, unknown>;
  onEdit?: () => void;
  isManager?: boolean;
}) {
  const grouped = useMemo(() => {
    const fields = getAllDisplayFields(vehicleRow);
    const g = groupDisplayFieldsBySection(fields);
    const ordered: Record<string, typeof fields> = {};
    for (const sec of SECTION_ORDER) {
      if (g[sec]?.length) ordered[sec] = g[sec];
    }
    for (const [sec, list] of Object.entries(g)) {
      if (!ordered[sec]) ordered[sec] = list;
    }
    return ordered;
  }, [vehicleRow]);

  const totalFields = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);

  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-3 border-b border-border bg-primary/5 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          כל שדות Dalia — <strong className="text-foreground">{totalFields}</strong> שדות · ריק ={' '}
          <span className="italic">{EMPTY_FIELD_LABEL}</span>
        </p>
        {isManager && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-sm font-bold text-primary whitespace-nowrap px-3 py-1.5 rounded-lg bg-primary/10"
          >
            עריכה מלאה
          </button>
        )}
      </div>
      {Object.entries(grouped).map(([section, fields]) => (
        <VehicleAccordionSection key={section} title={section} defaultOpen={section.startsWith('1.')}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {fields.map((f) => (
              <FieldCell key={f.key} label={f.label} value={f.value} />
            ))}
          </div>
        </VehicleAccordionSection>
      ))}
    </div>
  );
}
