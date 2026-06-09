import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Car,
  ClipboardList,
  FileText,
  Phone,
  Shield,
  Wrench,
  Bell,
  Calendar,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Link as RouterLink } from 'react-router-dom';
import { EntityContextBanner } from '@/components/EntityContextBanner';
import { buildVehicleContextUrl } from '@/lib/entityNavContext';

interface AssignedVehicle {
  id: string;
  manufacturer: string;
  model: string;
  year: number | null;
  license_plate: string;
  vehicle_type: string;
  odometer: number;
  test_expiry: string | null;
  insurance_expiry: string | null;
  comprehensive_insurance_expiry: string | null;
}

interface DriverAlert {
  key: string;
  title: string;
  count?: number;
  severity: 'critical' | 'warning' | 'info';
  link: string;
  detail?: string;
}

const OPEN_TREATMENT_STATUSES = ['new', 'open', 'in_progress', 'pending', 'חדש', 'פתוח', 'בטיפול'];

interface PendingAssignment {
  id: string;
  title: string;
  scheduled_date: string | null;
  scheduled_time: string;
  status: string;
}

const daysUntil = (dateValue: string | null | undefined) => {
  if (!dateValue) return null;
  const diff = new Date(dateValue).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
};

const formatDate = (dateValue: string | null | undefined) => {
  if (!dateValue) return '—';
  return new Date(dateValue).toLocaleDateString('he-IL');
};

const isOpenStatus = (status: string | null | undefined) =>
  OPEN_TREATMENT_STATUSES.includes((status || '').toLowerCase()) ||
  OPEN_TREATMENT_STATUSES.includes(status || '');

const driverActions = [
  { label: 'דיווח תקלה', icon: Wrench, link: '/faults' },
  { label: 'דיווח תאונה', icon: AlertTriangle, link: '/accidents' },
  { label: 'הזמנת שירות', icon: ClipboardList, link: '/service-orders' },
  { label: 'העלאת חשבונית דלק / הוצאה', icon: FileText, link: '/expenses' },
  { label: 'היסטוריית טיפולים לרכב', icon: Car, link: '/history' },
  { label: 'סידור עבודה שלי', icon: ClipboardList, link: '/driver-schedule' },
  { label: 'יצירת קשר עם מוקד', icon: Phone, link: '/emergency' },
  { label: 'תצהיר נהג', icon: FileText, link: '/driver-declarations' },
];

function ExpiryBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-muted-foreground">לא הוזן</span>;
  if (days <= 0) return <span className="text-xs font-bold text-destructive">פג תוקף!</span>;
  if (days <= 14) return <span className="text-xs font-bold text-destructive">עוד {days} ימים</span>;
  if (days <= 30) return <span className="text-xs font-semibold text-warning">עוד {days} ימים</span>;
  return <span className="text-xs text-muted-foreground">עוד {days} ימים</span>;
}

export default function DriverDashboard({
  scopedDriverId,
  scopedDriverName,
  managerView = false,
}: {
  scopedDriverId?: string;
  scopedDriverName?: string;
  managerView?: boolean;
} = {}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [vehicle, setVehicle] = useState<AssignedVehicle | null>(null);
  const [alerts, setAlerts] = useState<DriverAlert[]>([]);
  const [pendingAssignments, setPendingAssignments] = useState<PendingAssignment[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [displayCompany, setDisplayCompany] = useState('');

  useEffect(() => {
    const subjectId = managerView ? scopedDriverId : user?.id;
    if (!subjectId) return;

    const loadDriverDashboard = async () => {
      setLoading(true);

      let driverFullName = managerView ? scopedDriverName || '' : user?.full_name || '';
      let driverCompany = user?.company_name || '';

      if (managerView && scopedDriverId) {
        const { data: driverRow } = await supabase
          .from('drivers')
          .select('full_name, company_name')
          .eq('id', scopedDriverId)
          .maybeSingle();
        if (driverRow) {
          driverFullName = driverRow.full_name || driverFullName;
          driverCompany = driverRow.company_name || driverCompany;
        }
      }

      setDisplayName(driverFullName);
      setDisplayCompany(driverCompany);

      let vehicleQuery = supabase
        .from('vehicles')
        .select(
          'id, manufacturer, model, year, license_plate, vehicle_type, odometer, test_expiry, insurance_expiry, comprehensive_insurance_expiry, company_name',
        )
        .eq('assigned_driver_id', subjectId);
      if (managerView && driverCompany) {
        vehicleQuery = vehicleQuery.eq('company_name', driverCompany);
      }

      const [vehicleRes, serviceOrdersRes, assignmentsRes, pendingExamsRes] = await Promise.all([
        vehicleQuery.limit(1),
        driverFullName
          ? supabase
              .from('service_orders')
              .select('id, service_category, treatment_status, vehicle_plate, driver_name')
              .eq('driver_name', driverFullName)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('work_assignments')
          .select('id, title, scheduled_date, scheduled_time, status, driver_id, driver_name')
          .eq('driver_id', subjectId)
          .in('status', ['pending_driver_approval', 'sent_to_driver', 'driver_approved', 'in_progress']),
        supabase
          .from('driving_exams')
          .select('id, status, exam_type, created_at')
          .eq('driver_id', subjectId)
          .in('status', ['sent', 'in_progress'])
          .order('created_at', { ascending: false }),
      ]);

      if (vehicleRes.error || serviceOrdersRes.error) {
        toast({ title: 'שגיאה בטעינת נתוני הדשבורד', description: 'לא הצלחנו לטעון נתונים כרגע.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      const v = vehicleRes.data?.[0] || null;
      const assignedVehicle: AssignedVehicle | null = v
        ? {
            id: v.id,
            manufacturer: v.manufacturer || '—',
            model: v.model || '—',
            year: v.year,
            license_plate: v.license_plate,
            vehicle_type: v.vehicle_type || '—',
            odometer: Number(v.odometer) || 0,
            test_expiry: v.test_expiry,
            insurance_expiry: v.insurance_expiry,
            comprehensive_insurance_expiry: v.comprehensive_insurance_expiry,
          }
        : null;
      setVehicle(assignedVehicle);

      // Build alerts
      const allOrders = (serviceOrdersRes.data || []).filter(
        (o) => !driverFullName || o.driver_name === driverFullName,
      );
      const openOrders = allOrders.filter((o) => isOpenStatus(o.treatment_status));
      const scopedOpenOrders = assignedVehicle
        ? openOrders.filter((o) => !o.vehicle_plate || o.vehicle_plate === assignedVehicle.license_plate)
        : openOrders;
      const periodicServiceOpen = scopedOpenOrders.filter((o) =>
        (o.service_category || '').toLowerCase().includes('תקופ')
      );

      const newAlerts: DriverAlert[] = [];
      const testDays = daysUntil(assignedVehicle?.test_expiry);
      const insuranceDays = daysUntil(assignedVehicle?.insurance_expiry);
      const compInsuranceDays = daysUntil(assignedVehicle?.comprehensive_insurance_expiry);

      if (testDays !== null && testDays <= 30) {
        newAlerts.push({
          key: 'test',
          title: testDays <= 0 ? 'טסט פג תוקף!' : `טסט בעוד ${testDays} ימים`,
          detail: `תפוגה: ${formatDate(assignedVehicle?.test_expiry)}`,
          severity: testDays <= 0 ? 'critical' : 'warning',
          link: '/alerts',
        });
      }

      if (insuranceDays !== null && insuranceDays <= 30) {
        newAlerts.push({
          key: 'insurance',
          title: insuranceDays <= 0 ? 'ביטוח חובה פג תוקף!' : `ביטוח חובה בעוד ${insuranceDays} ימים`,
          detail: `תפוגה: ${formatDate(assignedVehicle?.insurance_expiry)}`,
          severity: insuranceDays <= 0 ? 'critical' : 'warning',
          link: '/alerts',
        });
      }

      if (compInsuranceDays !== null && compInsuranceDays <= 30) {
        newAlerts.push({
          key: 'comp_insurance',
          title: compInsuranceDays <= 0 ? 'ביטוח מקיף פג תוקף!' : `ביטוח מקיף בעוד ${compInsuranceDays} ימים`,
          detail: `תפוגה: ${formatDate(assignedVehicle?.comprehensive_insurance_expiry)}`,
          severity: compInsuranceDays <= 0 ? 'critical' : 'warning',
          link: '/alerts',
        });
      }

      if (periodicServiceOpen.length > 0) {
        newAlerts.push({
          key: 'periodic_service',
          title: 'טיפול תקופתי מתקרב',
          count: periodicServiceOpen.length,
          severity: 'warning',
          link: assignedVehicle
            ? buildVehicleContextUrl('/service-orders', {
                plate: assignedVehicle.license_plate,
                vehicleId: assignedVehicle.id,
              })
            : '/service-orders',
        });
      }

      if (scopedOpenOrders.length > 0) {
        newAlerts.push({
          key: 'open_service_order',
          title: 'הזמנת שירות פתוחה לרכב',
          count: scopedOpenOrders.length,
          severity: 'info',
          link: assignedVehicle
            ? buildVehicleContextUrl('/service-orders', {
                plate: assignedVehicle.license_plate,
                vehicleId: assignedVehicle.id,
              })
            : '/service-orders',
        });
      }

      // Pending work assignments alert
      const pendingWA = (assignmentsRes.data || []).filter(
        (a) =>
          a.driver_id === subjectId &&
          (!driverFullName || !a.driver_name || a.driver_name === driverFullName),
      );
      setPendingAssignments(pendingWA as PendingAssignment[]);
      const awaitingApproval = pendingWA.filter(a => a.status === 'pending_driver_approval');
      if (awaitingApproval.length > 0) {
        newAlerts.push({
          key: 'pending_work',
          title: 'עבודות ממתינות לאישורך',
          count: awaitingApproval.length,
          severity: 'critical',
          link: '/work-orders',
        });
      }

      // Pending driving exams
      const pendingExams = pendingExamsRes.data || [];
      if (pendingExams.length > 0) {
        newAlerts.push({
          key: 'pending_exam',
          title: 'מבחן כשירות נהיגה ממתין למילוי',
          count: pendingExams.length,
          severity: 'critical',
          link: `/driving-exam/${pendingExams[0].id}`,
        });
      }

      setAlerts(newAlerts);
      setLoading(false);
    };

    loadDriverDashboard();
  }, [user?.id, user?.full_name, user?.company_name, managerView, scopedDriverId, scopedDriverName]);

  const testDays = daysUntil(vehicle?.test_expiry);
  const insuranceDays = daysUntil(vehicle?.insurance_expiry);
  const compInsuranceDays = daysUntil(vehicle?.comprehensive_insurance_expiry);

  return (
    <div className="animate-fade-in space-y-6">
      {managerView && scopedDriverId && (
        <>
          <RouterLink to={`/drivers?driverId=${scopedDriverId}`} className="text-primary text-sm font-medium inline-block">
            ← חזרה לכרטיס נהג
          </RouterLink>
          <EntityContextBanner label={`נהג: ${displayName || scopedDriverName || '—'}`} strict />
        </>
      )}
      <header className="space-y-1">
        <h1 className="text-3xl font-black text-foreground">{managerView ? 'דשבורד נהג (צפייה מנהל)' : 'דשבורד נהג'}</h1>
        <p className="text-muted-foreground">{displayName || user?.full_name}</p>
        <p className="text-muted-foreground text-sm">{displayCompany || user?.company_name}</p>
      </header>

      {/* Vehicle Info */}
      <section className="card-elevated p-4">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Car size={18} className="text-primary" />
          הרכב המשויך
        </h2>
        {vehicle ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">מספר רכב</p>
                <p className="font-bold text-base">{vehicle.license_plate}</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">יצרן</p>
                <p className="font-bold">{vehicle.manufacturer}</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">דגם</p>
                <p className="font-bold">{vehicle.model}</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">שנתון</p>
                <p className="font-bold">{vehicle.year || '—'}</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">סוג רכב</p>
                <p className="font-bold">{vehicle.vehicle_type}</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">קילומטראז׳</p>
                <p className="font-bold">{vehicle.odometer.toLocaleString()}</p>
              </div>
            </div>

            {/* Documents / Expiry dates */}
            <div className="border border-border rounded-xl p-3 space-y-2">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Calendar size={14} className="text-primary" />
                מסמכים ותוקף
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <span className="text-muted-foreground">טסט</span>
                  <div className="text-left">
                    <p className="text-xs">{formatDate(vehicle.test_expiry)}</p>
                    <ExpiryBadge days={testDays} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <span className="text-muted-foreground">ביטוח חובה</span>
                  <div className="text-left">
                    <p className="text-xs">{formatDate(vehicle.insurance_expiry)}</p>
                    <ExpiryBadge days={insuranceDays} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <span className="text-muted-foreground">ביטוח מקיף</span>
                  <div className="text-left">
                    <p className="text-xs">{formatDate(vehicle.comprehensive_insurance_expiry)}</p>
                    <ExpiryBadge days={compInsuranceDays} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">{managerView ? 'אין נתונים לנהג זה' : 'לא הוצמד רכב לנהג זה.'}</p>
        )}
      </section>

      {/* Alerts */}
      <section className="card-elevated p-4">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Bell size={18} className="text-primary" />
          התראות נהג
        </h2>
        {loading ? (
          <p className="text-muted-foreground">טוען התראות...</p>
        ) : alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <Link
                key={alert.key}
                to={alert.link}
                className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {alert.severity === 'critical' ? (
                    <AlertTriangle size={16} className="text-destructive" />
                  ) : (
                    <Shield size={16} className={alert.severity === 'warning' ? 'text-warning' : 'text-primary'} />
                  )}
                  <div>
                    <span className="font-medium">{alert.title}</span>
                    {alert.detail && <p className="text-xs text-muted-foreground">{alert.detail}</p>}
                  </div>
                </div>
                {typeof alert.count === 'number' && (
                  <span className="text-sm font-bold text-destructive">{alert.count}</span>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">אין התראות פתוחות כרגע.</p>
        )}
      </section>

      {/* Pending Work Assignments */}
      {pendingAssignments.length > 0 && (
        <section className="card-elevated p-4">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <ClipboardList size={18} className="text-primary" />
            עבודות פעילות
          </h2>
          <div className="space-y-2">
            {pendingAssignments.map(a => (
              <Link key={a.id} to="/work-orders"
                className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-muted/40 transition-colors">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.scheduled_date ? new Date(a.scheduled_date).toLocaleDateString('he-IL') : ''} {a.scheduled_time}
                  </p>
                </div>
                <span className={`text-xs font-bold ${a.status === 'pending_driver_approval' ? 'text-destructive' : 'text-primary'}`}>
                  {a.status === 'pending_driver_approval' ? '⏳ ממתין לאישורך' :
                   a.status === 'in_progress' ? '▶️ בביצוע' :
                   a.status === 'driver_approved' ? '✅ אושר' : '📤 נשלח'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Actions */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {driverActions.map((action) => {
          const scopedPaths = ['/faults', '/accidents', '/service-orders', '/expenses'];
          const link =
            managerView && vehicle && scopedPaths.includes(action.link)
              ? buildVehicleContextUrl(action.link, {
                  plate: vehicle.license_plate,
                  vehicleId: vehicle.id,
                  action: action.link === '/accidents' ? 'new' : undefined,
                })
              : action.link;
          return (
            <Link key={action.label} to={link} className="big-action-btn bg-card text-foreground border border-border">
              <action.icon size={24} />
              <span>{action.label}</span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
