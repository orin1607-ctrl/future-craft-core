import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { UserCheck, Car, Save, UserPlus, Send, Users, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buildDriverAssignmentHistoryRow, parseInitialKm } from '@/lib/driverAssignmentHistory';

interface VehicleRow { id: string; license_plate: string; manufacturer: string; model: string; assigned_driver_id: string | null; company_name: string | null; odometer: number | null; }
interface DriverRow { id: string; full_name: string; email: string; phone: string; }
interface ProfileRow { id: string; full_name: string; phone: string; company_name: string; }
interface CompanionRow { id: string; full_name: string; phone: string | null; }
interface VehicleCompanionRow { id: string; vehicle_id: string; companion_id: string; }
interface AssignmentHistoryRow {
  vehicle_id: string;
  odometer: number | null;
  event_date: string;
  description: string;
}

export default function AttachCar() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [companions, setCompanions] = useState<CompanionRow[]>([]);
  const [vehicleCompanions, setVehicleCompanions] = useState<VehicleCompanionRow[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentHistoryRow[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedCompanions, setSelectedCompanions] = useState<string[]>([]);
  const [initialKmInput, setInitialKmInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestPhone, setRequestPhone] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  const loadData = async () => {
    const [vRes, dRes, pRes, cRes, vcRes, hRes] = await Promise.all([
      applyCompanyScope(supabase.from('vehicles').select('id, license_plate, manufacturer, model, assigned_driver_id, company_name, odometer'), companyFilter),
      applyCompanyScope(supabase.from('drivers').select('id, full_name, email, phone'), companyFilter),
      applyCompanyScope(supabase.from('profiles').select('id, full_name, phone, company_name'), companyFilter),
      applyCompanyScope(supabase.from('companions').select('id, full_name, phone'), companyFilter),
      applyCompanyScope(supabase.from('vehicle_companions').select('id, vehicle_id, companion_id'), companyFilter),
      applyCompanyScope(
        supabase
          .from('vehicle_history')
          .select('vehicle_id, odometer, event_date, description')
          .eq('event_type', 'driver_assignment')
          .order('event_date', { ascending: false }),
        companyFilter,
      ),
    ]);
    if (vRes.data) setVehicles(vRes.data as VehicleRow[]);
    if (dRes.data) setDrivers(dRes.data as DriverRow[]);
    if (pRes.data) setProfiles(pRes.data as ProfileRow[]);
    if (cRes.data) setCompanions(cRes.data as CompanionRow[]);
    if (vcRes.data) setVehicleCompanions(vcRes.data as VehicleCompanionRow[]);
    if (hRes.data) setAssignmentHistory(hRes.data as AssignmentHistoryRow[]);
  };

  useEffect(() => { loadData(); }, []);

  const handleAssign = async () => {
    if (!selectedVehicle || !selectedDriver) return;
    const { km: initialKm, error: kmError } = parseInitialKm(initialKmInput);
    if (kmError) {
      toast.error(kmError);
      return;
    }
    setLoading(true);

    const assignedId = selectedCustomer || selectedDriver;
    const vehicle = vehicles.find((v) => v.id === selectedVehicle);
    const driverName = getDriverName(assignedId);

    // Update vehicle assignment only. Do not write vehicles.odometer from initial KM.
    const { error } = await supabase
      .from('vehicles')
      .update({ assigned_driver_id: assignedId })
      .eq('id', selectedVehicle);

    if (error) {
      toast.error('שגיאה בהצמדת הרכב');
      console.error(error);
      setLoading(false);
      return;
    }

    if (vehicle) {
      const historyRow = buildDriverAssignmentHistoryRow({
        vehicleId: vehicle.id,
        companyName: vehicle.company_name || companyFilter || user?.company_name || '',
        driverId: assignedId,
        driverName,
        vehiclePlate: vehicle.license_plate,
        initialKm,
        createdBy: user?.id || null,
      });
      const { error: historyError } = await supabase.from('vehicle_history').insert(historyRow);
      if (historyError) {
        const { assigned_driver_id: _assignedDriverId, ...withoutNewColumn } = historyRow;
        const retry = await supabase.from('vehicle_history').insert(withoutNewColumn);
        if (retry.error) {
          console.error(historyError, retry.error);
          toast.error('הרכב הוצמד, אך שמירת קילומטר התחלתי בהיסטוריה נכשלה');
        }
      }
    }

    // Save companions - delete existing and insert new
    await supabase.from('vehicle_companions').delete().eq('vehicle_id', selectedVehicle);
    if (selectedCompanions.length > 0) {
      const companionInserts = selectedCompanions.map(cId => ({
        vehicle_id: selectedVehicle,
        companion_id: cId,
        company_name: companyFilter || user?.company_name || '',
        created_by: user?.id,
      }));
      const { error: cErr } = await supabase.from('vehicle_companions').insert(companionInserts);
      if (cErr) {
        console.error('Error saving companions:', cErr);
        toast.error('הרכב הוצמד אך שגיאה בשמירת מלווים');
      }
    }

    setLoading(false);
    toast.success('הרכב הוצמד בהצלחה');
    setInitialKmInput('');
    loadData();
  };

  const handleSendRequest = async () => {
    if (!requestName) return;
    setSendingRequest(true);

    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'super_admin');

    if (admins && admins.length > 0) {
      const notifications = admins.map((a: any) => ({
        user_id: a.user_id,
        type: 'request',
        title: '📋 בקשה לפתיחת משתמש חדש',
        message: `מנהל צי ${user?.full_name || ''} מבקש לפתוח משתמש חדש: ${requestName}, טלפון: ${requestPhone}. ${requestNote ? 'הערה: ' + requestNote : ''}`,
        link: '/user-management',
      }));
      await supabase.from('driver_notifications').insert(notifications);
    }

    setSendingRequest(false);
    setRequestDialogOpen(false);
    setRequestName('');
    setRequestPhone('');
    setRequestNote('');
    toast.success('הבקשה נשלחה למנהל העל');
  };

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return 'לא משויך';
    const driver = drivers.find(d => d.id === driverId);
    if (driver) return driver.full_name;
    const profile = profiles.find(p => p.id === driverId);
    if (profile) return profile.full_name;
    return 'לא ידוע';
  };

  const getCustomerName = (driverId: string | null) => {
    if (!driverId) return '';
    const profile = profiles.find(p => p.id === driverId);
    return profile ? profile.full_name : '';
  };

  const getVehicleCompanionNames = (vehicleId: string) => {
    const vcs = vehicleCompanions.filter(vc => vc.vehicle_id === vehicleId);
    return vcs.map(vc => {
      const comp = companions.find(c => c.id === vc.companion_id);
      return comp?.full_name || 'לא ידוע';
    });
  };

  const toggleCompanion = (companionId: string) => {
    setSelectedCompanions(prev =>
      prev.includes(companionId)
        ? prev.filter(id => id !== companionId)
        : [...prev, companionId]
    );
  };

  const loadVehicleForEdit = (v: VehicleRow) => {
    setSelectedVehicle(v.id);
    // Check if assigned_driver_id is a driver or a customer
    const isDriver = drivers.find(d => d.id === v.assigned_driver_id);
    if (isDriver) {
      setSelectedDriver(v.assigned_driver_id || '');
      setSelectedCustomer('');
    } else {
      setSelectedDriver('');
      setSelectedCustomer(v.assigned_driver_id || '');
    }
    // Load companions for this vehicle
    const vcs = vehicleCompanions.filter(vc => vc.vehicle_id === v.id);
    setSelectedCompanions(vcs.map(vc => vc.companion_id));
    setInitialKmInput('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  return (
    <div className="animate-fade-in">
      <h1 className="page-header flex items-center gap-3">
        <UserCheck size={28} />
        הצמדת רכב לנהג וללקוח
      </h1>

      {/* Assignment Form */}
      <div className="card-elevated mb-6">
        <h2 className="text-lg font-bold mb-4 text-primary">הצמדה חדשה</h2>
        <div className="space-y-4">
          {/* 1. Vehicle */}
          <div>
            <label className="block text-lg font-medium mb-2">🚗 בחר רכב</label>
            <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} className={inputClass}>
              <option value="">בחר רכב...</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.license_plate} - {v.manufacturer} {v.model}</option>
              ))}
            </select>
          </div>

          {/* 2. Driver */}
          <div>
            <label className="block text-lg font-medium mb-2">👤 בחר נהג</label>
            <select value={selectedDriver} onChange={e => { setSelectedDriver(e.target.value); }} className={inputClass}>
              <option value="">בחר נהג...</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.full_name} - {d.phone}</option>
              ))}
            </select>
          </div>

          {/* Initial KM at assignment — stored in vehicle_history, does not overwrite vehicles.odometer */}
          <div>
            <label className="block text-lg font-medium mb-2">קילומטר התחלתי</label>
            {selectedVehicle && (
              <p className="text-sm text-muted-foreground mb-2">
                קילומטר נוכחי ברכב:{' '}
                {vehicles.find((v) => v.id === selectedVehicle)?.odometer != null
                  ? `${Number(vehicles.find((v) => v.id === selectedVehicle)?.odometer).toLocaleString('he-IL')} ק״מ`
                  : 'לא הוזן ברכב'}
              </p>
            )}
            <input
              dir="ltr"
              className={inputClass}
              value={initialKmInput}
              onChange={(e) => setInitialKmInput(e.target.value)}
              placeholder="לדוגמה 85420"
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground mt-1">
              נשמר בהיסטוריית ההצמדה (נהג, רכב, מועד, ק״מ התחלתי). לא דורס את הקילומטר הנוכחי של הרכב.
            </p>
          </div>

          {/* 3. Customer (user/profile) */}
          <div>
            <label className="block text-lg font-medium mb-2">🏢 בחר לקוח (בעל הרכב / משתמש באפליקציה)</label>
            <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} className={inputClass}>
              <option value="">בחר לקוח...</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.full_name} {p.phone ? `- ${p.phone}` : ''} {p.company_name ? `(${p.company_name})` : ''}</option>
              ))}
            </select>
            {!isSuperAdmin && (
              <button onClick={() => setRequestDialogOpen(true)}
                className="mt-2 flex items-center gap-2 text-sm text-primary font-medium hover:underline">
                <UserPlus size={16} /> לקוח לא קיים? שלח בקשה לפתיחת משתמש
              </button>
            )}
            {isSuperAdmin && (
              <NavLink to="/user-management" className="mt-2 flex items-center gap-2 text-sm text-primary font-medium hover:underline">
                <UserPlus size={16} /> פתח משתמש חדש
              </NavLink>
            )}
          </div>

          {/* 4. Companions */}
          <div>
            <label className="block text-lg font-medium mb-2">
              <Users size={18} className="inline ml-1" />
              מלווים (ניתן לבחור מספר מלווים)
            </label>
            {companions.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין מלווים במערכת. <NavLink to="/companions" className="text-primary hover:underline">הוסף מלווים</NavLink></p>
            ) : (
              <div className="border-2 border-input rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto">
                {companions.map(c => (
                  <label key={c.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedCompanions.includes(c.id)}
                      onChange={() => toggleCompanion(c.id)}
                      className="w-5 h-5 rounded border-2 border-input accent-primary"
                    />
                    <span className="flex-1 text-base">{c.full_name}</span>
                    {c.phone && <span className="text-sm text-muted-foreground">{c.phone}</span>}
                  </label>
                ))}
              </div>
            )}
            {selectedCompanions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedCompanions.map(cId => {
                  const comp = companions.find(c => c.id === cId);
                  return (
                    <span key={cId} className="inline-flex items-center gap-1 text-sm bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-medium">
                      {comp?.full_name}
                      <button onClick={() => toggleCompanion(cId)} className="hover:text-destructive">
                        <X size={14} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={handleAssign}
            disabled={!selectedVehicle || !selectedDriver || loading}
            className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${selectedVehicle && selectedDriver && !loading ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
          >
            <Save size={24} className="inline ml-2" />
            {loading ? 'שומר...' : 'שמור הצמדה'}
          </button>
        </div>
      </div>

      {/* Current Assignments */}
      <h2 className="text-xl font-bold mb-4">הצמדות נוכחיות</h2>
      <div className="space-y-3">
        {vehicles.map(v => {
          const companionNames = getVehicleCompanionNames(v.id);
          return (
            <div key={v.id} className="card-elevated">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Car size={28} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-lg font-bold">{v.license_plate}</p>
                  <p className="text-muted-foreground">{v.manufacturer} {v.model}</p>
                </div>
                <div className="text-left">
                  <p className={`text-sm font-medium ${v.assigned_driver_id ? 'text-primary' : 'text-muted-foreground'}`}>
                    {v.assigned_driver_id ? '✅' : '❌'} {getDriverName(v.assigned_driver_id)}
                  </p>
                  {getCustomerName(v.assigned_driver_id) && (
                    <p className="text-xs text-muted-foreground">🏢 {getCustomerName(v.assigned_driver_id)}</p>
                  )}
                  {v.odometer != null && (
                    <p className="text-xs text-muted-foreground">ק״מ נוכחי ברכב: {Number(v.odometer).toLocaleString('he-IL')}</p>
                  )}
                  {assignmentHistory.find((h) => h.vehicle_id === v.id) && (
                    <p className="text-xs text-muted-foreground">
                      ק״מ התחלתי בהצמדה:{' '}
                      {assignmentHistory.find((h) => h.vehicle_id === v.id)?.odometer != null
                        ? `${Number(assignmentHistory.find((h) => h.vehicle_id === v.id)?.odometer).toLocaleString('he-IL')}`
                        : 'לא הוזן'}
                    </p>
                  )}
                </div>
              </div>
              {/* Companions display */}
              {companionNames.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-xs text-muted-foreground">מלווים:</span>
                  {companionNames.map((name, i) => (
                    <span key={i} className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-lg">
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {/* Edit / Reassign */}
              <div className="mt-3 pt-3 border-t border-border flex gap-2 flex-wrap">
                <button
                  onClick={() => loadVehicleForEdit(v)}
                  className="flex-1 py-2 rounded-xl bg-primary/10 text-primary font-bold text-sm min-h-[40px]">
                  ✏️ שנה הצמדה
                </button>
                {v.assigned_driver_id && (
                  <button
                    onClick={async () => {
                      await Promise.all([
                        supabase.from('vehicles').update({ assigned_driver_id: null }).eq('id', v.id),
                        supabase.from('vehicle_companions').delete().eq('vehicle_id', v.id),
                      ]);
                      toast.success('ההצמדה הוסרה');
                      loadData();
                    }}
                    className="py-2 px-4 rounded-xl bg-destructive/10 text-destructive font-bold text-sm min-h-[40px]">
                    🗑️ הסר
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {vehicles.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Car size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">אין רכבים במערכת</p>
        </div>
      )}

      {/* Request New User Dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">בקשה לפתיחת משתמש חדש</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm mb-2">הבקשה תישלח למנהל העל לאישור ופתיחת המשתמש.</p>
          <div className="space-y-4">
            <div>
              <label className="block font-medium mb-1">שם מלא *</label>
              <input value={requestName} onChange={e => setRequestName(e.target.value)} className={inputClass} placeholder="שם הנהג/משתמש" />
            </div>
            <div>
              <label className="block font-medium mb-1">טלפון</label>
              <input value={requestPhone} onChange={e => setRequestPhone(e.target.value)} className={inputClass} dir="ltr" style={{ textAlign: 'right' }} placeholder="050-0000000" />
            </div>
            <div>
              <label className="block font-medium mb-1">הערה</label>
              <textarea value={requestNote} onChange={e => setRequestNote(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="פרטים נוספים..." />
            </div>
            <button onClick={handleSendRequest} disabled={!requestName || sendingRequest}
              className={`w-full py-4 rounded-xl text-lg font-bold transition-colors ${requestName && !sendingRequest ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
              <Send size={20} className="inline ml-2" />
              {sendingRequest ? 'שולח...' : 'שלח בקשה למנהל על'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
