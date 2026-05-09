import { useState, useEffect } from 'react';
import { Users, Search, ArrowRight, Phone, Mail, Plus, Save, Edit2, X, Download, Upload, FileImage, Eye, AlertTriangle } from 'lucide-react';
import DriverDeclaration from '@/components/DriverDeclaration';
import DriverExamsTab from '@/components/driving-exam/DriverExamsTab';
import { exportToCsv } from '@/utils/exportCsv';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import InfoGapTracker from '@/components/InfoGapTracker';

interface DriverRow {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  license_number: string;
  license_expiry: string | null;
  license_types: string[];
  city: string;
  street: string;
  status: string;
  notes: string;
  company_name: string;
  id_number: string;
  license_image_url?: string;
}

const licenseOptions = ['A', 'A1', 'A2', 'B', 'C', 'C1', 'D', 'D1', 'E'];

export default function Drivers() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<DriverRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DriverRow | null>(null);

  const loadDrivers = async () => {
    const { data } = await applyCompanyScope(supabase.from('drivers').select('*'), companyFilter).order('created_at', { ascending: false });
    if (data) setDrivers(data as DriverRow[]);
  };

  useEffect(() => { loadDrivers(); }, []);

  const companies = [...new Set(drivers.map(d => d.company_name).filter(Boolean))];

  const filtered = drivers.filter(d => {
    const matchSearch = !search || d.full_name?.includes(search) || d.phone?.includes(search) || d.license_number?.includes(search) || d.id_number?.includes(search);
    const matchCompany = !filterCompany || d.company_name === filterCompany;
    const matchStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchSearch && matchCompany && matchStatus;
  });

  if (showForm || editingDriver) {
    return (
      <DriverForm
        driver={editingDriver}
        user={user}
        onDone={() => { setShowForm(false); setEditingDriver(null); loadDrivers(); }}
      />
    );
  }

  if (selected) {
    const d = selected;
    return (
      <div className="animate-fade-in">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
          <ArrowRight size={20} />
          חזרה לרשימה
        </button>
        <div className="card-elevated">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">{d.full_name}</h1>
            <div className="flex items-center gap-2">
              <span className={`status-badge ${d.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                {d.status === 'active' ? 'פעיל' : 'לא פעיל'}
              </span>
              {user?.role !== 'driver' && (
                <button onClick={() => { setSelected(null); setEditingDriver(d); }}
                  className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Edit2 size={18} className="text-primary" />
                </button>
              )}
            </div>
          </div>
          {(() => {
            const missing: string[] = [];
            if (!d.license_number) missing.push('מספר רישיון');
            if (!d.license_expiry) missing.push('תוקף רישיון');
            else if (new Date(d.license_expiry) < new Date()) missing.push('רישיון פג תוקף');
            if (!d.id_number) missing.push('תעודת זהות');
            if (!d.phone) missing.push('טלפון');
            if (!d.license_image_url) missing.push('צילום רישיון');
            if ((d as any).exam_expiry && new Date((d as any).exam_expiry) < new Date()) missing.push('מבחן כשירות פג תוקף');
            return <InfoGapTracker entityType="driver" entityId={d.id} companyName={(d as any).company_name || ''} gaps={missing} />;
          })()}
          <div className="grid grid-cols-2 gap-4 text-lg">
            <div><span className="text-muted-foreground">טלפון:</span><p className="font-bold">{d.phone}</p></div>
            <div><span className="text-muted-foreground">אימייל:</span><p className="font-bold">{d.email || '—'}</p></div>
            <div><span className="text-muted-foreground">ת.ז:</span><p className="font-bold">{d.id_number || '—'}</p></div>
            <div><span className="text-muted-foreground">רישיון:</span><p className="font-bold">{d.license_number || '—'}</p></div>
            <div><span className="text-muted-foreground">תוקף רישיון:</span><p className="font-bold">{d.license_expiry ? new Date(d.license_expiry).toLocaleDateString('he-IL') : '—'}</p></div>
            <div className="col-span-2"><span className="text-muted-foreground">סוגי רישיון:</span><p className="font-bold">{d.license_types?.join(', ') || '—'}</p></div>
            <div><span className="text-muted-foreground">עיר:</span><p className="font-bold">{d.city || '—'}</p></div>
            <div><span className="text-muted-foreground">רחוב:</span><p className="font-bold">{d.street || '—'}</p></div>
            <div><span className="text-muted-foreground">מבחן אחרון:</span><p className="font-bold">{(d as any).last_exam_date ? new Date((d as any).last_exam_date).toLocaleDateString('he-IL') : '—'}</p></div>
            <div>
              <span className="text-muted-foreground">תוקף מבחן:</span>
              <p className={`font-bold ${(d as any).exam_expiry && new Date((d as any).exam_expiry) < new Date() ? 'text-destructive' : ''}`}>
                {(d as any).exam_expiry ? new Date((d as any).exam_expiry).toLocaleDateString('he-IL') : '—'}
                {(d as any).exam_expiry && new Date((d as any).exam_expiry) < new Date() && ' ⚠️ פג תוקף'}
              </p>
            </div>
            {d.license_image_url && (
              <div className="col-span-2">
                <span className="text-muted-foreground">צילום רישיון נהיגה:</span>
                <div className="mt-2">
                  <a href={d.license_image_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors">
                    <Eye size={18} /> צפה ברישיון
                  </a>
                </div>
              </div>
            )}
          </div>
          {d.notes && <p className="mt-4 p-3 bg-muted rounded-xl text-muted-foreground">{d.notes}</p>}
          
          {/* Driver Declaration */}
          <div className="mt-6 pt-6 border-t border-border">
            <DriverDeclaration
              driverId={d.id}
              driverName={d.full_name}
              idNumber={d.id_number}
              licenseNumber={d.license_number}
              companyName={d.company_name}
              mode={user?.role === 'driver' ? 'driver' : 'manager'}
            />
          </div>

          {/* Driving Competency Exams */}
          <div className="mt-6 pt-6 border-t border-border">
            <h2 className="text-xl font-bold mb-3">📝 מבחני כשירות נהיגה</h2>
            <DriverExamsTab
              driverId={d.id}
              driverName={d.full_name}
              driverIdNumber={d.id_number}
              driverPhone={d.phone}
              companyName={d.company_name}
            />
          </div>
          <div className="flex gap-3 mt-6">
            {d.phone && (
              <a href={`tel:${d.phone}`} className="flex-1 bg-primary text-primary-foreground rounded-2xl p-4 flex items-center justify-center gap-2 text-lg font-bold">
                <Phone size={22} /> התקשר
              </a>
            )}
            {d.email && (
              <a href={`mailto:${d.email}`} className="flex-1 bg-muted text-foreground rounded-2xl p-4 flex items-center justify-center gap-2 text-lg font-bold">
                <Mail size={22} /> שלח מייל
              </a>
            )}
          </div>
          {/* Archive button */}
          {user?.role !== 'driver' && d.status !== 'archived' && (
            <button onClick={async () => {
              await supabase.from('drivers').update({ status: 'archived' }).eq('id', d.id);
              toast.success('הנהג הועבר לארכיון');
              setSelected(null);
              loadDrivers();
            }} className="w-full mt-3 py-3 rounded-xl border-2 border-warning/30 text-warning font-bold text-lg flex items-center justify-center gap-2 hover:bg-warning/5 transition-colors">
              📦 העבר לארכיון
            </button>
          )}
          {/* Delete button */}
          {user?.role !== 'driver' && (
            <button onClick={async () => {
              if (!confirm('האם אתה בטוח שברצונך למחוק את הנהג לצמיתות?')) return;
              const { error } = await supabase.from('drivers').delete().eq('id', d.id);
              if (error) {
                toast.error('שגיאה במחיקת הנהג');
                console.error(error);
              } else {
                toast.success('הנהג נמחק בהצלחה');
                setSelected(null);
                loadDrivers();
              }
            }} className="w-full mt-2 py-3 rounded-xl border-2 border-destructive/30 text-destructive font-bold text-lg flex items-center justify-center gap-2 hover:bg-destructive/5 transition-colors">
              🗑️ מחק נהג
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header mb-0">ניהול נהגים</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('drivers', [
            { key: 'full_name', label: 'שם מלא' },
            { key: 'phone', label: 'טלפון' },
            { key: 'email', label: 'אימייל' },
            { key: 'license_number', label: 'מספר רישיון' },
            { key: 'license_expiry', label: 'תוקף רישיון' },
            { key: 'city', label: 'עיר' },
            { key: 'status', label: 'סטטוס' },
            { key: 'company_name', label: 'חברה' },
            { key: 'notes', label: 'הערות' },
          ], filtered)} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm font-bold min-h-[48px] hover:bg-muted transition-colors">
            <Download size={18} /> ייצוא
          </button>
          {user?.role !== 'driver' && (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-lg font-bold min-h-[48px]">
              <Plus size={22} />
              נהג חדש
            </button>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם, טלפון, ת.ז או רישיון..."
          className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: 'all', label: 'הכל' },
          { key: 'active', label: 'פעיל' },
          { key: 'inactive', label: 'לא פעיל' },
          { key: 'archived', label: 'ארכיון' },
        ].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${statusFilter === f.key ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {f.label} ({f.key === 'all' ? drivers.filter(d => d.status !== 'archived').length : drivers.filter(d => d.status === f.key).length})
          </button>
        ))}
      </div>

      {/* Company filter - visible to super_admin */}
      {user?.role === 'super_admin' && companies.length > 1 && (
        <div className="mb-4">
          <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
            className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none">
            <option value="">כל החברות</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(d => (
          <button key={d.id} onClick={() => setSelected(d)} className="card-elevated w-full text-right hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-info/10 flex items-center justify-center flex-shrink-0">
                <Users size={28} className="text-info" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xl font-bold">{d.full_name}</p>
                <p className="text-muted-foreground text-lg">{d.phone}</p>
                {d.license_types?.length > 0 && <p className="text-sm text-muted-foreground">{d.license_types.join(', ')}</p>}
              </div>
              <span className={`status-badge ${d.status === 'active' ? 'status-active' : d.status === 'archived' ? 'bg-muted text-muted-foreground' : 'status-inactive'}`}>
                {d.status === 'active' ? 'פעיל' : d.status === 'archived' ? 'ארכיון' : 'לא פעיל'}
              </span>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Users size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">אין נהגים</p>
        </div>
      )}
    </div>
  );
}

function DriverForm({ driver, user, onDone }: { driver: DriverRow | null; user: any; onDone: () => void }) {
  const isEdit = !!driver;
  const [fullName, setFullName] = useState(driver?.full_name || '');
  const [idNumber, setIdNumber] = useState(driver?.id_number || '');
  const [phone, setPhone] = useState(driver?.phone || '');
  const [email, setEmail] = useState(driver?.email || '');
  const [password, setPassword] = useState('');
  const [licenseNumber, setLicenseNumber] = useState(driver?.license_number || '');
  const [licenseExpiry, setLicenseExpiry] = useState(driver?.license_expiry || '');
  const [licenseTypes, setLicenseTypes] = useState<string[]>(driver?.license_types || []);
  const [city, setCity] = useState(driver?.city || '');
  const [street, setStreet] = useState(driver?.street || '');
  const [status, setStatus] = useState(driver?.status || 'active');
  const [notes, setNotes] = useState(driver?.notes || '');
  const [licenseImageUrl, setLicenseImageUrl] = useState(driver?.license_image_url || '');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('הקובץ גדול מדי (מקסימום 5MB)'); return; }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `driver-licenses/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('documents').upload(path, file);
    if (error) { toast.error('שגיאה בהעלאת הקובץ'); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
    setLicenseImageUrl(urlData.publicUrl);
    setUploading(false);
    toast.success('רישיון הועלה בהצלחה');
  };

  // For new drivers, email and password are required to create login credentials
  const isValid = fullName.trim().length > 0 && phone.trim().length > 0 && licenseNumber.trim().length > 0 && idNumber.trim().length > 0
    && (isEdit || (email.trim().length > 0 && password.trim().length >= 6));
  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const toggleLicense = (type: string) => {
    setLicenseTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);

    if (isEdit) {
      // Update existing driver record
      const payload = {
        full_name: fullName,
        id_number: idNumber,
        phone,
        email,
        license_number: licenseNumber,
        license_expiry: licenseExpiry || null,
        license_types: licenseTypes,
        city,
        street,
        status,
        notes,
        license_image_url: licenseImageUrl,
        company_name: user?.company_name || '',
      };

      const { error } = await supabase.from('drivers').update(payload).eq('id', driver!.id);
      setLoading(false);
      if (error) {
        toast.error('שגיאה בעדכון הנהג');
        console.error(error);
      } else {
        toast.success('הנהג עודכן בהצלחה');
        onDone();
      }
    } else {
      // Create new driver: use edge function to create auth user + profile + driver record
      const effectiveEmail = email.trim() || `${phone.replace(/\D/g, '')}@placeholder.local`;

      const { data, error } = await supabase.functions.invoke('create-admin-user', {
        body: {
          email: effectiveEmail,
          password,
          full_name: fullName,
          phone,
          role: 'driver',
          company_name: user?.company_name || '',
          is_active: false, // Requires super_admin approval
        },
      });

      if (error || data?.error) {
        setLoading(false);
        toast.error(data?.error || 'שגיאה ביצירת הנהג');
        console.error(error || data?.error);
        return;
      }

      // Update the driver record with additional fields
      if (data?.user_id) {
        await supabase.from('drivers').update({
          id_number: idNumber,
          license_number: licenseNumber,
          license_expiry: licenseExpiry || null,
          license_types: licenseTypes,
          city,
          street,
          status,
          notes,
          license_image_url: licenseImageUrl,
        }).eq('id', data.user_id);
      }

      setLoading(false);
      toast.success('הנהג נוסף בהצלחה עם פרטי התחברות');
      onDone();
    }
  };

  return (
    <div className="animate-fade-in">
      <button onClick={onDone} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} />
        חזרה לרשימה
      </button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'עריכת נהג' : 'הוספת נהג חדש'}</h1>

      <div className="space-y-5">
        <div>
          <label className="block text-lg font-medium mb-2">שם מלא <span className="text-destructive">*</span></label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="שם הנהג..." className={inputClass} />
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">תעודת זהות <span className="text-destructive">*</span></label>
          <input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="תעודת זהות..." className={inputClass} />
        </div>
        {/* Login credentials - only for new drivers */}
        {!isEdit && (
          <div className="p-4 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-4">
            <p className="text-lg font-bold text-primary">פרטי התחברות לאפליקציה</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-lg font-medium mb-2">אימייל <span className="text-destructive">*</span></label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@..." className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
              </div>
              <div>
                <label className="block text-lg font-medium mb-2">סיסמה <span className="text-destructive">*</span></label>
                <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="לפחות 6 תווים..." className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">הנהג ישתמש בפרטים אלו כדי להיכנס לאפליקציה. החשבון ממתין לאישור מנהל על.</p>
          </div>
        )}

        {/* Email field for editing */}
        {isEdit && (
          <div>
            <label className="block text-lg font-medium mb-2">אימייל</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@..." className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg font-medium mb-2">טלפון <span className="text-destructive">*</span></label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-..." className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg font-medium mb-2">מספר רישיון <span className="text-destructive">*</span></label>
            <input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} placeholder="מספר רישיון..." className={inputClass} />
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">תוקף רישיון</label>
            <input type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-lg font-medium mb-2">סוגי רישיון</label>
          <div className="flex flex-wrap gap-2">
            {licenseOptions.map(type => (
              <button key={type} type="button" onClick={() => toggleLicense(type)}
                className={`px-4 py-2.5 rounded-xl text-base font-medium transition-colors ${licenseTypes.includes(type) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg font-medium mb-2">עיר</label>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="עיר..." className={inputClass} />
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">רחוב</label>
            <input value={street} onChange={e => setStreet(e.target.value)} placeholder="רחוב..." className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-lg font-medium mb-2">סטטוס</label>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStatus('active')}
              className={`flex-1 py-3 rounded-xl text-lg font-medium transition-colors ${status === 'active' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              פעיל
            </button>
            <button type="button" onClick={() => setStatus('inactive')}
              className={`flex-1 py-3 rounded-xl text-lg font-medium transition-colors ${status === 'inactive' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              לא פעיל
            </button>
          </div>
        </div>

        <div>
          <label className="block text-lg font-medium mb-2">צילום רישיון נהיגה</label>
          <div className="flex items-center gap-3">
            <label className={`flex items-center gap-2 px-5 py-3 rounded-xl cursor-pointer text-lg font-medium transition-colors ${uploading ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}>
              <Upload size={20} />
              {uploading ? 'מעלה...' : 'העלאת קובץ'}
              <input type="file" accept="image/*,.pdf" onChange={handleLicenseUpload} className="hidden" disabled={uploading} />
            </label>
            {licenseImageUrl && (
              <a href={licenseImageUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted text-foreground font-medium hover:bg-muted/80 transition-colors">
                <FileImage size={18} /> צפה ברישיון
              </a>
            )}
          </div>
        </div>

        <div>
          <label className="block text-lg font-medium mb-2">הערות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="הערות..." className={`${inputClass} resize-none`} />
        </div>

        <button onClick={handleSubmit} disabled={!isValid || loading}
          className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${isValid && !loading ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          <Save size={24} className="inline ml-2" />
          {loading ? 'שומר...' : isEdit ? 'עדכן נהג' : 'הוסף נהג'}
        </button>
      </div>
    </div>
  );
}
