import { useState, useRef, useEffect } from 'react';
import { FaultAttachment } from '@/data/demo-data';
import { ArrowRight, Camera, MapPin, Navigation, X, Plus, Car, RefreshCw, MessageCircle, UserPlus, Clock, CheckCircle2, XCircle, History } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { isVehicleScopedContext, plateMatches, useVehicleUrlContext } from '@/lib/entityNavContext';
import { recordVehicleHubAction } from '@/lib/vehicleActionFollowUp';
import VehicleScopedNavChrome from '@/components/vehicles/VehicleScopedNavChrome';
import { VEHICLE_EMPTY_LIST_MSG } from '@/lib/vehicleScopedUi';

type ActionType = 'pickup' | 'return';

interface VehicleConditionItem {
  label: string;
  status: 'ok' | 'damaged' | 'missing';
}

const conditionItems: string[] = [
  'מצב חיצוני - שריטות/מכות',
  'צמיגים',
  'אורות',
  'מראות',
  'ניקיון פנימי',
  'דלק',
  'מיזוג אוויר',
  'רדיו / מולטימדיה',
  'חגורות בטיחות',
  'גלגל רזרבי',
  'משולש אזהרה',
  'מטף כיבוי',
];

const conditionStatusLabels: Record<string, { text: string; cls: string }> = {
  ok: { text: 'תקין', cls: 'bg-success/15 text-success border-success/30' },
  damaged: { text: 'פגום', cls: 'bg-warning/15 text-warning border-warning/30' },
  missing: { text: 'חסר', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const approvalStatusConfig: Record<string, { text: string; icon: typeof Clock; cls: string }> = {
  pending: { text: 'ממתין לאישור', icon: Clock, cls: 'bg-warning/15 text-warning border-warning/30' },
  approved: { text: 'מאושר', icon: CheckCircle2, cls: 'bg-success/15 text-success border-success/30' },
  rejected: { text: 'נדחה', icon: XCircle, cls: 'bg-destructive/15 text-destructive border-destructive/30' },
};

interface HandoverRecord {
  id: string;
  vehicle_plate: string;
  manufacturer: string;
  model: string;
  giving_driver_name: string;
  receiving_driver_name: string;
  pickup_date: string;
  driver_approval_status: string;
  approval_updated_at: string | null;
  created_at: string;
}

export default function VehicleHandover() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const { plate: contextPlate, vehicleId: contextVehicleId, locked } = useVehicleUrlContext();
  const vehicleScoped = isVehicleScopedContext({ locked, plate: contextPlate, vehicleId: contextVehicleId });
  const [action, setAction] = useState<ActionType>('pickup');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [odometer, setOdometer] = useState('');
  const [vehicleNotes, setVehicleNotes] = useState('');
  
  const [fromDriver, setFromDriver] = useState('');
  const [fromDriverPhone, setFromDriverPhone] = useState('');
  const [fromIsOther, setFromIsOther] = useState(false);
  const [fromOtherId, setFromOtherId] = useState('');
  const [fromOtherLicense, setFromOtherLicense] = useState('');
  const [fromOtherLicenseExpiry, setFromOtherLicenseExpiry] = useState('');

  const [toDriver, setToDriver] = useState('');
  const [toDriverPhone, setToDriverPhone] = useState('');
  const [toIsOther, setToIsOther] = useState(false);
  const [toOtherId, setToOtherId] = useState('');
  const [toOtherLicense, setToOtherLicense] = useState('');
  const [toOtherLicenseExpiry, setToOtherLicenseExpiry] = useState('');
  
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().split('T')[0]);
  const [pickupTime, setPickupTime] = useState(new Date().toTimeString().slice(0, 5));
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  
  const [conditions, setConditions] = useState<VehicleConditionItem[]>(
    conditionItems.map(label => ({ label, status: 'ok' }))
  );
  const [conditionNotes, setConditionNotes] = useState('');
  const [photos, setPhotos] = useState<FaultAttachment[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');
  const [handoverRecords, setHandoverRecords] = useState<HandoverRecord[]>([]);

  // Load from DB
  const [dbVehicles, setDbVehicles] = useState<{ license_plate: string; manufacturer: string; model: string; year: number; vehicle_type: string }[]>([]);
  const [dbDrivers, setDbDrivers] = useState<{ full_name: string; phone: string }[]>([]);

  const loadHandoverHistory = async () => {
    const { data } = await applyCompanyScope(
      supabase.from('vehicle_handovers').select('id, vehicle_plate, manufacturer, model, giving_driver_name, receiving_driver_name, pickup_date, driver_approval_status, approval_updated_at, created_at').order('created_at', { ascending: false }),
      companyFilter
    ) as any;
    if (data) setHandoverRecords(data);
  };

  useEffect(() => {
    supabase.from('vehicles').select('license_plate, manufacturer, model, year, vehicle_type').then(({ data }) => {
      if (data) setDbVehicles(data);
    });
    supabase.from('drivers').select('full_name, phone').then(({ data }) => {
      if (data) setDbDrivers(data);
    });
    loadHandoverHistory();
  }, [companyFilter]);

  useEffect(() => {
    if (contextPlate) {
      setVehiclePlate(contextPlate);
      setActiveTab('history');
    }
  }, [contextPlate]);

  const visibleHandoverRecords = locked && contextPlate
    ? handoverRecords.filter((r) => plateMatches(r.vehicle_plate, contextPlate))
    : handoverRecords;

  const selectedVehicle = dbVehicles.find(v => v.license_plate === vehiclePlate);

  const handleFromDriverChange = (name: string) => {
    if (name === '__other__') {
      setFromIsOther(true); setFromDriver(''); setFromDriverPhone('');
      return;
    }
    setFromIsOther(false);
    setFromDriver(name);
    const driver = dbDrivers.find(d => d.full_name === name);
    if (driver) setFromDriverPhone(driver.phone);
  };

  const handleToDriverChange = (name: string) => {
    if (name === '__other__') {
      setToIsOther(true); setToDriver(''); setToDriverPhone('');
      return;
    }
    setToIsOther(false);
    setToDriver(name);
    const driver = dbDrivers.find(d => d.full_name === name);
    if (driver) setToDriverPhone(driver.phone);
  };

  const sendWhatsApp = (phone: string, driverName: string) => {
    if (!phone) { toast.error('אין מספר טלפון'); return; }
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '972');
    const message = `שלום ${driverName},\nבקשת אישור להחלפת רכב ${vehiclePlate}.\nתאריך: ${pickupDate}\nשעה: ${pickupTime}\nאנא אשר/י קבלה.\nתודה!`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      toast.error('הדפדפן לא תומך במיקום');
      return;
    }
    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=he`);
          const data = await res.json();
          setLocationAddress(data.display_name || `${latitude}, ${longitude}`);
          setLocationName(data.address?.city || data.address?.town || data.address?.village || '');
        } catch {
          setLocationAddress(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        }
        setIsLoadingLocation(false);
        toast.success('המיקום נקלט בהצלחה');
      },
      () => {
        setIsLoadingLocation(false);
        toast.error('לא הצלחנו לקבל מיקום, אנא אשר גישה למיקום');
      },
      { enableHighAccuracy: true }
    );
  };

  const openInMap = () => {
    if (locationAddress) {
      window.open(`https://www.google.com/maps/search/${encodeURIComponent(locationAddress)}`, '_blank');
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newPhotos: FaultAttachment[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      size: file.size,
      url: URL.createObjectURL(file),
    }));
    setPhotos(prev => [...prev, ...newPhotos]);
    e.target.value = '';
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const p = prev.find(a => a.id === id);
      if (p) URL.revokeObjectURL(p.url);
      return prev.filter(a => a.id !== id);
    });
  };

  const updateCondition = (index: number, status: 'ok' | 'damaged' | 'missing') => {
    setConditions(prev => prev.map((c, i) => i === index ? { ...c, status } : c));
  };

  const isValid = vehiclePlate && fromDriver && toDriver && pickupDate && pickupTime;

  const handleSubmit = async () => {
    if (!isValid) return;
    const dateTimeIso =
      pickupDate && pickupTime
        ? new Date(`${pickupDate}T${pickupTime}`).toISOString()
        : pickupDate
          ? new Date(`${pickupDate}T12:00:00`).toISOString()
          : null;

    const { error } = await supabase.from('vehicle_handovers' as any).insert({
      action_type: action,
      vehicle_plate: vehiclePlate,
      date_time: dateTimeIso,
      vehicle_type: selectedVehicle?.vehicle_type || '',
      manufacturer: selectedVehicle?.manufacturer || '',
      model: selectedVehicle?.model || '',
      odometer: parseInt(odometer) || 0,
      vehicle_notes: vehicleNotes,
      giving_driver_name: fromDriver,
      giving_driver_phone: fromDriverPhone,
      receiving_driver_name: toDriver,
      receiving_driver_phone: toDriverPhone,
      pickup_date: pickupDate,
      pickup_time: pickupTime,
      location_name: locationName,
      location_address: locationAddress,
      condition_checklist: conditions,
      damage_summary: conditionNotes,
      company_name: user?.company_name || '',
      created_by: user?.id,
    } as any);
    if (error) {
      toast.error('שגיאה בשמירת הטופס');
      console.error(error);
    } else {
      // Save temporary driver records if applicable
      const tempDriverPromises: Promise<any>[] = [];
      if (fromIsOther && fromDriver) {
        tempDriverPromises.push(
          (supabase.from('temporary_drivers' as any).insert({
            full_name: fromDriver,
            id_number: fromOtherId,
            license_number: fromOtherLicense,
            license_expiry: fromOtherLicenseExpiry || null,
            phone: fromDriverPhone,
            company_name: user?.company_name || '',
            created_by: user?.id,
          } as any) as any).then(() => {})
        );
      }
      if (toIsOther && toDriver) {
        tempDriverPromises.push(
          (supabase.from('temporary_drivers' as any).insert({
            full_name: toDriver,
            id_number: toOtherId,
            license_number: toOtherLicense,
            license_expiry: toOtherLicenseExpiry || null,
            phone: toDriverPhone,
            company_name: user?.company_name || '',
            created_by: user?.id,
          } as any) as any).then(() => {})
        );
      }
      if (tempDriverPromises.length > 0) {
        await Promise.all(tempDriverPromises);
      }
      await recordVehicleHubAction({
        vehicleId: contextVehicleId || selectedVehicle?.id,
        vehiclePlate: vehiclePlate,
        companyName: user?.company_name || '',
        action: action === 'return' ? 'החזרת רכב' : 'מסירת רכב',
        details: `${fromDriver} → ${toDriver}`,
        userId: user?.id,
        userName: user?.full_name,
        targetDate: pickupDate || null,
        notifyTransport: vehicleScoped,
        transportMessage: vehicleScoped
          ? `רכב ${vehiclePlate} · ${fromDriver} → ${toDriver} · ${pickupDate || ''}`
          : undefined,
      });
      toast.success('טופס החלפת רכב נשלח בהצלחה');
      loadHandoverHistory();
    }
  };

  const handleApprovalChange = async (handoverId: string, newStatus: string) => {
    const { error } = await supabase
      .from('vehicle_handovers')
      .update({ driver_approval_status: newStatus, approval_updated_at: new Date().toISOString() } as any)
      .eq('id', handoverId);
    if (error) {
      toast.error('שגיאה בעדכון הסטטוס');
    } else {
      toast.success(newStatus === 'approved' ? 'ההחלפה אושרה' : newStatus === 'rejected' ? 'ההחלפה נדחתה' : 'הסטטוס עודכן');
      loadHandoverHistory();
    }
  };

  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  return (
    <div className="animate-fade-in">
      <VehicleScopedNavChrome
        vehicleId={contextVehicleId}
        plate={contextPlate}
        pageLabel="שינוע"
        active={vehicleScoped}
      />
      <h1 className="page-header">טופס החלפת רכב</h1>

      {/* Tabs */}
      <div className="flex gap-3 mb-5">
        <button onClick={() => setActiveTab('form')}
          className={`flex-1 py-3 rounded-xl text-lg font-bold transition-colors ${activeTab === 'form' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          <RefreshCw size={18} className="inline ml-2" /> טופס חדש
        </button>
        <button onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 rounded-xl text-lg font-bold transition-colors ${activeTab === 'history' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          <History size={18} className="inline ml-2" /> היסטוריה ({visibleHandoverRecords.length})
        </button>
      </div>

      {activeTab === 'history' ? (
        <div className="space-y-3">
          {visibleHandoverRecords.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCw size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-xl">{locked && contextPlate ? VEHICLE_EMPTY_LIST_MSG : 'אין החלפות רכב'}</p>
            </div>
          ) : visibleHandoverRecords.map(record => {
            const status = approvalStatusConfig[record.driver_approval_status] || approvalStatusConfig.pending;
            const StatusIcon = status.icon;
            return (
              <div key={record.id} className="card-elevated">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-lg font-bold">{record.vehicle_plate}</p>
                    <p className="text-sm text-muted-foreground">{record.manufacturer} {record.model}</p>
                  </div>
                  <span className={`px-3 py-1.5 rounded-full text-sm font-bold border flex items-center gap-1.5 ${status.cls}`}>
                    <StatusIcon size={14} />
                    {status.text}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <span>{record.giving_driver_name}</span>
                  <span>←</span>
                  <span>{record.receiving_driver_name}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {record.pickup_date ? new Date(record.pickup_date).toLocaleDateString('he-IL') : ''}
                  {record.approval_updated_at && ` • עודכן: ${new Date(record.approval_updated_at).toLocaleDateString('he-IL')}`}
                </p>
                {(user?.role === 'fleet_manager' || user?.role === 'super_admin') && record.driver_approval_status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => handleApprovalChange(record.id, 'approved')}
                      className="flex-1 py-2.5 rounded-xl bg-success/15 text-success font-bold text-sm flex items-center justify-center gap-1.5 border border-success/30">
                      <CheckCircle2 size={16} /> אשר
                    </button>
                    <button onClick={() => handleApprovalChange(record.id, 'rejected')}
                      className="flex-1 py-2.5 rounded-xl bg-destructive/15 text-destructive font-bold text-sm flex items-center justify-center gap-1.5 border border-destructive/30">
                      <XCircle size={16} /> דחה
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
      {/* Action Type */}
      <div className="card-elevated mb-5">
        <h2 className="text-lg font-bold mb-3 text-primary">פעולת רכב</h2>
        <div className="flex gap-3">
          <button
            onClick={() => setAction('pickup')}
            className={`flex-1 py-4 rounded-xl text-lg font-bold border-2 transition-colors ${action === 'pickup' ? 'border-primary bg-primary/10 text-primary' : 'bg-muted text-muted-foreground border-transparent'}`}
          >
            🔑 לקיחה
          </button>
          <button
            onClick={() => setAction('return')}
            className={`flex-1 py-4 rounded-xl text-lg font-bold border-2 transition-colors ${action === 'return' ? 'border-primary bg-primary/10 text-primary' : 'bg-muted text-muted-foreground border-transparent'}`}
          >
            🔄 החזרה
          </button>
        </div>
      </div>

      {/* Vehicle Details */}
      <div className="card-elevated mb-5">
        <h2 className="text-lg font-bold mb-4 text-primary">פרטי רכב</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-lg font-medium mb-2">מספר רכב</label>
            <select value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} disabled={locked && !!contextPlate} className={inputClass}>
              <option value="">בחר רכב...</option>
              {dbVehicles.map(v => (
                <option key={v.license_plate} value={v.license_plate}>{v.license_plate} - {v.manufacturer} {v.model}</option>
              ))}
            </select>
          </div>
          {selectedVehicle && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted">
              <div><span className="text-sm text-muted-foreground">סוג רכב</span><p className="font-bold">{selectedVehicle.vehicle_type}</p></div>
              <div><span className="text-sm text-muted-foreground">יצרן</span><p className="font-bold">{selectedVehicle.manufacturer}</p></div>
              <div><span className="text-sm text-muted-foreground">דגם</span><p className="font-bold">{selectedVehicle.model}</p></div>
              <div><span className="text-sm text-muted-foreground">שנה</span><p className="font-bold">{selectedVehicle.year}</p></div>
            </div>
          )}
          <div>
            <label className="block text-lg font-medium mb-2">קילומטראז' נוכחי</label>
            <input type="number" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="הכנס קילומטראז'..." className={inputClass} />
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">הערות רכב (אופציונלי)</label>
            <textarea value={vehicleNotes} onChange={e => setVehicleNotes(e.target.value)} rows={2} placeholder="הערות על הרכב..." className={`${inputClass} resize-none`} />
          </div>
        </div>
      </div>

      {/* Driver Exchange */}
      <div className="card-elevated mb-5">
        <h2 className="text-lg font-bold mb-4 text-primary">טופס {action === 'pickup' ? 'לקיחה' : 'החזרה'}</h2>
        <div className="space-y-4">
          {/* From Driver */}
          <div>
            <label className="block text-lg font-medium mb-2">נהג מוסר</label>
            <select value={fromIsOther ? '__other__' : fromDriver} onChange={e => handleFromDriverChange(e.target.value)} className={inputClass}>
              <option value="">בחר נהג...</option>
              {dbDrivers.map(d => (
                <option key={d.full_name} value={d.full_name}>{d.full_name}</option>
              ))}
              <option value="__other__">➕ אחר (נהג זמני)</option>
            </select>
          </div>
          {fromIsOther && (
            <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
              <p className="text-sm font-bold text-primary flex items-center gap-2"><UserPlus size={16} /> פרטי נהג זמני (מוסר)</p>
              <input value={fromDriver} onChange={e => setFromDriver(e.target.value)} placeholder="שם נהג..." className={inputClass} />
              <input value={fromOtherId} onChange={e => setFromOtherId(e.target.value)} placeholder="מספר מזהה (ת.ז)..." className={inputClass} />
              <input value={fromOtherLicense} onChange={e => setFromOtherLicense(e.target.value)} placeholder="מספר רישיון נהיגה..." className={inputClass} />
              <input type="date" value={fromOtherLicenseExpiry} onChange={e => setFromOtherLicenseExpiry(e.target.value)} placeholder="תוקף רישיון" className={inputClass} />
            </div>
          )}
          <div>
            <label className="block text-lg font-medium mb-2">טלפון נהג מוסר</label>
            <div className="flex gap-2">
              <input type="tel" value={fromDriverPhone} onChange={e => setFromDriverPhone(e.target.value)} placeholder="מספר טלפון..." className={`${inputClass} flex-1`} />
              {fromDriverPhone && (
                <button onClick={() => sendWhatsApp(fromDriverPhone, fromDriver)} className="px-4 rounded-xl bg-[hsl(142,70%,45%)] text-white font-bold flex items-center gap-2 min-h-[48px]">
                  <MessageCircle size={20} />
                </button>
              )}
            </div>
          </div>

          {/* To Driver */}
          <div>
            <label className="block text-lg font-medium mb-2">נהג מקבל</label>
            <select value={toIsOther ? '__other__' : toDriver} onChange={e => handleToDriverChange(e.target.value)} className={inputClass}>
              <option value="">בחר נהג...</option>
              {dbDrivers.filter(d => d.full_name !== fromDriver).map(d => (
                <option key={d.full_name} value={d.full_name}>{d.full_name}</option>
              ))}
              <option value="__other__">➕ אחר (נהג זמני)</option>
            </select>
          </div>
          {toIsOther && (
            <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
              <p className="text-sm font-bold text-primary flex items-center gap-2"><UserPlus size={16} /> פרטי נהג זמני (מקבל)</p>
              <input value={toDriver} onChange={e => setToDriver(e.target.value)} placeholder="שם נהג..." className={inputClass} />
              <input value={toOtherId} onChange={e => setToOtherId(e.target.value)} placeholder="מספר מזהה (ת.ז)..." className={inputClass} />
              <input value={toOtherLicense} onChange={e => setToOtherLicense(e.target.value)} placeholder="מספר רישיון נהיגה..." className={inputClass} />
              <input type="date" value={toOtherLicenseExpiry} onChange={e => setToOtherLicenseExpiry(e.target.value)} placeholder="תוקף רישיון" className={inputClass} />
            </div>
          )}
          <div>
            <label className="block text-lg font-medium mb-2">טלפון נהג מקבל</label>
            <div className="flex gap-2">
              <input type="tel" value={toDriverPhone} onChange={e => setToDriverPhone(e.target.value)} placeholder="מספר טלפון..." className={`${inputClass} flex-1`} />
              {toDriverPhone && (
                <button onClick={() => sendWhatsApp(toDriverPhone, toDriver)} className="px-4 rounded-xl bg-[hsl(142,70%,45%)] text-white font-bold flex items-center gap-2 min-h-[48px]">
                  <MessageCircle size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Date, Time & Location */}
      <div className="card-elevated mb-5">
        <h2 className="text-lg font-bold mb-4 text-primary">תאריך, שעה ומיקום</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-lg font-medium mb-2">תאריך {action === 'pickup' ? 'לקיחה' : 'החזרה'}</label>
              <input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-lg font-medium mb-2">שעת {action === 'pickup' ? 'לקיחה' : 'החזרה'}</label>
              <input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">מיקום</label>
            <input type="text" value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="שם המיקום..." className={inputClass} />
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">כתובת / נקודת ציון</label>
            <input type="text" value={locationAddress} onChange={e => setLocationAddress(e.target.value)} placeholder="כתובת מלאה..." className={inputClass} />
          </div>
          <div className="flex gap-3">
            <button
              onClick={getLocation}
              disabled={isLoadingLocation}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-primary/30 bg-primary/5 text-lg font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <Navigation size={22} className={isLoadingLocation ? 'animate-spin' : ''} />
              {isLoadingLocation ? 'מאתר...' : 'קח מיקום מהטלפון'}
            </button>
            <button
              onClick={openInMap}
              disabled={!locationAddress}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-input bg-muted/50 text-lg font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              <MapPin size={22} />
              פתח במפה
            </button>
          </div>
        </div>
      </div>

      {/* Vehicle Condition */}
      <div className="card-elevated mb-5">
        <h2 className="text-lg font-bold mb-4 text-primary">מצב הרכב בעת {action === 'pickup' ? 'לקיחה' : 'החזרה'}</h2>
        <div className="space-y-3">
          {conditions.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
              <span className="text-base font-medium flex-1">{item.label}</span>
              <div className="flex gap-1">
                {(['ok', 'damaged', 'missing'] as const).map(status => {
                  const sl = conditionStatusLabels[status];
                  return (
                    <button
                      key={status}
                      onClick={() => updateCondition(idx, status)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${item.status === status ? sl.cls + ' border-current' : 'bg-background text-muted-foreground border-transparent'}`}
                    >
                      {sl.text}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <label className="block text-lg font-medium mb-2">הערות מצב רכב</label>
          <textarea value={conditionNotes} onChange={e => setConditionNotes(e.target.value)} rows={2} placeholder="פירוט נזקים או הערות..." className={`${inputClass} resize-none`} />
        </div>
      </div>

      {/* Photos */}
      <div className="card-elevated mb-5">
        <h2 className="text-lg font-bold mb-4 text-primary">תמונות רכב</h2>
        <button
          onClick={() => cameraRef.current?.click()}
          className="w-full flex items-center justify-center gap-3 py-5 rounded-xl border-2 border-dashed border-input bg-muted/50 text-xl font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Camera size={28} />
          📸 צלם תמונה
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoChange} className="hidden" />
        
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {photos.map(p => (
              <div key={p.id} className="relative">
                <img src={p.url} alt={p.name} className="w-full h-24 rounded-xl object-cover" />
                <button onClick={() => removePhoto(p.id)} className="absolute top-1 left-1 p-1 rounded-full bg-destructive text-destructive-foreground">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!isValid}
        className={`w-full py-5 rounded-xl text-xl font-bold transition-colors mb-6 ${isValid ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
      >
        <RefreshCw size={24} className="inline ml-2" />
        שלח טופס {action === 'pickup' ? 'לקיחה' : 'החזרה'}
      </button>
      </>
      )}
    </div>
  );
}
