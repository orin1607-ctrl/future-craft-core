import { useEffect, useMemo, useState } from 'react';
import { Bell, Building2, ChevronDown, Mail, MessageCircle, Save, Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import {
  ActionSettingState,
  DRIVER_APP_ACTIONS,
  defaultActionSetting,
  mergeActionSettings,
} from '@/lib/driverAppActions';

const inputClass =
  'w-full p-3 rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none text-sm';

type CompanyConfig = {
  dalia_service_enabled: boolean;
};

const emptyCompanyConfig = (): CompanyConfig => ({ dalia_service_enabled: false });

export default function DriverAppNotificationsAdmin() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);

  const [daliaEmail, setDaliaEmail] = useState('');
  const [daliaWhatsapp, setDaliaWhatsapp] = useState('');
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(emptyCompanyConfig);
  const [actionSettings, setActionSettings] = useState<Record<string, ActionSettingState>>(
    () => mergeActionSettings([]),
  );

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadGlobalsAndCompanies();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!selectedCompany || !isSuperAdmin) return;
    loadCompany(selectedCompany);
  }, [selectedCompany, isSuperAdmin]);

  const loadGlobalsAndCompanies = async () => {
    setLoading(true);
    const [globalRes, profilesRes] = await Promise.all([
      supabase.from('dalia_contact_settings').select('email, whatsapp').eq('id', 'global').maybeSingle(),
      supabase.from('profiles').select('company_name'),
    ]);

    if (globalRes.data) {
      setDaliaEmail(globalRes.data.email || '');
      setDaliaWhatsapp(globalRes.data.whatsapp || '');
    }

    const unique = [...new Set(
      (profilesRes.data || [])
        .map((p) => p.company_name)
        .filter((name): name is string => !!name && name.trim() !== ''),
    )].sort();
    setCompanies(unique);
    setLoading(false);
  };

  const loadCompany = async (companyName: string) => {
    setLoadingCompany(true);
    const [configRes, actionsRes] = await Promise.all([
      supabase.from('driver_app_company_config').select('*').eq('company_name', companyName).maybeSingle(),
      supabase.from('driver_app_action_settings').select('*').eq('company_name', companyName),
    ]);

    setCompanyConfig({
      dalia_service_enabled: !!configRes.data?.dalia_service_enabled,
    });
    setActionSettings(mergeActionSettings(actionsRes.data || []));
    setLoadingCompany(false);
  };

  const updateAction = (key: string, patch: Partial<ActionSettingState>) => {
    setActionSettings((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || defaultActionSetting(DRIVER_APP_ACTIONS.find((a) => a.key === key)!)), ...patch, action_key: key },
    }));
  };

  const saveGlobals = async () => {
    setSavingGlobal(true);
    const { error } = await supabase.from('dalia_contact_settings').upsert({
      id: 'global',
      email: daliaEmail.trim(),
      whatsapp: daliaWhatsapp.trim(),
      updated_at: new Date().toISOString(),
      updated_by: user?.id || null,
    });
    setSavingGlobal(false);
    if (error) {
      toast.error('שמירת פרטי דליה נכשלה');
      console.error(error);
      return;
    }
    toast.success('פרטי הקשר הקבועים של דליה נשמרו');
  };

  const saveCompany = async () => {
    if (!selectedCompany) return;
    setSaving(true);

    const actionRows = DRIVER_APP_ACTIONS.map((action) => {
      const setting = actionSettings[action.key] || defaultActionSetting(action);
      return {
        company_name: selectedCompany,
        action_key: action.key,
        visible_to_driver: setting.visible_to_driver,
        email_enabled: action.hasNotifications ? setting.email_enabled : false,
        email_to_fleet_managers: action.hasNotifications ? setting.email_to_fleet_managers : false,
        email_to_dalia: action.hasNotifications ? setting.email_to_dalia : false,
        email_extra: action.hasNotifications ? setting.email_extra.trim() : '',
        whatsapp_enabled: action.hasNotifications ? setting.whatsapp_enabled : false,
        whatsapp_to_dalia: action.hasNotifications ? setting.whatsapp_to_dalia : false,
        whatsapp_extra: action.hasNotifications ? setting.whatsapp_extra.trim() : '',
        condition_mode: action.conditions ? setting.condition_mode : 'all',
        condition_values: action.conditions && setting.condition_mode === 'by_value' ? setting.condition_values : [],
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      };
    });

    const { error: configError } = await supabase.from('driver_app_company_config').upsert({
      company_name: selectedCompany,
      dalia_service_enabled: companyConfig.dalia_service_enabled,
      updated_at: new Date().toISOString(),
      updated_by: user?.id || null,
    });

    const { error: actionsError } = await supabase
      .from('driver_app_action_settings')
      .upsert(actionRows, { onConflict: 'company_name,action_key' });

    setSaving(false);
    if (configError || actionsError) {
      toast.error('שמירת הגדרות החברה נכשלה');
      console.error(configError || actionsError);
      return;
    }
    toast.success(`הגדרות ${selectedCompany} נשמרו`);
    loadCompany(selectedCompany);
  };

  const filteredCompanies = useMemo(
    () => companies.filter((c) => !search || c.includes(search)),
    [companies, search],
  );

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-16">
        <Bell size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין הרשאה — מסך זה זמין למנהל על בלבד</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="page-header flex items-center gap-3">
        <Settings2 size={28} /> ניהול אפליקציית נהג והתראות
      </h1>
      <p className="text-muted-foreground">
        שליטה לפי חברה על כפתורי הנהג ועל יעדי Email / WhatsApp. ההגדרות נשמרות בלבד —
        שליחת הודעות אמיתית תתווסף בשלב הבא. המיילים הקיימים למנהל הצי ממשיכים לעבוד כרגיל.
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        </div>
      ) : (
        <>
          <section className="card-elevated space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Mail size={20} className="text-primary" />
              פרטי קשר דליה להתראות
            </h2>
            <p className="text-sm text-muted-foreground">
              פרטים קבועים לכל החברות. אין צורך להזין אותם מחדש בכל חברה.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email דליה קבוע</label>
                <input
                  dir="ltr"
                  className={inputClass}
                  value={daliaEmail}
                  onChange={(e) => setDaliaEmail(e.target.value)}
                  placeholder="dalia@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">WhatsApp דליה קבוע</label>
                <input
                  dir="ltr"
                  className={inputClass}
                  value={daliaWhatsapp}
                  onChange={(e) => setDaliaWhatsapp(e.target.value)}
                  placeholder="972501234567"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={saveGlobals}
              disabled={savingGlobal}
              className="py-3 px-5 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              <Save size={18} />
              {savingGlobal ? 'שומר...' : 'שמור פרטי דליה'}
            </button>
          </section>

          <section className="card-elevated">
            <label className="block text-lg font-bold mb-3 flex items-center gap-2">
              <Building2 size={20} className="text-primary" />
              בחר חברה
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
                  <div className="p-3 border-b border-border">
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="חיפוש חברה..."
                        className="w-full pr-10 p-2.5 rounded-lg border border-input bg-background text-sm"
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {filteredCompanies.map((company) => (
                      <button
                        key={company}
                        type="button"
                        onClick={() => {
                          setSelectedCompany(company);
                          setDropdownOpen(false);
                          setSearch('');
                        }}
                        className={`w-full text-right px-4 py-3 text-sm hover:bg-primary/10 flex items-center gap-3 ${
                          selectedCompany === company ? 'bg-primary/10 text-primary font-bold' : ''
                        }`}
                      >
                        <Building2 size={16} />
                        <span className="flex-1">{company}</span>
                        {selectedCompany === company && <span>✓</span>}
                      </button>
                    ))}
                    {filteredCompanies.length === 0 && (
                      <p className="text-center text-muted-foreground py-4 text-sm">לא נמצאו חברות</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {selectedCompany && (
            loadingCompany ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
              </div>
            ) : (
              <>
                <section className="card-elevated space-y-4">
                  <h2 className="text-lg font-bold">חברה: {selectedCompany}</h2>
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted">
                    <div>
                      <p className="font-bold">שירות טיפול דליה</p>
                      <p className="text-sm text-muted-foreground">
                        {companyConfig.dalia_service_enabled
                          ? 'ON — ההגדרות מוכנות לשלב השליחה הבא. לא נשלחות הודעות כעת.'
                          : 'OFF — ההגדרות נשמרות, אך שירות דליה אינו פעיל לחברה זו.'}
                      </p>
                    </div>
                    <Switch
                      checked={companyConfig.dalia_service_enabled}
                      onCheckedChange={(checked) => setCompanyConfig({ dalia_service_enabled: checked })}
                      aria-label="שירות טיפול דליה"
                    />
                  </div>
                  {!companyConfig.dalia_service_enabled && (
                    <p className="text-xs text-muted-foreground">
                      סימון יעד «דליה» בפעולה יישמר, אבל השירות כבוי עד שיופעל המתג למעלה.
                    </p>
                  )}
                </section>

                {DRIVER_APP_ACTIONS.map((action) => {
                  const setting = actionSettings[action.key] || defaultActionSetting(action);
                  return (
                    <section key={action.key} className="card-elevated space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold">{action.label}</h3>
                          <p className="text-sm text-muted-foreground">{action.description}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-medium">הצג לנהג</span>
                          <Switch
                            checked={setting.visible_to_driver}
                            onCheckedChange={(checked) => updateAction(action.key, { visible_to_driver: checked })}
                            aria-label={`הצג לנהג ${action.label}`}
                          />
                        </div>
                      </div>

                      {action.hasNotifications ? (
                        <div className="grid md:grid-cols-2 gap-4 pt-2 border-t border-border">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="font-bold flex items-center gap-2">
                                <Mail size={16} /> Email
                              </p>
                              <Switch
                                checked={setting.email_enabled}
                                onCheckedChange={(checked) => updateAction(action.key, { email_enabled: checked })}
                                aria-label={`Email ${action.label}`}
                              />
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-primary"
                                checked={setting.email_to_fleet_managers}
                                onChange={(e) => updateAction(action.key, { email_to_fleet_managers: e.target.checked })}
                              />
                              מנהל/י צי הרכב
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-primary"
                                checked={setting.email_to_dalia}
                                onChange={(e) => updateAction(action.key, { email_to_dalia: e.target.checked })}
                              />
                              דליה ({daliaEmail || 'לא הוגדר אימייל קבוע'})
                            </label>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">יעד נוסף (אופציונלי)</label>
                              <input
                                dir="ltr"
                                className={inputClass}
                                value={setting.email_extra}
                                onChange={(e) => updateAction(action.key, { email_extra: e.target.value })}
                                placeholder="extra@example.com"
                              />
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="font-bold flex items-center gap-2">
                                <MessageCircle size={16} /> WhatsApp
                              </p>
                              <Switch
                                checked={setting.whatsapp_enabled}
                                onCheckedChange={(checked) => updateAction(action.key, { whatsapp_enabled: checked })}
                                aria-label={`WhatsApp ${action.label}`}
                              />
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-primary"
                                checked={setting.whatsapp_to_dalia}
                                onChange={(e) => updateAction(action.key, { whatsapp_to_dalia: e.target.checked })}
                              />
                              דליה ({daliaWhatsapp || 'לא הוגדר מספר קבוע'})
                            </label>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">יעד נוסף (אופציונלי)</label>
                              <input
                                dir="ltr"
                                className={inputClass}
                                value={setting.whatsapp_extra}
                                onChange={(e) => updateAction(action.key, { whatsapp_extra: e.target.value })}
                                placeholder="9725..."
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">נשמר בלבד. אין שליחת WhatsApp במסך זה.</p>
                          </div>

                          {action.conditions && (
                            <div className="md:col-span-2 space-y-2 pt-2 border-t border-border">
                              <p className="font-bold">תנאי לפי {action.conditions.label}</p>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name={`cond-${action.key}`}
                                  checked={setting.condition_mode === 'all'}
                                  onChange={() => updateAction(action.key, { condition_mode: 'all', condition_values: [] })}
                                />
                                כל פנייה
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name={`cond-${action.key}`}
                                  checked={setting.condition_mode === 'by_value'}
                                  onChange={() =>
                                    updateAction(action.key, {
                                      condition_mode: 'by_value',
                                      condition_values:
                                        setting.condition_values.length > 0
                                          ? setting.condition_values
                                          : action.conditions!.options.map((o) => o.value),
                                    })
                                  }
                                />
                                לפי ערך
                              </label>
                              {setting.condition_mode === 'by_value' && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {action.conditions.options.map((option) => {
                                    const checked = setting.condition_values.includes(option.value);
                                    return (
                                      <label
                                        key={option.value}
                                        className={`px-3 py-2 rounded-xl text-sm cursor-pointer border ${
                                          checked ? 'bg-primary/10 border-primary text-primary font-bold' : 'bg-muted border-transparent'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          className="sr-only"
                                          checked={checked}
                                          onChange={() => {
                                            const next = checked
                                              ? setting.condition_values.filter((v) => v !== option.value)
                                              : [...setting.condition_values, option.value];
                                            updateAction(action.key, { condition_values: next });
                                          }}
                                        />
                                        {option.label}
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground border-t border-border pt-3">
                          לפעולה זו אין התראת מערכת היום — כאן שולטים רק בהצגה לנהג.
                        </p>
                      )}
                    </section>
                  );
                })}

                <button
                  type="button"
                  onClick={saveCompany}
                  disabled={saving}
                  className="w-full py-4 rounded-xl bg-primary text-primary-foreground text-lg font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={20} />
                  {saving ? 'שומר...' : `שמור הגדרות ${selectedCompany}`}
                </button>
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
