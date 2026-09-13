import { useEffect, useState } from 'react';
import { Gauge, History } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type AssignedVehicle = {
  id: string;
  license_plate: string;
  manufacturer: string | null;
  model: string | null;
  odometer: number | null;
};

type HistoryRow = {
  id: string;
  event_date: string;
  odometer: number | null;
  driver_name: string | null;
  title: string;
  description: string;
  source: string | null;
};

export default function DriverOdometer() {
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState<AssignedVehicle | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: vehicleRow, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id, license_plate, manufacturer, model, odometer')
      .eq('assigned_driver_id', user.id)
      .maybeSingle();

    if (vehicleError) {
      console.error(vehicleError);
      toast.error('לא ניתן לטעון את הרכב המשויך');
      setLoading(false);
      return;
    }

    setVehicle(vehicleRow);
    setValue(vehicleRow?.odometer != null ? String(vehicleRow.odometer) : '');

    if (vehicleRow?.id) {
      const { data: hist } = await supabase
        .from('vehicle_history')
        .select('id, event_date, odometer, driver_name, title, description, source')
        .eq('vehicle_id', vehicleRow.id)
        .eq('event_type', 'odometer')
        .order('event_date', { ascending: false })
        .limit(50);
      setHistory((hist || []) as HistoryRow[]);
    } else {
      setHistory([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const lastReport = history[0];
  const daysSinceLast = lastReport
    ? Math.floor((Date.now() - new Date(lastReport.event_date).getTime()) / 86400000)
    : null;

  const handleSubmit = async () => {
    if (!vehicle) return;
    const next = parseInt(value, 10);
    if (Number.isNaN(next) || next < 0) {
      toast.error('הזן קילומטראז׳ תקין');
      return;
    }
    if (vehicle.odometer != null && next < vehicle.odometer) {
      toast.error('לא ניתן להקטין את הקילומטראז׳');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('report_driver_odometer', {
      p_vehicle_id: vehicle.id,
      p_odometer: next,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || 'שמירת הקילומטראז׳ נכשלה');
      console.error(error);
      return;
    }
    toast.success('הקילומטראז׳ נשמר');
    await load();
  };

  if (loading) {
    return (
      <div className="animate-fade-in text-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="animate-fade-in card-elevated text-center py-12">
        <Gauge size={40} className="mx-auto mb-3 text-muted-foreground" />
        <h1 className="text-2xl font-bold mb-2">דיווח קילומטראז׳</h1>
        <p className="text-muted-foreground">לא הוצמד רכב לנהג זה.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="page-header flex items-center gap-3">
        <Gauge size={28} /> דיווח קילומטראז׳
      </h1>

      <section className="card-elevated space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">רכב משויך</p>
          <p className="text-xl font-bold">{vehicle.license_plate}</p>
          <p className="text-muted-foreground">
            {[vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ')}
          </p>
        </div>
        <div className="rounded-xl bg-muted p-4">
          <p className="text-sm text-muted-foreground">קילומטראז׳ נוכחי</p>
          <p className="text-2xl font-black">{(vehicle.odometer || 0).toLocaleString()} ק״מ</p>
        </div>
        {daysSinceLast != null && daysSinceLast > 30 && (
          <p className="text-sm rounded-xl p-3 bg-warning/10 text-warning">
            לא דווח קילומטראז׳ מעל 30 יום. מומלץ לעדכן עכשיו.
          </p>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">קילומטראז׳ חדש</label>
          <input
            type="number"
            min={vehicle.odometer || 0}
            className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            dir="ltr"
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full py-4 rounded-xl bg-primary text-primary-foreground text-lg font-bold disabled:opacity-50"
        >
          {saving ? 'שומר...' : 'שמור דיווח'}
        </button>
      </section>

      <section className="card-elevated space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <History size={18} /> היסטוריית דיווחים
        </h2>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין דיווחים עדיין.</p>
        ) : (
          <div className="space-y-2">
            {history.map((row) => (
              <div key={row.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">{(row.odometer || 0).toLocaleString()} ק״מ</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.event_date).toLocaleString('he-IL')}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.driver_name || 'נהג'} · {row.source === 'driver_report' ? 'דיווח נהג' : row.source || 'מערכת'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
