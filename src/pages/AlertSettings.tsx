import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { clearCompanySettingsCache } from '@/lib/companySettings';
import { clearCompanyAttentionRedCache } from '@/lib/companyAttentionRedSettings';
import { Building2, Save, Search, ChevronDown, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

import { MANAGEABLE_BUTTONS } from '@/hooks/useHiddenButtons';
import { TRANSPORT_FEATURES } from '@/lib/transportSettings';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  bulkSetCompanyInsuranceRedHighlight,
  loadCompanyInsuranceRedStats,
  type CompanyInsuranceRedStats,
} from '@/lib/bulkInsuranceRedHighlight';
import {
  DEFAULT_COMPANY_AUTO_SEND,
  fetchCompanyAutoSend,
  saveCompanyAutoSend,
  type CompanyAutoSend,
} from '@/lib/companyAutoSend';

interface CompanyAlertConfig {
  id: string;
  company_name: string;
  alert_days_before: number;
  reminder_30_days: boolean;
  reminder_7_days: boolean;
  reminder_1_day: boolean;
  require_driver_assignment: boolean;
  max_vehicles_without_assignment: number;
  vehicle_approval_required: boolean;
  require_insurance_docs: boolean;
  require_no_claims: boolean;
  hidden_buttons: string[];
  module_transport_enabled: boolean;
  transport_hidden_features: string[];
  incident_notify_in_app?: boolean;
  incident_notify_email?: boolean;
  incident_notify_whatsapp?: boolean;
  incident_email_recipients?: string;
  incident_whatsapp_recipients?: string;
  show_insurance_attention?: boolean;
  show_gaps_attention?: boolean;
  show_insurance_attention_red?: boolean;
  show_gaps_attention_red?: boolean;
}

interface ProfileCompany {
  company_name: string;
}

export default function AlertSettings() {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<CompanyAlertConfig[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [insuranceRedStats, setInsuranceRedStats] = useState<CompanyInsuranceRedStats | null>(null);
  const [loadingInsuranceRedStats, setLoadingInsuranceRedStats] = useState(false);
  const [bulkRedPending, setBulkRedPending] = useState<boolean | null>(null);
  const [bulkRedApplying, setBulkRedApplying] = useState(false);
  const [autoSend, setAutoSend] = useState<CompanyAutoSend>(DEFAULT_COMPANY_AUTO_SEND);
  const [savingAutoSend, setSavingAutoSend] = useState(false);
  const isSuperAdmin = user?.role === 'super_admin';
  // RLS: only super_admin can UPDATE company_settings. Fleet managers may view own company.
  const canEditAlerts = isSuperAdmin;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedCompany) {
      setAutoSend(DEFAULT_COMPANY_AUTO_SEND);
      return;
    }
    let cancelled = false;
    fetchCompanyAutoSend(selectedCompany).then((value) => {
      if (!cancelled) setAutoSend(value);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const persistAutoSend = async (next: CompanyAutoSend) => {
    if (!selectedCompany || !isSuperAdmin) return;
    setSavingAutoSend(true);
    try {
      await saveCompanyAutoSend(selectedCompany, next, user?.id);
      setAutoSend(next);
      toast.success(`שליחה אוטומטית עודכנה עבור ${selectedCompany}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירת שליחה אוטומטית');
    } finally {
      setSavingAutoSend(false);
    }
  };

  const loadData = async () => {
    setLoading(true);

    // Load all company settings
    const { data: settingsData } = await supabase
      .from('company_settings')
      .select('id, company_name, alert_days_before, reminder_30_days, reminder_7_days, reminder_1_day, require_driver_assignment, max_vehicles_without_assignment, vehicle_approval_required, require_insurance_docs, require_no_claims, hidden_buttons, module_transport_enabled, transport_hidden_features, incident_notify_in_app, incident_notify_email, incident_notify_whatsapp, incident_email_recipients, incident_whatsapp_recipients, show_insurance_attention, show_gaps_attention, show_insurance_attention_red, show_gaps_attention_red');
    
    if (settingsData) {
      setConfigs(
        settingsData.map((s) => ({
          ...s,
          module_transport_enabled: s.module_transport_enabled ?? false,
          transport_hidden_features: s.transport_hidden_features ?? [],
        })) as CompanyAlertConfig[],
      );
    }

    // Load all unique company names from profiles
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('company_name');

    if (profilesData) {
      const uniqueCompanies = [...new Set(
        (profilesData as ProfileCompany[])
          .map(p => p.company_name)
          .filter(Boolean)
          .filter(name => name && name.trim() !== '')
      )].sort();
      setCompanies(uniqueCompanies);

      // Auto-create missing company_settings records
      if (settingsData) {
        const existingNames = new Set(settingsData.map(s => s.company_name));
        const missingCompanies = uniqueCompanies.filter(c => !existingNames.has(c));
        
        if (missingCompanies.length > 0) {
          const newSettings = missingCompanies.map(name => ({
            company_name: name,
            alert_days_before: 30,
            reminder_30_days: true,
            reminder_7_days: true,
            reminder_1_day: true,
            require_driver_assignment: true,
            max_vehicles_without_assignment: 0,
            vehicle_approval_required: false,
            require_insurance_docs: true,
            require_no_claims: true,
            module_transport_enabled: false,
            transport_hidden_features: [],
          }));
          
          const { data: inserted } = await supabase
            .from('company_settings')
            .insert(newSettings)
            .select('id, company_name, alert_days_before, reminder_30_days, reminder_7_days, reminder_1_day, require_driver_assignment, max_vehicles_without_assignment, vehicle_approval_required, require_insurance_docs, require_no_claims, hidden_buttons, module_transport_enabled, transport_hidden_features');
          
          if (inserted) {
            setConfigs(prev => [...prev, ...(inserted as CompanyAlertConfig[])]);
          }
        }
      }
    }

    setLoading(false);
  };

  const activeConfig = configs.find(c => c.company_name === selectedCompany);

  useEffect(() => {
    if (!selectedCompany || !isSuperAdmin) {
      setInsuranceRedStats(null);
      return;
    }
    let cancelled = false;
    setLoadingInsuranceRedStats(true);
    loadCompanyInsuranceRedStats(selectedCompany)
      .then((stats) => {
        if (!cancelled) setInsuranceRedStats(stats);
      })
      .finally(() => {
        if (!cancelled) setLoadingInsuranceRedStats(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany, isSuperAdmin]);

  const refreshInsuranceRedStats = async () => {
    if (!selectedCompany) return;
    setLoadingInsuranceRedStats(true);
    const stats = await loadCompanyInsuranceRedStats(selectedCompany);
    setInsuranceRedStats(stats);
    setLoadingInsuranceRedStats(false);
  };

  const applyBulkInsuranceRed = async () => {
    if (!selectedCompany || bulkRedPending === null) return;
    const targetOn = bulkRedPending;
    setBulkRedApplying(true);
    const { updated, error } = await bulkSetCompanyInsuranceRedHighlight(selectedCompany, targetOn);
    setBulkRedApplying(false);
    setBulkRedPending(null);
    if (error) {
      toast.error(`שגיאה בעדכון: ${error}`);
      return;
    }
    toast.success(`עודכנו ${updated} רכבים — הצגת ביטוח באדום ${targetOn ? 'מופעלת' : 'כבויה'}`);
    await refreshInsuranceRedStats();
  };

  const handleSave = async () => {
    if (!activeConfig) return;
    setSaving(true);
    const { error } = await supabase.from('company_settings').update({
      alert_days_before: activeConfig.alert_days_before,
      reminder_30_days: activeConfig.reminder_30_days,
      reminder_7_days: activeConfig.reminder_7_days,
      reminder_1_day: activeConfig.reminder_1_day,
      require_driver_assignment: activeConfig.require_driver_assignment,
      max_vehicles_without_assignment: activeConfig.max_vehicles_without_assignment,
      vehicle_approval_required: activeConfig.vehicle_approval_required,
      require_insurance_docs: activeConfig.require_insurance_docs,
      require_no_claims: activeConfig.require_no_claims,
      hidden_buttons: activeConfig.hidden_buttons || [],
      module_transport_enabled: activeConfig.module_transport_enabled,
      transport_hidden_features: activeConfig.transport_hidden_features || [],
      incident_notify_in_app: activeConfig.incident_notify_in_app ?? true,
      incident_notify_email: activeConfig.incident_notify_email ?? true,
      incident_notify_whatsapp: activeConfig.incident_notify_whatsapp ?? false,
      incident_email_recipients: activeConfig.incident_email_recipients || 'fleet_managers',
      incident_whatsapp_recipients: activeConfig.incident_whatsapp_recipients || 'dalia',
      show_insurance_attention: activeConfig.show_insurance_attention !== false,
      show_gaps_attention: activeConfig.show_gaps_attention !== false,
      show_insurance_attention_red: activeConfig.show_insurance_attention_red !== false,
      show_gaps_attention_red: activeConfig.show_gaps_attention_red !== false,
    }).eq('id', activeConfig.id);
    setSaving(false);
    if (error) toast.error('שגיאה בשמירה');
    else {
      clearCompanySettingsCache(activeConfig.company_name);
      clearCompanyAttentionRedCache(activeConfig.company_name);
      toast.success(`הגדרות ${activeConfig.company_name} עודכנו בהצלחה`);
    }
  };

  const updateConfig = (field: string, value: any) => {
    if (!activeConfig) return;
    setConfigs(prev => prev.map(c => c.id === activeConfig.id ? { ...c, [field]: value } : c));
  };

  const filteredCompanies = companies.filter(c => 
    !search || c.includes(search)
  );

  if (!canEditAlerts) {
    return (
      <div className="animate-fade-in text-center py-16">
        <Building2 size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין הרשאה — רק Super Admin או מנהל צי</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <Link to="/admin/modules" className="text-primary text-sm font-medium inline-block">
        ← חזרה לכפתורים ומודולים
      </Link>
      <h1 className="page-header flex items-center gap-3">
        <Settings2 size={28} /> הגדרות חברות
      </h1>
      <p className="text-muted-foreground">בחר חברה כדי לערוך את ההגדרות שלה — התראות, אישורים, חובות הצמדה ומסמכים.</p>

      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm space-y-2">
        <p className="font-bold">סטטוס יישום בהגדרות</p>
        <ul className="text-muted-foreground space-y-1">
          <li>✅ <strong>תזכורות אוטומטיות</strong> — מחובר ליצירת התראות מרכז רכב</li>
          <li>✅ <strong>הסתרת כפתורים</strong> — Sidebar, כרטיסי דשבורד, FleetOS והסעות</li>
          <li>✅ <strong>מודול הסעות</strong> — Master Switch + מסכים בנפרד + כרטיס דשבורד</li>
          <li>✅ <strong>חובות רכב</strong> — הצמדת נהג, מסמכי ביטוח, הדר תביעות, אישור רכב חדש</li>
          <li>ℹ️ <strong>יבוא הסעות</strong> — מוסתר עד לשלב יישום מלא (לא Placeholder ללקוח)</li>
        </ul>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        </div>
      ) : (
        <>
          {/* ═══ Company Selector ═══ */}
          <div className="card-elevated">
            <label className="block text-lg font-bold mb-3 flex items-center gap-2">
              <Building2 size={20} className="text-primary" />
              בחר חברה / לקוח
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className={`w-full p-4 text-lg rounded-xl border-2 text-right flex items-center justify-between transition-colors ${
                  selectedCompany 
                    ? 'border-primary bg-primary/5 text-foreground' 
                    : 'border-input bg-background text-muted-foreground'
                }`}
              >
                <span>{selectedCompany || 'לחץ לבחירת חברה...'}</span>
                <ChevronDown size={20} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border-2 border-border rounded-xl shadow-lg z-30 max-h-72 overflow-hidden">
                  {/* Search */}
                  <div className="p-3 border-b border-border">
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="חיפוש חברה..."
                        className="w-full pr-10 p-3 text-base rounded-lg border border-input bg-background focus:border-primary focus:outline-none"
                        autoFocus
                      />
                    </div>
                  </div>
                  {/* Options */}
                  <div className="overflow-y-auto max-h-52">
                    {filteredCompanies.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">לא נמצאו חברות</div>
                    ) : (
                      filteredCompanies.map(company => (
                        <button
                          key={company}
                          type="button"
                          onClick={() => {
                            setSelectedCompany(company);
                            setDropdownOpen(false);
                            setSearch('');
                          }}
                          className={`w-full text-right px-4 py-3 text-base hover:bg-primary/10 transition-colors flex items-center gap-3 ${
                            selectedCompany === company ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'
                          }`}
                        >
                          <Building2 size={16} className={selectedCompany === company ? 'text-primary' : 'text-muted-foreground'} />
                          {company}
                          {selectedCompany === company && <span className="mr-auto text-primary">✓</span>}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {companies.length > 0 && !selectedCompany && (
              <p className="mt-3 text-sm text-muted-foreground text-center">
                {companies.length} חברות זמינות — בחר חברה כדי לערוך את ההגדרות שלה
              </p>
            )}
          </div>

          {/* ═══ Settings Panel ═══ */}
          {activeConfig ? (
            <div className="card-elevated space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Building2 size={22} className="text-primary" />
                  הגדרות: {activeConfig.company_name}
                </h2>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Save size={18} />
                  {saving ? 'שומר...' : 'שמור הגדרות'}
                </button>
              </div>

              <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3" data-testid="company-auto-send">
                <h3 className="font-bold text-lg">שליחה אוטומטית — Email / WhatsApp</h3>
                <p className="text-sm text-muted-foreground">
                  Super Admin בלבד, לפי חברה. כיבוי לא מבטל התראות בתוך המערכת (טסטים, ביטוחים, טיפולים, פגי תוקף)
                  ולא חוסם שליחה ידנית.
                </p>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                  <div>
                    <p className="font-medium">Email אוטומטי</p>
                    <p className="text-xs text-muted-foreground">{autoSend.emailAutomatic ? 'ON — מורשה' : 'OFF — חסום'}</p>
                  </div>
                  <Switch
                    checked={autoSend.emailAutomatic}
                    disabled={savingAutoSend}
                    onCheckedChange={(on) => void persistAutoSend({ ...autoSend, emailAutomatic: on })}
                    aria-label="Email אוטומטי"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                  <div>
                    <p className="font-medium">WhatsApp אוטומטי</p>
                    <p className="text-xs text-muted-foreground">{autoSend.whatsappAutomatic ? 'ON — מורשה' : 'OFF — חסום'}</p>
                  </div>
                  <Switch
                    checked={autoSend.whatsappAutomatic}
                    disabled={savingAutoSend}
                    onCheckedChange={(on) => void persistAutoSend({ ...autoSend, whatsappAutomatic: on })}
                    aria-label="WhatsApp אוטומטי"
                  />
                </div>
              </div>

              {/* Reminder Settings */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg">🔔 תזכורות אוטומטיות</h3>
                <div>
                  <label className="block text-sm font-medium mb-1">ימים לפני תזכורת ראשונה</label>
                  <input
                    type="number"
                    value={activeConfig.alert_days_before}
                    min={1}
                    max={90}
                    onChange={e => updateConfig('alert_days_before', parseInt(e.target.value) || 30)}
                    className="w-32 p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  {[
                    { key: 'reminder_30_days', label: '30 יום לפני' },
                    { key: 'reminder_7_days', label: '7 ימים לפני' },
                    { key: 'reminder_1_day', label: 'יום לפני' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 p-3 rounded-xl bg-muted cursor-pointer hover:bg-muted/80 transition-colors">
                      <input
                        type="checkbox"
                        checked={(activeConfig as any)[key]}
                        onChange={e => updateConfig(key, e.target.checked)}
                        className="rounded w-5 h-5 accent-primary"
                      />
                      <span className="text-base font-medium">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Incident alert settings — faults / accidents (separate from emergency WhatsApp) */}
              <div className="border-t border-border pt-4 space-y-3" id="incident-alert-settings">
                <h3 className="font-bold text-lg">הגדרות התראות על תאונות ותקלות</h3>
                <p className="text-sm text-muted-foreground">
                  לכל חברה בנפרד. מתג WhatsApp כאן הוא תוספת בתשלום לדיווחי תאונות/תקלות בלבד —{' '}
                  <strong>לא</strong> קשור לכפתור החירום / whatsapp_enabled.
                </p>
                <div className="space-y-2">
                  {[
                    { key: 'incident_notify_in_app', label: 'התראה בתוך המערכת — פעיל / כבוי' },
                    { key: 'incident_notify_email', label: 'Email — פעיל / כבוי' },
                    { key: 'incident_notify_whatsapp', label: 'WhatsApp (תוספת בתשלום) — פעיל / כבוי' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 p-3 rounded-xl bg-muted cursor-pointer hover:bg-muted/80 transition-colors">
                      <input
                        type="checkbox"
                        checked={Boolean((activeConfig as any)[key] ?? (key === 'incident_notify_whatsapp' ? false : true))}
                        onChange={(e) => updateConfig(key, e.target.checked)}
                        className="rounded w-5 h-5 accent-primary"
                      />
                      <span className="text-base font-medium">{label}</span>
                      <span className="mr-auto text-xs text-muted-foreground">
                        {Boolean((activeConfig as any)[key] ?? key !== 'incident_notify_whatsapp')
                          ? 'פעיל'
                          : 'כבוי'}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">נמעני Email</label>
                    <select
                      value={(activeConfig as any).incident_email_recipients || 'fleet_managers'}
                      onChange={(e) => updateConfig('incident_email_recipients', e.target.value)}
                      className="w-full p-3 rounded-xl border-2 border-input bg-background"
                    >
                      <option value="fleet_managers">כל מנהלי הצי</option>
                      <option value="dalia">דליה בלבד</option>
                      <option value="both">מנהלי הצי + דליה</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">נמעני WhatsApp</label>
                    <select
                      value={(activeConfig as any).incident_whatsapp_recipients || 'dalia'}
                      onChange={(e) => updateConfig('incident_whatsapp_recipients', e.target.value)}
                      className="w-full p-3 rounded-xl border-2 border-input bg-background"
                    >
                      <option value="fleet_managers">כל מנהלי הצי</option>
                      <option value="dalia">דליה בלבד</option>
                      <option value="both">מנהלי הצי + דליה</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border text-sm"
                    onClick={() => {
                      updateConfig('incident_notify_in_app', true);
                      updateConfig('incident_notify_email', false);
                      updateConfig('incident_notify_whatsapp', false);
                    }}
                  >
                    בתוך המערכת בלבד
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border text-sm"
                    onClick={() => {
                      updateConfig('incident_notify_in_app', false);
                      updateConfig('incident_notify_email', true);
                      updateConfig('incident_notify_whatsapp', false);
                    }}
                  >
                    Email בלבד
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border text-sm"
                    onClick={() => {
                      updateConfig('incident_notify_in_app', false);
                      updateConfig('incident_notify_email', false);
                      updateConfig('incident_notify_whatsapp', true);
                    }}
                  >
                    WhatsApp בלבד
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border text-sm"
                    onClick={() => {
                      updateConfig('incident_notify_in_app', true);
                      updateConfig('incident_notify_email', true);
                      updateConfig('incident_notify_whatsapp', true);
                    }}
                  >
                    Email + WhatsApp
                  </button>
                </div>
              </div>

              {/* Vehicle Settings */}
              <div className="border-t border-border pt-4 space-y-3">
                <h3 className="font-bold text-lg">🚗 הגדרות רכב</h3>
                <label className="flex items-center gap-3 p-3 rounded-xl bg-muted cursor-pointer hover:bg-muted/80 transition-colors">
                  <input
                    type="checkbox"
                    checked={activeConfig.vehicle_approval_required}
                    onChange={e => updateConfig('vehicle_approval_required', e.target.checked)}
                    className="rounded w-5 h-5 accent-primary"
                  />
                  <span className="text-base font-medium">אישור מנהל על נדרש להפעלת רכב חדש</span>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-xl bg-muted cursor-pointer hover:bg-muted/80 transition-colors">
                  <input
                    type="checkbox"
                    checked={activeConfig.require_driver_assignment}
                    onChange={e => updateConfig('require_driver_assignment', e.target.checked)}
                    className="rounded w-5 h-5 accent-primary"
                  />
                  <span className="text-base font-medium">חובה להצמיד נהג/משתמש לרכב</span>
                </label>
                {!activeConfig.require_driver_assignment && (
                  <div className="mr-8 space-y-2 p-3 rounded-xl bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground">ניתן להכניס רכבים ללא הצמדת נהג או משתמש, עד למכסה שהוגדרה</p>
                    <div>
                      <label className="block text-sm font-medium mb-1">כמות רכבים ללא חובת הצמדה</label>
                      <input
                        type="number"
                        value={activeConfig.max_vehicles_without_assignment}
                        min={0}
                        max={9999}
                        onChange={e => updateConfig('max_vehicles_without_assignment', parseInt(e.target.value) || 0)}
                        className="w-32 p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none"
                      />
                      <p className="text-xs text-muted-foreground mt-1">0 = ללא הגבלה (כל הרכבים פטורים)</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Document & Insurance Settings */}
              <div className="border-t border-border pt-4 space-y-3">
                <h3 className="font-bold text-lg">📄 מסמכים וביטוחים</h3>
                <label className="flex items-center gap-3 p-3 rounded-xl bg-muted cursor-pointer hover:bg-muted/80 transition-colors">
                  <input
                    type="checkbox"
                    checked={activeConfig.require_insurance_docs}
                    onChange={e => updateConfig('require_insurance_docs', e.target.checked)}
                    className="rounded w-5 h-5 accent-primary"
                  />
                  <span className="text-base font-medium">חובת הכנסת מסמכי ביטוח בהקמת רכב</span>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-xl bg-muted cursor-pointer hover:bg-muted/80 transition-colors">
                  <input
                    type="checkbox"
                    checked={activeConfig.require_no_claims}
                    onChange={e => updateConfig('require_no_claims', e.target.checked)}
                    className="rounded w-5 h-5 accent-primary"
                  />
                  <span className="text-base font-medium">חובת מילוי היסטוריית הדר תביעות</span>
                </label>

                {isSuperAdmin && (
                  <div className="mt-4 p-4 rounded-xl border border-border bg-background space-y-3">
                    <h4 className="font-bold text-base">הצגת התראות ביטוח באדום — לכל רכבי הלקוח</h4>
                    <p className="text-sm text-muted-foreground">
                      פעולה מרכזית בלבד על צבע/הדגשה אדומה. לא משנה את &quot;הפעל התראות ביטוח&quot; ולא מכבה התראות 30/7/1.
                      ניתן לשנות רכב בודד לאחר מכן בכרטיס הרכב.
                    </p>
                    {loadingInsuranceRedStats ? (
                      <p className="text-sm text-muted-foreground">טוען סטטיסטיקת רכבים...</p>
                    ) : insuranceRedStats ? (
                      <p className="text-sm">
                        רכבים בחברה: <strong>{insuranceRedStats.total}</strong> · אדום מופעל:{' '}
                        <strong>{insuranceRedStats.redOn}</strong> · אדום כבוי:{' '}
                        <strong>{insuranceRedStats.redOff}</strong>
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div className="text-right flex-1">
                        <p className="text-sm font-bold">הצג התראות ביטוח באדום לכל רכבי הלקוח</p>
                        <p className="text-xs text-muted-foreground">
                          שינוי יחול על כל הרכבים של {activeConfig.company_name} לאחר אישור
                        </p>
                      </div>
                      <Switch
                        checked={
                          insuranceRedStats
                            ? insuranceRedStats.redOn > 0 && insuranceRedStats.redOff === 0
                            : false
                        }
                        disabled={bulkRedApplying || loadingInsuranceRedStats || !insuranceRedStats?.total}
                        onCheckedChange={(on) => setBulkRedPending(on)}
                      />
                    </div>
                  </div>
                )}

                {isSuperAdmin && (
                  <div className="mt-4 p-4 rounded-xl border border-border bg-background space-y-3">
                    <h4 className="font-bold text-base">הצגה והדגשה בדשבורד רכב — לכל רכבי הלקוח</h4>
                    <p className="text-sm text-muted-foreground">
                      שינוי תצוגה בלבד פר-לקוח. הנתונים, החוסרים וההתראות נשארים.
                      לכל סוג: הצגה/הסתרה נפרדת, והדגשה באדום נפרדת (רק אם מוצג).
                    </p>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div className="text-right flex-1">
                        <p className="text-sm font-bold">הצג / הסתר &quot;יש לטפל&quot; לכל רכבי הלקוח</p>
                        <p className="text-xs text-muted-foreground">
                          כבוי = הלקוח לא רואה את &quot;יש לטפל&quot; באריח ביטוחים ורישיונות
                        </p>
                      </div>
                      <Switch
                        checked={activeConfig.show_insurance_attention !== false}
                        onCheckedChange={(on) => updateConfig('show_insurance_attention', on)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div className="text-right flex-1">
                        <p className="text-sm font-bold">הצג &quot;יש לטפל&quot; באדום לכל רכבי הלקוח</p>
                        <p className="text-xs text-muted-foreground">
                          רלוונטי רק כשההצגה למעלה פעילה — צבע בלבד
                        </p>
                      </div>
                      <Switch
                        checked={activeConfig.show_insurance_attention_red !== false}
                        onCheckedChange={(on) => updateConfig('show_insurance_attention_red', on)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div className="text-right flex-1">
                        <p className="text-sm font-bold">הצג / הסתר &quot;דורש טיפול&quot; לכל רכבי הלקוח</p>
                        <p className="text-xs text-muted-foreground">
                          כבוי = הלקוח לא רואה את &quot;דורש טיפול&quot; באריח חוסרים והתראות
                        </p>
                      </div>
                      <Switch
                        checked={activeConfig.show_gaps_attention !== false}
                        onCheckedChange={(on) => updateConfig('show_gaps_attention', on)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div className="text-right flex-1">
                        <p className="text-sm font-bold">הצג &quot;דורש טיפול&quot; באדום לכל רכבי הלקוח</p>
                        <p className="text-xs text-muted-foreground">
                          רלוונטי רק כשההצגה למעלה פעילה — צבע בלבד
                        </p>
                      </div>
                      <Switch
                        checked={activeConfig.show_gaps_attention_red !== false}
                        onCheckedChange={(on) => updateConfig('show_gaps_attention_red', on)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Transport Module */}
              <div className="border-t border-border pt-4 space-y-3">
                <h3 className="font-bold text-lg">🚌 מודול הסעות</h3>
                <p className="text-sm text-muted-foreground">
                  Master Switch מפעיל את מרכז ההסעות (<code className="text-xs">/transport</code>) ואת כרטיס &quot;חברות הסעות&quot; בדשבורד.
                  מנהל על תמיד רואה הכל.
                </p>
                <label className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20 cursor-pointer hover:bg-primary/10 transition-colors">
                  <input
                    type="checkbox"
                    checked={activeConfig.module_transport_enabled}
                    onChange={e => updateConfig('module_transport_enabled', e.target.checked)}
                    className="rounded w-5 h-5 accent-primary"
                  />
                  <span className="text-base font-bold">הפעל מודול הסעות לחברה זו</span>
                </label>

                {activeConfig.module_transport_enabled && (
                  <div className="mr-2 space-y-2 p-3 rounded-xl bg-muted/50 border border-border">
                    <p className="text-sm font-medium">מסכים וכפתורים — סמן להסתרה:</p>
                    {TRANSPORT_FEATURES.map(feature => {
                      const hiddenSet = new Set(activeConfig.transport_hidden_features || []);
                      const isHidden = hiddenSet.has(feature.id);
                      const toggleFeature = () => {
                        const current = activeConfig.transport_hidden_features || [];
                        const next = isHidden
                          ? current.filter(id => id !== feature.id)
                          : [...current, feature.id];
                        updateConfig('transport_hidden_features', next);
                      };
                      return (
                        <label
                          key={feature.id}
                          className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer hover:bg-muted/80 transition-colors ${isHidden ? 'bg-destructive/10' : 'bg-muted'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isHidden}
                            onChange={toggleFeature}
                            className="rounded w-5 h-5 accent-destructive"
                          />
                          <span className={`text-base font-medium ${isHidden ? 'text-destructive line-through' : ''}`}>
                            {feature.label}
                          </span>
                          <span className="text-xs text-muted-foreground mr-auto">{feature.subtitle}</span>
                          {isHidden && <span className="text-xs text-destructive">מוסתר</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Button Visibility Settings */}
              <div className="border-t border-border pt-4 space-y-3">
                <h3 className="font-bold text-lg">🎛️ ניהול כפתורים — הצגה / הסתרה</h3>
                <p className="text-sm text-muted-foreground">סמן את הכפתורים שברצונך <strong>להסתיר</strong> עבור משתמשי חברה זו. ההגדרה לא משפיעה על מנהל על.</p>
                {(() => {
                  const categories = [...new Set(MANAGEABLE_BUTTONS.map(b => b.category))];
                  const hiddenSet = new Set(activeConfig.hidden_buttons || []);
                  const toggleButton = (path: string) => {
                    const current = activeConfig.hidden_buttons || [];
                    const next = current.includes(path) ? current.filter(p => p !== path) : [...current, path];
                    updateConfig('hidden_buttons', next);
                  };
                  return categories.map(cat => (
                    <div key={cat}>
                      <p className="text-xs font-bold text-muted-foreground mb-1.5 mt-3">{cat}</p>
                      <div className="space-y-1">
                        {MANAGEABLE_BUTTONS.filter(b => b.category === cat).map(btn => (
                          <label key={btn.path} className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer hover:bg-muted/80 transition-colors ${hiddenSet.has(btn.path) ? 'bg-destructive/10' : 'bg-muted'}`}>
                            <input
                              type="checkbox"
                              checked={hiddenSet.has(btn.path)}
                              onChange={() => toggleButton(btn.path)}
                              className="rounded w-5 h-5 accent-destructive"
                            />
                            <span className={`text-base font-medium ${hiddenSet.has(btn.path) ? 'text-destructive line-through' : ''}`}>{btn.label}</span>
                            {hiddenSet.has(btn.path) && <span className="mr-auto text-xs text-destructive">מוסתר</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Save button at bottom too */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-4 rounded-xl bg-primary text-primary-foreground text-lg font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save size={20} />
                {saving ? 'שומר...' : 'שמור הגדרות'}
              </button>
            </div>
          ) : selectedCompany ? (
            <div className="card-elevated text-center py-12 text-muted-foreground">
              <Settings2 size={48} className="mx-auto mb-4 opacity-40" />
              <p className="text-lg">לא נמצאו הגדרות עבור חברה זו</p>
            </div>
          ) : null}
        </>
      )}

      <AlertDialog open={bulkRedPending !== null} onOpenChange={(open) => !open && setBulkRedPending(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור עדכון מרכזי</AlertDialogTitle>
            <AlertDialogDescription>
              פעולה זו תשנה את הגדרת הצגת התראות הביטוח באדום עבור{' '}
              <strong>{insuranceRedStats?.total ?? '—'}</strong> רכבים של{' '}
              <strong>{selectedCompany}</strong> ל-{bulkRedPending ? 'מופעל' : 'כבוי'}.
              <br />
              התראות הביטוח 30/7/1 ימשיכו לפעול לרכבים שההתראות שלהם פעילות.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <AlertDialogAction onClick={applyBulkInsuranceRed} disabled={bulkRedApplying}>
              {bulkRedApplying ? 'מעדכן...' : 'להמשיך'}
            </AlertDialogAction>
            <AlertDialogCancel disabled={bulkRedApplying}>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
