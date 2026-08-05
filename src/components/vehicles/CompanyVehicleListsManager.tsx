import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  loadCompanyListSettings,
  resetCompanyInspectionChecklist,
  resetCompanyTreatmentItems,
  saveCompanyInspectionChecklist,
  saveCompanyTreatmentItems,
} from '@/lib/companyListSettings';
import { DEFAULT_INSPECTION_CHECKLIST, DEFAULT_TREATMENT_ITEMS } from '@/lib/vehicleListDefaults';

type ListKind = 'treatment' | 'inspection';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  onSaved?: () => void;
};

function EditableList({
  title,
  items,
  onChange,
  onReset,
  isCustom,
  defaultLabel,
}: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  onReset: () => void;
  isCustom: boolean;
  defaultLabel: string;
}) {
  const [newItem, setNewItem] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const addItem = () => {
    const v = newItem.trim();
    if (!v) return;
    if (items.includes(v)) {
      toast.error('הפריט כבר קיים');
      return;
    }
    onChange([...items, v]);
    setNewItem('');
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...items];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {isCustom ? 'רשימה מותאמת ללקוח' : defaultLabel}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="הוסף פריט חדש..."
          className="flex-1 p-2 rounded-lg border border-input bg-background text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') addItem();
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={addItem}>
          <Plus size={14} />
        </Button>
      </div>
      <ul className="space-y-1 max-h-48 overflow-y-auto">
        {items.map((item, idx) => (
          <li key={`${item}-${idx}`} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-sm">
            <GripVertical size={14} className="text-muted-foreground shrink-0" />
            {editingIdx === idx ? (
              <input
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                className="flex-1 p-1 rounded border border-input text-sm"
                autoFocus
                onBlur={() => {
                  const v = editVal.trim();
                  if (v && v !== item) {
                    const next = [...items];
                    next[idx] = v;
                    onChange(next);
                  }
                  setEditingIdx(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <button
                type="button"
                className="flex-1 text-right truncate"
                onClick={() => {
                  setEditingIdx(idx);
                  setEditVal(item);
                }}
              >
                {item}
              </button>
            )}
            <button type="button" className="p-1" onClick={() => move(idx, -1)} disabled={idx === 0}>
              <ArrowUp size={14} />
            </button>
            <button type="button" className="p-1" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}>
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              className="p-1 text-destructive"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      {isCustom && (
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onReset}>
          <RotateCcw size={14} />
          איפוס לברירת מחדל
        </Button>
      )}
    </div>
  );
}

export default function CompanyVehicleListsManager({ open, onOpenChange, companyName, onSaved }: Props) {
  const [tab, setTab] = useState<ListKind>('treatment');
  const [treatmentItems, setTreatmentItems] = useState<string[]>([...DEFAULT_TREATMENT_ITEMS]);
  const [inspectionItems, setInspectionItems] = useState<string[]>([...DEFAULT_INSPECTION_CHECKLIST]);
  const [hasCustomTreatment, setHasCustomTreatment] = useState(false);
  const [hasCustomInspection, setHasCustomInspection] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !companyName) return;
    setLoading(true);
    loadCompanyListSettings(companyName)
      .then((s) => {
        setTreatmentItems(s.treatmentItems);
        setInspectionItems(s.inspectionChecklist);
        setHasCustomTreatment(s.hasCustomTreatment);
        setHasCustomInspection(s.hasCustomInspection);
      })
      .catch(() => toast.error('שגיאה בטעינת רשימות'))
      .finally(() => setLoading(false));
  }, [open, companyName]);

  const save = async () => {
    if (!companyName) return;
    setSaving(true);
    try {
      if (tab === 'treatment') {
        await saveCompanyTreatmentItems(companyName, treatmentItems);
        setHasCustomTreatment(true);
      } else {
        await saveCompanyInspectionChecklist(companyName, inspectionItems);
        setHasCustomInspection(true);
      }
      toast.success('הרשימה נשמרה');
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const resetCurrent = async () => {
    if (!companyName) return;
    try {
      if (tab === 'treatment') {
        await resetCompanyTreatmentItems(companyName);
        setTreatmentItems([...DEFAULT_TREATMENT_ITEMS]);
        setHasCustomTreatment(false);
      } else {
        await resetCompanyInspectionChecklist(companyName);
        setInspectionItems([...DEFAULT_INSPECTION_CHECKLIST]);
        setHasCustomInspection(false);
      }
      toast.success('אופס לברירת מחדל');
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה באיפוס');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>ניהול רשימות — {companyName}</DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">
            הוסף (+) · ערוך (לחיצה על פריט) · מחק (פח) · סדר (↑↓) · שמור · איפוס לברירת מחדל
          </p>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setTab('treatment')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold ${tab === 'treatment' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            דרוש טיפול
          </button>
          <button
            type="button"
            onClick={() => setTab('inspection')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold ${tab === 'inspection' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            בדיקת תלת-חצי
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">טוען…</p>
        ) : tab === 'treatment' ? (
          <EditableList
            title="סוגי טיפול (כרטיס רכב)"
            items={treatmentItems}
            onChange={setTreatmentItems}
            onReset={() => void resetCurrent()}
            isCustom={hasCustomTreatment}
            defaultLabel="ברירת מחדל מערכת"
          />
        ) : (
          <EditableList
            title="סעיפי בדיקת תלת/חצי"
            items={inspectionItems}
            onChange={setInspectionItems}
            onReset={() => void resetCurrent()}
            isCustom={hasCustomInspection}
            defaultLabel="ברירת מחדל מערכת"
          />
        )}

        <p className="text-xs text-muted-foreground">
          שינוי סדר או מחיקת פריט לא משפיע על היסטוריית טיפולים/בדיקות קיימת.
        </p>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            סגור
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || loading} className="gap-1">
            <Save size={14} />
            {saving ? 'שומר…' : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
