import { useState, useRef, useEffect } from 'react';
import { MapPin, Camera, Loader2, Send, CheckCircle2, Car, Users, Navigation, Fuel, ClipboardCheck, Image, Package, MessageSquare, ShieldCheck, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { isVehicleScopedContext, plateMatches, useVehicleUrlContext } from '@/lib/entityNavContext';
import VehicleScopedNavChrome from '@/components/vehicles/VehicleScopedNavChrome';
import { VEHICLE_EMPTY_LIST_MSG } from '@/lib/vehicleScopedUi';
import { Button } from '@/components/ui/button';
import { ResolvedStorageImg } from '@/components/documents/DocumentViewer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ─── Photo upload helper ───
function PhotoUpload({ label, imageUrl, onUpload, required }: { label: string; imageUrl: string; onUpload: (url: string) => void; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `exchanges/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('documents').upload(path, file);
    if (error) { toast.error('שגיאה בהעלאת תמונה'); setUploading(false); return; }
    onUpload(path);
    setUploading(false);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`w-full aspect-[4/3] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 text-sm font-medium transition-colors ${imageUrl ? 'border-primary/50 bg-primary/5' : 'border-input bg-muted/30 hover:border-primary hover:text-primary'}`}
      >
        {uploading ? <Loader2 size={28} className="animate-spin text-primary" /> : imageUrl ? (
          <ResolvedStorageImg url={imageUrl} alt={label} className="w-full h-full object-cover rounded-lg" />
        ) : (
          <>
            <Camera size={28} className="text-muted-foreground" />
            <span className="text-muted-foreground text-xs">{label}</span>
            {required && <span className="text-destructive text-[10px]">חובה</span>}
          </>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
    </div>
  );
}

// ─── Section wrapper ───
function Section({ icon: Icon, title, children, id }: { icon: any; title: string; children: React.ReactNode; id: string }) {
  return (
    <Card id={id} className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon size={20} className="text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

// ─── Radio group helper ───
function RadioRow({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${value === o.value ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'bg-muted/50 border-border text-foreground hover:bg-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───
export default function VehicleExchange() {
  const { user } = useAuth();
  const isPrivate = user?.role === 'private_customer';
  const companyFilter = useCompanyFilter();
  const { plate: contextPlate, vehicleId: contextVehicleId, locked } = useVehicleUrlContext();
  const vehicleScoped = isVehicleScopedContext({ locked, plate: contextPlate, vehicleId: contextVehicleId });
  const [activeTab, setActiveTab] = useState('form');
  const [saving, setSaving] = useState(false);

  // Part 1
  const [actionType, setActionType] = useState('');
  const [exchangeDate, setExchangeDate] = useState(new Date().toISOString().split('T')[0]);
  const [exchangeTime, setExchangeTime] = useState(new Date().toTimeString().slice(0, 5));

  // Part 2
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleTypeCustom, setVehicleTypeCustom] = useState('');
  const [branch, setBranch] = useState('');
  const [internalNumber, setInternalNumber] = useState('');
  const [permanentDriverName, setPermanentDriverName] = useState('');
  const [hasPermanentDriver, setHasPermanentDriver] = useState(false);

  // Part 3
  const [givingDriverName, setGivingDriverName] = useState('');
  const [givingDriverPhone, setGivingDriverPhone] = useState('');
  const [receivingDriverName, setReceivingDriverName] = useState('');
  const [receivingDriverPhone, setReceivingDriverPhone] = useState('');
  const [receivingDriverType, setReceivingDriverType] = useState('');

  // Part 4
  const [locationAddress, setLocationAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Part 5
  const [odometer, setOdometer] = useState('');
  const [fuelLevel, setFuelLevel] = useState('');
  const [cleanliness, setCleanliness] = useState('');
  const [hasDamages, setHasDamages] = useState(false);
  const [damageDetails, setDamageDetails] = useState('');
  const [hasWarningLight, setHasWarningLight] = useState(false);

  // Part 6
  const [photoFront, setPhotoFront] = useState('');
  const [photoRear, setPhotoRear] = useState('');
  const [photoRight, setPhotoRight] = useState('');
  const [photoLeft, setPhotoLeft] = useState('');
  const [photoInterior, setPhotoInterior] = useState('');
  const [photoOdometer, setPhotoOdometer] = useState('');
  const [photoDamage, setPhotoDamage] = useState('');

  // Part 7
  const [keyCount, setKeyCount] = useState('1');
  const [hasLicenseDoc, setHasLicenseDoc] = useState(true);
  const [hasInsuranceDoc, setHasInsuranceDoc] = useState(true);
  const [hasSpareTire, setHasSpareTire] = useState(true);
  const [hasJack, setHasJack] = useState(true);
  const [extraEquipment, setExtraEquipment] = useState('');

  // Part 8
  const [exchangeReason, setExchangeReason] = useState('');
  const [givingDriverNotes, setGivingDriverNotes] = useState('');
  const [receivingDriverNotes, setReceivingDriverNotes] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Part 9
  const [givingDriverApproved, setGivingDriverApproved] = useState(false);
  const [receivingDriverApproved, setReceivingDriverApproved] = useState(false);
  const [managerApproved, setManagerApproved] = useState(false);

  // Part 10
  const [whatsappPhone, setWhatsappPhone] = useState('');

  // History
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searchPlate, setSearchPlate] = useState('');
  const [searchDriver, setSearchDriver] = useState('');

  // Auto-fill driver name
  useEffect(() => {
    if (user?.role === 'driver' || user?.role === 'private_customer') {
      setGivingDriverName(user.full_name || '');
      setGivingDriverPhone(user.phone || '');
    }
  }, [user]);

  useEffect(() => {
    if (!contextPlate) return;
    setVehiclePlate(contextPlate);
    setSearchPlate(contextPlate);
  }, [contextPlate]);

  const getLocation = () => {
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&accept-language=he`);
          const data = await res.json();
          setLocationAddress(data.display_name || `${pos.coords.latitude}, ${pos.coords.longitude}`);
        } catch {
          setLocationAddress(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        }
        setGettingLocation(false);
        toast.success('מיקום נקלט בהצלחה');
      },
      () => { toast.error('שגיאה בקבלת מיקום'); setGettingLocation(false); },
      { enableHighAccuracy: true }
    );
  };

  const validate = (): string | null => {
    if (!vehiclePlate) return 'חובה להזין מספר רכב';
    if (!givingDriverName) return 'חובה להזין שם נהג מוסר';
    if (!receivingDriverName && !receivingDriverPhone) return 'חובה להזין נהג מקבל או טלפון';
    if (!odometer) return 'חובה להזין קילומטראז\'';
    if (!isPrivate) {
      if (!locationAddress) return 'חובה לקבל מיקום';
      if (!photoFront || !photoRear || !photoRight || !photoLeft || !photoInterior || !photoOdometer) return 'חובה לצלם את כל התמונות הנדרשות';
      if (!givingDriverApproved || !receivingDriverApproved) return 'חובה לקבל אישור משני הנהגים';
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }

    setSaving(true);
    const { error } = await supabase.from('vehicle_exchanges' as any).insert({
      created_by: user?.id,
      company_name: user?.company_name || '',
      exchange_date: exchangeDate,
      exchange_time: exchangeTime,
      action_type: actionType,
      vehicle_plate: vehiclePlate,
      vehicle_type: vehicleType,
      vehicle_type_custom: vehicleTypeCustom,
      branch,
      internal_number: internalNumber,
      permanent_driver_name: permanentDriverName,
      has_permanent_driver: hasPermanentDriver,
      giving_driver_name: givingDriverName,
      giving_driver_phone: givingDriverPhone,
      receiving_driver_name: receivingDriverName,
      receiving_driver_phone: receivingDriverPhone,
      receiving_driver_type: receivingDriverType,
      location_address: locationAddress,
      lat,
      lng,
      handover_date: exchangeDate,
      handover_time: exchangeTime,
      odometer: parseInt(odometer) || 0,
      fuel_level: fuelLevel,
      cleanliness,
      has_damages: hasDamages,
      damage_details: damageDetails,
      has_warning_light: hasWarningLight,
      photo_front: photoFront,
      photo_rear: photoRear,
      photo_right: photoRight,
      photo_left: photoLeft,
      photo_interior: photoInterior,
      photo_odometer: photoOdometer,
      photo_damage: photoDamage,
      key_count: parseInt(keyCount) || 1,
      has_license_doc: hasLicenseDoc,
      has_insurance_doc: hasInsuranceDoc,
      has_spare_tire: hasSpareTire,
      has_jack: hasJack,
      extra_equipment: extraEquipment,
      exchange_reason: exchangeReason,
      giving_driver_notes: givingDriverNotes,
      receiving_driver_notes: receivingDriverNotes,
      special_instructions: specialInstructions,
      giving_driver_approved: givingDriverApproved,
      receiving_driver_approved: receivingDriverApproved,
      manager_approved: managerApproved,
      whatsapp_phone: whatsappPhone,
      whatsapp_status: 'pending',
      status: 'completed',
    } as any);

    setSaving(false);
    if (error) { toast.error('שגיאה בשמירת הטופס'); console.error(error); return; }
    toast.success('טופס החלפת רכב נשמר בהצלחה!');
    // Reset critical fields
    setVehiclePlate(''); setOdometer(''); setPhotoFront(''); setPhotoRear('');
    setPhotoRight(''); setPhotoLeft(''); setPhotoInterior(''); setPhotoOdometer('');
    setPhotoDamage(''); setGivingDriverApproved(false); setReceivingDriverApproved(false);
  };

  const sendWhatsApp = () => {
    const phone = whatsappPhone || (hasPermanentDriver ? givingDriverPhone : '');
    if (!phone) { toast.error('לא הוזן מספר טלפון'); return; }
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '972');
    const msg = encodeURIComponent(
      `🚗 אישור החלפת רכב\n\nרכב: ${vehiclePlate}\nנהג מוסר: ${givingDriverName}\nנהג מקבל: ${receivingDriverName || 'טרם צוין'}\nתאריך: ${exchangeDate}\nשעה: ${exchangeTime}\nמיקום: ${locationAddress}\nק"מ: ${odometer}\n\nנא לאשר קבלת הרכב.`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
    toast.success('נשלח בוואטסאפ');
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    let query = supabase.from('vehicle_exchanges' as any).select('*').order('created_at', { ascending: false }).limit(50);
    const plateFilter = locked && contextPlate ? contextPlate : searchPlate;
    if (plateFilter) query = query.ilike('vehicle_plate', `%${plateFilter}%`);
    if (searchDriver) query = query.or(`giving_driver_name.ilike.%${searchDriver}%,receiving_driver_name.ilike.%${searchDriver}%`);
    const { data } = await query;
    let rows = (data as any[]) || [];
    if (locked && contextPlate) {
      rows = rows.filter((r) => plateMatches(r.vehicle_plate, contextPlate));
    }
    setHistory(rows);
    setLoadingHistory(false);
  };

  useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, locked, contextPlate]);

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-8" dir="rtl">
      <VehicleScopedNavChrome
        vehicleId={contextVehicleId}
        plate={contextPlate}
        pageLabel="החלפת רכב"
        active={vehicleScoped}
      />
      <h1 className="text-2xl font-bold text-foreground">טופס החלפת רכב</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="form" className="text-base">טופס חדש</TabsTrigger>
          <TabsTrigger value="history" className="text-base">היסטוריה</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="space-y-4 mt-4">
          {/* Part 1 – Basic Info */}
          <Section icon={ClipboardCheck} title="פרטי בסיס" id="sec1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>תאריך</Label>
                <Input type="date" value={exchangeDate} onChange={e => setExchangeDate(e.target.value)} />
              </div>
              <div>
                <Label>שעה</Label>
                <Input type="time" value={exchangeTime} onChange={e => setExchangeTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>סוג פעולה</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger><SelectValue placeholder="בחר סוג" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="temp">החלפה זמנית</SelectItem>
                  <SelectItem value="shift">החלפה למשמרת</SelectItem>
                  <SelectItem value="daily">החלפה יומית</SelectItem>
                  <SelectItem value="fault">עקב תקלה</SelectItem>
                  <SelectItem value="transport">שינוע</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Section>

          {/* Part 2 – Vehicle */}
          <Section icon={Car} title="פרטי רכב" id="sec2">
            <div>
              <Label>מספר רכב <span className="text-destructive">*</span></Label>
              <Input value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} placeholder="מספר רכב" className="text-lg" />
            </div>
            <div>
              <Label>סוג רכב</Label>
              <Select value={vehicleType} onValueChange={v => { setVehicleType(v); if (v !== 'other') setVehicleTypeCustom(''); }}>
                <SelectTrigger><SelectValue placeholder="בחר סוג" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">פרטי</SelectItem>
                  <SelectItem value="commercial">מסחרי</SelectItem>
                  <SelectItem value="taxi">מונית</SelectItem>
                  <SelectItem value="minibus">מיניבוס</SelectItem>
                  <SelectItem value="bus">אוטובוס</SelectItem>
                  <SelectItem value="other">אחר</SelectItem>
                </SelectContent>
              </Select>
              {vehicleType === 'other' && <Input className="mt-2" placeholder="פרט סוג רכב" value={vehicleTypeCustom} onChange={e => setVehicleTypeCustom(e.target.value)} />}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>סניף / מחלקה</Label>
                <Input value={branch} onChange={e => setBranch(e.target.value)} />
              </div>
              <div>
                <Label>מספר פנימי</Label>
                <Input value={internalNumber} onChange={e => setInternalNumber(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={hasPermanentDriver} onCheckedChange={setHasPermanentDriver} />
              <Label>יש נהג קבוע</Label>
            </div>
            {hasPermanentDriver && (
              <div>
                <Label>שם נהג קבוע</Label>
                <Input value={permanentDriverName} onChange={e => setPermanentDriverName(e.target.value)} />
              </div>
            )}
          </Section>

          {/* Part 3 – Drivers */}
          <Section icon={Users} title="נהגים" id="sec3">
            <div className="p-3 rounded-xl bg-muted/50 space-y-3">
              <p className="font-bold text-sm text-primary">נהג מוסר</p>
              <div>
                <Label>שם מלא <span className="text-destructive">*</span></Label>
                <Input value={givingDriverName} onChange={e => setGivingDriverName(e.target.value)} className="text-lg" />
              </div>
              <div>
                <Label>טלפון</Label>
                <Input type="tel" value={givingDriverPhone} onChange={e => setGivingDriverPhone(e.target.value)} />
              </div>
            </div>
            <div className="p-3 rounded-xl bg-muted/50 space-y-3">
              <p className="font-bold text-sm text-primary">נהג מקבל</p>
              <div>
                <Label>שם מלא</Label>
                <Input value={receivingDriverName} onChange={e => setReceivingDriverName(e.target.value)} className="text-lg" />
              </div>
              <div>
                <Label>טלפון {!hasPermanentDriver && <span className="text-destructive">*</span>}</Label>
                <Input type="tel" value={receivingDriverPhone} onChange={e => setReceivingDriverPhone(e.target.value)} />
              </div>
              <div>
                <Label>סוג נהג מקבל</Label>
                <Select value={receivingDriverType} onValueChange={setReceivingDriverType}>
                  <SelectTrigger><SelectValue placeholder="בחר סוג" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanent">קבוע</SelectItem>
                    <SelectItem value="temp">זמני</SelectItem>
                    <SelectItem value="substitute">מחליף</SelectItem>
                    <SelectItem value="transport">שינוע</SelectItem>
                    <SelectItem value="other">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          {/* Part 4 – Location */}
          <Section icon={MapPin} title="מיקום וזמן" id="sec4">
            <Button type="button" onClick={getLocation} disabled={gettingLocation} variant="outline" className="w-full py-6 text-lg gap-3">
              {gettingLocation ? <Loader2 className="animate-spin" size={22} /> : <Navigation size={22} />}
              {gettingLocation ? 'מאתר...' : 'קבל מיקום נוכחי'}
            </Button>
            {locationAddress && (
              <div className="p-3 rounded-xl bg-success/10 border border-success/20 text-sm">
                <span className="font-bold text-success">📍 </span>{locationAddress}
              </div>
            )}
            <div>
              <Label>כתובת ידנית</Label>
              <Input value={locationAddress} onChange={e => setLocationAddress(e.target.value)} placeholder="או הזן כתובת ידנית" />
            </div>
          </Section>

          {/* Part 5 – Condition */}
          <Section icon={Fuel} title="מצב רכב" id="sec5">
            <div>
              <Label>קילומטראז' <span className="text-destructive">*</span></Label>
              <Input type="number" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="ק״מ" className="text-lg" />
            </div>
            <div>
              <Label>דלק</Label>
              <RadioRow
                options={[
                  { value: 'full', label: 'מלא' },
                  { value: '3/4', label: '¾' },
                  { value: '1/2', label: '½' },
                  { value: '1/4', label: '¼' },
                  { value: 'empty', label: 'ריק' },
                ]}
                value={fuelLevel}
                onChange={setFuelLevel}
              />
            </div>
            <div>
              <Label>ניקיון</Label>
              <RadioRow
                options={[
                  { value: 'clean', label: 'תקין' },
                  { value: 'slightly_dirty', label: 'מלוכלך קל' },
                  { value: 'very_dirty', label: 'מלוכלך מאוד' },
                ]}
                value={cleanliness}
                onChange={setCleanliness}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={hasDamages} onCheckedChange={setHasDamages} />
              <Label>נזקים קיימים</Label>
            </div>
            {hasDamages && <Textarea placeholder="פרט נזקים..." value={damageDetails} onChange={e => setDamageDetails(e.target.value)} />}
            <div className="flex items-center gap-3">
              <Switch checked={hasWarningLight} onCheckedChange={setHasWarningLight} />
              <Label>נורת תקלה דולקת</Label>
            </div>
          </Section>

          {/* Part 6 – Photos (not for private customers) */}
          {!isPrivate && (
            <Section icon={Image} title="תמונות (חובה)" id="sec6">
              <p className="text-xs text-muted-foreground">יש לצלם ישירות מהטלפון. לא ניתן לסיים טופס ללא כל התמונות.</p>
              <div className="grid grid-cols-2 gap-3">
                <PhotoUpload label="צילום קדמי" imageUrl={photoFront} onUpload={setPhotoFront} required />
                <PhotoUpload label="צילום אחורי" imageUrl={photoRear} onUpload={setPhotoRear} required />
                <PhotoUpload label="צד ימין" imageUrl={photoRight} onUpload={setPhotoRight} required />
                <PhotoUpload label="צד שמאל" imageUrl={photoLeft} onUpload={setPhotoLeft} required />
                <PhotoUpload label="צילום פנים" imageUrl={photoInterior} onUpload={setPhotoInterior} required />
                <PhotoUpload label="צילום ק״מ" imageUrl={photoOdometer} onUpload={setPhotoOdometer} required />
              </div>
              {hasDamages && (
                <div>
                  <p className="text-sm font-medium mb-2">צילום נזק</p>
                  <PhotoUpload label="צילום נזק" imageUrl={photoDamage} onUpload={setPhotoDamage} />
                </div>
              )}
            </Section>
          )}

          {/* Part 7 – Equipment */}
          <Section icon={Package} title="ציוד ברכב" id="sec7">
            <div>
              <Label>מספר מפתחות</Label>
              <Input type="number" min={0} value={keyCount} onChange={e => setKeyCount(e.target.value)} />
            </div>
            <div className="space-y-3">
              {[
                { label: 'רישיון רכב', checked: hasLicenseDoc, onChange: setHasLicenseDoc },
                { label: 'ביטוח', checked: hasInsuranceDoc, onChange: setHasInsuranceDoc },
                { label: 'גלגל חלופי', checked: hasSpareTire, onChange: setHasSpareTire },
                { label: 'ג\'ק', checked: hasJack, onChange: setHasJack },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <Switch checked={item.checked} onCheckedChange={item.onChange} />
                  <Label>{item.label}</Label>
                </div>
              ))}
            </div>
            <div>
              <Label>ציוד נוסף</Label>
              <Input value={extraEquipment} onChange={e => setExtraEquipment(e.target.value)} placeholder="ציוד נוסף ברכב..." />
            </div>
          </Section>

          {/* Part 8 – Notes */}
          <Section icon={MessageSquare} title="הערות" id="sec8">
            <div>
              <Label>סיבת ההחלפה</Label>
              <Textarea value={exchangeReason} onChange={e => setExchangeReason(e.target.value)} placeholder="סיבת ההחלפה..." />
            </div>
            <div>
              <Label>הערות נהג מוסר</Label>
              <Textarea value={givingDriverNotes} onChange={e => setGivingDriverNotes(e.target.value)} />
            </div>
            <div>
              <Label>הערות נהג מקבל</Label>
              <Textarea value={receivingDriverNotes} onChange={e => setReceivingDriverNotes(e.target.value)} />
            </div>
            <div>
              <Label>הנחיות מיוחדות</Label>
              <Textarea value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} />
            </div>
          </Section>

          {/* Part 9 – Approvals */}
          <Section icon={ShieldCheck} title="אישורים" id="sec9">
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Switch checked={givingDriverApproved} onCheckedChange={setGivingDriverApproved} />
                <div>
                  <p className="font-medium">אישור נהג מוסר</p>
                  <p className="text-xs text-muted-foreground">אני מאשר את מסירת הרכב</p>
                </div>
                {givingDriverApproved && <CheckCircle2 className="text-success mr-auto" size={20} />}
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Switch checked={receivingDriverApproved} onCheckedChange={setReceivingDriverApproved} />
                <div>
                  <p className="font-medium">אישור נהג מקבל</p>
                  <p className="text-xs text-muted-foreground">אני מאשר את קבלת הרכב</p>
                </div>
                {receivingDriverApproved && <CheckCircle2 className="text-success mr-auto" size={20} />}
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Switch checked={managerApproved} onCheckedChange={setManagerApproved} />
                <div>
                  <p className="font-medium">אישור מנהל</p>
                  <p className="text-xs text-muted-foreground">אופציונלי</p>
                </div>
              </div>
            </div>
          </Section>

          {/* Part 10 – WhatsApp */}
          <Section icon={MessageCircle} title="שליחה בוואטסאפ" id="sec10">
            {!hasPermanentDriver && (
              <div>
                <Label>מספר וואטסאפ לשליחה</Label>
                <Input type="tel" value={whatsappPhone} onChange={e => setWhatsappPhone(e.target.value)} placeholder="05X-XXXXXXX" className="text-lg" />
              </div>
            )}
            {hasPermanentDriver && givingDriverPhone && (
              <p className="text-sm text-muted-foreground">ישלח אוטומטית ל-{givingDriverPhone}</p>
            )}
            <Button type="button" onClick={sendWhatsApp} variant="outline" className="w-full py-6 text-lg gap-3 border-success text-success hover:bg-success/10">
              <Send size={22} />
              שלח אישור קבלה בוואטסאפ
            </Button>
          </Section>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-7 text-xl font-bold shadow-lg"
            size="lg"
          >
            {saving ? <Loader2 className="animate-spin ml-2" size={24} /> : <CheckCircle2 size={24} className="ml-2" />}
            שמור טופס החלפה
          </Button>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">חיפוש היסטוריה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="חפש לפי רכב" value={searchPlate} onChange={e => setSearchPlate(e.target.value)} />
                <Input placeholder="חפש לפי נהג" value={searchDriver} onChange={e => setSearchDriver(e.target.value)} />
              </div>
              <Button onClick={loadHistory} variant="outline" className="w-full">חפש</Button>
            </CardContent>
          </Card>

          {loadingHistory ? (
            <div className="text-center py-8"><Loader2 className="animate-spin mx-auto" size={32} /></div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {locked && contextPlate ? VEHICLE_EMPTY_LIST_MSG : 'אין היסטוריית החלפות'}
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((ex: any) => (
                <Card key={ex.id} className="border-border/50">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-primary">{ex.exchange_number}</span>
                      <span className="text-xs text-muted-foreground">{ex.exchange_date}</span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p>🚗 רכב: <strong>{ex.vehicle_plate}</strong></p>
                      <p>👤 מוסר: {ex.giving_driver_name}</p>
                      <p>👤 מקבל: {ex.receiving_driver_name || '—'}</p>
                      <p>📍 {ex.location_address || '—'}</p>
                      <p>ק״מ: {ex.odometer?.toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {ex.giving_driver_approved && <span className="text-xs px-2 py-1 rounded-full bg-success/15 text-success">מוסר אישר</span>}
                      {ex.receiving_driver_approved && <span className="text-xs px-2 py-1 rounded-full bg-success/15 text-success">מקבל אישר</span>}
                      {ex.has_damages && <span className="text-xs px-2 py-1 rounded-full bg-destructive/15 text-destructive">נזקים</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
