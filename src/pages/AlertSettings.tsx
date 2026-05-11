import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Building2, Save, Search, ChevronDown, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

import { MANAGEABLE_BUTTONS } from '@/hooks/useHiddenButtons';

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
  hide_driver_credentials: boolean;
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
  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    // Load all company settings
    const { data: settingsData } = await supabase
      .from('company_settings')
      .select('id, company_name, alert_days_before, reminder_30_days, reminder_7_days, reminder_1_day, require_driver_assignment, max_vehicles_without_assignment, vehicle_approval_required, require_insurance_docs, require_no_claims, hidden_buttons, hide_driver_credentials');
    
    if (settingsData) setConfigs(settingsData as CompanyAlertConfig[]);

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
          }));
          
          const { data: inserted } = await supabase
            .from('company_settings')
            .insert(newSettings)
            .select('id, company_name, alert_days_before, reminder_30_days, reminder_7_days, reminder_1_day, require_driver_assignment, max_vehicles_without_assignment, vehicle_approval_required, require_insurance_docs, require_no_claims, hidden_buttons, hide_driver_credentials');
          
          if (inserted) {
            setConfigs(prev => [...prev, ...(inserted as CompanyAlertConfig[])]);
          }
        }
      }
    }

    setLoading(false);
  };

  const activeConfig = configs.find(c => c.company_name === selectedCompany);

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
      hide_driver_credentials: activeConfig.hide_driver_credentials,
    }).eq('id', activeConfig.id);
    setSaving(false);
    if (error) toast.error('שגיאה בשמירה');
    else toast.success(`הגדרות ${activeConfig.company_name} עודכנו בהצלחה`);
  };

  const updateConfig = (field: string, value: any) => {
    if (!activeConfig) return;
    setConfigs(prev => prev.map(c => c.id === activeConfig.id ? { ...c, [field]: value } : c));
  };

  const filteredCompanies = companies.filter(c => 
    !search || c.includes(search)
  );

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-16">
        <Building2 size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין הרשאה</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="page-header flex items-center gap-3">
        <Settings2 size={28} /> הגדרות חברות
      </h1>
      <p className="text-muted-foreground">בחר חברה כדי לערוך את ההגדרות שלה — התראות, אישורים, חובות הצמדה ומסמכים.</p>

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
              </div>

              {/* Driver Credentials Settings */}
              <div className="border-t border-border pt-4 space-y-3">
                <h3 className="font-bold text-lg">👤 הגדרות נהגים</h3>
                <label className="flex items-center gap-3 p-3 rounded-xl bg-muted cursor-pointer hover:bg-muted/80 transition-colors">
                  <input
                    type="checkbox"
                    checked={activeConfig.hide_driver_credentials}
                    onChange={e => updateConfig('hide_driver_credentials', e.target.checked)}
                    className="rounded w-5 h-5 accent-primary"
                  />
                  <span className="text-base font-medium">הסתר סיסמה ומשתמש ביצירת נהג (יווצר אוטומטית)</span>
                </label>
                {activeConfig.hide_driver_credentials && (
                  <p className="text-xs text-muted-foreground mr-8">
                    משתמש: <code dir="ltr">{`{phone}@gmail.com`}</code> · סיסמה: <code dir="ltr">{`Passxyz+{phone}`}</code>
                  </p>
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
    </div>
  );
}
