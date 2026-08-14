import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Users, Search, ArrowRight, Plus, Save, X, Download, Upload, FileImage, Eye, LayoutDashboard } from 'lucide-react';
import { buildDriverDashboardUrl } from '@/lib/entityNavContext';
import { Button } from '@/components/ui/button';
import { EntityContextBanner } from '@/components/EntityContextBanner';
import { exportToCsv } from '@/utils/exportCsv';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import { fetchRequiredFieldsOverrides } from '@/lib/requiredFieldsApi';
import { validateRequiredModuleFields } from '@/lib/requiredFieldsValidate';
import { DocumentAttachment } from '@/components/documents/DocumentViewer';
import { uploadDocument } from '@/lib/uploadDocument';
import DriverHub from '@/components/drivers/DriverHub';
import { fetchCompanyDepartments } from '@/lib/companyDepartments';
import { useHiddenButtonsState } from '@/hooks/useHiddenButtons';
import { isDriverHubDashboardHidden } from '@/lib/hiddenButtons';

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
  show_notes_on_list?: boolean | null;
  company_name: string;
  id_number: string;
  license_image_url?: string;
  last_exam_date?: string | null;
  exam_expiry?: string | null;
  department?: string | null;
}

const licenseOptions = ['A', 'A1', 'A2', 'B', 'C', 'C1', 'D', 'D1', 'E'];

export default function Drivers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const { hiddenButtons, ready: hiddenReady } = useHiddenButtonsState();
  const showDriverDashboard = hiddenReady && !isDriverHubDashboardHidden(hiddenButtons);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [search, setSearch] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
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

  useEffect(() => {
    const company = filterCompany || user?.company_name || '';
    if (!company) {
      setDepartmentOptions([]);
      return;
    }
    void fetchCompanyDepartments(company).then(setDepartmentOptions);
  }, [filterCompany, user?.company_name, drivers]);

  useEffect(() => {
    const companyName = searchParams.get('companyName');
    if (companyName) setFilterCompany(companyName);
    const driverId = searchParams.get('driverId');
    if (!driverId || drivers.length === 0) return;
    const match = drivers.find((d) => d.id === driverId);
    if (match) setSelected(match);
  }, [searchParams, drivers]);

  const companies = [...new Set(drivers.map(d => d.company_name).filter(Boolean))];

  const filtered = drivers.filter(d => {
    const matchSearch = !search || d.full_name?.includes(search) || d.phone?.includes(search) || d.license_number?.includes(search) || d.id_number?.includes(search);
    const matchCompany = !filterCompany || d.company_name === filterCompany;
    const matchStatus = statusFilter === 'all' || d.status === statusFilter;
    const matchDepartment = !filterDepartment || (d.department || '') === filterDepartment;
    return matchSearch && matchCompany && matchStatus && matchDepartment;
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

  const fromFleetManager = searchParams.get('from') === 'fleet-manager';

  if (selected) {
    const d = selected;

    return (
      <DriverHub
        driver={d}
        isManager={user?.role !== 'driver'}
        onNotesSaved={(patch) => {
          setSelected((s) => (s ? { ...s, ...patch } : s));
          setDrivers((list) => list.map((x) => (x.id === d.id ? { ...x, ...patch } : x)));
        }}
        onBack={() => setSelected(null)}
        onEdit={() => {
          setSelected(null);
          setEditingDriver(d);
        }}
        onArchive={
          user?.role !== 'driver' && d.status !== 'archived'
            ? async () => {
                await supabase.from('drivers').update({ status: 'archived' }).eq('id', d.id);
                toast.success('הנהג הועבר לארכיון');
                setSelected(null);
                loadDrivers();
              }
            : undefined
        }
        onDelete={
          user?.role !== 'driver'
            ? async () => {
                if (!confirm('האם אתה בטוח שברצונך למחוק את הנהג לצמיתות?')) return;
                const { error } = await supabase.from('drivers').delete().eq('id', d.id);
                if (error) {
                  toast.error('שגיאה במחיקת הנהג');
                } else {
                  toast.success('הנהג נמחק בהצלחה');
                  setSelected(null);
                  loadDrivers();
                }
              }
            : undefined
        }
        fromFleetManager={fromFleetManager}
        filterCompany={filterCompany}
      />
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

      {/* Department filter */}
      {departmentOptions.length > 0 && (
        <div className="mb-4">
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none"
          >
            <option value="">כל המחלקות</option>
            {departmentOptions.map((dep) => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
        </div>
      )}

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

      {fromFleetManager && filterCompany && (
        <EntityContextBanner label={`נהגים באחריות מנהל צי · ${filterCompany}`} strict />
      )}

      <div className="space-y-3">
        {filtered.map((d) => (
          <div key={d.id} className="card-elevated">
            <button type="button" onClick={() => setSelected(d)} className="w-full text-right hover:opacity-90 transition-opacity">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-info/10 flex items-center justify-center flex-shrink-0">
                  <Users size={28} className="text-info" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-bold">{d.full_name}</p>
                  <p className="text-muted-foreground text-lg">{d.phone}</p>
                  {d.department && (
                    <p className="text-sm text-muted-foreground">מחלקה: {d.department}</p>
                  )}
                  {d.license_types?.length > 0 && (
                    <p className="text-sm text-muted-foreground">{d.license_types.join(', ')}</p>
                  )}
                  {d.show_notes_on_list && d.notes?.trim() ? (
                    <p className="text-sm text-foreground/80 mt-1 whitespace-pre-wrap break-words">{d.notes.trim()}</p>
                  ) : null}
                </div>
                <span
                  className={`status-badge ${d.status === 'active' ? 'status-active' : d.status === 'archived' ? 'bg-muted text-muted-foreground' : 'status-inactive'}`}
                >
                  {d.status === 'active' ? 'פעיל' : d.status === 'archived' ? 'ארכיון' : 'לא פעיל'}
                </span>
              </div>
            </button>
            {user?.role !== 'driver' && showDriverDashboard && (
              <Button
                type="button"
                className="w-full mt-3 h-12 font-bold gap-2"
                onClick={() =>
                  navigate(buildDriverDashboardUrl({ driverId: d.id, driverName: d.full_name }))
                }
              >
                <LayoutDashboard size={18} />
                פתח דשבורד נהג
              </Button>
            )}
          </div>
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
  const [lastExamDate, setLastExamDate] = useState(driver?.last_exam_date?.split('T')[0] || '');
  const [examExpiry, setExamExpiry] = useState(driver?.exam_expiry?.split('T')[0] || '');
  const [department, setDepartment] = useState(driver?.department || '');
  const [deptOptions, setDeptOptions] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const company = user?.company_name || driver?.company_name || '';
    if (company) void fetchCompanyDepartments(company).then(setDeptOptions);
  }, [user?.company_name, driver?.company_name]);

  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const driverName = fullName || driver?.full_name || '';
    const company = user?.company_name || driver?.company_name || '';
    if (!company) {
      toast.error('חסר שם חברה לשיוך המסמך');
      e.target.value = '';
      return;
    }
    setUploading(true);
    const result = await uploadDocument({
      file,
      storageFolder: 'driver-license',
      category: 'driver-license',
      companyName: company,
      driverName,
      displayName: `רישיון נהיגה — ${driverName}`,
      documentDate: new Date().toISOString().split('T')[0],
    });
    setUploading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setLicenseImageUrl(result.publicUrl);
    if (isEdit && driver?.id) {
      const { error } = await supabase
        .from('drivers')
        .update({ license_image_url: result.publicUrl })
        .eq('id', driver.id);
      if (error) console.error('license_image_url sync:', error);
    }
    toast.success('רישיון הועלה ונרשם במערכת המסמכים');
    e.target.value = '';
  };

  // Email/password optional for new drivers — required only when creating login credentials
  const wantsLogin = !isEdit && (email.trim().length > 0 || password.trim().length > 0);
  const isValid = fullName.trim().length > 0 && phone.trim().length > 0 && licenseNumber.trim().length > 0 && idNumber.trim().length > 0
    && (!wantsLogin || (email.trim().length > 0 && password.trim().length >= 6));
  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const toggleLicense = (type: string) => {
    setLicenseTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const handleSubmit = async () => {
    if (!isValid) return;

    const fieldOverrides = await fetchRequiredFieldsOverrides();
    const driverValues: Record<string, string> = {
      full_name: fullName,
      phone,
      email,
      login_email: wantsLogin ? email : '',
      password: isEdit ? 'unchanged' : wantsLogin ? password : '',
      license_number: licenseNumber,
      license_expiry: licenseExpiry || '',
      id_number: idNumber,
      company_name: user?.company_name || '',
    };
    const requiredCheck = validateRequiredModuleFields('drivers', driverValues, fieldOverrides);
    if (!requiredCheck.ok) {
      toast.error(requiredCheck.message);
      return;
    }

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
        last_exam_date: lastExamDate || null,
        exam_expiry: examExpiry || null,
        department: department.trim() || null,
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
    } else if (wantsLogin) {
      // Create new driver with login credentials via edge function
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
          last_exam_date: lastExamDate || null,
          exam_expiry: examExpiry || null,
          department: department.trim() || null,
        }).eq('id', data.user_id);
      }

      setLoading(false);
      toast.success('הנהג נוסף בהצלחה עם פרטי התחברות');
      onDone();
    } else {
      const payload = {
        full_name: fullName,
        id_number: idNumber,
        phone,
        email: email.trim() || '',
        license_number: licenseNumber,
        license_expiry: licenseExpiry || null,
        license_types: licenseTypes,
        city,
        street,
        status,
        notes,
        license_image_url: licenseImageUrl,
        last_exam_date: lastExamDate || null,
        exam_expiry: examExpiry || null,
        department: department.trim() || null,
        company_name: user?.company_name || '',
        created_by: user?.id || null,
      };

      const { error } = await supabase.from('drivers').insert(payload);
      setLoading(false);
      if (error) {
        toast.error('שגיאה בהוספת הנהג');
        console.error(error);
      } else {
        toast.success('הנהג נוסף בהצלחה (ללא פרטי התחברות)');
        onDone();
      }
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
            <p className="text-lg font-bold text-primary">פרטי התחברות לאפליקציה (אופציונלי)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-lg font-medium mb-2">אימייל</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@..." className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
              </div>
              <div>
                <label className="block text-lg font-medium mb-2">סיסמה</label>
                <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="לפחות 6 תווים..." className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">ניתן ליצור נהג גם ללא אימייל וסיסמה. אם ממלאים פרטי התחברות — שניהם נדרשים (סיסמה לפחות 6 תווים). חשבון עם התחברות ממתין לאישור מנהל על.</p>
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
            <label className="block text-lg font-medium mb-2">מבחן אחרון</label>
            <input type="date" value={lastExamDate} onChange={e => setLastExamDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">תוקף מבחן</label>
            <input type="date" value={examExpiry} onChange={e => setExamExpiry(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg font-medium mb-2">מחלקה (אופציונלי)</label>
            <input
              list="driver-dept-options"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="בחר או הקלד מחלקה..."
              className={inputClass}
            />
            <datalist id="driver-dept-options">
              {deptOptions.map((dep) => (
                <option key={dep} value={dep} />
              ))}
            </datalist>
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
              <DocumentAttachment label="רישיון נהיגה" url={licenseImageUrl} fileName="רישיון-נהיגה" />
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
