import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Plus, Trash2, Save, Settings, ArrowUp, ArrowDown, AlertTriangle, Car, Wrench, Shield, HelpCircle, Building2, Search, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface CompanySettings {
  id?: string;
  company_name: string;
  whatsapp_enabled: boolean;
  whatsapp_phone: string;
  whatsapp_button_color: string;
  whatsapp_button_text: string;
}

interface EmergencyCategory {
  id?: string;
  company_name: string;
  category_key: string;
  category_label: string;
  category_icon: string;
  target_type: string;
  target_value: string;
  auto_message_template: string;
  sort_order: number;
  is_active: boolean;
}

interface CompanyEntry {
  name: string;
  type: 'company' | 'private_customer';
}

const iconOptions = [
  { value: 'accident', label: 'תאונה', Icon: AlertTriangle },
  { value: 'tow', label: 'גרר', Icon: Car },
  { value: 'fault', label: 'תקלה', Icon: Wrench },
  { value: 'tire', label: 'פנצ׳ר/שמשה', Icon: Shield },
  { value: 'other', label: 'אחר', Icon: HelpCircle },
];

export default function EmergencySettings() {
  const { user } = useAuth();
  const [companyEntries, setCompanyEntries] = useState<CompanyEntry[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [categories, setCategories] = useState<EmergencyCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  const isSuperAdmin = user?.role === 'super_admin';

  // Load companies from profiles + user_roles (to identify private customers)
  useEffect(() => {
    if (!isSuperAdmin) return;
    loadCompanies();
  }, [isSuperAdmin]);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, company_name'),
      supabase.from('user_roles').select('user_id, role'),
    ]);

    const roleMap = new Map((rolesRes.data || []).map(r => [r.user_id, r.role]));
    const companiesSet = new Set<string>();
    const privateCustomers: string[] = [];

    (profilesRes.data || []).forEach(p => {
      const role = roleMap.get(p.id);
      if (role === 'private_customer') {
        // Private customers - use their full_name as identifier
        const name = p.full_name?.trim() || p.company_name?.trim();
        if (name) privateCustomers.push(name);
      } else if (p.company_name?.trim()) {
        companiesSet.add(p.company_name.trim());
      }
    });

    const entries: CompanyEntry[] = [
      ...Array.from(companiesSet).sort().map(name => ({ name, type: 'company' as const })),
      ...privateCustomers.sort().map(name => ({ name, type: 'private_customer' as const })),
    ];

    setCompanyEntries(entries);
    setLoadingCompanies(false);
  };

  useEffect(() => {
    if (!selectedCompany) return;
    loadData();
  }, [selectedCompany]);

  const loadData = async () => {
    const [settingsRes, catsRes] = await Promise.all([
      supabase.from('company_settings').select('*').eq('company_name', selectedCompany).maybeSingle(),
      supabase.from('emergency_categories').select('*').eq('company_name', selectedCompany).order('sort_order'),
    ]);

    if (settingsRes.data) {
      setSettings(settingsRes.data as CompanySettings);
    } else {
      setSettings({
        company_name: selectedCompany,
        whatsapp_enabled: true,
        whatsapp_phone: '',
        whatsapp_button_color: '#25D366',
        whatsapp_button_text: 'שירותי חירום 24/7',
      });
    }

    setCategories((catsRes.data || []) as EmergencyCategory[]);
  };

  const loadLogs = async () => {
    if (!selectedCompany) return;
    const { data } = await supabase
      .from('emergency_logs')
      .select('*')
      .eq('company_name', selectedCompany)
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs(data || []);
    setShowLogs(true);
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);

    let settingsError: Error | null = null;
    let categoriesError: Error | null = null;

    if (settings.id) {
      const { error } = await supabase.from('company_settings').update({
        whatsapp_enabled: settings.whatsapp_enabled,
        whatsapp_phone: settings.whatsapp_phone,
        whatsapp_button_color: settings.whatsapp_button_color,
        whatsapp_button_text: settings.whatsapp_button_text,
        updated_at: new Date().toISOString(),
      }).eq('id', settings.id);
      if (error) settingsError = error;
    } else {
      const { error } = await supabase.from('company_settings').insert({
        company_name: settings.company_name,
        whatsapp_enabled: settings.whatsapp_enabled,
        whatsapp_phone: settings.whatsapp_phone,
        whatsapp_button_color: settings.whatsapp_button_color,
        whatsapp_button_text: settings.whatsapp_button_text,
      });
      if (error) settingsError = error;
    }

    const { error: deleteError } = await supabase.from('emergency_categories').delete().eq('company_name', selectedCompany);
    if (deleteError) categoriesError = deleteError;

    if (!categoriesError && categories.length > 0) {
      const { error } = await supabase.from('emergency_categories').insert(
        categories.map((c, i) => ({
          company_name: selectedCompany,
          category_key: c.category_key,
          category_label: c.category_label,
          category_icon: c.category_icon,
          target_type: c.target_type,
          target_value: c.target_value,
          auto_message_template: c.auto_message_template,
          sort_order: i,
          is_active: c.is_active,
        }))
      );
      if (error) categoriesError = error;
    }

    setSaving(false);
    if (settingsError || categoriesError) {
      toast.error(settingsError?.message || categoriesError?.message || 'שגיאה בשמירה');
      return;
    }
    toast.success(`הגדרות חירום עבור "${selectedCompany}" נשמרו בהצלחה`);
    loadData();
  };

  const addCategory = () => {
    setCategories(prev => [...prev, {
      company_name: selectedCompany,
      category_key: `cat_${Date.now()}`,
      category_label: '',
      category_icon: 'other',
      target_type: 'whatsapp',
      target_value: '',
      auto_message_template: 'שלום, אני צריך שירות חירום\nחברה: {company}\nשם פונה: {name}\nטלפון: {phone}\nסוג אירוע: {category}',
      sort_order: prev.length,
      is_active: true,
    }]);
  };

  const updateCategory = (index: number, field: string, value: any) => {
    setCategories(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const removeCategory = (index: number) => {
    setCategories(prev => prev.filter((_, i) => i !== index));
  };

  const moveCategory = (index: number, dir: -1 | 1) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= categories.length) return;
    const arr = [...categories];
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
    setCategories(arr);
  };

  const updateLogStatus = async (logId: string, status: string) => {
    await supabase.from('emergency_logs').update({
      status,
      resolved_at: status === 'closed' ? new Date().toISOString() : null,
      resolved_by: status === 'closed' ? user?.full_name || '' : '',
    }).eq('id', logId);
    toast.success('הסטטוס עודכן');
    loadLogs();
  };

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-12">
        <p className="text-xl text-muted-foreground">אין הרשאות לצפייה בדף זה</p>
      </div>
    );
  }

  const filteredEntries = companyEntries.filter(e =>
    !search || e.name.includes(search)
  );

  const inputClass = "w-full p-3 rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none text-sm";

  return (
    <div className="animate-fade-in space-y-4">
      <Link to="/dalia-settings" className="text-primary text-sm font-medium inline-block">
        ← חזרה ל-Dalia Settings
      </Link>
      <h1 className="page-header flex items-center gap-3">
        <Phone size={28} />
        הגדרות שירותי חירום
      </h1>

      {/* Company selector */}
      <div className="card-elevated mb-4">
        <label className="block text-base font-bold mb-2 flex items-center gap-2">
          <Building2 size={18} className="text-primary" />
          בחר חברה / לקוח פרטי
        </label>
        <div className="relative mb-2">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש..."
            className="w-full pr-10 p-3 rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none text-sm"
          />
        </div>
        {loadingCompanies ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto border border-border rounded-xl">
            {filteredEntries.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">לא נמצאו חברות</p>
            ) : (
              filteredEntries.map((entry) => (
                <button
                  key={`${entry.type}-${entry.name}`}
                  onClick={() => { setSelectedCompany(entry.name); setSearch(''); }}
                  className={`w-full text-right px-4 py-3 text-sm hover:bg-primary/10 transition-colors flex items-center gap-3 border-b border-border last:border-b-0 ${
                    selectedCompany === entry.name ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'
                  }`}
                >
                  {entry.type === 'private_customer' ? (
                    <User size={16} className="text-emerald-500 shrink-0" />
                  ) : (
                    <Building2 size={16} className="text-primary shrink-0" />
                  )}
                  <span className="flex-1">{entry.name}</span>
                  {entry.type === 'private_customer' && (
                    <span className="text-xs bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-lg">לקוח פרטי</span>
                  )}
                  {selectedCompany === entry.name && <span className="text-primary">✓</span>}
                </button>
              ))
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          {companyEntries.filter(e => e.type === 'company').length} חברות, {companyEntries.filter(e => e.type === 'private_customer').length} לקוחות פרטיים
        </p>
      </div>

      {selectedCompany && settings && (
        <>
          {/* General button settings */}
          <div className="card-elevated mb-4">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Settings size={20} />
              הגדרות כפתור חירום — {selectedCompany}
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-base font-medium flex-1">כפתור פעיל</label>
                <button
                  onClick={() => setSettings(s => s ? { ...s, whatsapp_enabled: !s.whatsapp_enabled } : s)}
                  className={`w-14 h-8 rounded-full relative transition-colors ${settings.whatsapp_enabled ? 'bg-primary' : 'bg-muted'}`}
                >
                  <div className={`absolute top-1 w-6 h-6 rounded-full bg-background shadow transition-all ${settings.whatsapp_enabled ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">טלפון ברירת מחדל (וואטסאפ)</label>
                <input value={settings.whatsapp_phone} onChange={e => setSettings(s => s ? { ...s, whatsapp_phone: e.target.value } : s)} className={inputClass} dir="ltr" placeholder="972501234567" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">צבע כפתור</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={settings.whatsapp_button_color || '#25D366'} onChange={e => setSettings(s => s ? { ...s, whatsapp_button_color: e.target.value } : s)} className="w-10 h-10 rounded-lg border-0 cursor-pointer" />
                    <input value={settings.whatsapp_button_color || '#25D366'} onChange={e => setSettings(s => s ? { ...s, whatsapp_button_color: e.target.value } : s)} className={inputClass} dir="ltr" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">טקסט כפתור</label>
                  <input value={settings.whatsapp_button_text || ''} onChange={e => setSettings(s => s ? { ...s, whatsapp_button_text: e.target.value } : s)} className={inputClass} />
                </div>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="card-elevated mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <AlertTriangle size={20} />
                קטגוריות חירום ({categories.length})
              </h2>
              <button onClick={addCategory} className="flex items-center gap-1 text-sm bg-primary text-primary-foreground px-3 py-2 rounded-xl font-medium">
                <Plus size={16} />
                הוסף קטגוריה
              </button>
            </div>

            {categories.length === 0 && (
              <p className="text-muted-foreground text-center py-4">אין קטגוריות. הוסף קטגוריות חירום.</p>
            )}

            <div className="space-y-3">
              {categories.map((cat, i) => (
                <div key={i} className="border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveCategory(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowUp size={16} /></button>
                      <button onClick={() => moveCategory(i, 1)} disabled={i === categories.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowDown size={16} /></button>
                      <span className="text-xs text-muted-foreground">#{i + 1}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCategory(i, 'is_active', !cat.is_active)}
                        className={`text-xs px-2 py-1 rounded-lg font-medium ${cat.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
                      >
                        {cat.is_active ? 'פעיל' : 'כבוי'}
                      </button>
                      <button onClick={() => removeCategory(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 size={16} /></button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">שם קטגוריה</label>
                      <input value={cat.category_label} onChange={e => updateCategory(i, 'category_label', e.target.value)} className={inputClass} placeholder="תאונה / גרר..." />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">אייקון</label>
                      <select value={cat.category_icon} onChange={e => updateCategory(i, 'category_icon', e.target.value)} className={inputClass}>
                        {iconOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">סוג יעד</label>
                      <select value={cat.target_type} onChange={e => updateCategory(i, 'target_type', e.target.value)} className={inputClass}>
                        <option value="whatsapp">וואטסאפ</option>
                        <option value="phone">חיוג טלפוני</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">מספר / יעד</label>
                      <input value={cat.target_value} onChange={e => updateCategory(i, 'target_value', e.target.value)} className={inputClass} dir="ltr" placeholder="972501234567" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">הודעה אוטומטית (משתנים: {'{company}'}, {'{name}'}, {'{phone}'}, {'{category}'})</label>
                    <textarea
                      value={cat.auto_message_template}
                      onChange={e => updateCategory(i, 'auto_message_template', e.target.value)}
                      className={`${inputClass} resize-none`}
                      rows={3}
                      placeholder="שלום, אני צריך שירות חירום..."
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Save */}
          <button onClick={handleSaveSettings} disabled={saving}
            className="w-full py-4 rounded-xl bg-primary text-primary-foreground text-lg font-bold flex items-center justify-center gap-2 mb-4 disabled:opacity-50">
            <Save size={20} />
            {saving ? 'שומר...' : 'שמור הגדרות'}
          </button>

          {/* Logs */}
          <div className="card-elevated">
            <button onClick={loadLogs} className="w-full flex items-center justify-between py-2">
              <h2 className="text-lg font-bold">יומן אירועי חירום</h2>
              <span className="text-sm text-primary font-medium">הצג יומן</span>
            </button>

            {showLogs && (
              <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
                {logs.length === 0 && <p className="text-muted-foreground text-center py-4">אין רשומות</p>}
                {logs.map(log => (
                  <div key={log.id} className="border border-border rounded-xl p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">{log.category_label}</span>
                      <select
                        value={log.status}
                        onChange={e => updateLogStatus(log.id, e.target.value)}
                        className="text-xs border border-input rounded-lg px-2 py-1 bg-background"
                      >
                        <option value="open">פתוח</option>
                        <option value="handled">טופל</option>
                        <option value="closed">סגור</option>
                      </select>
                    </div>
                    <p className="text-muted-foreground">{log.user_name} • {new Date(log.created_at).toLocaleString('he-IL')}</p>
                    <p className="text-muted-foreground">{log.target_type === 'whatsapp' ? 'וואטסאפ' : 'טלפון'}: {log.target_value}</p>
                    {log.resolved_by && <p className="text-xs text-primary mt-1">טופל ע״י {log.resolved_by} • {new Date(log.resolved_at).toLocaleString('he-IL')}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
