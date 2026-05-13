import { useEffect, useState } from 'react';
import { Plus, Zap, Trash2, Edit2, Power, Clock, AlertTriangle, Wrench, CheckCircle2, Calendar, FileText, CalendarClock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Scenario {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  flow_type: string;
  target_audience: string;
  custom_phone: string | null;
  custom_message: string | null;
  is_active: boolean;
  delay_minutes: number;
  trigger_count: number;
  last_triggered_at: string | null;
}

interface Run {
  id: string;
  scenario_id: string;
  target_name: string | null;
  target_phone: string | null;
  status: string;
  scheduled_at: string;
  executed_at: string | null;
  context: any;
  error_message: string | null;
}

const TRIGGERS = [
  { key: 'fault_created', label: 'תקלה חדשה נפתחה', icon: AlertTriangle, color: 'text-destructive' },
  { key: 'service_order_created', label: 'קריאת שירות ותחזוקה חדשה', icon: Wrench, color: 'text-primary' },
  { key: 'service_completed', label: 'טיפול הושלם', icon: CheckCircle2, color: 'text-green-600' },
  { key: 'license_expiring', label: 'רישיון נהיגה עומד לפוג', icon: Calendar, color: 'text-amber-600' },
  { key: 'test_expiring', label: 'טסט עומד לפוג', icon: Calendar, color: 'text-amber-600' },
  { key: 'manual', label: 'הפעלה ידנית בלבד', icon: Power, color: 'text-muted-foreground' },
];

const AUDIENCES = [
  { key: 'driver', label: 'הנהג ברכב' },
  { key: 'customer', label: 'הלקוח' },
  { key: 'manager', label: 'מנהל הצי' },
  { key: 'custom', label: 'מספר מותאם' },
];

const FLOWS = [
  { key: 'inbound_general', label: 'שיחה כללית' },
  { key: 'pickup_ready', label: 'איסוף רכב' },
  { key: 'pickup_scheduling', label: 'תיאום איסוף רכב מהלקוח' },
  { key: 'service_reminder', label: 'תזכורת טיפול' },
  { key: 'price_offer', label: 'הצעת מחיר' },
];

const trigLabel = (k: string) => TRIGGERS.find(t => t.key === k)?.label || k;
const trigIcon = (k: string) => TRIGGERS.find(t => t.key === k)?.icon || Zap;

export default function ScenariosTab() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [tab, setTab] = useState<'scenarios' | 'runs'>('scenarios');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('fault_created');
  const [flowType, setFlowType] = useState('inbound_general');
  const [audience, setAudience] = useState('driver');
  const [customPhone, setCustomPhone] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(0);

  // One-off scheduled call
  const [schName, setSchName] = useState('');
  const [schPhone, setSchPhone] = useState('');
  const [schDate, setSchDate] = useState('');
  const [schTime, setSchTime] = useState('');
  const [schFlow, setSchFlow] = useState('inbound_general');
  const [schMessage, setSchMessage] = useState('');

  const load = async () => {
    const [sc, rn] = await Promise.all([
      supabase.from('voice_scenarios').select('*').order('created_at', { ascending: false }),
      supabase.from('voice_scenario_runs').select('*').order('scheduled_at', { ascending: false }).limit(50),
    ]);
    setScenarios((sc.data as Scenario[]) || []);
    setRuns((rn.data as Run[]) || []);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setEditing(null); setName(''); setDescription(''); setTriggerType('fault_created');
    setFlowType('inbound_general'); setAudience('driver'); setCustomPhone(''); setCustomMessage(''); setDelayMinutes(0);
  };

  const startEdit = (s: Scenario) => {
    setEditing(s);
    setName(s.name); setDescription(s.description || '');
    setTriggerType(s.trigger_type); setFlowType(s.flow_type); setAudience(s.target_audience);
    setCustomPhone(s.custom_phone || ''); setCustomMessage(s.custom_message || '');
    setDelayMinutes(s.delay_minutes || 0);
    setShowForm(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.error('הזן שם תסריט');
    const payload = {
      name, description, trigger_type: triggerType, flow_type: flowType,
      target_audience: audience, custom_phone: audience === 'custom' ? customPhone : null,
      custom_message: customMessage || null, delay_minutes: delayMinutes,
    };
    const { error } = editing
      ? await supabase.from('voice_scenarios').update(payload).eq('id', editing.id)
      : await supabase.from('voice_scenarios').insert(payload);
    if (error) return toast.error('שגיאה - ' + error.message);
    toast.success(editing ? 'עודכן' : 'נוצר');
    setShowForm(false); resetForm(); load();
  };

  const toggle = async (s: Scenario) => {
    await supabase.from('voice_scenarios').update({ is_active: !s.is_active }).eq('id', s.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('למחוק תסריט?')) return;
    await supabase.from('voice_scenarios').delete().eq('id', id);
    toast.success('נמחק'); load();
  };

  const scheduleCall = async () => {
    if (!schName.trim() || !schPhone.trim()) return toast.error('הזן שם וטלפון');
    if (!schDate || !schTime) return toast.error('בחר תאריך ושעה');
    const scheduledAt = new Date(`${schDate}T${schTime}`);
    if (scheduledAt < new Date()) return toast.error('המועד חייב להיות בעתיד');

    const { error } = await supabase.from('voice_scenario_runs').insert({
      scenario_id: null,
      trigger_entity_type: 'manual_schedule',
      target_phone: schPhone,
      target_name: schName,
      context: { flow_type: schFlow, custom_message: schMessage } as any,
      scheduled_at: scheduledAt.toISOString(),
      status: 'pending',
    });
    if (error) return toast.error('שגיאה - ' + error.message);
    toast.success(`שיחה תוזמנה ל-${scheduledAt.toLocaleString('he-IL')}`);
    setShowSchedule(false);
    setSchName(''); setSchPhone(''); setSchDate(''); setSchTime(''); setSchMessage(''); setSchFlow('inbound_general');
    setTab('runs'); load();
  };

  const cancelRun = async (id: string) => {
    if (!confirm('לבטל את התזמון?')) return;
    await supabase.from('voice_scenario_runs').update({ status: 'cancelled' }).eq('id', id);
    toast.success('בוטל'); load();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setTab('scenarios')}
          className={`flex-1 py-2 rounded-xl text-sm font-bold ${tab === 'scenarios' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          תסריטים ({scenarios.length})
        </button>
        <button onClick={() => setTab('runs')}
          className={`flex-1 py-2 rounded-xl text-sm font-bold ${tab === 'runs' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          היסטוריית הפעלות ({runs.length})
        </button>
      </div>

      {tab === 'scenarios' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold justify-center text-sm">
              <Plus size={16} /> תסריט חדש
            </button>
            <button onClick={() => setShowSchedule(true)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-accent text-accent-foreground font-bold justify-center text-sm border-2 border-primary/30">
              <CalendarClock size={16} /> תזמן שיחה
            </button>
          </div>

          <div className="card-elevated bg-primary/5 border-primary/20 text-xs">
            <div className="flex items-start gap-2">
              <Zap size={14} className="text-primary mt-0.5 shrink-0" />
              <div>
                <div className="font-bold mb-1">איך זה עובד?</div>
                <div className="text-muted-foreground">בכל פעם שטריגר נורה במערכת (תקלה חדשה, שירותים ותחזוקה וכו'), המערכת תיצור משימת חיוג אוטומטית. תוכל לראות את התור בלשונית "היסטוריית הפעלות".</div>
              </div>
            </div>
          </div>

          {scenarios.length === 0 && (
            <div className="card-elevated text-center text-muted-foreground py-8">
              <Zap size={32} className="mx-auto mb-2 opacity-50" />
              אין תסריטים עדיין. צור תסריט ראשון כדי להתחיל.
            </div>
          )}

          {scenarios.map(s => {
            const Icon = trigIcon(s.trigger_type);
            return (
              <div key={s.id} className={`card-elevated ${!s.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-xl bg-muted shrink-0`}>
                      <Icon size={18} className={TRIGGERS.find(t => t.key === s.trigger_type)?.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-base truncate">{s.name}</h4>
                      <p className="text-xs text-muted-foreground">{trigLabel(s.trigger_type)}</p>
                      {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => toggle(s)} className={`p-2 rounded-xl ${s.is_active ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                      <Power size={16} />
                    </button>
                    <button onClick={() => startEdit(s)} className="p-2 rounded-xl bg-muted hover:bg-muted/70">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => remove(s.id)} className="p-2 rounded-xl bg-destructive/10 text-destructive">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded-lg bg-muted">יעד: {AUDIENCES.find(a => a.key === s.target_audience)?.label}</span>
                  <span className="px-2 py-1 rounded-lg bg-muted">תבנית: {FLOWS.find(f => f.key === s.flow_type)?.label}</span>
                  {s.delay_minutes > 0 && <span className="px-2 py-1 rounded-lg bg-muted flex items-center gap-1"><Clock size={10} /> השהיה {s.delay_minutes} דק'</span>}
                  <span className="px-2 py-1 rounded-lg bg-muted">הופעל {s.trigger_count} פעמים</span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === 'runs' && (
        <>
          {runs.length === 0 && (
            <div className="card-elevated text-center text-muted-foreground py-8">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              אין הפעלות עדיין
            </div>
          )}
          {runs.map(r => (
            <div key={r.id} className="card-elevated">
              <div className="flex items-center justify-between mb-1">
                <div className="font-bold">{r.target_name || 'לא ידוע'}</div>
                <span className={`text-xs px-2 py-1 rounded-lg ${
                  r.status === 'executed' ? 'bg-green-500/10 text-green-600' :
                  r.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                  r.status === 'pending' ? 'bg-amber-500/10 text-amber-600' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {r.status === 'pending' ? 'ממתין' : r.status === 'executed' ? 'בוצע' : r.status === 'failed' ? 'נכשל' : r.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>📞 {r.target_phone || 'אין טלפון'}</div>
                <div>🕐 {new Date(r.scheduled_at).toLocaleString('he-IL')}</div>
                {r.context?.vehicle_plate && <div>🚗 {r.context.vehicle_plate}</div>}
                {r.context?.custom_message && <div>💬 {r.context.custom_message}</div>}
                {r.error_message && <div className="text-destructive">⚠ {r.error_message}</div>}
              </div>
              {r.status === 'pending' && (
                <button onClick={() => cancelRun(r.id)}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium">
                  בטל תזמון
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowForm(false); resetForm(); }}>
          <div className="bg-card rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">{editing ? 'ערוך תסריט' : 'תסריט חדש'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">שם התסריט *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="לדוגמה: התראה על תקלה דחופה"
                  className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium">תיאור (לא חובה)</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                  className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">טריגר *</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {TRIGGERS.map(t => {
                    const Icon = t.icon;
                    return (
                      <button key={t.key} type="button" onClick={() => setTriggerType(t.key)}
                        className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium border-2 transition-all ${
                          triggerType === t.key ? 'border-primary bg-primary/10' : 'border-input bg-background'
                        }`}>
                        <Icon size={16} className={t.color} />
                        <span className="text-right">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">קהל יעד</label>
                  <select value={audience} onChange={e => setAudience(e.target.value)}
                    className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background">
                    {AUDIENCES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">תבנית שיחה</label>
                  <select value={flowType} onChange={e => setFlowType(e.target.value)}
                    className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background">
                    {FLOWS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
              </div>
              {audience === 'custom' && (
                <div>
                  <label className="text-sm font-medium">מספר טלפון מותאם *</label>
                  <input value={customPhone} onChange={e => setCustomPhone(e.target.value)} placeholder="050-1234567"
                    className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background" />
                </div>
              )}
              <div>
                <label className="text-sm font-medium">השהיה לפני חיוג (דקות)</label>
                <input type="number" min={0} value={delayMinutes} onChange={e => setDelayMinutes(Number(e.target.value))}
                  className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background" />
                <p className="text-xs text-muted-foreground mt-1">0 = חיוג מיידי</p>
              </div>
              <div>
                <label className="text-sm font-medium">הודעה מותאמת (לא חובה)</label>
                <textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)} rows={3}
                  placeholder="טקסט שיוצג לסוכן בנוסף לתבנית הסטנדרטית..."
                  className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={save} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold">
                  {editing ? 'עדכן' : 'צור תסריט'}
                </button>
                <button onClick={() => { setShowForm(false); resetForm(); }} className="flex-1 py-3 rounded-xl border border-border">ביטול</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSchedule && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowSchedule(false)}>
          <div className="bg-card rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="text-primary" size={22} />
              <h3 className="text-xl font-bold">תזמן שיחה עתידית</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">השיחה תופעל אוטומטית בתאריך והשעה שתבחר.</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">שם הנמען *</label>
                <input value={schName} onChange={e => setSchName(e.target.value)} placeholder="למשל: יוסי כהן"
                  className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium">מספר טלפון *</label>
                <input value={schPhone} onChange={e => setSchPhone(e.target.value)} placeholder="050-1234567" type="tel"
                  className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">תאריך *</label>
                  <input type="date" value={schDate} onChange={e => setSchDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium">שעה *</label>
                  <input type="time" value={schTime} onChange={e => setSchTime(e.target.value)}
                    className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">תבנית שיחה</label>
                <select value={schFlow} onChange={e => setSchFlow(e.target.value)}
                  className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background">
                  {FLOWS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">הודעה / נושא השיחה (לא חובה)</label>
                <textarea value={schMessage} onChange={e => setSchMessage(e.target.value)} rows={3}
                  placeholder="למשל: תזכורת לטיפול 10,000 ק״מ ביום ראשון"
                  className="w-full mt-1 p-3 rounded-xl border-2 border-input bg-background text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={scheduleCall} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2">
                  <CalendarClock size={16} /> תזמן
                </button>
                <button onClick={() => setShowSchedule(false)} className="flex-1 py-3 rounded-xl border border-border">ביטול</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
