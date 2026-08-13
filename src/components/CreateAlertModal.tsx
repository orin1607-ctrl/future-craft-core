import { useState } from 'react';
import { X, Bell, Calendar, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  FREE_ALERT_LABEL,
  FREE_ALERT_TYPE,
  OFFICER_ALERT_LABEL,
  OFFICER_ALERT_TYPE,
  formatDriverAlertMeta,
  formatVehicleAlertMeta,
} from '@/lib/vehicleActionFollowUp';

const ALERT_TYPES = [
  { value: 'insurance', label: 'ביטוח', emoji: '🛡️' },
  { value: 'test', label: 'טסט', emoji: '🔍' },
  { value: 'service', label: 'טיפול', emoji: '🔧' },
  { value: 'fault', label: 'תקלה', emoji: '⚠️' },
  { value: OFFICER_ALERT_TYPE, label: OFFICER_ALERT_LABEL, emoji: '🛡️' },
  { value: FREE_ALERT_TYPE, label: FREE_ALERT_LABEL, emoji: '📝' },
  { value: 'other', label: 'אחר', emoji: '📌' },
];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'ללא חזרה' },
  { value: 'daily', label: 'יומי' },
  { value: 'weekly', label: 'שבועי' },
  { value: 'monthly', label: 'חודשי' },
  { value: 'yearly', label: 'שנתי' },
  { value: 'custom', label: 'מותאם אישית (ימים)' },
];

export default function CreateAlertModal({
  onClose,
  onCreated,
  vehiclePlate,
  vehicleId,
  driverId,
  driverName,
}: {
  onClose: () => void;
  onCreated: () => void;
  vehiclePlate?: string;
  vehicleId?: string;
  driverId?: string;
  driverName?: string;
}) {
  const { user } = useAuth();
  const [alertType, setAlertType] = useState(vehiclePlate || driverId ? FREE_ALERT_TYPE : 'other');
  const [title, setTitle] = useState(vehiclePlate || driverId ? FREE_ALERT_LABEL : '');
  const [description, setDescription] = useState('');
  const [alertDate, setAlertDate] = useState('');
  const [alertTime, setAlertTime] = useState('09:00');
  const [recurrence, setRecurrence] = useState('none');
  const [customDays, setCustomDays] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = title.trim() && alertDate;

  const handleSubmit = async () => {
    if (!isValid || !user) return;
    setLoading(true);

    const dateTime = new Date(`${alertDate}T${alertTime}`).toISOString();

    const vehicleMeta = vehiclePlate ? formatVehicleAlertMeta(vehiclePlate, vehicleId) : '';
    const driverMeta = driverId ? formatDriverAlertMeta(driverId, driverName) : '';
    const fullDescription = [vehicleMeta, driverMeta, description.trim()].filter(Boolean).join('\n') || null;
    const titleSuffix = vehiclePlate || driverName || '';
    const fullTitle = titleSuffix ? `${title.trim()} · ${titleSuffix}` : title.trim();

    const { error } = await supabase.from('custom_alerts').insert({
      user_id: user.id,
      company_name: user.company_name || '',
      alert_type: alertType,
      title: fullTitle,
      description: fullDescription,
      alert_date: dateTime,
      recurrence,
      recurrence_interval: recurrence === 'custom' ? parseInt(customDays) || null : null,
      next_trigger_at: dateTime,
    });

    setLoading(false);
    if (error) {
      toast.error('שגיאה ביצירת ההתראה');
      console.error(error);
    } else {
      toast.success('ההתראה נוצרה בהצלחה');
      onCreated();
      onClose();
    }
  };

  const inputClass = "w-full p-3 text-base rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <X size={20} />
          </button>
          <h2 className="text-xl font-black flex items-center gap-2">
            <Bell size={22} className="text-primary" />
            {vehiclePlate || driverId ? 'הוסף התראה חופשית' : 'יצירת התראה חדשה'}
          </h2>
        </div>

        <div className="p-5 space-y-4">
          {/* Alert Type */}
          <div>
            <label className="block text-sm font-bold mb-2">סוג התראה *</label>
            <div className="grid grid-cols-3 gap-2">
              {ALERT_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setAlertType(t.value)}
                  className={`p-3 rounded-xl text-sm font-bold border-2 transition-all text-center ${alertType === t.value ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground hover:border-primary/50'}`}>
                  <span className="text-lg block mb-1">{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-bold mb-2">כותרת *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת ההתראה..." className={inputClass} />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold mb-2">תיאור</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="תיאור נוסף..." className={`${inputClass} resize-none`} />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold mb-2 flex items-center gap-1">
                <Calendar size={14} /> תאריך *
              </label>
              <input type="date" value={alertDate} onChange={e => setAlertDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">שעה</label>
              <input type="time" value={alertTime} onChange={e => setAlertTime(e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <label className="block text-sm font-bold mb-2 flex items-center gap-1">
              <RefreshCw size={14} /> תדירות חזרה
            </label>
            <select value={recurrence} onChange={e => setRecurrence(e.target.value)} className={inputClass}>
              {RECURRENCE_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {recurrence === 'custom' && (
            <div>
              <label className="block text-sm font-bold mb-2">כל כמה ימים?</label>
              <input type="number" min="1" value={customDays} onChange={e => setCustomDays(e.target.value)} placeholder="מספר ימים..." className={inputClass} />
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!isValid || loading}
            className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${isValid && !loading ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
            {loading ? 'שומר...' : '🔔 צור התראה'}
          </button>
        </div>
      </div>
    </div>
  );
}
