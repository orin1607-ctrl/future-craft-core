import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { Bell, ShieldAlert, Car, IdCard, Wrench, Clock, CheckCircle2, ScrollText, Search, Building2, Briefcase, ClipboardList } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

// ─── Alerts Types ───
type AlertSeverity = 'critical' | 'warning' | 'info';
type AlertCategory = 'test' | 'insurance' | 'comprehensive_insurance' | 'license' | 'fault' | 'service_order' | 'work_assignment';

interface AlertItem {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  subtitle: string;
  daysLeft: number | null;
  date: string | null;
  meta?: string;
  link?: string;
}

const categoryLabels: Record<AlertCategory, string> = {
  test: 'טסט',
  insurance: 'ביטוח חובה',
  comprehensive_insurance: 'ביטוח מקיף',
  license: 'רישיון נהיגה',
  fault: 'תקלה דחופה',
  service_order: 'שירותים ותחזוקה',
  work_assignment: 'סידור עבודה',
};

const categoryIcons: Record<AlertCategory, typeof Car> = {
  test: Car,
  insurance: ShieldAlert,
  comprehensive_insurance: ShieldAlert,
  license: IdCard,
  fault: Wrench,
  service_order: Briefcase,
  work_assignment: ClipboardList,
};

const severityStyles: Record<AlertSeverity, string> = {
  critical: 'bg-destructive/10 border-destructive/40 text-destructive',
  warning: 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400',
  info: 'bg-blue-500/10 border-blue-500/40 text-blue-700 dark:text-blue-400',
};

const severityBadge: Record<AlertSeverity, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  warning: 'bg-amber-500 text-white',
  info: 'bg-blue-500 text-white',
};

function getDaysLeft(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getSeverity(daysLeft: number | null): AlertSeverity {
  if (daysLeft === null) return 'info';
  if (daysLeft <= 0) return 'critical';
  if (daysLeft <= 14) return 'warning';
  return 'info';
}

// ─── Updates (System Logs) Types ───
interface LogEntry {
  id: string;
  created_at: string;
  user_name: string;
  company_name: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  vehicle_plate: string;
  old_status: string;
  new_status: string;
  details: string;
  channel: string;
}

const ACTION_LABELS: Record<string, string> = {
  approve: 'אישור', reject: 'דחייה', create: 'יצירה', update: 'עדכון',
  status_change: 'שינוי סטטוס', reminder_sent: 'תזכורת נשלחה',
};

const ENTITY_LABELS: Record<string, string> = {
  vehicle: 'רכב', driver: 'נהג', fault: 'תקלה', accident: 'תאונה',
  work_assignment: 'סידור עבודה', service_order: 'שירותים ותחזוקה',
  approval_request: 'בקשת אישור', handover: 'חילופי רכב',
};

// ─── Main Component ───
export default function Alerts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyFilter = useCompanyFilter();
  const isSuperAdmin = user?.role === 'super_admin';

  // Alerts state
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertFilter, setAlertFilter] = useState<AlertCategory | 'all'>('all');

  // Updates state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logSearch, setLogSearch] = useState('');
  const [logFilterCompany, setLogFilterCompany] = useState('');
  const [logFilterEntity, setLogFilterEntity] = useState('');
  const [logFilterDate, setLogFilterDate] = useState('');
  const [companies, setCompanies] = useState<string[]>([]);

  useEffect(() => {
    if (user) loadAlerts();
  }, [user, companyFilter]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadLogs();
      supabase.from('profiles').select('company_name').then(({ data }) => {
        if (data) setCompanies([...new Set(data.map(d => d.company_name).filter(Boolean) as string[])]);
      });
    }
  }, [isSuperAdmin]);

  const loadAlerts = async () => {
    setAlertsLoading(true);
    const allAlerts: AlertItem[] = [];

    // 1. Vehicle expiries
    const { data: vehicles } = await applyCompanyScope(supabase.from('vehicles').select('*'), companyFilter);
    const vehicleByPlate: Record<string, { id: string; internal_number: string }> = {};
    const vehicleById: Record<string, { id: string; internal_number: string; license_plate: string }> = {};
    if (vehicles) {
      for (const v of vehicles as any[]) {
        if (v.license_plate) vehicleByPlate[v.license_plate] = { id: v.id, internal_number: v.internal_number || '' };
        vehicleById[v.id] = { id: v.id, internal_number: v.internal_number || '', license_plate: v.license_plate || '' };
      }
      for (const v of vehicles) {
        const plate = v.license_plate;
        const internal = (v as any).internal_number ? ` | פנימי ${(v as any).internal_number}` : '';
        const label = `${v.manufacturer || ''} ${v.model || ''} - ${plate}${internal}`.trim();
        const vehicleLink = `/vehicles?vehicleId=${v.id}`;

        const testDays = getDaysLeft(v.test_expiry);
        if (testDays !== null && testDays <= 30) {
          allAlerts.push({ id: `test-${v.id}`, category: 'test', severity: getSeverity(testDays), title: testDays <= 0 ? 'טסט פג תוקף!' : 'טסט עומד לפוג', subtitle: label, daysLeft: testDays, date: v.test_expiry, link: vehicleLink });
        }

        const insDays = getDaysLeft(v.insurance_expiry);
        if (insDays !== null && insDays <= 30) {
          allAlerts.push({ id: `ins-${v.id}`, category: 'insurance', severity: getSeverity(insDays), title: insDays <= 0 ? 'ביטוח חובה פג!' : 'ביטוח חובה עומד לפוג', subtitle: label, daysLeft: insDays, date: v.insurance_expiry, link: vehicleLink });
        }

        const compDays = getDaysLeft(v.comprehensive_insurance_expiry);
        if (compDays !== null && compDays <= 30) {
          allAlerts.push({ id: `comp-${v.id}`, category: 'comprehensive_insurance', severity: getSeverity(compDays), title: compDays <= 0 ? 'ביטוח מקיף פג!' : 'ביטוח מקיף עומד לפוג', subtitle: label, daysLeft: compDays, date: v.comprehensive_insurance_expiry, link: vehicleLink });
        }
      }
    }

    // 2. Driver license expiries
    const { data: drivers } = await applyCompanyScope(supabase.from('drivers').select('*'), companyFilter);
    if (drivers) {
      for (const d of drivers) {
        const licDays = getDaysLeft(d.license_expiry);
        if (licDays !== null && licDays <= 30) {
          allAlerts.push({ id: `lic-${d.id}`, category: 'license', severity: getSeverity(licDays), title: licDays <= 0 ? 'רישיון נהיגה פג!' : 'רישיון עומד לפוג', subtitle: d.full_name, daysLeft: licDays, date: d.license_expiry, meta: d.phone || undefined, link: '/drivers' });
        }
      }
    }

    // 2b. Driver exam expiry
    if (drivers) {
      for (const d of drivers) {
        const examExpiry = (d as any).exam_expiry;
        if (examExpiry) {
          const examDays = getDaysLeft(examExpiry);
          if (examDays !== null && examDays <= 30) {
            allAlerts.push({ id: `exam-${d.id}`, category: 'license', severity: getSeverity(examDays), title: examDays <= 0 ? 'תוקף מבחן נהיגה פג!' : 'מבחן נהיגה עומד לפוג', subtitle: d.full_name, daysLeft: examDays, date: examExpiry, meta: d.phone || undefined, link: '/drivers' });
          }
        }
      }
    }


    const { data: faults } = await applyCompanyScope(
      supabase.from('faults').select('*').in('urgency', ['urgent', 'high', 'critical', 'דחוף', 'גבוהה']).in('status', ['new', 'open', 'חדש', 'פתוח', 'בטיפול', 'in_progress']),
      companyFilter
    );
    if (faults) {
      for (const f of faults as any[]) {
        const v = f.vehicle_id ? vehicleById[f.vehicle_id] : (f.vehicle_plate ? vehicleByPlate[f.vehicle_plate] : null);
        const internal = v?.internal_number ? ` | פנימי ${v.internal_number}` : '';
        const link = v ? `/vehicles?vehicleId=${v.id}` : '/faults';
        allAlerts.push({ id: `fault-${f.id}`, category: 'fault', severity: 'critical', title: `תקלה דחופה - ${f.fault_type || 'כללי'}`, subtitle: `${f.vehicle_plate || 'ללא רכב'}${internal} • ${f.driver_name || 'ללא נהג'}`, daysLeft: null, date: f.date ? new Date(f.date).toISOString().split('T')[0] : null, meta: f.description || undefined, link });
      }
    }

    // 3b. Open vehicle defects (inspection findings)
    const { data: vehicleTasks } = await applyCompanyScope(
      supabase.from('vehicle_tasks').select('*').in('status', ['open', 'in_progress']),
      companyFilter
    );
    if (vehicleTasks) {
      for (const vt of vehicleTasks as any[]) {
        const daysSince = Math.floor((Date.now() - new Date(vt.created_at).getTime()) / (1000 * 60 * 60 * 24));
        const isOverdue = vt.follow_up_date && new Date(vt.follow_up_date) < new Date();
        const severity: AlertSeverity = isOverdue ? 'critical' : daysSince > 7 ? 'warning' : 'info';
        const v = vt.vehicle_id ? vehicleById[vt.vehicle_id] : (vt.vehicle_plate ? vehicleByPlate[vt.vehicle_plate] : null);
        const internal = v?.internal_number ? ` | פנימי ${v.internal_number}` : '';
        const link = v ? `/vehicles?vehicleId=${v.id}` : '/vehicle-tasks';
        allAlerts.push({
          id: `defect-${vt.id}`,
          category: 'fault',
          severity,
          title: isOverdue ? `ליקוי באיחור: ${vt.title}` : `ליקוי פתוח: ${vt.title}`,
          subtitle: `רכב ${vt.vehicle_plate || '—'}${internal} • ${daysSince} ימים`,
          daysLeft: vt.follow_up_date ? Math.floor((new Date(vt.follow_up_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
          date: vt.created_at?.split('T')[0] || null,
          meta: vt.description || undefined,
          link,
        });
      }
    }

    // 4. Service orders - pending / urgent
    const { data: serviceOrders } = await applyCompanyScope(
      supabase.from('service_orders').select('*').in('treatment_status', ['new', 'pending_approval', 'in_progress']),
      companyFilter
    );
    if (serviceOrders) {
      for (const so of serviceOrders as any[]) {
        const isUrgent = so.urgency === 'urgent' || so.urgency === 'critical';
        const severity: AlertSeverity = isUrgent ? 'critical' : so.treatment_status === 'new' ? 'warning' : 'info';
        const v = so.vehicle_id ? vehicleById[so.vehicle_id] : (so.vehicle_plate ? vehicleByPlate[so.vehicle_plate] : null);
        const internal = v?.internal_number ? ` | פנימי ${v.internal_number}` : '';
        allAlerts.push({
          id: `so-${so.id}`,
          category: 'service_order',
          severity,
          title: isUrgent ? `קריאת שירות ותחזוקה דחופה` : `שירותים ותחזוקה ${so.treatment_status === 'new' ? 'חדשה' : 'בטיפול'}`,
          subtitle: `${so.vehicle_plate || 'ללא רכב'}${internal} • ${so.driver_name || 'ללא נהג'}`,
          daysLeft: null,
          date: so.created_at ? new Date(so.created_at).toISOString().split('T')[0] : null,
          meta: `${so.service_category || ''} ${so.description ? '- ' + so.description : ''}`.trim() || undefined,
          link: '/service-orders',
        });
      }
    }

    // 5. Work assignments - pending approval
    const { data: assignments } = await applyCompanyScope(
      supabase.from('work_assignments').select('*').in('status', ['pending', 'approved']),
      companyFilter
    );
    if (assignments) {
      for (const wa of assignments) {
        const isPending = wa.status === 'pending';
        allAlerts.push({
          id: `wa-${wa.id}`,
          category: 'work_assignment',
          severity: isPending ? 'warning' : 'info',
          title: isPending ? 'סידור עבודה ממתין לאישור' : 'סידור עבודה פעיל',
          subtitle: `${wa.driver_name || 'ללא נהג'} • ${wa.vehicle_plate || 'ללא רכב'}`,
          daysLeft: null,
          date: wa.scheduled_date || null,
          meta: wa.title || undefined,
          link: '/work-orders',
        });
      }
    }

    allAlerts.sort((a, b) => {
      const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
      const diff = severityOrder[a.severity] - severityOrder[b.severity];
      if (diff !== 0) return diff;
      return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
    });

    setAlerts(allAlerts);
    setAlertsLoading(false);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    const { data } = await supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(500);
    if (data) setLogs(data as LogEntry[]);
    setLogsLoading(false);
  };

  const filteredAlerts = alertFilter === 'all' ? alerts : alerts.filter(a => a.category === alertFilter);
  const alertCounts = {
    all: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
  };
  const categories: (AlertCategory | 'all')[] = ['all', 'test', 'insurance', 'comprehensive_insurance', 'license', 'fault', 'service_order', 'work_assignment'];

  const filteredLogs = logs.filter(l => {
    if (logSearch && !l.user_name.includes(logSearch) && !l.details.includes(logSearch) && !l.vehicle_plate.includes(logSearch) && !l.entity_id.includes(logSearch)) return false;
    if (logFilterCompany && l.company_name !== logFilterCompany) return false;
    if (logFilterDate && !l.created_at.startsWith(logFilterDate)) return false;
    if (logFilterEntity && l.entity_type !== logFilterEntity) return false;
    return true;
  });

  return (
    <div className="animate-fade-in space-y-4">
      <h1 className="page-header flex items-center gap-3 !mb-0">
        <Bell size={28} />
        התראות ועדכונים
      </h1>

      <Tabs defaultValue="alerts" dir="rtl">
        <TabsList className="w-full grid grid-cols-2 h-12">
          <TabsTrigger value="alerts" className="text-base font-bold gap-2">
            <Bell size={18} />
            התראות
            {alertCounts.all > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                {alertCounts.all}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="updates" className="text-base font-bold gap-2" disabled={!isSuperAdmin}>
            <ScrollText size={18} />
            עדכונים
          </TabsTrigger>
        </TabsList>

        {/* ─── Alerts Tab ─── */}
        <TabsContent value="alerts" className="space-y-4 mt-4">
          {/* Severity Counters */}
          <div className="flex items-center gap-3 flex-wrap">
            {alertCounts.critical > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground text-sm font-bold animate-pulse">
                {alertCounts.critical} קריטי
              </span>
            )}
            {alertCounts.warning > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-amber-500 text-white text-sm font-bold">
                {alertCounts.warning} אזהרה
              </span>
            )}
            <span className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm font-medium">
              {alertCounts.all} סה״כ
            </span>
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            {categories.map(cat => {
              const count = cat === 'all' ? alerts.length : alerts.filter(a => a.category === cat).length;
              if (cat !== 'all' && count === 0) return null;
              return (
                <button key={cat} onClick={() => setAlertFilter(cat)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${alertFilter === cat ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                  {cat === 'all' ? 'הכל' : categoryLabels[cat]} ({count})
                </button>
              );
            })}
          </div>

          {alertsLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            </div>
          )}

          {!alertsLoading && filteredAlerts.length === 0 && (
            <div className="card-elevated text-center py-16">
              <CheckCircle2 className="mx-auto mb-4 text-green-500" size={48} />
              <p className="text-xl font-bold text-foreground">הכל תקין! 🎉</p>
              <p className="text-muted-foreground mt-2">אין התראות פעילות כרגע</p>
            </div>
          )}

          {!alertsLoading && filteredAlerts.length > 0 && (
            <div className="space-y-3">
              {filteredAlerts.map(alert => {
                const Icon = categoryIcons[alert.category];
                return (
                  <div key={alert.id}
                    onClick={() => alert.link && navigate(alert.link)}
                    className={`rounded-2xl border-2 p-5 transition-all hover:shadow-md ${alert.link ? 'cursor-pointer' : ''} ${severityStyles[alert.severity]}`}>
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl ${severityBadge[alert.severity]}`}>
                        <Icon size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-bold text-lg">{alert.title}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${severityBadge[alert.severity]}`}>
                            {categoryLabels[alert.category]}
                          </span>
                        </div>
                        <p className="text-sm opacity-80 font-medium">{alert.subtitle}</p>
                        {alert.meta && <p className="text-sm opacity-60 mt-1 line-clamp-2">{alert.meta}</p>}
                        {alert.link && <p className="text-xs mt-2 opacity-70 underline">לחץ לצפייה →</p>}
                      </div>
                      <div className="text-left shrink-0">
                        {alert.daysLeft !== null && (
                          <div className="flex items-center gap-1.5">
                            <Clock size={16} />
                            <span className="font-bold text-lg">
                              {alert.daysLeft <= 0 ? 'פג!' : `${alert.daysLeft} ימים`}
                            </span>
                          </div>
                        )}
                        {alert.date && (
                          <p className="text-xs opacity-60 mt-1">
                            {new Date(alert.date).toLocaleDateString('he-IL')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Updates (System Logs) Tab ─── */}
        <TabsContent value="updates" className="space-y-4 mt-4">
          {!isSuperAdmin ? (
            <div className="card-elevated text-center py-16">
              <ScrollText size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-xl text-muted-foreground">אין לך הרשאה לצפות בעדכונים</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="חיפוש..."
                    className="w-full pr-10 p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" />
                </div>
                <select value={logFilterCompany} onChange={e => setLogFilterCompany(e.target.value)}
                  className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
                  <option value="">כל החברות</option>
                  {companies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={logFilterEntity} onChange={e => setLogFilterEntity(e.target.value)}
                  className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
                  <option value="">כל הסוגים</option>
                  {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="date" value={logFilterDate} onChange={e => setLogFilterDate(e.target.value)}
                  className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" />
              </div>

              <p className="text-sm text-muted-foreground">{filteredLogs.length} רשומות</p>

              {logsLoading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
              ) : filteredLogs.length === 0 ? (
                <div className="card-elevated text-center py-12 text-muted-foreground">אין עדכונים</div>
              ) : (
                <div className="space-y-2">
                  {filteredLogs.map(l => (
                    <div key={l.id} className="card-elevated text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold">{l.user_name || 'מערכת'}</span>
                            <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-bold">
                              {ACTION_LABELS[l.action_type] || l.action_type}
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground text-xs">
                              {ENTITY_LABELS[l.entity_type] || l.entity_type}
                            </span>
                            {l.channel !== 'system' && (
                              <span className="px-2 py-0.5 rounded-lg bg-accent text-accent-foreground text-xs">{l.channel}</span>
                            )}
                          </div>
                          {l.details && <p className="text-muted-foreground line-clamp-2">{l.details}</p>}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {l.company_name && <span className="flex items-center gap-1"><Building2 size={12} /> {l.company_name}</span>}
                            {l.vehicle_plate && <span className="flex items-center gap-1"><Car size={12} /> {l.vehicle_plate}</span>}
                            {l.old_status && l.new_status && <span>{l.old_status} → {l.new_status}</span>}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(l.created_at), 'dd/MM HH:mm', { locale: he })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
