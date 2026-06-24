import { useState, useEffect } from 'react';
import { Building2, User, Search, ArrowRight, Phone, Mail, Plus, Edit2, Trash2, FileText, Printer, KeyRound, Send, Eye, EyeOff, Loader2, Lock, X, Briefcase, PlusCircle, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CallCustomerButton from '@/components/voice/CallCustomerButton';
import { Link } from 'react-router-dom';
import {
  hasMarketingService,
  provisionMarketingClient,
  syncMarketingFromDalia,
  SERVICE_TYPE_OPTIONS,
  type ServiceType,
  type DaliaCustomerSnapshot,
} from '@/lib/marketingProvision';

interface CustomerRow {
  id: string;
  name: string;
  customer_type: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: string;
  customer_number: string;
  business_id: string;
  fax: string;
  agreement_description: string;
  agreement_amount_before_vat: number | null;
  agreement_amount_with_vat: number | null;
  agreement_serial_number: string;
  service_type?: string;
  contact_role?: string;
  activity_field?: string;
}

interface AgreementRow {
  id: string;
  customer_id: string;
  serial_number: string;
  description: string;
  amount_before_vat: number | null;
  amount_with_vat: number | null;
  company_name: string;
  created_at: string;
}

interface DealRow {
  id: string;
  customer_id: string;
  deal_number: string;
  customer_name: string;
  work_type: string;
  description: string;
  amount: number;
  open_date: string;
  target_date: string | null;
  status: string;
  company_name: string;
  created_at: string;
}

type ViewMode = 'list' | 'detail' | 'form';

const dealStatusLabels: Record<string, { text: string; cls: string }> = {
  open: { text: 'פתוחה', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  in_progress: { text: 'בביצוע', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  completed: { text: 'הושלמה', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { text: 'בוטלה', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [editItem, setEditItem] = useState<CustomerRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    let query = supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (user?.role === 'fleet_manager') {
      query = query.eq('company_name', user.company_name || '');
    }
    const { data } = await query;
    if (data) setCustomers(data as unknown as CustomerRow[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';
  const filtered = customers.filter(c => !search || c.name?.includes(search) || c.contact_person?.includes(search) || c.phone?.includes(search) || c.customer_number?.includes(search));

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק לקוח זה?')) return;
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) toast.error('שגיאה'); else { toast.success('נמחק'); setViewMode('list'); loadData(); }
  };

  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleSendResetEmail = async (email: string) => {
    if (!email) { toast.error('ללקוח זה אין כתובת אימייל'); return; }
    setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-password-reset', {
        body: { email, redirect_url: 'https://car.mrk.co.il/reset-password' },
      });
      if (error || data?.error) {
        toast.error('שגיאה בשליחת קישור האיפוס');
      } else {
        toast.success('קישור לאיפוס סיסמה נשלח בהצלחה');
      }
    } catch {
      toast.error('שגיאה בשליחת קישור האיפוס');
    }
    setResetLoading(false);
  };

  const handleChangePassword = async (email: string) => {
    if (!email) { toast.error('ללקוח זה אין כתובת אימייל'); return; }
    if (!newPassword || newPassword.length < 6) { toast.error('סיסמה חייבת להכיל לפחות 6 תווים'); return; }
    setPasswordLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('change-user-password', {
        body: { email, new_password: newPassword },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'שגיאה בשינוי הסיסמה');
      } else {
        toast.success('הסיסמה שונתה בהצלחה');
        setShowPasswordDialog(false);
        setNewPassword('');
      }
    } catch {
      toast.error('שגיאה בשינוי הסיסמה');
    }
    setPasswordLoading(false);
  };

  if (viewMode === 'form') {
    return <CustomerForm customer={editItem} onDone={() => { setViewMode('list'); setEditItem(null); loadData(); }} onBack={() => { setViewMode('list'); setEditItem(null); }} user={user} />;
  }

  if (viewMode === 'detail' && selected) {
    const c = selected;
    return (
      <CustomerDetail
        customer={c}
        isManager={isManager}
        user={user}
        onBack={() => { setViewMode('list'); setSelected(null); }}
        onEdit={() => { setEditItem(c); setViewMode('form'); }}
        onDelete={() => handleDelete(c.id)}
        onSendReset={() => handleSendResetEmail(c.email)}
        onChangePassword={() => { setNewPassword(''); setShowPasswordDialog(true); }}
        resetLoading={resetLoading}
        showPasswordDialog={showPasswordDialog}
        setShowPasswordDialog={setShowPasswordDialog}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        passwordLoading={passwordLoading}
        handleChangePassword={() => handleChangePassword(c.email)}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header !mb-0 flex items-center gap-3"><Building2 size={28} /> לקוחות</h1>
        {isManager && <button onClick={() => { setEditItem(null); setViewMode('form'); }} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-lg font-bold min-h-[48px]"><Plus size={22} /> לקוח חדש</button>}
      </div>
      <div className="relative mb-5">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
      </div>
      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Building2 size={48} className="mx-auto mb-4 opacity-50" /><p className="text-xl">אין לקוחות</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c.id} className="card-elevated w-full hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4">
                <button onClick={() => { setSelected(c); setViewMode('detail'); }} className="flex items-center gap-4 flex-1 text-right min-w-0">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {c.customer_type === 'company' ? <Building2 size={28} className="text-primary" /> : <User size={28} className="text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xl font-bold truncate">{c.name}</p>
                    <p className="text-muted-foreground truncate">{c.contact_person} • {c.phone}</p>
                    {c.customer_number && <p className="text-xs text-muted-foreground">מס׳ {c.customer_number}</p>}
                    <p className="text-xs text-primary/80 font-semibold mt-1">
                      {SERVICE_TYPE_OPTIONS.find(o => o.value === (c.service_type || 'fleet_only'))?.label}
                    </p>
                    {hasMarketingService(c.service_type) && (
                      <span className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">שיווק</span>
                    )}
                  </div>
                </button>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`status-badge ${c.status === 'active' ? 'status-active' : 'status-inactive'}`}>{c.status === 'active' ? 'פעיל' : 'לא פעיל'}</span>
                  {c.phone && (
                    <CallCustomerButton
                      customerId={c.id}
                      customerName={c.name}
                      customerPhone={c.phone}
                      variant="icon"
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───── Customer Detail ───── */
function CustomerDetail({ customer: c, isManager, user, onBack, onEdit, onDelete, onSendReset, onChangePassword, resetLoading, showPasswordDialog, setShowPasswordDialog, newPassword, setNewPassword, showPassword, setShowPassword, passwordLoading, handleChangePassword }: any) {
  const [agreements, setAgreements] = useState<AgreementRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [showDealForm, setShowDealForm] = useState(false);
  const [editDeal, setEditDeal] = useState<DealRow | null>(null);

  const loadDeals = () => {
    supabase.from('customer_deals').select('*').eq('customer_id', c.id).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setDeals(data as unknown as DealRow[]); });
  };

  useEffect(() => {
    supabase.from('customer_agreements').select('*').eq('customer_id', c.id).order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setAgreements(data as unknown as AgreementRow[]); });
    loadDeals();
  }, [c.id]);

  const handlePrintAgreement = (ag: AgreementRow) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const today = new Date().toLocaleDateString('he-IL');
    printWindow.document.write(`
      <html dir="rtl">
      <head>
        <title>הסכם עבודה - ${c.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #222; }
          h1 { text-align: center; font-size: 24px; margin-bottom: 4px; }
          .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 30px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
          .info-item label { font-size: 12px; color: #888; display: block; margin-bottom: 2px; }
          .info-item p { font-size: 16px; font-weight: bold; margin: 0; }
          .section { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
          .section-title { font-size: 18px; font-weight: bold; margin-bottom: 12px; border-bottom: 2px solid #333; padding-bottom: 6px; }
          .amount-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 16px; }
          .amount-row:last-child { border-bottom: none; font-weight: bold; font-size: 18px; }
          .note { background: #f9f9f9; padding: 12px; border-radius: 6px; margin-top: 16px; font-size: 13px; color: #666; text-align: center; }
          .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
          .sig-block { text-align: center; width: 200px; }
          .sig-line { border-top: 1px solid #333; margin-top: 60px; padding-top: 8px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <h1>הסכם עבודה</h1>
        <p class="subtitle">מסמך פתיחת לקוח • תאריך: ${today}</p>
        <p class="subtitle" style="font-size:12px; color:#999;">מסמך זה אינו מהווה חשבונית</p>
        <div class="section">
          <div class="section-title">פרטי לקוח</div>
          <div class="info-grid">
            <div class="info-item"><label>שם</label><p>${c.name}</p></div>
            <div class="info-item"><label>מספר לקוח</label><p>${c.customer_number || '—'}</p></div>
            <div class="info-item"><label>סוג</label><p>${c.customer_type === 'company' ? 'חברה' : 'פרטי'}</p></div>
            <div class="info-item"><label>עוסק מורשה / ח.פ</label><p>${c.business_id || '—'}</p></div>
            <div class="info-item"><label>איש קשר</label><p>${c.contact_person}</p></div>
            <div class="info-item"><label>טלפון</label><p>${c.phone || '—'}</p></div>
            <div class="info-item"><label>אימייל</label><p>${c.email || '—'}</p></div>
            <div class="info-item"><label>כתובת</label><p>${c.address || '—'}</p></div>
          </div>
        </div>
        <div class="section">
          <div class="section-title">פרטי הסכם</div>
          ${ag.serial_number ? `<div class="info-item" style="margin-bottom:12px"><label>מספר סידורי</label><p>${ag.serial_number}</p></div>` : ''}
          ${ag.description ? `<div class="info-item" style="margin-bottom:16px"><label>פירוט</label><p>${ag.description}</p></div>` : ''}
          <div class="amount-row"><span>סכום לפני מע״מ</span><span>₪${ag.amount_before_vat ? Number(ag.amount_before_vat).toLocaleString('he-IL') : '—'}</span></div>
          <div class="amount-row"><span>סכום כולל מע״מ</span><span>₪${ag.amount_with_vat ? Number(ag.amount_with_vat).toLocaleString('he-IL') : '—'}</span></div>
        </div>
        <div class="note">מסמך זה מהווה הסכם עבודה בלבד ואינו מהווה חשבונית מס</div>
        <div class="signatures">
          <div class="sig-block"><div class="sig-line">חתימת הלקוח</div></div>
          <div class="sig-block"><div class="sig-line">חתימת החברה</div></div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleDeleteDeal = async (dealId: string) => {
    if (!confirm('למחוק עסקה זו?')) return;
    const { error } = await supabase.from('customer_deals').delete().eq('id', dealId);
    if (error) toast.error('שגיאה במחיקה');
    else { toast.success('העסקה נמחקה'); loadDeals(); }
  };

  const totalDealsAmount = deals.filter(d => d.status !== 'cancelled').reduce((sum, d) => sum + (d.amount || 0), 0);

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]"><ArrowRight size={20} /> חזרה</button>
      
      {/* Customer Info Card */}
      <div className="card-elevated">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{c.name}</h1>
            {c.customer_number && <p className="text-muted-foreground text-sm">מס׳ לקוח: {c.customer_number}</p>}
          </div>
          <span className={`status-badge ${c.status === 'active' ? 'status-active' : 'status-inactive'}`}>{c.status === 'active' ? 'פעיל' : 'לא פעיל'}</span>
        </div>

        <div className="mb-6 p-4 rounded-xl border-2 border-primary/25 bg-primary/5">
          <span className="text-sm font-medium text-muted-foreground block mb-1">סוג שירות</span>
          <p className="text-xl font-bold text-primary">
            {SERVICE_TYPE_OPTIONS.find(o => o.value === (c.service_type || 'fleet_only'))?.label || '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-2">לפי סוג השירות נקבע אם נפתח כרטיס ניהול שיווק</p>
        </div>

        <div className="mb-4 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
          <p className="text-sm text-muted-foreground mb-2">כרטיס CRM — Client ID מ-Supabase</p>
          <Link
            to={`/dalia-crm?customer=${c.id}`}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 rounded-xl bg-blue-600 text-white font-bold min-h-[48px] hover:opacity-90"
          >
            פתח כרטיס CRM
          </Link>
        </div>

        {hasMarketingService(c.service_type) && (
          <div className="mb-4 p-4 rounded-xl border-2 border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-800">
            <p className="text-sm text-muted-foreground mb-2">כרטיס שיווק מחובר לדליה — מקור אמת אחד</p>
            <Link
              to={`/ai-marketing?customer=${c.id}`}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 rounded-xl bg-violet-600 text-white font-bold min-h-[48px] hover:opacity-90"
            >
              פתח כרטיס ניהול שיווק
            </Link>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-lg">
          <div><span className="text-muted-foreground text-sm">סוג</span><p className="font-bold">{c.customer_type === 'company' ? 'חברה' : 'פרטי'}</p></div>
          {c.business_id && <div><span className="text-muted-foreground text-sm">עוסק מורשה / ח.פ</span><p className="font-bold">{c.business_id}</p></div>}
          <div><span className="text-muted-foreground text-sm">איש קשר</span><p className="font-bold">{c.contact_person}</p></div>
          <div><span className="text-muted-foreground text-sm">טלפון</span><p className="font-bold" dir="ltr">{c.phone}</p></div>
          {c.fax && <div><span className="text-muted-foreground text-sm">פקס</span><p className="font-bold" dir="ltr">{c.fax}</p></div>}
          <div><span className="text-muted-foreground text-sm">אימייל</span><p className="font-bold" dir="ltr">{c.email}</p></div>
          {c.address && <div className="col-span-2"><span className="text-muted-foreground text-sm">כתובת</span><p className="font-bold">{c.address}</p></div>}
        </div>

        {c.notes && <p className="mt-4 p-3 bg-muted rounded-xl text-muted-foreground">{c.notes}</p>}

        {/* Agreements list */}
        {agreements.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="text-lg font-bold flex items-center gap-2"><FileText size={20} className="text-primary" /> הסכמים ({agreements.length})</h3>
            {agreements.map((ag, idx) => (
              <div key={ag.id} className="border-2 border-primary/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">הסכם #{idx + 1}</span>
                  <button onClick={() => handlePrintAgreement(ag)} className="text-primary flex items-center gap-1 text-sm font-medium hover:opacity-80">
                    <Printer size={16} /> הדפסה
                  </button>
                </div>
                {ag.serial_number && <p className="text-sm"><span className="text-muted-foreground">מס׳ סידורי:</span> <strong>{ag.serial_number}</strong></p>}
                {ag.description && <p className="text-sm"><span className="text-muted-foreground">פירוט:</span> {ag.description}</p>}
                <div className="flex gap-6 text-sm">
                  {ag.amount_before_vat != null && <span><span className="text-muted-foreground">לפני מע״מ:</span> <strong>₪{Number(ag.amount_before_vat).toLocaleString('he-IL')}</strong></span>}
                  {ag.amount_with_vat != null && <span><span className="text-muted-foreground">כולל מע״מ:</span> <strong>₪{Number(ag.amount_with_vat).toLocaleString('he-IL')}</strong></span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          {c.phone && <a href={`tel:${c.phone}`} className="flex-1 bg-primary text-primary-foreground rounded-2xl p-4 flex items-center justify-center gap-2 text-lg font-bold"><Phone size={22} /> התקשר</a>}
          {c.email && <a href={`mailto:${c.email}`} className="flex-1 bg-muted text-foreground rounded-2xl p-4 flex items-center justify-center gap-2 text-lg font-bold"><Mail size={22} /> מייל</a>}
        </div>

        {/* Password management section */}
        {isManager && c.email && (
          <div className="border-2 border-primary/20 rounded-2xl p-5 mt-4 space-y-3">
            <div className="flex items-center gap-2 text-primary mb-1">
              <Lock size={20} />
              <h3 className="text-lg font-bold">ניהול סיסמה</h3>
            </div>
            <div className="flex gap-3">
              <button onClick={onSendReset} disabled={resetLoading}
                className="flex-1 py-4 rounded-xl bg-accent text-accent-foreground font-bold flex items-center justify-center gap-2 text-lg hover:opacity-90 transition-opacity disabled:opacity-50">
                {resetLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                שלח קישור איפוס
              </button>
              <button onClick={onChangePassword}
                className="flex-1 py-4 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center gap-2 text-lg hover:opacity-90 transition-opacity">
                <KeyRound size={20} />
                החלף סיסמה
              </button>
            </div>
          </div>
        )}

        {isManager && (
          <div className="flex gap-3 mt-4">
            <button onClick={onEdit} className="flex-1 py-4 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center gap-2 text-lg">
              <Edit2 size={20} /> עריכת פרטי לקוח
            </button>
            <button onClick={onDelete} className="py-4 px-6 rounded-xl border-2 border-destructive/30 text-destructive font-bold flex items-center justify-center gap-2">
              <Trash2 size={20} />
            </button>
          </div>
        )}
      </div>

      {/* ═══════ Deals / Transactions Section ═══════ */}
      <div className="card-elevated mt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Briefcase size={22} className="text-primary" />
            <h2 className="text-xl font-bold">עסקאות ({deals.length})</h2>
          </div>
          {isManager && (
            <button onClick={() => { setEditDeal(null); setShowDealForm(true); }}
              className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">
              <PlusCircle size={16} /> עסקה חדשה
            </button>
          )}
        </div>

        {totalDealsAmount > 0 && (
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">סך עסקאות פעילות</span>
            <span className="text-lg font-bold text-primary">₪{totalDealsAmount.toLocaleString('he-IL')}</span>
          </div>
        )}

        {deals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Briefcase size={32} className="mx-auto mb-2 opacity-40" />
            <p>אין עסקאות עדיין</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deals.map(deal => {
              const sl = dealStatusLabels[deal.status] || { text: deal.status, cls: 'bg-muted text-muted-foreground' };
              return (
                <div key={deal.id} className="border border-border rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-primary">{deal.deal_number}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${sl.cls}`}>{sl.text}</span>
                    </div>
                    {isManager && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditDeal(deal); setShowDealForm(true); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDeleteDeal(deal.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  {deal.work_type && <p className="text-sm"><span className="text-muted-foreground">סוג עבודה:</span> {deal.work_type}</p>}
                  {deal.description && <p className="text-sm text-muted-foreground">{deal.description}</p>}
                  <div className="flex items-center gap-4 text-sm">
                    {deal.amount > 0 && <span className="font-bold">₪{deal.amount.toLocaleString('he-IL')}</span>}
                    {deal.open_date && (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Calendar size={12} /> נפתחה: {new Date(deal.open_date).toLocaleDateString('he-IL')}
                      </span>
                    )}
                    {deal.target_date && (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Calendar size={12} /> יעד: {new Date(deal.target_date).toLocaleDateString('he-IL')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Deal Form Dialog */}
      <Dialog open={showDealForm} onOpenChange={setShowDealForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase size={22} className="text-primary" />
              {editDeal ? 'עריכת עסקה' : 'עסקה חדשה'} — {c.name}
            </DialogTitle>
          </DialogHeader>
          <DealForm
            deal={editDeal}
            customerId={c.id}
            customerName={c.name}
            companyName={user?.company_name || ''}
            userId={user?.id}
            onDone={() => { setShowDealForm(false); setEditDeal(null); loadDeals(); }}
            onCancel={() => { setShowDealForm(false); setEditDeal(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound size={22} className="text-primary" />
              החלפת סיסמה - {c.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-muted-foreground text-sm">הגדר סיסמה חדשה עבור <strong dir="ltr">{c.email}</strong></p>
            <div className="relative">
              <label className="block text-lg font-medium mb-2">סיסמה חדשה</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none pl-12"
                placeholder="לפחות 6 תווים"
                dir="ltr"
                style={{ textAlign: 'right' }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-[52px] text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <button onClick={handleChangePassword}
              disabled={passwordLoading || !newPassword || newPassword.length < 6}
              className="w-full py-4 rounded-xl bg-primary text-primary-foreground text-lg font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
              {passwordLoading ? <Loader2 size={20} className="animate-spin" /> : <KeyRound size={20} />}
              שמור סיסמה חדשה
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───── Deal Form ───── */
function DealForm({ deal, customerId, customerName, companyName, userId, onDone, onCancel }: {
  deal: DealRow | null;
  customerId: string;
  customerName: string;
  companyName: string;
  userId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!deal;
  const [workType, setWorkType] = useState(deal?.work_type || '');
  const [description, setDescription] = useState(deal?.description || '');
  const [amount, setAmount] = useState(deal?.amount?.toString() || '');
  const [openDate, setOpenDate] = useState(deal?.open_date || new Date().toISOString().split('T')[0]);
  const [targetDate, setTargetDate] = useState(deal?.target_date || '');
  const [status, setStatus] = useState(deal?.status || 'open');
  const [loading, setLoading] = useState(false);

  const inputClass = "w-full p-3 text-base rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";
  const isValid = workType && description;

  const handleSubmit = async () => {
    if (!isValid) { toast.error('יש למלא סוג עבודה ופירוט'); return; }
    setLoading(true);

    const payload: any = {
      customer_id: customerId,
      customer_name: customerName,
      work_type: workType,
      description,
      amount: parseFloat(amount) || 0,
      open_date: openDate || null,
      target_date: targetDate || null,
      status,
      company_name: companyName,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (isEdit) {
      ({ error } = await supabase.from('customer_deals').update(payload).eq('id', deal!.id));
    } else {
      ({ error } = await supabase.from('customer_deals').insert({ ...payload, created_by: userId }));
    }

    setLoading(false);
    if (error) {
      toast.error('שגיאה בשמירה');
      console.error(error);
    } else {
      toast.success(isEdit ? 'העסקה עודכנה' : 'העסקה נוספה');
      onDone();
    }
  };

  return (
    <div className="space-y-4 pt-2">
      {isEdit && deal?.deal_number && (
        <div className="p-3 rounded-xl bg-muted text-center">
          <span className="text-sm text-muted-foreground">מספר עסקה:</span>{' '}
          <strong className="text-primary">{deal.deal_number}</strong>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">סוג עבודה / שירות *</label>
        <select value={workType} onChange={e => setWorkType(e.target.value)} className={inputClass}>
          <option value="">בחר סוג...</option>
          <option value="הסעות">הסעות</option>
          <option value="שינוע">שינוע</option>
          <option value="ליסינג">ליסינג</option>
          <option value="תחזוקה">תחזוקה</option>
          <option value="ייעוץ">ייעוץ</option>
          <option value="אחר">אחר</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">פירוט העבודה *</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="תיאור מפורט של העסקה..." />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">סכום העסקה (₪)</label>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">תאריך פתיחה</label>
          <input type="date" value={openDate} onChange={e => setOpenDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">תאריך יעד</label>
          <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">סטטוס</label>
        <div className="grid grid-cols-2 gap-2">
          {(['open', 'in_progress', 'completed', 'cancelled'] as const).map(s => {
            const sl = dealStatusLabels[s];
            return (
              <button key={s} type="button" onClick={() => setStatus(s)}
                className={`py-2.5 rounded-xl text-sm font-medium transition-all border-2 ${
                  status === s ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                }`}>
                {sl.text}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={handleSubmit} disabled={!isValid || loading}
          className={`flex-1 py-4 rounded-xl text-lg font-bold transition-colors ${isValid && !loading ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          {loading ? 'שומר...' : isEdit ? '💾 עדכן עסקה' : '💾 שמור עסקה'}
        </button>
        <button onClick={onCancel} className="px-6 py-4 rounded-xl border-2 border-border text-muted-foreground font-bold hover:bg-muted transition-colors">
          ביטול
        </button>
      </div>
    </div>
  );
}

/* ───── Customer Form ───── */
interface AgreementDraft {
  id?: string;
  serial_number: string;
  description: string;
  amount_before_vat: string;
  amount_with_vat: string;
}

function CustomerForm({ customer, onDone, onBack, user }: { customer: CustomerRow | null; onDone: () => void; onBack: () => void; user: any }) {
  const isEdit = !!customer;
  const [name, setName] = useState(customer?.name || '');
  const [customerType, setCustomerType] = useState(customer?.customer_type || 'company');
  const [contactPerson, setContactPerson] = useState(customer?.contact_person || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [address, setAddress] = useState(customer?.address || '');
  const [status, setStatus] = useState(customer?.status || 'active');
  const [notes, setNotes] = useState(customer?.notes || '');
  const [customerNumber, setCustomerNumber] = useState(customer?.customer_number || '');
  const [businessId, setBusinessId] = useState(customer?.business_id || '');
  const [fax, setFax] = useState(customer?.fax || '');
  const [serviceType, setServiceType] = useState<ServiceType>((customer?.service_type as ServiceType) || 'fleet_only');
  const [loading, setLoading] = useState(false);

  // Multiple agreements
  const [agreements, setAgreements] = useState<AgreementDraft[]>([]);
  const [deletedAgreementIds, setDeletedAgreementIds] = useState<string[]>([]);

  // Load existing agreements when editing
  useEffect(() => {
    if (isEdit && customer) {
      supabase.from('customer_agreements').select('*').eq('customer_id', customer.id).order('created_at', { ascending: true })
        .then(({ data }) => {
          if (data && data.length > 0) {
            setAgreements(data.map((a: any) => ({
              id: a.id,
              serial_number: a.serial_number || '',
              description: a.description || '',
              amount_before_vat: a.amount_before_vat?.toString() || '',
              amount_with_vat: a.amount_with_vat?.toString() || '',
            })));
          } else if (customer.agreement_serial_number || customer.agreement_description || customer.agreement_amount_before_vat) {
            // Migrate legacy single agreement
            setAgreements([{
              serial_number: customer.agreement_serial_number || '',
              description: customer.agreement_description || '',
              amount_before_vat: customer.agreement_amount_before_vat?.toString() || '',
              amount_with_vat: customer.agreement_amount_with_vat?.toString() || '',
            }]);
          }
        });
    }
  }, []);

  const addAgreement = () => {
    setAgreements(prev => [...prev, { serial_number: '', description: '', amount_before_vat: '', amount_with_vat: '' }]);
  };

  const removeAgreement = (idx: number) => {
    const ag = agreements[idx];
    if (ag.id) setDeletedAgreementIds(prev => [...prev, ag.id!]);
    setAgreements(prev => prev.filter((_, i) => i !== idx));
  };

  const updateAgreement = (idx: number, field: keyof AgreementDraft, value: string) => {
    setAgreements(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const isValid = name && contactPerson;
  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    const payload = {
      name, customer_type: customerType, contact_person: contactPerson,
      phone, email, address, status, notes,
      customer_number: customerNumber, business_id: businessId, fax,
      service_type: serviceType,
      // Keep legacy fields for backward compat
      agreement_description: agreements[0]?.description || null,
      agreement_amount_before_vat: agreements[0]?.amount_before_vat ? parseFloat(agreements[0].amount_before_vat) : null,
      agreement_amount_with_vat: agreements[0]?.amount_with_vat ? parseFloat(agreements[0].amount_with_vat) : null,
      agreement_serial_number: agreements[0]?.serial_number || null,
    } as any;

    let error;
    let customerId = customer?.id;

    if (isEdit) {
      ({ error } = await supabase.from('customers').update(payload).eq('id', customer!.id));
    } else {
      const res = await supabase.from('customers').insert({ ...payload, company_name: user?.company_name || '', created_by: user?.id }).select('id').single();
      error = res.error;
      customerId = res.data?.id;
    }

    if (error) {
      toast.error('שגיאה');
      console.error(error);
      setLoading(false);
      return;
    }

    if (customerId && hasMarketingService(serviceType)) {
      const { data: row } = await supabase.from('customers').select('*').eq('id', customerId).single();
      if (row) {
        const prov = await provisionMarketingClient(row as DaliaCustomerSnapshot);
        if (!prov.ok) {
          toast.error('הלקוח נשמר — שגיאה בהקמת כרטיס שיווק: ' + (prov.error || ''));
        } else {
          await syncMarketingFromDalia(row as DaliaCustomerSnapshot);
          if (!isEdit) toast.success('נוצר כרטיס שיווק אוטומטי');
        }
      }
    }

    // Save agreements
    if (customerId) {
      // Delete removed agreements
      if (deletedAgreementIds.length > 0) {
        await supabase.from('customer_agreements').delete().in('id', deletedAgreementIds);
      }

      // Upsert agreements
      for (const ag of agreements) {
        const agPayload = {
          customer_id: customerId,
          serial_number: ag.serial_number,
          description: ag.description,
          amount_before_vat: ag.amount_before_vat ? parseFloat(ag.amount_before_vat) : null,
          amount_with_vat: ag.amount_with_vat ? parseFloat(ag.amount_with_vat) : null,
          company_name: user?.company_name || '',
        };

        if (ag.id) {
          await supabase.from('customer_agreements').update(agPayload).eq('id', ag.id);
        } else {
          await supabase.from('customer_agreements').insert(agPayload);
        }
      }
    }

    setLoading(false);
    toast.success(isEdit ? 'עודכן' : 'נוסף');
    onDone();
  };

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]"><ArrowRight size={20} /> חזרה</button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'עריכת לקוח' : 'לקוח חדש'}</h1>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-lg font-medium mb-2">שם *</label><input value={name} onChange={e => setName(e.target.value)} className={inputClass} /></div>
          <div><label className="block text-lg font-medium mb-2">מספר לקוח</label><input value={customerNumber} onChange={e => setCustomerNumber(e.target.value)} className={inputClass} placeholder="מספר ייחודי" /></div>
        </div>
        <div><label className="block text-lg font-medium mb-2">סוג</label>
          <select value={customerType} onChange={e => setCustomerType(e.target.value)} className={inputClass}>
            <option value="company">חברה</option><option value="private">פרטי</option>
          </select></div>
        <div><label className="block text-lg font-medium mb-2">סוג שירות *</label>
          <select value={serviceType} onChange={e => setServiceType(e.target.value as ServiceType)} className={inputClass}>
            {SERVICE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground mt-2">בחירת שיווק יוצרת כרטיס שיווק מחובר — ללא לקוח כפול</p>
        </div>
        <div><label className="block text-lg font-medium mb-2">עוסק מורשה / ח.פ</label><input value={businessId} onChange={e => setBusinessId(e.target.value)} className={inputClass} /></div>
        <div><label className="block text-lg font-medium mb-2">איש קשר *</label><input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className={inputClass} /></div>
        <div><label className="block text-lg font-medium mb-2">כתובת מלאה</label><input value={address} onChange={e => setAddress(e.target.value)} className={inputClass} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-lg font-medium mb-2">טלפון</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} dir="ltr" style={{ textAlign: 'right' }} /></div>
          <div><label className="block text-lg font-medium mb-2">פקס</label><input type="tel" value={fax} onChange={e => setFax(e.target.value)} className={inputClass} dir="ltr" style={{ textAlign: 'right' }} /></div>
        </div>
        <div><label className="block text-lg font-medium mb-2">אימייל</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} dir="ltr" style={{ textAlign: 'right' }} /></div>
        <div><label className="block text-lg font-medium mb-2">סטטוס</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass}><option value="active">פעיל</option><option value="inactive">לא פעיל</option></select></div>
        <div><label className="block text-lg font-medium mb-2">הערות</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} /></div>

        {/* הסכמים */}
        <div className="border-2 border-primary/20 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <FileText size={22} />
              <h2 className="text-xl font-bold">הסכמי עבודה</h2>
            </div>
            <button type="button" onClick={addAgreement} className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">
              <Plus size={18} /> הוסף הסכם
            </button>
          </div>
          <p className="text-sm text-muted-foreground">מסמך פתיחת לקוח — אינו מהווה חשבונית</p>

          {agreements.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <FileText size={32} className="mx-auto mb-2 opacity-40" />
              <p>אין הסכמים. לחץ על "הוסף הסכם" להוספת הסכם חדש.</p>
            </div>
          )}

          {agreements.map((ag, idx) => (
            <div key={idx} className="border border-border rounded-xl p-4 space-y-3 relative">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-primary">הסכם #{idx + 1}</span>
                <button type="button" onClick={() => removeAgreement(idx)} className="text-destructive hover:opacity-70 p-1">
                  <X size={18} />
                </button>
              </div>
              <div><label className="block text-base font-medium mb-1">מספר סידורי</label><input value={ag.serial_number} onChange={e => updateAgreement(idx, 'serial_number', e.target.value)} className={inputClass} placeholder="מספר סידורי להסכם" /></div>
              <div><label className="block text-base font-medium mb-1">פירוט קצר</label><textarea value={ag.description} onChange={e => updateAgreement(idx, 'description', e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="תיאור השירות / ההסכם" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-base font-medium mb-1">סכום לפני מע״מ</label><input type="number" value={ag.amount_before_vat} onChange={e => updateAgreement(idx, 'amount_before_vat', e.target.value)} className={inputClass} dir="ltr" style={{ textAlign: 'right' }} placeholder="₪" /></div>
                <div><label className="block text-base font-medium mb-1">סכום כולל מע״מ</label><input type="number" value={ag.amount_with_vat} onChange={e => updateAgreement(idx, 'amount_with_vat', e.target.value)} className={inputClass} dir="ltr" style={{ textAlign: 'right' }} placeholder="₪" /></div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={handleSubmit} disabled={!isValid || loading}
          className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${isValid && !loading ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          {loading ? 'שומר...' : isEdit ? '💾 עדכן' : '💾 שמור'}
        </button>
      </div>
    </div>
  );
}
