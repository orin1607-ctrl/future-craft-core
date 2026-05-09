import { useState, useEffect } from 'react';
import { ArrowRight, ClipboardCheck, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface VehicleBasic {
  id: string;
  license_plate: string;
  internal_number: string;
  manufacturer: string;
  model: string;
}

const CHECKLIST_ITEMS = [
  'תוקף רישיון',
  'תוקף ביטוח',
  'בדיקה חזותית לרכב',
  'צמיגים',
  'גלגל רזרבי',
  'אורות לסוגיהן',
  'מגבים',
  'שמשות',
  'מראות',
  'בלמים',
  'דוושת בלם',
  'חגורות בטיחות',
  'נזילות שמן מנוע',
  'נזילות גלגל חילוף',
  'נזילות ושלמות פנסים',
  'רעש כללי',
  'נורות שעונים ונוריות',
  'אחר',
];

interface CheckItem {
  name: string;
  status: 'ok' | 'defect' | '';
  notes: string;
}

export default function PrivateVehicleInspection() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState<VehicleBasic[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [employeeName, setEmployeeName] = useState(user?.full_name || '');
  const [odometer, setOdometer] = useState('');
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<CheckItem[]>(
    CHECKLIST_ITEMS.map(name => ({ name, status: 'ok', notes: '' }))
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    applyCompanyScope(supabase.from('vehicles').select('id, license_plate, internal_number, manufacturer, model'), companyFilter)
      .then(({ data }) => { if (data) setVehicles(data as VehicleBasic[]); });
  }, []);

  const selectedVehicle = vehicles.find(v => v.id === vehicleId);

  const updateItem = (index: number, field: keyof CheckItem, value: string) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async () => {
    if (!vehicleId) { toast.error('יש לבחור רכב'); return; }
    if (!employeeName.trim()) { toast.error('יש להזין שם עובד'); return; }

    setLoading(true);
    const hasDefects = items.some(i => i.status === 'defect');

    const { data: inspection, error } = await supabase.from('vehicle_inspections').insert({
      vehicle_id: vehicleId,
      vehicle_plate: selectedVehicle?.license_plate || '',
      inspection_type: 'tri_semi_annual',
      inspector_name: employeeName,
      overall_status: hasDefects ? 'failed' : 'passed',
      notes: `קילומטראז׳: ${odometer}`,
      company_name: user?.company_name || '',
      created_by: user?.id,
    }).select('id').single();

    if (error || !inspection) {
      toast.error('שגיאה בשמירת הביקורת');
      setLoading(false);
      return;
    }

    const itemsPayload = items.map(item => ({
      inspection_id: inspection.id,
      item_name: item.name,
      status: item.status,
      notes: item.notes,
    }));
    await supabase.from('inspection_items').insert(itemsPayload);

    const defects = items.filter(i => i.status === 'defect');
    if (defects.length > 0) {
      const tasks = defects.map(d => ({
        vehicle_id: vehicleId,
        vehicle_plate: selectedVehicle?.license_plate || '',
        inspection_id: inspection.id,
        title: `ליקוי: ${d.name}`,
        description: d.notes || `ליקוי שנמצא בבדיקה תלת/חצי ${new Date().toLocaleDateString('he-IL')}`,
        status: 'open',
        company_name: user?.company_name || '',
        created_by: user?.id,
      }));
      await supabase.from('vehicle_tasks').insert(tasks);
      toast.success(`הבדיקה נשמרה, ${defects.length} משימות טיפול נפתחו`);
    } else {
      toast.success('הבדיקה נשמרה – הרכב תקין');
    }

    setLoading(false);
    navigate('/vehicle-inspections');
  };

  const inputClass = "w-full p-3 text-base rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  return (
    <div className="animate-fade-in pb-24">
      <button onClick={() => navigate('/vehicle-inspections')} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} /> חזרה
      </button>

      <div className="flex items-center gap-3 mb-6">
        <ClipboardCheck size={28} className="text-primary" />
        <h1 className="text-2xl font-bold">בדיקה תלת / חצי לרכב פרטי{selectedVehicle?.internal_number ? ` | מס' פנימי ${selectedVehicle.internal_number}` : ''}</h1>
      </div>

      {/* Top Fields */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-base font-medium mb-1.5">רכב מס׳ *</label>
          <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className={inputClass}>
            <option value="">בחר רכב...</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.license_plate}{v.internal_number ? ` | ${v.internal_number}` : ''} - {v.manufacturer} {v.model}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-base font-medium mb-1.5">שם עובד *</label>
            <input value={employeeName} onChange={e => setEmployeeName(e.target.value)} placeholder="שם עובד..." className={inputClass} />
          </div>
          <div>
            <label className="block text-base font-medium mb-1.5">קילומטר</label>
            <input type="number" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="0" className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-base font-medium mb-1.5">תאריך</label>
          <input type="date" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      {/* Inspection Table */}
      <div className="border border-border rounded-xl overflow-hidden mb-6">
        {/* Header */}
        <div className="grid grid-cols-[1fr_60px_60px_1fr] bg-muted/70 text-sm font-bold border-b border-border">
          <div className="p-2.5 border-l border-border">בדיקה</div>
          <div className="p-2.5 text-center border-l border-border">תקין</div>
          <div className="p-2.5 text-center border-l border-border">לא תקין</div>
          <div className="p-2.5">הערות</div>
        </div>

        {/* Rows */}
        {items.map((item, i) => (
          <div key={i} className={`grid grid-cols-[1fr_60px_60px_1fr] border-b border-border last:border-0 ${item.status === 'defect' ? 'bg-destructive/5' : ''}`}>
            <div className="p-2.5 text-sm font-medium border-l border-border flex items-center">{item.name}</div>
            <div className="p-2.5 border-l border-border flex items-center justify-center">
              <button
                type="button"
                onClick={() => updateItem(i, 'status', 'ok')}
                className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors ${
                  item.status === 'ok' ? 'bg-success/20 border-success text-success' : 'border-input text-transparent hover:border-muted-foreground'
                }`}
              >
                ✓
              </button>
            </div>
            <div className="p-2.5 border-l border-border flex items-center justify-center">
              <button
                type="button"
                onClick={() => updateItem(i, 'status', 'defect')}
                className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors ${
                  item.status === 'defect' ? 'bg-destructive/20 border-destructive text-destructive' : 'border-input text-transparent hover:border-muted-foreground'
                }`}
              >
                ✗
              </button>
            </div>
            <div className="p-1.5">
              <input
                value={item.notes}
                onChange={e => updateItem(i, 'notes', e.target.value)}
                placeholder="הערות..."
                className="w-full p-1.5 text-xs rounded-lg border border-input bg-background focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!vehicleId || loading}
        className={`w-full py-4 rounded-xl text-lg font-bold transition-colors flex items-center justify-center gap-2 ${
          vehicleId && !loading ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'
        }`}
      >
        <Save size={22} />
        {loading ? 'שומר...' : 'שמור בדיקה'}
      </button>
    </div>
  );
}
