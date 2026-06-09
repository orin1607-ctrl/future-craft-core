import { useState, useEffect } from 'react';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import type { VehicleHubVehicle } from '@/components/vehicles/VehicleHub';
import { recordVehicleHubAction } from '@/lib/vehicleActionFollowUp';

const CATEGORIES = [
  'ליקוי',
  'תקלה',
  'טיפול',
  'הזמנת שירות',
  'תאונה',
  'בדיקה',
  'התראה',
  'מסמך',
  'שינוע',
  'הערה',
] as const;

type Category = (typeof CATEGORIES)[number];

const SUB_TYPES: Record<Category, string[]> = {
  ליקוי: ['בלמים', 'מנוע', 'גוף / פח', 'גלגלים', 'חשמל', 'מיזוג', 'הגה', 'אחר'],
  תקלה: ['רכב לא נדלק', 'פנצ׳ר', 'מצבר', 'נורות', 'חיישן תקלה', 'אחר'],
  טיפול: ['החלפת שמן', 'צמיגים', 'מסנן', 'מניעתי', 'מזגן', 'פנצ׳ר', 'מצבר', 'גרר', 'אחר'],
  'הזמנת שירות': ['למוסך', 'לספק חלקים', 'גרר', 'רכב חלופי', 'אחר'],
  תאונה: ['תאונת דרכים', 'נזק חניה', 'שריטה', 'פגיעת צד', 'עורפי', 'אחר'],
  בדיקה: ['תלת שנתית', 'חצי שנתית', 'טסט', 'ביקורת שדה', 'לאחר תאונה', 'אחר'],
  התראה: ['תוקף ביטוח', 'תוקף טסט', 'תוקף רישיון', 'ק"מ לטיפול', 'אחר'],
  מסמך: ['רישיון רכב', 'פוליסת ביטוח', 'אישור תקינות', 'תעודת בעלות', 'אחר'],
  שינוע: ['לנהג חדש', 'למוסך', 'לסניף', 'למחסן', 'אחר'],
  הערה: ['כללית', 'לנהג', 'פנימית', 'אחר'],
};

const inputClass =
  'w-full p-3 rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none text-base';

export default function VehicleActionModal({
  open,
  onOpenChange,
  vehicle,
  driverName,
  initialCategory,
  onSaved,
  onOpenAlert,
  onOpenSupplier,
  onEditVehicle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: VehicleHubVehicle;
  driverName: string;
  initialCategory?: string;
  onSaved: () => void;
  onOpenAlert: () => void;
  onOpenSupplier: () => void;
  onEditVehicle?: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<'category' | 'subtype' | 'form'>('category');
  const [category, setCategory] = useState<Category | ''>('');
  const [subType, setSubType] = useState('');
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('בינונית');
  const [garage, setGarage] = useState('');
  const [serviceStatus, setServiceStatus] = useState('פתוח');
  const [location, setLocation] = useState('');
  const [damage, setDamage] = useState('קל');
  const [inspector, setInspector] = useState('');
  const [result, setResult] = useState('עבר');
  const [alertUrgency, setAlertUrgency] = useState('רגיל');
  const [docName, setDocName] = useState('');
  const [docExpiry, setDocExpiry] = useState('');
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [transferDriver, setTransferDriver] = useState('');
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep(initialCategory ? 'subtype' : 'category');
    if (initialCategory && CATEGORIES.includes(initialCategory as Category)) {
      setCategory(initialCategory as Category);
    } else {
      setCategory('');
    }
    setSubType('');
    setDescription('');
    setDate(new Date().toISOString().split('T')[0]);
  }, [open, initialCategory]);

  const resetAndClose = () => {
    onOpenChange(false);
    setStep('category');
    setCategory('');
    setSubType('');
  };

  const pickCategory = (cat: Category) => {
    if (cat === 'התראה') {
      resetAndClose();
      onOpenAlert();
      return;
    }
    setCategory(cat);
    setStep('subtype');
  };

  const pickSub = (sub: string) => {
    setSubType(sub);
    setStep('form');
    if (category === 'מסמך') setDocName(sub);
  };

  const save = async () => {
    if (!category || !subType) return;
    setLoading(true);
    let error: { message: string } | null = null;

    try {
      if (category === 'ליקוי') {
        ({ error } = await supabase.from('vehicle_tasks').insert({
          vehicle_id: vehicle.id,
          vehicle_plate: vehicle.license_plate,
          company_name: vehicle.company_name || user?.company_name || '',
          title: `${subType}${description ? ` – ${description.slice(0, 40)}` : ''}`,
          description: description || subType,
          status: 'open',
          created_by: user?.id,
        }));
      } else if (category === 'תקלה') {
        const urgency =
          severity === 'גבוהה' ? 'urgent' : severity === 'נמוכה' ? 'low' : 'normal';
        ({ error } = await supabase.from('faults').insert({
          vehicle_plate: vehicle.license_plate,
          driver_name: driverName,
          fault_type: subType,
          description: description || subType,
          urgency,
          status: 'opened',
          company_name: vehicle.company_name || user?.company_name || '',
          created_by: user?.id,
          date: date || null,
        }));
      } else if (category === 'טיפול' || category === 'הזמנת שירות') {
        ({ error } = await supabase.from('service_orders').insert({
          service_category: category === 'טיפול' ? subType : `${category} – ${subType}`,
          description: description || subType,
          vehicle_plate: vehicle.license_plate,
          driver_name: driverName,
          vendor_name: garage || null,
          odometer: vehicle.odometer || 0,
          company_name: vehicle.company_name || user?.company_name || '',
          treatment_status:
            serviceStatus === 'הושלם'
              ? 'completed'
              : serviceStatus === 'בטיפול'
                ? 'in_treatment'
                : 'pending_approval',
          created_by: user?.id,
          ordering_user: user?.full_name || '',
        }));
      } else if (category === 'תאונה') {
        ({ error } = await supabase.from('accidents').insert({
          vehicle_plate: vehicle.license_plate,
          driver_name: driverName,
          location: location || null,
          description: description || subType,
          company_name: vehicle.company_name || user?.company_name || '',
          created_by: user?.id,
          date: date || null,
        }));
      } else if (category === 'בדיקה') {
        const typeMap: Record<string, string> = {
          'תלת שנתית': 'tri_semi_annual',
          'חצי שנתית': 'semi_annual',
          טסט: 'semi_annual',
        };
        ({ error } = await supabase.from('vehicle_inspections').insert({
          vehicle_id: vehicle.id,
          vehicle_plate: vehicle.license_plate,
          inspection_type: typeMap[subType] || 'quarterly',
          inspector_name: inspector || user?.full_name || '',
          overall_status: result === 'עבר' ? 'passed' : result === 'נכשל' ? 'failed' : 'pending',
          notes: description || subType,
          inspection_date: date,
          company_name: vehicle.company_name || user?.company_name || '',
          created_by: user?.id,
        }));
      } else if (category === 'הערה') {
        const merged = [vehicle.notes, `[${subType}] ${description}`].filter(Boolean).join('\n');
        ({ error } = await supabase.from('vehicles').update({ notes: merged }).eq('id', vehicle.id));
      } else if (category === 'שינוע') {
        const transportDesc = `מ: ${fromLoc || '—'} → אל: ${toLoc || '—'}${description ? `. ${description}` : ''}`;
        const serviceDate = date || new Date().toISOString().split('T')[0];
        const dateTimeIso = date ? new Date(`${date}T09:00:00`).toISOString() : null;
        ({ error } = await supabase.from('service_orders').insert({
          service_category: `שינוע – ${subType}`,
          description: transportDesc,
          vehicle_plate: vehicle.license_plate,
          driver_name: transferDriver || driverName,
          towing_requested: true,
          towing_address: toLoc || null,
          service_date: serviceDate,
          date_time: dateTimeIso,
          company_name: vehicle.company_name || user?.company_name || '',
          treatment_status: 'pending_approval',
          created_by: user?.id,
          ordering_user: user?.full_name || '',
        }));
      } else if (category === 'מסמך') {
        setLoading(false);
        resetAndClose();
        if (onEditVehicle) {
          onEditVehicle();
          toast.info('העלאת מסמך — בטופס עריכת הרכב (אותם שדות ו-bindings)');
        } else {
          toast.info('להעלאת קובץ — עריכת רכב');
        }
        return;
      }
    } catch (e) {
      error = { message: String(e) };
    }

    setLoading(false);
    if (error) {
      toast.error('שגיאה בשמירת הפעולה');
      console.error(error);
      return;
    }
    const actionDetails = [subType, description].filter(Boolean).join(' · ');
    const datedCategories = new Set(['שינוע', 'בדיקה', 'טיפול', 'הזמנת שירות', 'תקלה', 'תאונה']);
    await recordVehicleHubAction({
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.license_plate,
      companyName: vehicle.company_name || user?.company_name || '',
      action: `פתיחת ${category}`,
      details: actionDetails,
      userId: user?.id,
      userName: user?.full_name,
      targetDate: datedCategories.has(category) && date ? date : null,
      notifyTransport: category === 'שינוע',
      transportMessage:
        category === 'שינוע'
          ? `רכב ${vehicle.license_plate} · ${subType} · מ: ${fromLoc || '—'} → ${toLoc || '—'}`
          : undefined,
    });
    toast.success(`${category} נשמר`);
    onSaved();
    resetAndClose();
  };

  const formTitle = category && subType ? `${category} · ${subType}` : 'פרטים';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-right">
          <SheetTitle>פתיחת פעולה חדשה</SheetTitle>
          <SheetDescription>
            {vehicle.license_plate}
            {vehicle.internal_number ? ` · ${vehicle.internal_number}` : ''}
          </SheetDescription>
        </SheetHeader>

        {step === 'category' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">בחר קטגוריה</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => pickCategory(cat)}
                  className="card-elevated py-3 px-2 text-sm font-bold hover:border-primary/40 transition-colors"
                >
                  {cat}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  resetAndClose();
                  onOpenSupplier();
                }}
                className="card-elevated py-3 px-2 text-sm font-bold hover:border-primary/40 transition-colors"
              >
                הזמנה לספק
              </button>
            </div>
          </div>
        )}

        {step === 'subtype' && category && (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{category} – סוג</p>
            <div className="space-y-2">
              {(SUB_TYPES[category] || ['כללי']).map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => pickSub(sub)}
                  className="w-full card-elevated py-3 px-4 text-right font-medium flex items-center justify-between hover:border-primary/40"
                >
                  {sub}
                  <ChevronLeft size={18} className="text-muted-foreground" />
                </button>
              ))}
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => setStep('category')}>
              <ArrowRight size={16} className="ml-2" /> חזור
            </Button>
          </div>
        )}

        {step === 'form' && category && (
          <div className="mt-4 space-y-4">
            <p className="font-bold">{formTitle}</p>
            <div>
              <label className="block text-sm font-medium mb-1 text-muted-foreground">תאריך</label>
              <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {(category === 'ליקוי' || category === 'תקלה' || category === 'תאונה') && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1 text-muted-foreground">תיאור</label>
                  <textarea
                    className={`${inputClass} min-h-[80px] resize-y`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="תאר את הבעיה..."
                  />
                </div>
                {category !== 'תאונה' && (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-muted-foreground">חומרה</label>
                    <select className={inputClass} value={severity} onChange={(e) => setSeverity(e.target.value)}>
                      <option>גבוהה</option>
                      <option>בינונית</option>
                      <option>נמוכה</option>
                    </select>
                  </div>
                )}
              </>
            )}

            {category === 'תאונה' && (
              <div>
                <label className="block text-sm font-medium mb-1 text-muted-foreground">מיקום</label>
                <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            )}

            {(category === 'טיפול' || category === 'הזמנת שירות') && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1 text-muted-foreground">מוסך / ספק</label>
                  <input className={inputClass} value={garage} onChange={(e) => setGarage(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-muted-foreground">תיאור</label>
                  <textarea
                    className={`${inputClass} min-h-[72px]`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-muted-foreground">סטטוס</label>
                  <select className={inputClass} value={serviceStatus} onChange={(e) => setServiceStatus(e.target.value)}>
                    <option>פתוח</option>
                    <option>בטיפול</option>
                    <option>הושלם</option>
                  </select>
                </div>
              </>
            )}

            {category === 'בדיקה' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1 text-muted-foreground">בודק</label>
                  <input className={inputClass} value={inspector} onChange={(e) => setInspector(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-muted-foreground">תוצאה</label>
                  <select className={inputClass} value={result} onChange={(e) => setResult(e.target.value)}>
                    <option>עבר</option>
                    <option>נכשל</option>
                    <option>ממתין</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-muted-foreground">הערות</label>
                  <textarea className={`${inputClass} min-h-[72px]`} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
              </>
            )}

            {category === 'הערה' && (
              <div>
                <label className="block text-sm font-medium mb-1 text-muted-foreground">הודעה / הערה</label>
                <textarea className={`${inputClass} min-h-[80px]`} value={noteText || description} onChange={(e) => { setNoteText(e.target.value); setDescription(e.target.value); }} />
              </div>
            )}

            {category === 'שינוע' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1 text-muted-foreground">מאיפה</label>
                  <input className={inputClass} value={fromLoc} onChange={(e) => setFromLoc(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-muted-foreground">לאן</label>
                  <input className={inputClass} value={toLoc} onChange={(e) => setToLoc(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-muted-foreground">נהג / מוביל</label>
                  <input className={inputClass} value={transferDriver} onChange={(e) => setTransferDriver(e.target.value)} placeholder={driverName} />
                </div>
              </>
            )}

            {category === 'מסמך' && (
              <div>
                <label className="block text-sm font-medium mb-1 text-muted-foreground">תוקף עד</label>
                <input type="date" className={inputClass} value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep('subtype')}>
                חזור
              </Button>
              <Button type="button" className="flex-1" disabled={loading} onClick={save}>
                {loading ? 'שומר...' : 'שמור פעולה'}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
