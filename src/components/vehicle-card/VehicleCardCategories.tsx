import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Car, FileText, Shield, Wrench, Settings, Folder, ClipboardCheck,
  AlertTriangle, Truck, Bell, History, Activity, LayoutGrid, Upload,
  Power, Save, Plus, Link as LinkIcon,
} from 'lucide-react';

type VehicleAny = Record<string, any>;

interface Props {
  vehicle: VehicleAny;
  onUpdated?: (v: VehicleAny) => void;
}

const FINANCE_TRACKS = [
  { value: 'operational_leasing', label: 'ליסינג תפעולי' },
  { value: 'financial_leasing', label: 'ליסינג מימוני' },
  { value: 'loan', label: 'הלוואה / מימון' },
  { value: 'self_maintenance', label: 'תחזוקה עצמית' },
  { value: 'service_maintenance', label: 'שירות ותחזוקה' },
  { value: 'company_owned', label: 'בעלות חברה' },
  { value: 'private_owned', label: 'בעלות פרטית' },
  { value: 'rental', label: 'השכרה' },
  { value: 'other', label: 'אחר' },
];

const MAINTENANCE_METHODS = [
  { value: 'dalya', label: 'דליה' },
  { value: 'self', label: 'תחזוקה עצמית' },
  { value: 'leasing', label: 'ליסינג' },
  { value: 'external_garage', label: 'מוסך חיצוני' },
];

const VEHICLE_STATUSES = [
  { value: 'active', label: 'פעיל' },
  { value: 'in_service', label: 'בטיפול' },
  { value: 'out_of_service', label: 'לא פעיל / מושבת' },
  { value: 'archived', label: 'מוארך' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Section({ title, icon: Icon, children, value }: { title: string; icon: any; children: React.ReactNode; value: string; }) {
  return (
    <AccordionItem value={value} className="border border-border rounded-xl mb-2 overflow-hidden bg-card">
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex items-center gap-2 text-base font-semibold">
          <Icon size={18} className="text-primary" />
          {title}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}

export default function VehicleCardCategories({ vehicle, onUpdated }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [v, setV] = useState<VehicleAny>(vehicle);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [newDept, setNewDept] = useState('');

  useEffect(() => { setV(vehicle); }, [vehicle]);

  useEffect(() => {
    const company = vehicle.company_name;
    if (!company) return;
    supabase.from('departments').select('id,name').eq('company_name', company).order('name')
      .then(({ data }) => { if (data) setDepartments(data as any); });
  }, [vehicle.company_name]);

  const set = (patch: VehicleAny) => setV((p) => ({ ...p, ...patch }));
  const setJson = (field: string, key: string, val: any) =>
    setV((p) => ({ ...p, [field]: { ...(p[field] || {}), [key]: val } }));
  const getJson = (field: string, key: string, dflt: any = '') =>
    (v[field] && v[field][key] !== undefined && v[field][key] !== null) ? v[field][key] : dflt;

  const save = async (fields: string[]) => {
    setSaving(true);
    const patch: VehicleAny = {};
    fields.forEach((f) => (patch[f] = v[f] ?? null));
    const { error, data } = await supabase.from('vehicles').update(patch).eq('id', v.id).select().single();
    setSaving(false);
    if (error) { toast.error('שגיאה בשמירה: ' + error.message); return; }
    toast.success('נשמר ✓');
    if (data) { setV(data); onUpdated?.(data); }
  };

  const toggleActive = async () => {
    const newStatus = v.status === 'out_of_service' ? 'active' : 'out_of_service';
    const { error, data } = await supabase.from('vehicles').update({ status: newStatus }).eq('id', v.id).select().single();
    if (error) { toast.error(error.message); return; }
    toast.success(newStatus === 'active' ? 'הרכב הופעל' : 'הרכב הושבת');
    if (data) { setV(data); onUpdated?.(data); }
  };

  const addDepartment = async () => {
    if (!newDept.trim()) return;
    const { data, error } = await supabase.from('departments').insert({
      company_name: v.company_name, name: newDept.trim(), created_by: profile?.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setDepartments((p) => [...p, data as any]);
    set({ department: newDept.trim() });
    setNewDept('');
    toast.success('מחלקה נוספה');
  };

  const SaveBtn = ({ fields }: { fields: string[] }) => (
    <Button size="sm" onClick={() => save(fields)} disabled={saving} className="mt-3">
      <Save size={14} className="ml-1" /> שמור
    </Button>
  );

  const isInactive = v.status === 'out_of_service';

  // ---- Insurances helpers ----
  const InsuranceBlock = ({ k, title }: { k: 'mandatory' | 'comprehensive' | 'third_party'; title: string }) => {
    const blk = (v.insurances && v.insurances[k]) || {};
    const setIns = (key: string, val: any) =>
      setV((p) => ({ ...p, insurances: { ...(p.insurances || {}), [k]: { ...(p.insurances?.[k] || {}), [key]: val } } }));
    return (
      <div className="border border-border rounded-lg p-3 mb-3 bg-muted/30">
        <h4 className="font-semibold mb-2">{title}</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="חברה מבטחת"><Input value={blk.company || ''} onChange={(e) => setIns('company', e.target.value)} /></Field>
          <Field label="סוכן ביטוח"><Input value={blk.agent || ''} onChange={(e) => setIns('agent', e.target.value)} /></Field>
          <Field label="מספר פוליסה"><Input value={blk.policy_number || ''} onChange={(e) => setIns('policy_number', e.target.value)} /></Field>
          <Field label="סוג ביטוח"><Input value={blk.type || ''} onChange={(e) => setIns('type', e.target.value)} /></Field>
          <Field label="תאריך התחלה"><Input type="date" value={blk.start_date || ''} onChange={(e) => setIns('start_date', e.target.value)} /></Field>
          <Field label="תאריך סיום"><Input type="date" value={blk.end_date || ''} onChange={(e) => setIns('end_date', e.target.value)} /></Field>
          <Field label="סטטוס"><Input value={blk.status || ''} onChange={(e) => setIns('status', e.target.value)} /></Field>
          <Field label="עלות"><Input type="number" value={blk.cost || ''} onChange={(e) => setIns('cost', e.target.value)} /></Field>
          <Field label="אופן תשלום"><Input value={blk.payment_method || ''} onChange={(e) => setIns('payment_method', e.target.value)} /></Field>
          <Field label="קישור למסמך"><Input value={blk.doc_url || ''} onChange={(e) => setIns('doc_url', e.target.value)} /></Field>
        </div>
        <div className="mt-2">
          <Field label="הערות"><Textarea rows={2} value={blk.notes || ''} onChange={(e) => setIns('notes', e.target.value)} /></Field>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top header card */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xl font-bold">
              <Car size={22} className="text-primary" />
              {v.license_plate}
              {v.internal_number && <span className="text-sm text-muted-foreground">({v.internal_number})</span>}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {v.manufacturer} {v.model} {v.year && `· ${v.year}`}
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
              <span>ק"מ: {(v.odometer || 0).toLocaleString()}</span>
              {v.assigned_driver_id && <span>נהג משויך ✓</span>}
              {v.current_location && <span>מיקום: {v.current_location}</span>}
              {v.ownership_type && <span>בעלות: {v.ownership_type}</span>}
            </div>
          </div>
          <Button
            variant={isInactive ? 'default' : 'outline'}
            onClick={toggleActive}
            className={isInactive ? '' : 'border-destructive text-destructive hover:bg-destructive/10'}
          >
            <Power size={16} className="ml-1" />
            {isInactive ? 'הפעל רכב' : 'השבת רכב'}
          </Button>
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {/* 1 - Vehicle details */}
        <Section value="cat1" title="1. פרטי רכב" icon={Car}>
          <h4 className="font-semibold text-sm mt-1 mb-2 text-muted-foreground">עריכת פרטים</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="מספר רכב"><Input value={v.license_plate || ''} onChange={(e) => set({ license_plate: e.target.value })} /></Field>
            <Field label="מספר פנימי"><Input value={v.internal_number || ''} onChange={(e) => set({ internal_number: e.target.value })} /></Field>
            <Field label="מספר שלדה VIN"><Input value={v.vin || ''} onChange={(e) => set({ vin: e.target.value })} /></Field>
            <Field label="מספר מנוע"><Input value={v.engine_number || ''} onChange={(e) => set({ engine_number: e.target.value })} /></Field>
            <Field label="יצרן"><Input value={v.manufacturer || ''} onChange={(e) => set({ manufacturer: e.target.value })} /></Field>
            <Field label="דגם"><Input value={v.model || ''} onChange={(e) => set({ model: e.target.value })} /></Field>
            <Field label="שנתון"><Input type="number" value={v.year || ''} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="כינוי רכב"><Input value={v.nickname || ''} onChange={(e) => set({ nickname: e.target.value })} /></Field>
            <Field label="סוג רכב"><Input value={v.vehicle_type || ''} onChange={(e) => set({ vehicle_type: e.target.value })} /></Field>
            <Field label="שימוש"><Input value={v.usage_type || ''} onChange={(e) => set({ usage_type: e.target.value })} /></Field>
            <Field label="סוג דלק"><Input value={v.fuel_type || ''} onChange={(e) => set({ fuel_type: e.target.value })} /></Field>
            <Field label="סגמנט"><Input value={v.segment || ''} onChange={(e) => set({ segment: e.target.value })} /></Field>
            <Field label="סוג בעלות"><Input value={v.ownership_type || ''} onChange={(e) => set({ ownership_type: e.target.value })} /></Field>
          </div>

          <h4 className="font-semibold text-sm mt-5 mb-2 text-muted-foreground">שיוך ומיקום</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="מחלקה">
              <div className="flex gap-1">
                <Select value={v.department || ''} onValueChange={(val) => set({ department: val })}>
                  <SelectTrigger><SelectValue placeholder="בחר מחלקה" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-1 mt-1">
                <Input placeholder="הוסף מחלקה חדשה" value={newDept} onChange={(e) => setNewDept(e.target.value)} className="text-xs" />
                <Button size="sm" variant="outline" onClick={addDepartment}><Plus size={14} /></Button>
              </div>
            </Field>
            <Field label="ממונה רכב"><Input value={v.vehicle_manager || ''} onChange={(e) => set({ vehicle_manager: e.target.value })} /></Field>
            <Field label="מיקום נוכחי"><Input value={v.current_location || ''} onChange={(e) => set({ current_location: e.target.value })} /></Field>
            <Field label="אתר עבודה"><Input value={v.work_site || ''} onChange={(e) => set({ work_site: e.target.value })} /></Field>
            <Field label="סטטוס">
              <Select value={v.status || 'active'} onValueChange={(val) => set({ status: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VEHICLE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <h4 className="font-semibold text-sm mt-5 mb-2 text-muted-foreground">תאריכים</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="תאריך רכישה"><Input type="date" value={v.purchase_date || ''} onChange={(e) => set({ purchase_date: e.target.value })} /></Field>
            <Field label="תאריך עליה לכביש"><Input type="date" value={v.road_entry_date || ''} onChange={(e) => set({ road_entry_date: e.target.value })} /></Field>
            <Field label="תאריך מכירה"><Input type="date" value={v.sale_date || ''} onChange={(e) => set({ sale_date: e.target.value })} /></Field>
            <Field label="תאריך גריעה"><Input type="date" value={v.archived_date || ''} onChange={(e) => set({ archived_date: e.target.value })} /></Field>
          </div>

          <SaveBtn fields={['license_plate','internal_number','vin','engine_number','manufacturer','model','year','nickname','vehicle_type','usage_type','fuel_type','segment','ownership_type','department','vehicle_manager','current_location','work_site','status','purchase_date','road_entry_date','sale_date','archived_date']} />
        </Section>

        {/* 2 - Finance / Leasing */}
        <Section value="cat2" title="2. בעלות, ליסינג ומימון" icon={FileText}>
          <Field label="סוג מסלול">
            <Select value={v.finance_track || ''} onValueChange={(val) => set({ finance_track: val })}>
              <SelectTrigger><SelectValue placeholder="בחר מסלול" /></SelectTrigger>
              <SelectContent>
                {FINANCE_TRACKS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {(v.finance_track === 'operational_leasing' || v.finance_track === 'financial_leasing' || v.finance_track === 'rental') && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 border border-border rounded-lg p-3 bg-muted/30">
              <Field label="חברת ליסינג/השכרה"><Input value={getJson('finance_details','company')} onChange={(e) => setJson('finance_details','company',e.target.value)} /></Field>
              <Field label="מספר הסכם"><Input value={getJson('finance_details','agreement_number')} onChange={(e) => setJson('finance_details','agreement_number',e.target.value)} /></Field>
              <Field label="עלות חודשית"><Input type="number" value={getJson('finance_details','monthly_cost')} onChange={(e) => setJson('finance_details','monthly_cost',e.target.value)} /></Field>
              {v.finance_track === 'operational_leasing' && (
                <>
                  <Field label='ק"מ כלול'><Input type="number" value={getJson('finance_details','included_km')} onChange={(e) => setJson('finance_details','included_km',e.target.value)} /></Field>
                  <Field label='עלות חריגה'><Input type="number" value={getJson('finance_details','overage_cost')} onChange={(e) => setJson('finance_details','overage_cost',e.target.value)} /></Field>
                  <Field label="אחריות תחזוקה"><Input value={getJson('finance_details','maintenance_coverage')} onChange={(e) => setJson('finance_details','maintenance_coverage',e.target.value)} /></Field>
                </>
              )}
              <Field label="תאריך התחלה"><Input type="date" value={getJson('finance_details','start_date')} onChange={(e) => setJson('finance_details','start_date',e.target.value)} /></Field>
              <Field label="תאריך סיום"><Input type="date" value={getJson('finance_details','end_date')} onChange={(e) => setJson('finance_details','end_date',e.target.value)} /></Field>
              <Field label="יתרת תשלומים"><Input type="number" value={getJson('finance_details','remaining_payments')} onChange={(e) => setJson('finance_details','remaining_payments',e.target.value)} /></Field>
              <Field label="איש קשר"><Input value={getJson('finance_details','contact_name')} onChange={(e) => setJson('finance_details','contact_name',e.target.value)} /></Field>
              <Field label="טלפון"><Input value={getJson('finance_details','contact_phone')} onChange={(e) => setJson('finance_details','contact_phone',e.target.value)} /></Field>
              <Field label="מייל"><Input value={getJson('finance_details','contact_email')} onChange={(e) => setJson('finance_details','contact_email',e.target.value)} /></Field>
              <Field label="קישור להסכם"><Input value={getJson('finance_details','doc_url')} onChange={(e) => setJson('finance_details','doc_url',e.target.value)} /></Field>
              <div className="col-span-full">
                <Field label="הערות"><Textarea rows={2} value={getJson('finance_details','notes')} onChange={(e) => setJson('finance_details','notes',e.target.value)} /></Field>
              </div>
            </div>
          )}

          {(v.finance_track === 'service_maintenance') && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 border border-border rounded-lg p-3 bg-muted/30">
              <Field label="ספק שירות"><Input value={getJson('finance_details','provider')} onChange={(e) => setJson('finance_details','provider',e.target.value)} /></Field>
              <Field label="איש קשר"><Input value={getJson('finance_details','contact_name')} onChange={(e) => setJson('finance_details','contact_name',e.target.value)} /></Field>
              <Field label="טלפון"><Input value={getJson('finance_details','contact_phone')} onChange={(e) => setJson('finance_details','contact_phone',e.target.value)} /></Field>
              <Field label="סוג שירות"><Input value={getJson('finance_details','service_type')} onChange={(e) => setJson('finance_details','service_type',e.target.value)} /></Field>
              <Field label="תנאי שירות"><Input value={getJson('finance_details','terms')} onChange={(e) => setJson('finance_details','terms',e.target.value)} /></Field>
              <Field label="SLA"><Input value={getJson('finance_details','sla')} onChange={(e) => setJson('finance_details','sla',e.target.value)} /></Field>
              <div className="col-span-full">
                <Field label="הערות"><Textarea rows={2} value={getJson('finance_details','notes')} onChange={(e) => setJson('finance_details','notes',e.target.value)} /></Field>
              </div>
            </div>
          )}

          {(v.finance_track === 'company_owned' || v.finance_track === 'private_owned') && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 border border-border rounded-lg p-3 bg-muted/30">
              <Field label="בעלים רשום"><Input value={getJson('finance_details','registered_owner')} onChange={(e) => setJson('finance_details','registered_owner',e.target.value)} /></Field>
              <Field label="תאריך רכישה"><Input type="date" value={getJson('finance_details','purchase_date')} onChange={(e) => setJson('finance_details','purchase_date',e.target.value)} /></Field>
              <Field label="קישור למסמכי בעלות"><Input value={getJson('finance_details','ownership_doc')} onChange={(e) => setJson('finance_details','ownership_doc',e.target.value)} /></Field>
              <div className="col-span-full">
                <Field label="הערות בעלות"><Textarea rows={2} value={getJson('finance_details','notes')} onChange={(e) => setJson('finance_details','notes',e.target.value)} /></Field>
              </div>
            </div>
          )}

          {/* Pledge */}
          <div className="mt-4 border border-border rounded-lg p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!v.is_pledged} onChange={(e) => set({ is_pledged: e.target.checked })} />
              <span className="font-semibold">האם הרכב משועבד?</span>
            </label>
            {v.is_pledged && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                <Field label="למי משועבד"><Input value={getJson('pledge_details','holder')} onChange={(e) => setJson('pledge_details','holder',e.target.value)} /></Field>
                <Field label="מספר שעבוד"><Input value={getJson('pledge_details','number')} onChange={(e) => setJson('pledge_details','number',e.target.value)} /></Field>
                <Field label="תאריך התחלה"><Input type="date" value={getJson('pledge_details','start_date')} onChange={(e) => setJson('pledge_details','start_date',e.target.value)} /></Field>
                <Field label="תאריך סיום"><Input type="date" value={getJson('pledge_details','end_date')} onChange={(e) => setJson('pledge_details','end_date',e.target.value)} /></Field>
                <Field label="קישור למסמך"><Input value={getJson('pledge_details','doc_url')} onChange={(e) => setJson('pledge_details','doc_url',e.target.value)} /></Field>
                <div className="col-span-full"><Field label="הערות"><Textarea rows={2} value={getJson('pledge_details','notes')} onChange={(e) => setJson('pledge_details','notes',e.target.value)} /></Field></div>
              </div>
            )}
          </div>

          {/* Loan toggle */}
          {['self_maintenance','company_owned','private_owned','loan'].includes(v.finance_track) && (
            <div className="mt-4 border border-border rounded-lg p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!v.has_loan || v.finance_track === 'loan'} onChange={(e) => set({ has_loan: e.target.checked })} />
                <span className="font-semibold">קיימת הלוואה / מימון?</span>
              </label>
              {(v.has_loan || v.finance_track === 'loan') && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                  <Field label="חברת מימון / בנק"><Input value={getJson('loan_details','lender')} onChange={(e) => setJson('loan_details','lender',e.target.value)} /></Field>
                  <Field label="מספר הסכם הלוואה"><Input value={getJson('loan_details','agreement_number')} onChange={(e) => setJson('loan_details','agreement_number',e.target.value)} /></Field>
                  <Field label="סכום מקורי"><Input type="number" value={getJson('loan_details','original_amount')} onChange={(e) => setJson('loan_details','original_amount',e.target.value)} /></Field>
                  <Field label="יתרת הלוואה"><Input type="number" value={getJson('loan_details','balance')} onChange={(e) => setJson('loan_details','balance',e.target.value)} /></Field>
                  <Field label="תאריך התחלה"><Input type="date" value={getJson('loan_details','start_date')} onChange={(e) => setJson('loan_details','start_date',e.target.value)} /></Field>
                  <Field label="תאריך סיום"><Input type="date" value={getJson('loan_details','end_date')} onChange={(e) => setJson('loan_details','end_date',e.target.value)} /></Field>
                  <Field label="ריבית"><Input value={getJson('loan_details','interest')} onChange={(e) => setJson('loan_details','interest',e.target.value)} /></Field>
                  <Field label="החזר חודשי"><Input type="number" value={getJson('loan_details','monthly_payment')} onChange={(e) => setJson('loan_details','monthly_payment',e.target.value)} /></Field>
                  <Field label="מספר תשלומים"><Input type="number" value={getJson('loan_details','total_payments')} onChange={(e) => setJson('loan_details','total_payments',e.target.value)} /></Field>
                  <Field label="תשלומים שנותרו"><Input type="number" value={getJson('loan_details','remaining_payments')} onChange={(e) => setJson('loan_details','remaining_payments',e.target.value)} /></Field>
                  <Field label="קישור למסמך הלוואה"><Input value={getJson('loan_details','doc_url')} onChange={(e) => setJson('loan_details','doc_url',e.target.value)} /></Field>
                  <div className="col-span-full"><Field label="הערות הלוואה"><Textarea rows={2} value={getJson('loan_details','notes')} onChange={(e) => setJson('loan_details','notes',e.target.value)} /></Field></div>
                </div>
              )}
            </div>
          )}

          <SaveBtn fields={['finance_track','finance_details','is_pledged','pledge_details','has_loan','loan_details']} />
        </Section>

        {/* 3 - Insurance & licensing */}
        <Section value="cat3" title="3. ביטוחים ורישיונות" icon={Shield}>
          <InsuranceBlock k="mandatory" title="ביטוח חובה" />
          <InsuranceBlock k="comprehensive" title="ביטוח מקיף" />
          <InsuranceBlock k="third_party" title="ביטוח צד ג׳" />

          <h4 className="font-semibold mt-2 mb-2">כיסויים נוספים</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {['windshield','towing','headlights','replacement_car','road_service','young_driver','new_driver'].map((k) => {
              const labels: any = { windshield: 'אחריות שמשות', towing: 'אחריות גרירה', headlights: 'אחריות פנסים', replacement_car: 'רכב חלופי', road_service: 'שירות דרך', young_driver: 'כיסוי נהג צעיר', new_driver: 'כיסוי נהג חדש' };
              return (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!getJson('insurances', `coverage_${k}`, false)} onChange={(e) => setJson('insurances', `coverage_${k}`, e.target.checked)} />
                  {labels[k]}
                </label>
              );
            })}
          </div>

          <h4 className="font-semibold mt-4 mb-2">רישוי וטסטים</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="רישיון רכב (קישור)"><Input value={v.license_doc_url || ''} onChange={(e) => set({ license_doc_url: e.target.value })} /></Field>
            <Field label="טסט אחרון"><Input type="date" value={v.last_test_date || ''} onChange={(e) => set({ last_test_date: e.target.value })} /></Field>
            <Field label="טסט הבא"><Input type="date" value={v.test_expiry || ''} onChange={(e) => set({ test_expiry: e.target.value })} /></Field>
            <Field label="סטטוס טסט"><Input value={v.test_status || ''} onChange={(e) => set({ test_status: e.target.value })} /></Field>
          </div>

          <h4 className="font-semibold mt-4 mb-2">תסקירים וציוד חובה</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="תסקיר מנהל - תאריך"><Input type="date" value={getJson('inspections_certificates','manager_cert_date')} onChange={(e) => setJson('inspections_certificates','manager_cert_date',e.target.value)} /></Field>
            <Field label="תסקיר מנהל - מספר"><Input value={getJson('inspections_certificates','manager_cert_number')} onChange={(e) => setJson('inspections_certificates','manager_cert_number',e.target.value)} /></Field>
            <Field label="תסקיר הרמה - מספר"><Input value={getJson('inspections_certificates','lift_cert_number')} onChange={(e) => setJson('inspections_certificates','lift_cert_number',e.target.value)} /></Field>
            <Field label="תסקיר הרמה - תוקף"><Input type="date" value={getJson('inspections_certificates','lift_cert_expiry')} onChange={(e) => setJson('inspections_certificates','lift_cert_expiry',e.target.value)} /></Field>
            <Field label="תוקף אביזרים"><Input type="date" value={getJson('inspections_certificates','accessories_expiry')} onChange={(e) => setJson('inspections_certificates','accessories_expiry',e.target.value)} /></Field>
            <Field label="תוקף ציוד ייעודי"><Input type="date" value={getJson('inspections_certificates','special_equipment_expiry')} onChange={(e) => setJson('inspections_certificates','special_equipment_expiry',e.target.value)} /></Field>
            <div className="col-span-full"><Field label="הערות תסקיר"><Textarea rows={2} value={getJson('inspections_certificates','notes')} onChange={(e) => setJson('inspections_certificates','notes',e.target.value)} /></Field></div>
          </div>

          <SaveBtn fields={['insurances','license_doc_url','last_test_date','test_expiry','test_status','inspections_certificates']} />
        </Section>

        {/* 4 - Equipment */}
        <Section value="cat4" title="4. ציוד וכלים מיוחדים" icon={Wrench}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="סוג / ייעודי"><Input value={v.equipment_type || ''} onChange={(e) => set({ equipment_type: e.target.value })} /></Field>
            <Field label="כוח סוס"><Input type="number" value={v.horsepower || ''} onChange={(e) => set({ horsepower: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="נפח מנוע"><Input type="number" value={v.engine_volume || ''} onChange={(e) => set({ engine_volume: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="משקל / טון"><Input type="number" value={v.weight_tons || ''} onChange={(e) => set({ weight_tons: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="KVA"><Input type="number" value={v.kva || ''} onChange={(e) => set({ kva: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="שעות מנוע"><Input type="number" value={v.engine_hours || ''} onChange={(e) => set({ engine_hours: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="מספר סידורי ציוד"><Input value={v.equipment_serial || ''} onChange={(e) => set({ equipment_serial: e.target.value })} /></Field>
            <div className="col-span-full"><Field label="ציוד ייעודי - פירוט"><Textarea rows={3} value={v.equipment_details || ''} onChange={(e) => set({ equipment_details: e.target.value })} /></Field></div>
          </div>
          <SaveBtn fields={['equipment_type','horsepower','engine_volume','weight_tons','kva','engine_hours','equipment_serial','equipment_details']} />
        </Section>

        {/* 5 - Maintenance */}
        <Section value="cat5" title="5. טיפולים ותחזוקה" icon={Settings}>
          <h4 className="font-semibold text-sm mb-2 text-muted-foreground">נתוני מונה</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label='ק"מ נוכחי'><Input type="number" value={v.odometer || ''} onChange={(e) => set({ odometer: e.target.value ? Number(e.target.value) : 0 })} /></Field>
            <Field label="שעות מנוע"><Input type="number" value={v.engine_hours || ''} onChange={(e) => set({ engine_hours: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="סוג מונה"><Input value={v.meter_type || ''} onChange={(e) => set({ meter_type: e.target.value })} /></Field>
            <Field label="תאריך עדכון מונה"><Input type="datetime-local" value={v.meter_updated_at ? String(v.meter_updated_at).slice(0,16) : ''} onChange={(e) => set({ meter_updated_at: e.target.value })} /></Field>
          </div>

          <h4 className="font-semibold text-sm mt-4 mb-2 text-muted-foreground">טיפולים</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="טיפול אחרון"><Input type="date" value={v.last_service_date || ''} onChange={(e) => set({ last_service_date: e.target.value })} /></Field>
            <Field label="טיפול הבא"><Input type="date" value={v.next_service_date || ''} onChange={(e) => set({ next_service_date: e.target.value })} /></Field>
            <Field label='טיפול הבא בק"מ'><Input type="number" value={v.next_service_km || ''} onChange={(e) => set({ next_service_km: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="שעות מנוע לטיפול הבא"><Input type="number" value={v.next_service_hours || ''} onChange={(e) => set({ next_service_hours: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="סוג טיפול"><Input value={v.service_type || ''} onChange={(e) => set({ service_type: e.target.value })} /></Field>
            <Field label="סטטוס"><Input value={v.service_status || ''} onChange={(e) => set({ service_status: e.target.value })} /></Field>
            <div className="col-span-full"><Field label="הערות טיפול"><Textarea rows={2} value={v.service_notes || ''} onChange={(e) => set({ service_notes: e.target.value })} /></Field></div>
          </div>

          <h4 className="font-semibold text-sm mt-4 mb-2 text-muted-foreground">שיטת תחזוקה</h4>
          <Field label="שיטה">
            <Select value={v.maintenance_method || ''} onValueChange={(val) => set({ maintenance_method: val })}>
              <SelectTrigger><SelectValue placeholder="בחר שיטה" /></SelectTrigger>
              <SelectContent>
                {MAINTENANCE_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {v.maintenance_method === 'self' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 border border-border rounded-lg p-3 bg-muted/30">
              <Field label="ממונה תחזוקה"><Input value={getJson('maintenance_details','manager')} onChange={(e) => setJson('maintenance_details','manager',e.target.value)} /></Field>
              <Field label="מוסך מטפל"><Input value={getJson('maintenance_details','garage')} onChange={(e) => setJson('maintenance_details','garage',e.target.value)} /></Field>
              <Field label="טלפון מוסך"><Input value={getJson('maintenance_details','garage_phone')} onChange={(e) => setJson('maintenance_details','garage_phone',e.target.value)} /></Field>
              <Field label="אחריות"><Input value={getJson('maintenance_details','warranty')} onChange={(e) => setJson('maintenance_details','warranty',e.target.value)} /></Field>
              <Field label="פירוט אחריות"><Input value={getJson('maintenance_details','warranty_details')} onChange={(e) => setJson('maintenance_details','warranty_details',e.target.value)} /></Field>
              <div className="col-span-full"><Field label="הערות תחזוקה"><Textarea rows={2} value={getJson('maintenance_details','notes')} onChange={(e) => setJson('maintenance_details','notes',e.target.value)} /></Field></div>
            </div>
          )}
          {v.maintenance_method === 'leasing' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 border border-border rounded-lg p-3 bg-muted/30">
              <Field label="חברת ליסינג"><Input value={getJson('maintenance_details','leasing_company')} onChange={(e) => setJson('maintenance_details','leasing_company',e.target.value)} /></Field>
              <Field label="מוקד שירות"><Input value={getJson('maintenance_details','service_center')} onChange={(e) => setJson('maintenance_details','service_center',e.target.value)} /></Field>
              <Field label="טלפון"><Input value={getJson('maintenance_details','service_phone')} onChange={(e) => setJson('maintenance_details','service_phone',e.target.value)} /></Field>
              <Field label="איש קשר"><Input value={getJson('maintenance_details','contact')} onChange={(e) => setJson('maintenance_details','contact',e.target.value)} /></Field>
              <div className="col-span-full"><Field label="הערות תחזוקה"><Textarea rows={2} value={getJson('maintenance_details','notes')} onChange={(e) => setJson('maintenance_details','notes',e.target.value)} /></Field></div>
            </div>
          )}

          <SaveBtn fields={['odometer','engine_hours','meter_type','meter_updated_at','last_service_date','next_service_date','next_service_km','next_service_hours','service_type','service_status','service_notes','maintenance_method','maintenance_details']} />
        </Section>

        {/* 6 - Documents */}
        <Section value="cat6" title="6. מסמכים וקבצים" icon={Folder}>
          <p className="text-sm text-muted-foreground mb-2">לניהול מלא של מסמכים השתמש במסך המסמכים של הרכב.</p>
          <Button variant="outline" onClick={() => navigate(`/documents?vehicle=${v.id}`)}>
            <LinkIcon size={14} className="ml-1" /> פתח מסמכי רכב
          </Button>
        </Section>

        {/* 7 - Inspections */}
        <Section value="cat7" title="7. בדיקות רכב" icon={ClipboardCheck}>
          <Button variant="outline" onClick={() => navigate(`/vehicle-inspections?vehicle=${v.id}`)}>
            <LinkIcon size={14} className="ml-1" /> בדיקות תקופתיות ובטיחות
          </Button>
        </Section>

        {/* 8 - Faults */}
        <Section value="cat8" title="8. תקלות ותיקונים" icon={AlertTriangle}>
          <Button variant="outline" onClick={() => navigate(`/faults?vehicle=${v.id}`)}>
            <LinkIcon size={14} className="ml-1" /> פתח תקלות רכב
          </Button>
        </Section>

        {/* 9 - Services */}
        <Section value="cat9" title="9. שירותי רכב" icon={Truck}>
          <Button variant="outline" onClick={() => navigate(`/service-orders?vehicle=${v.id}`)}>
            <LinkIcon size={14} className="ml-1" /> הזמנות שירות (טסט, שינוע, שטיפה, דלק וכו׳)
          </Button>
        </Section>

        {/* 10 - Alerts */}
        <Section value="cat10" title="10. התראות" icon={Bell}>
          <Button variant="outline" onClick={() => navigate(`/alerts?vehicle=${v.id}`)}>
            <LinkIcon size={14} className="ml-1" /> נהל התראות רכב
          </Button>
        </Section>

        {/* 11 - History (uses existing VehicleFilePanel mounted elsewhere) */}
        <Section value="cat11" title="11. היסטוריה ומעקב" icon={History}>
          <p className="text-sm text-muted-foreground">לתצוגת ההיסטוריה המלאה ראה "תיק רכב / היסטוריית רכב" שמתחת.</p>
        </Section>

        {/* 12 - Vehicle tracking */}
        <Section value="cat12" title="12. מעקב רכב" icon={Activity}>
          <Button variant="outline" onClick={() => navigate(`/vehicle-tasks?vehicle=${v.id}`)}>
            <LinkIcon size={14} className="ml-1" /> משימות ופעולות רכב
          </Button>
        </Section>

        {/* 13 - Module shortcuts */}
        <Section value="cat13" title="13. בקרה ומעקב רכב" icon={LayoutGrid}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button variant="outline" onClick={() => navigate(`/vehicle-inspections?vehicle=${v.id}`)}>ביקורות רכב</Button>
            <Button variant="outline" onClick={() => navigate(`/faults?vehicle=${v.id}`)}>ליקויים</Button>
            <Button variant="outline" onClick={() => navigate(`/vehicle-tasks?vehicle=${v.id}`)}>מעקב רכב</Button>
            <Button variant="outline" onClick={() => navigate(`/alerts?vehicle=${v.id}`)}>התראות רכב</Button>
          </div>
        </Section>

        {/* 14 - Import info */}
        <Section value="cat14" title="14. מידע מערכת וייבוא" icon={Upload}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="מקור נתון"><Input value={v.import_source || ''} onChange={(e) => set({ import_source: e.target.value })} /></Field>
            <Field label="קטגוריית מקור"><Input value={v.import_category || ''} onChange={(e) => set({ import_category: e.target.value })} /></Field>
            <Field label="חוצץ / קטגוריית מקור"><Input value={v.import_buffer || ''} onChange={(e) => set({ import_buffer: e.target.value })} /></Field>
            <Field label="שם קובץ"><Input value={v.import_file_name || ''} onChange={(e) => set({ import_file_name: e.target.value })} /></Field>
            <Field label="תאריך ייבוא"><Input type="datetime-local" value={v.import_date ? String(v.import_date).slice(0,16) : ''} onChange={(e) => set({ import_date: e.target.value })} /></Field>
            <Field label="סטטוס ייבוא"><Input value={v.import_status || ''} onChange={(e) => set({ import_status: e.target.value })} /></Field>
          </div>
          <SaveBtn fields={['import_source','import_category','import_buffer','import_file_name','import_date','import_status']} />
        </Section>
      </Accordion>
    </div>
  );
}
