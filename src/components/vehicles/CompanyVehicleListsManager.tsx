import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  loadCompanyGapAlertsSettings,
  resetCompanyGapAlertsConfig,
  saveCompanyGapAlertsConfig,
} from '@/lib/companyGapAlertsSettings';
import {
  loadCompanyListSettings,
  resetCompanyInspectionChecklist,
  resetCompanyTreatmentItems,
  saveCompanyInspectionChecklist,
  saveCompanyTreatmentItems,
} from '@/lib/companyListSettings';
import { DEFAULT_INSPECTION_CHECKLIST, DEFAULT_TREATMENT_ITEMS } from '@/lib/vehicleListDefaults';
import { DEFAULT_GAP_ALERT_ITEMS, type GapAlertConfigItem } from '@/lib/vehicleGapAlertsDefaults';

type ListKind = 'treatment' | 'inspection' | 'gaps_alerts';

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

function EditableGapAlertsList({
  items,
  onChange,
  onReset,
  isCustom,
}: {
  items: GapAlertConfigItem[];
  onChange: (items: GapAlertConfigItem[]) => void;
  onReset: () => void;
  isCustom: boolean;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [criticalHideKey, setCriticalHideKey] = useState<string | null>(null);

  const sorted = [...items].sort((a, b) => a.order - b.order);

  const applyOrder = (next: GapAlertConfigItem[]) =>
    next.map((item, idx) => ({ ...item, order: idx + 1 }));

  const move = (key: string, dir: -1 | 1) => {
    const idx = sorted.findIndex((i) => i.key === key);
    if (idx < 0) return;
    const item = sorted[idx];
    if (item.locked) return;
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const target = sorted[j];
    if (target.locked) return;
    const next = [...sorted];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(applyOrder(next));
  };

  const setVisible = (key: string, visible: boolean) => {
    onChange(items.map((i) => (i.key === key ? { ...i, visible } : i)));
  };

  const requestToggleVisible = (item: GapAlertConfigItem) => {
    if (item.locked) return;
    if (item.visible && item.isCritical) {
      setCriticalHideKey(item.key);
      return;
    }
    setVisible(item.key, !item.visible);
  };

  const confirmCriticalHide = () => {
    if (!criticalHideKey) return;
    setVisible(criticalHideKey, false);
    setCriticalHideKey(null);
  };

  const criticalItem = criticalHideKey ? items.find((i) => i.key === criticalHideKey) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">שורות חוסרים והתראות</h3>
        <span className="text-xs text-muted-foreground">
          {isCustom ? 'תבנית מותאמת ללקוח' : 'ברירת מחדל מערכת'}
        </span>
      </div>

      <p className="text-xs text-muted-foreground rounded-lg bg-muted/60 p-2">
        הסתרה משפיעה על <strong>תצוגה בלבד</strong>. החישוב האוטומטי ממשיך לרוץ. שורת &quot;דורש השלמה&quot; תמיד
        מוצגת — סיכום מחושב של מצב הרכב.
      </p>

      <ul className="space-y-1 max-h-56 overflow-y-auto">
        {sorted.map((item) => (
          <li
            key={item.key}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-sm ${
              item.locked ? 'border-primary/30 bg-primary/5' : 'border-border'
            } ${!item.visible && !item.locked ? 'opacity-50' : ''}`}
          >
            <GripVertical size={14} className="text-muted-foreground shrink-0" />
            {editingKey === item.key && !item.locked ? (
              <input
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                className="flex-1 p-1 rounded border border-input text-sm"
                autoFocus
                onBlur={() => {
                  const v = editVal.trim();
                  if (v && v !== item.displayLabel) {
                    onChange(items.map((i) => (i.key === item.key ? { ...i, displayLabel: v } : i)));
                  }
                  setEditingKey(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <button
                type="button"
                className="flex-1 text-right truncate"
                disabled={item.locked}
                onClick={() => {
                  if (item.locked) return;
                  setEditingKey(item.key);
                  setEditVal(item.displayLabel);
                }}
              >
                {item.displayLabel}
                {item.locked && (
                  <span className="block text-[10px] text-primary font-normal">סיכום אוטומטי — תמיד מוצג</span>
                )}
              </button>
            )}
            {!item.locked && (
              <>
                <button
                  type="button"
                  className="p-1"
                  title={item.visible ? 'הסתר' : 'הצג'}
                  onClick={() => requestToggleVisible(item)}
                >
                  {item.visible ? <Eye size={14} /> : <EyeOff size={14} className="text-muted-foreground" />}
                </button>
                <button type="button" className="p-1" onClick={() => move(item.key, -1)} disabled={sorted.indexOf(item) === 0}>
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="p-1"
                  onClick={() => move(item.key, 1)}
                  disabled={sorted.indexOf(item) === sorted.length - 1}
                >
                  <ArrowDown size={14} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {isCustom && (
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onReset}>
          <RotateCcw size={14} />
          איפוס לברירת מחדל
        </Button>
      )}

      <AlertDialog open={!!criticalHideKey} onOpenChange={(o) => !o && setCriticalHideKey(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>הסתרת שורת {criticalItem?.displayLabel}?</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              הבדיקה האוטומטית (ביטוח / רישיון / טסט) תמשיך לרוץ ברקע. רק התצוגה בכרטיס הרכב תוסתר. נתונים,
              מסמכים והיסטוריה לא יימחקו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCriticalHide}>הסתר מתצוגה</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function CompanyVehicleListsManager({ open, onOpenChange, companyName, onSaved }: Props) {
  const [tab, setTab] = useState<ListKind>('treatment');
  const [treatmentItems, setTreatmentItems] = useState<string[]>([...DEFAULT_TREATMENT_ITEMS]);
  const [inspectionItems, setInspectionItems] = useState<string[]>([...DEFAULT_INSPECTION_CHECKLIST]);
  const [gapAlertItems, setGapAlertItems] = useState<GapAlertConfigItem[]>([...DEFAULT_GAP_ALERT_ITEMS]);
  const [hasCustomTreatment, setHasCustomTreatment] = useState(false);
  const [hasCustomInspection, setHasCustomInspection] = useState(false);
  const [hasCustomGapAlerts, setHasCustomGapAlerts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !companyName) return;
    setLoading(true);
    Promise.all([loadCompanyListSettings(companyName), loadCompanyGapAlertsSettings(companyName)])
      .then(([lists, gaps]) => {
        setTreatmentItems(lists.treatmentItems);
        setInspectionItems(lists.inspectionChecklist);
        setHasCustomTreatment(lists.hasCustomTreatment);
        setHasCustomInspection(lists.hasCustomInspection);
        setGapAlertItems(gaps.items);
        setHasCustomGapAlerts(gaps.hasCustom);
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
      } else if (tab === 'inspection') {
        await saveCompanyInspectionChecklist(companyName, inspectionItems);
        setHasCustomInspection(true);
      } else {
        await saveCompanyGapAlertsConfig(companyName, gapAlertItems);
        setHasCustomGapAlerts(true);
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
      } else if (tab === 'inspection') {
        await resetCompanyInspectionChecklist(companyName);
        setInspectionItems([...DEFAULT_INSPECTION_CHECKLIST]);
        setHasCustomInspection(false);
      } else {
        await resetCompanyGapAlertsConfig(companyName);
        setGapAlertItems([...DEFAULT_GAP_ALERT_ITEMS]);
        setHasCustomGapAlerts(false);
      }
      toast.success('אופס לברירת מחדל');
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה באיפוס');
    }
  };

  const tabHelp =
    tab === 'gaps_alerts'
      ? 'שם תצוגה (לחיצה) · הצג/הסתר (עין) · סדר (↑↓) · שמור · איפוס'
      : 'הוסף (+) · ערוך (לחיצה על פריט) · מחק (פח) · סדר (↑↓) · שמור · איפוס לברירת מחדל';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>רשימות טיפול ובדיקה — {companyName}</DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">{tabHelp}</p>
        </DialogHeader>

        <div className="flex gap-1 mb-2 flex-wrap">
          <button
            type="button"
            onClick={() => setTab('treatment')}
            className={`flex-1 min-w-[90px] py-2 rounded-lg text-xs sm:text-sm font-bold ${tab === 'treatment' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            סוגי טיפול
          </button>
          <button
            type="button"
            onClick={() => setTab('inspection')}
            className={`flex-1 min-w-[90px] py-2 rounded-lg text-xs sm:text-sm font-bold ${tab === 'inspection' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            בדיקת תלת-חצי
          </button>
          <button
            type="button"
            onClick={() => setTab('gaps_alerts')}
            className={`flex-1 min-w-[90px] py-2 rounded-lg text-xs sm:text-sm font-bold ${tab === 'gaps_alerts' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            חוסרים והתראות
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">טוען…</p>
        ) : tab === 'treatment' ? (
          <EditableList
            title="סוגי טיפול (פעולות רכב)"
            items={treatmentItems}
            onChange={setTreatmentItems}
            onReset={() => void resetCurrent()}
            isCustom={hasCustomTreatment}
            defaultLabel="ברירת מחדל מערכת"
          />
        ) : tab === 'inspection' ? (
          <EditableList
            title="סעיפי בדיקת תלת/חצי"
            items={inspectionItems}
            onChange={setInspectionItems}
            onReset={() => void resetCurrent()}
            isCustom={hasCustomInspection}
            defaultLabel="ברירת מחדל מערכת"
          />
        ) : (
          <EditableGapAlertsList
            items={gapAlertItems}
            onChange={setGapAlertItems}
            onReset={() => void resetCurrent()}
            isCustom={hasCustomGapAlerts}
          />
        )}

        {tab !== 'gaps_alerts' && (
          <p className="text-xs text-muted-foreground">
            שינוי סדר או מחיקת פריט לא משפיע על היסטוריית טיפולים/בדיקות קיימת.
          </p>
        )}

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
