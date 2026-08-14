import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, Car, Users, FileText, Wrench, AlertTriangle, Download, Filter,
  ChevronDown, ChevronUp, ShoppingCart, TrendingUp, Package, Mail, MessageSquare,
  Share2, ShieldAlert, CalendarRange, ClipboardList,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { buildVehicleHubUrl, normalizePlate } from '@/lib/entityNavContext';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { SearchableFilterField } from '@/components/SearchableFilterField';
import { InternalNumber } from '@/components/vehicles/vehiclePlateDisplay';
import {
  type ReportPeriodMode,
  resolveReportPeriod,
  formatSummaryHeadline,
  dateInReportRange,
} from '@/lib/reportPeriod';
import {
  VEHICLE_EXPIRY_SELECT,
  buildVehicleRenewalEvents,
} from '@/lib/vehicleExpiryShared';

interface RawData {
  vehicles: any[];
  drivers: any[];
  faults: any[];
  accidents: any[];
  expenses: any[];
  serviceOrders: any[];
  supplierOrders: any[];
  inspections: any[];
}

const reportTypes = [
  { value: 'ops_tests', label: 'טסטים' },
  { value: 'ops_treatments', label: 'טיפולים' },
  { value: 'ops_accidents', label: 'תאונות' },
  { value: 'ops_officer_inspections', label: 'ביקורות קצין רכב' },
  { value: 'ops_insurance', label: 'ביטוחים לחידוש' },
  { value: 'vehicles', label: 'סיכום רכבים' },
  { value: 'drivers', label: 'סיכום נהגים' },
  { value: 'expenses', label: 'הוצאות לפי תקופה' },
  { value: 'profit_loss', label: 'רווח והפסד' },
  { value: 'faults', label: 'טיפולים (מפורט)' },
  { value: 'accidents', label: 'תאונות (מפורט)' },
  { value: 'service_orders', label: 'הזמנות' },
  { value: 'vendors', label: 'סיכום לפי ספקים' },
];

const STANDARD_HEADERS = ['מס\' פנימי', 'מספר רכב', 'חברה / לקוח', 'נהג', 'סוג האירוע', 'תאריך', 'סטטוס'];
const OFFICER_INSPECTION_HEADERS = [
  'מספר רכב',
  'מס׳ פנימי',
  'סוג הביקורת',
  'תאריך הביקורת',
  'מועד הביקורת הבאה',
  'סטטוס',
  'קישור לביקורת',
  'קישור לרכב',
];
const INSPECTION_SELECT = 'id,vehicle_id,vehicle_plate,inspection_type,inspection_date,next_due_date,overall_status,company_name';

function inspectionTypeLabel(t: string | null | undefined): string {
  if (t === 'tri_semi_annual') return 'תלת/חצי שנתית';
  if (t === 'quarterly') return 'רבעונית';
  if (t === 'semi_annual') return 'חצי שנתית';
  if (t === 'annual') return 'שנתית';
  return t || 'ביקורת';
}

const PERIOD_OPTIONS: { value: ReportPeriodMode; label: string }[] = [
  { value: 'month', label: 'חודש נוכחי' },
  { value: 'week', label: 'שבוע נוכחי' },
  { value: 'year', label: 'שנה נוכחית' },
  { value: 'custom', label: 'טווח תאריכים' },
  { value: 'all', label: 'הכל' },
];

const FAULT_SELECT = 'id,date,fault_type,description,vehicle_plate,driver_name,company_name,status,urgency';
const ACCIDENT_SELECT = 'id,date,description,vehicle_plate,driver_name,company_name,status,location,estimated_cost';
const EXPENSE_SELECT = 'id,date,category,vendor,vehicle_plate,driver_name,company_name,amount,invoice_number';
const SERVICE_SELECT = 'id,created_at,service_date,service_category,description,vehicle_plate,driver_name,company_name,vendor_name,treatment_status';
const DRIVER_SELECT = 'id,full_name,phone,license_number,license_expiry,status,company_name';
const SUPPLIER_SELECT = 'id,created_at,supplier_name,company_name,approved_amount,status';

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '-' : x.toLocaleDateString('he-IL');
}

function statusLabel(s: string | null | undefined): string {
  if (!s) return '-';
  if (s === 'active') return 'פעיל';
  if (s === 'inactive' || s === 'archived') return 'לא פעיל';
  if (s === 'in_service') return 'בטיפול';
  if (s === 'closed') return 'סגור';
  if (s === 'passed') return 'תקין';
  if (s === 'failed') return 'ליקויים';
  if (s === 'pending') return 'ממתין';
  if (s === 'new' || s === 'open') return 'פתוח';
  if (s === 'in_progress') return 'בתהליך';
  return s;
}

export default function Reports() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyFilter = useCompanyFilter();
  const [raw, setRaw] = useState<RawData>({
    vehicles: [], drivers: [], faults: [], accidents: [], expenses: [], serviceOrders: [], supplierOrders: [], inspections: [],
  });
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>('month');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [filterReportTypes, setFilterReportTypes] = useState<string[]>([]);
  const [filterVendor, setFilterVendor] = useState('');
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterInternal, setFilterInternal] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => { loadData(); }, [companyFilter]);

  const loadData = async () => {
    setLoading(true);
    const [vRes, dRes, fRes, aRes, eRes, soRes, woRes, iRes] = await Promise.all([
      applyCompanyScope(supabase.from('vehicles').select(VEHICLE_EXPIRY_SELECT), companyFilter),
      applyCompanyScope(supabase.from('drivers').select(DRIVER_SELECT), companyFilter),
      applyCompanyScope(supabase.from('faults').select(FAULT_SELECT), companyFilter),
      applyCompanyScope(supabase.from('accidents').select(ACCIDENT_SELECT), companyFilter),
      applyCompanyScope(supabase.from('expenses').select(EXPENSE_SELECT), companyFilter),
      applyCompanyScope(supabase.from('service_orders').select(SERVICE_SELECT), companyFilter),
      applyCompanyScope(supabase.from('supplier_work_orders').select(SUPPLIER_SELECT), companyFilter),
      supabase.from('vehicle_inspections').select(INSPECTION_SELECT),
    ]);
    const vehicles = vRes.data || [];
    const companyPlates = new Set(
      vehicles.map((v) => normalizePlate(v.license_plate || '')).filter(Boolean),
    );
    const inspections = (iRes.data || []).filter((i) => {
      if (!companyFilter) return true;
      if (i.company_name === companyFilter) return true;
      const p = normalizePlate(i.vehicle_plate || '');
      return !!p && companyPlates.has(p);
    });
    setRaw({
      vehicles,
      drivers: dRes.data || [],
      faults: fRes.data || [],
      accidents: aRes.data || [],
      expenses: eRes.data || [],
      serviceOrders: soRes.data || [],
      supplierOrders: woRes.data || [],
      inspections,
    });
    setLoading(false);
  };

  const period = useMemo(
    () => resolveReportPeriod(periodMode, filterDateFrom, filterDateTo),
    [periodMode, filterDateFrom, filterDateTo],
  );

  const companies = useMemo(
    () => [...new Set(raw.vehicles.map(v => v.company_name).filter(Boolean))],
    [raw.vehicles],
  );
  const vendors = useMemo(
    () => [...new Set([
      ...raw.expenses.map(e => e.vendor),
      ...raw.serviceOrders.map(s => s.vendor_name),
    ].filter(Boolean))],
    [raw],
  );
  const vehiclePlates = useMemo(
    () => [...new Set(raw.vehicles.map(v => v.license_plate).filter(Boolean))],
    [raw.vehicles],
  );
  const internalNumbers = useMemo(
    () => [...new Set(raw.vehicles.map(v => v.internal_number).filter(Boolean))],
    [raw.vehicles],
  );
  const driverNames = useMemo(
    () => [...new Set(raw.drivers.map(d => d.full_name).filter(Boolean))],
    [raw.drivers],
  );
  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    raw.faults.forEach(f => f.status && set.add(f.status));
    raw.accidents.forEach(a => a.status && set.add(a.status));
    raw.serviceOrders.forEach(s => s.treatment_status && set.add(s.treatment_status));
    raw.vehicles.forEach(v => v.status && set.add(v.status));
    raw.inspections.forEach(i => i.overall_status && set.add(i.overall_status));
    return [...set].sort();
  }, [raw]);

  const plateToInternal = useMemo(() => {
    const map: Record<string, string> = {};
    raw.vehicles.forEach(v => {
      if (!v.license_plate) return;
      map[v.license_plate] = v.internal_number || '';
      map[normalizePlate(v.license_plate)] = v.internal_number || '';
    });
    return map;
  }, [raw.vehicles]);
  const plateToCompany = useMemo(() => {
    const map: Record<string, string> = {};
    raw.vehicles.forEach(v => {
      if (!v.license_plate) return;
      map[v.license_plate] = v.company_name || '';
      map[normalizePlate(v.license_plate)] = v.company_name || '';
    });
    return map;
  }, [raw.vehicles]);
  const plateToVehicleId = useMemo(() => {
    const map: Record<string, string> = {};
    raw.vehicles.forEach(v => {
      if (!v.license_plate || !v.id) return;
      map[v.license_plate] = v.id;
      map[normalizePlate(v.license_plate)] = v.id;
    });
    return map;
  }, [raw.vehicles]);
  const getInternal = (plate: string | null | undefined) =>
    plate ? (plateToInternal[plate] || plateToInternal[normalizePlate(plate)] || '-') : '-';
  const getCompanyForPlate = (plate: string | null | undefined, fallback?: string | null) =>
    fallback || (plate ? plateToCompany[plate] : '') || '-';
  const getVehicleId = (plate: string | null | undefined, fallback?: string | null) =>
    fallback || (plate ? plateToVehicleId[plate] || plateToVehicleId[normalizePlate(plate)] : '') || '';
  const inspectionPath = (inspection: any) => {
    const vehicleId = getVehicleId(inspection.vehicle_plate, inspection.vehicle_id);
    const query = new URLSearchParams({ inspectionId: inspection.id });
    if (inspection.vehicle_plate) query.set('plate', inspection.vehicle_plate);
    if (vehicleId) query.set('vehicleId', vehicleId);
    query.set('context', 'vehicle');
    return `/vehicle-inspections?${query.toString()}`;
  };

  const driverById = useMemo(() => {
    const map: Record<string, string> = {};
    raw.drivers.forEach(d => { if (d.id) map[d.id] = d.full_name || ''; });
    return map;
  }, [raw.drivers]);

  const matchEntityFilters = (opts: {
    company?: string | null;
    plate?: string | null;
    internal?: string | null;
    driver?: string | null;
    status?: string | null;
  }) => {
    const company = filterCompany || (user?.role === 'super_admin' ? '' : (companyFilter || ''));
    if (company && opts.company && opts.company !== company) return false;
    if (company && !opts.company && opts.plate) {
      if (plateToCompany[opts.plate] && plateToCompany[opts.plate] !== company) return false;
    }
    if (filterVehicle) {
      const want = normalizePlate(filterVehicle);
      const got = normalizePlate(opts.plate || '');
      if (opts.plate !== filterVehicle && want !== got) return false;
    }
    if (filterInternal) {
      const internal =
        opts.internal ||
        (opts.plate ? plateToInternal[opts.plate] || plateToInternal[normalizePlate(opts.plate)] || '' : '');
      if (internal !== filterInternal) return false;
    }
    if (filterDriver && opts.driver !== filterDriver) return false;
    if (filterStatus && opts.status !== filterStatus) return false;
    return true;
  };

  const filtered = useMemo(() => {
    const from = period.from;
    const to = period.to;
    const matchCompany = (c: string | null) => {
      const company = filterCompany || (user?.role === 'super_admin' ? '' : '');
      return !company || c === company;
    };

    return {
      vehicles: raw.vehicles.filter(v =>
        matchEntityFilters({
          company: v.company_name,
          plate: v.license_plate,
          internal: v.internal_number,
          status: v.status,
        }),
      ),
      drivers: raw.drivers.filter(d =>
        matchCompany(d.company_name) &&
        (!filterDriver || d.full_name === filterDriver) &&
        (!filterStatus || d.status === filterStatus),
      ),
      faults: raw.faults.filter(f =>
        matchEntityFilters({
          company: f.company_name,
          plate: f.vehicle_plate,
          driver: f.driver_name,
          status: f.status,
        }) && dateInReportRange(f.date, from, to),
      ),
      accidents: raw.accidents.filter(a =>
        matchEntityFilters({
          company: a.company_name,
          plate: a.vehicle_plate,
          driver: a.driver_name,
          status: a.status,
        }) && dateInReportRange(a.date, from, to),
      ),
      expenses: raw.expenses.filter(e =>
        matchEntityFilters({
          company: e.company_name,
          plate: e.vehicle_plate,
          driver: e.driver_name,
        }) && dateInReportRange(e.date, from, to) &&
        (!filterVendor || e.vendor === filterVendor),
      ),
      serviceOrders: raw.serviceOrders.filter(s =>
        matchEntityFilters({
          company: s.company_name,
          plate: s.vehicle_plate,
          driver: s.driver_name,
          status: s.treatment_status,
        }) && dateInReportRange(s.service_date || s.created_at, from, to) &&
        (!filterVendor || s.vendor_name === filterVendor),
      ),
      supplierOrders: raw.supplierOrders.filter(o =>
        matchCompany(o.company_name) &&
        dateInReportRange(o.created_at, from, to) &&
        (!filterVendor || o.supplier_name === filterVendor) &&
        (!filterStatus || o.status === filterStatus),
      ),
      inspections: raw.inspections.filter(i =>
        matchEntityFilters({
          company: i.company_name || (i.vehicle_plate ? plateToCompany[i.vehicle_plate] || plateToCompany[normalizePlate(i.vehicle_plate)] : ''),
          plate: i.vehicle_plate,
          internal: i.vehicle_plate
            ? plateToInternal[i.vehicle_plate] || plateToInternal[normalizePlate(i.vehicle_plate)] || ''
            : '',
          status: i.overall_status,
        }) && (
          periodMode !== 'custom' ||
          dateInReportRange(i.inspection_date, from, to) ||
          dateInReportRange(i.next_due_date, from, to)
        ),
      ),
    };
  }, [
    raw, period, periodMode, filterCompany, filterVehicle, filterInternal, filterDriver,
    filterStatus, filterVendor, user?.role, companyFilter, plateToInternal, plateToCompany,
  ]);

  const testsInPeriod = useMemo(
    () => buildVehicleRenewalEvents(filtered.vehicles, {
      from: period.from,
      to: period.to,
      driverById,
      kinds: ['test'],
    }).filter(e => !filterDriver || e.driverName === filterDriver)
      .filter(e => !filterStatus || e.status === filterStatus),
    [filtered.vehicles, period, driverById, filterDriver, filterStatus],
  );

  const insuranceInPeriod = useMemo(
    () => buildVehicleRenewalEvents(filtered.vehicles, {
      from: period.from,
      to: period.to,
      driverById,
      kinds: ['insurance', 'comprehensive_insurance', 'third_party_insurance'],
    }).filter(e => !filterDriver || e.driverName === filterDriver)
      .filter(e => !filterStatus || e.status === filterStatus),
    [filtered.vehicles, period, driverById, filterDriver, filterStatus],
  );

  const showReport = (type: string) => filterReportTypes.length === 0 || filterReportTypes.includes(type);
  useEffect(() => {
    if (filterReportTypes.length === 1) setExpandedReport(filterReportTypes[0]);
  }, [filterReportTypes]);

  const toggleReportType = (type: string) => {
    setFilterReportTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
    setExpandedReport(type);
  };

  const clearFilters = () => {
    setPeriodMode('month');
    setFilterCompany('');
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setFilterReportTypes([]);
    setFilterVendor('');
    setFilterVehicle('');
    setFilterInternal('');
    setFilterDriver('');
    setFilterStatus('');
  };

  const hasActiveFilters = Boolean(
    filterCompany || filterDateFrom || filterDateTo || filterReportTypes.length > 0 ||
    filterVendor || filterVehicle || filterInternal || filterDriver || filterStatus ||
    periodMode !== 'month',
  );

  const totalExpenses = filtered.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalAccidentCost = filtered.accidents.reduce((s, a) => s + (a.estimated_cost || 0), 0);

  const vendorSummary = useMemo(() => {
    const map: Record<string, { count: number; total: number; workOrders: number; workOrderTotal: number }> = {};
    filtered.expenses.forEach(e => {
      if (!e.vendor) return;
      if (!map[e.vendor]) map[e.vendor] = { count: 0, total: 0, workOrders: 0, workOrderTotal: 0 };
      map[e.vendor].count++;
      map[e.vendor].total += e.amount || 0;
    });
    filtered.serviceOrders.forEach(s => {
      if (!s.vendor_name) return;
      if (!map[s.vendor_name]) map[s.vendor_name] = { count: 0, total: 0, workOrders: 0, workOrderTotal: 0 };
      map[s.vendor_name].count++;
    });
    filtered.supplierOrders.forEach(o => {
      const name = o.supplier_name;
      if (!name) return;
      if (!map[name]) map[name] = { count: 0, total: 0, workOrders: 0, workOrderTotal: 0 };
      map[name].workOrders++;
      map[name].workOrderTotal += o.approved_amount || 0;
      map[name].total += o.approved_amount || 0;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const totalSupplierOrdersAmount = useMemo(
    () => filtered.supplierOrders.reduce((s: number, o: any) => s + (o.approved_amount || 0), 0),
    [filtered],
  );

  const CHART_COLORS = [
    'hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
    'hsl(var(--chart-4))', 'hsl(var(--chart-5))', '#6366f1', '#ec4899', '#14b8a6',
  ];

  const standardRow = (r: {
    internal?: string; plate?: string; company?: string; driver?: string;
    eventType?: string; date?: string; status?: string;
  }) => [
    r.internal || '-',
    r.plate || '-',
    r.company || '-',
    r.driver || '-',
    r.eventType || '-',
    r.date || '-',
    r.status || '-',
  ];

  const buildReportText = () => {
    const lines: string[] = [`דוח דליה - ${new Date().toLocaleDateString('he-IL')}`, ''];
    lines.push(formatSummaryHeadline(testsInPeriod.length, 'טסטים', period.labelSuffix));
    lines.push(formatSummaryHeadline(filtered.faults.length, 'טיפולים', period.labelSuffix));
    lines.push(formatSummaryHeadline(filtered.accidents.length, 'תאונות', period.labelSuffix));
    lines.push(formatSummaryHeadline(insuranceInPeriod.length, 'ביטוחים לחידוש', period.labelSuffix));
    lines.push('');
    return lines.join('\n');
  };

  const exportCSV = () => {
    const rows: string[][] = [];
    const pushBlock = (title: string, dataRows: string[][], headers = STANDARD_HEADERS) => {
      rows.push([`--- ${title} ---`]);
      rows.push(headers);
      dataRows.forEach(r => rows.push(r));
      rows.push([]);
    };

    if (showReport('ops_tests')) {
      pushBlock('טסטים', testsInPeriod.map(e => standardRow({
        internal: e.internalNumber, plate: e.vehiclePlate, company: e.companyName,
        driver: e.driverName, eventType: e.eventType, date: fmtDate(e.date), status: e.status,
      })));
    }
    if (showReport('ops_treatments') || showReport('faults')) {
      pushBlock('טיפולים', filtered.faults.map(f => standardRow({
        internal: getInternal(f.vehicle_plate), plate: f.vehicle_plate,
        company: getCompanyForPlate(f.vehicle_plate, f.company_name),
        driver: f.driver_name, eventType: f.fault_type || 'טיפול', date: fmtDate(f.date),
        status: statusLabel(f.status),
      })));
    }
    if (showReport('ops_accidents') || showReport('accidents')) {
      pushBlock('תאונות', filtered.accidents.map(a => standardRow({
        internal: getInternal(a.vehicle_plate), plate: a.vehicle_plate,
        company: getCompanyForPlate(a.vehicle_plate, a.company_name),
        driver: a.driver_name, eventType: 'תאונה', date: fmtDate(a.date),
        status: statusLabel(a.status),
      })));
    }
    if (showReport('ops_officer_inspections')) {
      pushBlock(
        'ביקורות קצין רכב',
        filtered.inspections.map(i => {
          const vehicleId = getVehicleId(i.vehicle_plate, i.vehicle_id);
          return [
          i.vehicle_plate || '-',
          getInternal(i.vehicle_plate),
          inspectionTypeLabel(i.inspection_type),
          fmtDate(i.inspection_date),
          i.next_due_date ? fmtDate(i.next_due_date) : '—',
          statusLabel(i.overall_status),
          inspectionPath(i),
          vehicleId ? buildVehicleHubUrl(vehicleId) : '—',
          ];
        }),
        OFFICER_INSPECTION_HEADERS,
      );
    }
    if (showReport('ops_insurance')) {
      pushBlock('ביטוחים לחידוש', insuranceInPeriod.map(e => standardRow({
        internal: e.internalNumber, plate: e.vehiclePlate, company: e.companyName,
        driver: e.driverName, eventType: e.eventType, date: fmtDate(e.date), status: e.status,
      })));
    }

    if (rows.length === 0) rows.push(['אין נתונים להצגה']);
    const escapeCsv = (value: string) => {
      const raw = String(value ?? '');
      const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = '\uFEFF' + rows.map(r => r.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `דוח_דליה_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Keep the blob alive long enough for slower browsers/webviews to finish
    // handing the file to their download manager.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    toast.success('קובץ הדוח הורד בהצלחה');
  };

  const shareViaWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildReportText())}`, '_blank');
    setShareDialogOpen(false);
  };
  const shareViaEmail = () => {
    const subject = `דוח דליה - ${new Date().toLocaleDateString('he-IL')}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildReportText())}`, '_blank');
    setShareDialogOpen(false);
  };
  const copyToClipboard = () => {
    navigator.clipboard.writeText(buildReportText()).then(() => toast.success('הדוח הועתק ללוח'));
    setShareDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="animate-fade-in text-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
      </div>
    );
  }

  const selectClass = 'w-full p-3 text-base rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none';
  const toggleExpand = (key: string) => setExpandedReport(expandedReport === key ? null : key);

  const canPickCompany = user?.role === 'super_admin';

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header !mb-0 flex items-center gap-3">
          <BarChart3 size={28} /> דוחות וסיכומים
        </h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShareDialogOpen(true)} className="flex items-center gap-2 px-3 py-3 rounded-xl bg-muted text-foreground text-base font-bold min-h-[48px]">
            <Share2 size={20} />
          </button>
          <button type="button" onClick={exportCSV} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-base font-bold min-h-[48px]">
            <Download size={20} /> ייצוא
          </button>
        </div>
      </div>
      <p className="text-muted-foreground mb-4">
        סיכומים לפי תקופה — לחיצה על כרטיס פותחת את רשימת הרשומות המסוננת
      </p>

      <button
        type="button"
        onClick={() => setFiltersOpen(!filtersOpen)}
        className={cn(
          'w-full flex items-center justify-between p-4 rounded-xl mb-4 text-lg font-bold transition-colors',
          hasActiveFilters ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        )}
      >
        <span className="flex items-center gap-2">
          <Filter size={20} />
          סינון
          {hasActiveFilters && (
            <span className="bg-primary-foreground/20 text-primary-foreground text-xs px-2 py-0.5 rounded-full">פעיל</span>
          )}
        </span>
        {filtersOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {filtersOpen && (
        <div className="card-elevated mb-6 space-y-4 animate-fade-in">
          <div>
            <label className="block text-sm font-medium mb-1">תקופה</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PERIOD_OPTIONS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPeriodMode(p.value)}
                  className={cn(
                    'p-3 rounded-xl text-sm font-bold border-2 min-h-[48px]',
                    periodMode === p.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input bg-background',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {(periodMode === 'custom' || periodMode === 'all') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">מתאריך</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn(selectClass, 'text-right', !filterDateFrom && 'text-muted-foreground')}>
                      {filterDateFrom ? format(filterDateFrom, 'dd/MM/yyyy') : 'בחר...'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterDateFrom} onSelect={setFilterDateFrom} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">עד תאריך</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn(selectClass, 'text-right', !filterDateTo && 'text-muted-foreground')}>
                      {filterDateTo ? format(filterDateTo, 'dd/MM/yyyy') : 'בחר...'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterDateTo} onSelect={setFilterDateTo} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {canPickCompany && (
              <div>
                <label className="block text-sm font-medium mb-1">חברה / לקוח</label>
                <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className={selectClass}>
                  <option value="">הכל</option>
                  {companies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">מספר רכב</label>
              <SearchableFilterField
                value={filterVehicle}
                onChange={setFilterVehicle}
                options={vehiclePlates}
                placeholder="הכל / הקלידו לחיפוש..."
                searchPlaceholder="חיפוש מספר רכב..."
                emptyText="לא נמצא מספר רכב"
                triggerClassName={selectClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">מספר פנימי</label>
              <SearchableFilterField
                value={filterInternal}
                onChange={setFilterInternal}
                options={internalNumbers}
                placeholder="הכל / הקלידו לחיפוש..."
                searchPlaceholder="חיפוש מספר פנימי..."
                emptyText="לא נמצא מספר פנימי"
                triggerClassName={selectClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">נהג</label>
              <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)} className={selectClass}>
                <option value="">הכל</option>
                {driverNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">סטטוס</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectClass}>
                <option value="">הכל</option>
                {statusOptions.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                <option value="פג תוקף">פג תוקף</option>
                <option value="לחידוש">לחידוש</option>
                <option value="בתוקף">בתוקף</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ספק</label>
              <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className={selectClass}>
                <option value="">הכל</option>
                {vendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">סוגי דוח להצגה</label>
            <div className="flex flex-wrap gap-2">
              {reportTypes.map(rt => (
                <button
                  key={rt.value}
                  type="button"
                  onClick={() => toggleReportType(rt.value)}
                  className={cn(
                    'px-3 py-2 rounded-xl text-sm font-bold border',
                    filterReportTypes.includes(rt.value) || filterReportTypes.length === 0
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-muted border-transparent text-muted-foreground',
                  )}
                >
                  {rt.label}
                </button>
              ))}
            </div>
          </div>

          <button type="button" onClick={clearFilters} className="w-full p-3 rounded-xl bg-muted font-bold min-h-[48px]">
            נקה סינונים
          </button>
        </div>
      )}

      {/* Operational period summaries */}
      <div className="space-y-4 mb-8">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <CalendarRange size={20} /> סיכומי תקופה
        </h2>

        {showReport('ops_tests') && (
          <ExpandableReport
            expanded={expandedReport === 'ops_tests'}
            onToggle={() => toggleExpand('ops_tests')}
            card={
              <SummaryCard
                icon={Car}
                color="bg-primary/10 text-primary"
                headline={formatSummaryHeadline(testsInPeriod.length, 'טסטים', period.labelSuffix)}
                expanded={expandedReport === 'ops_tests'}
              />
            }
            table={
              <DetailTable
                headers={STANDARD_HEADERS}
                rows={testsInPeriod.map(e => standardRow({
                  internal: e.internalNumber, plate: e.vehiclePlate, company: e.companyName,
                  driver: e.driverName, eventType: e.eventType, date: fmtDate(e.date), status: e.status,
                }))}
              />
            }
          />
        )}

        {showReport('ops_treatments') && (
          <ExpandableReport
            expanded={expandedReport === 'ops_treatments'}
            onToggle={() => toggleExpand('ops_treatments')}
            card={
              <SummaryCard
                icon={Wrench}
                color="bg-warning/10 text-warning"
                headline={formatSummaryHeadline(filtered.faults.length, 'טיפולים', period.labelSuffix)}
                expanded={expandedReport === 'ops_treatments'}
              />
            }
            table={
              <DetailTable
                headers={STANDARD_HEADERS}
                rows={filtered.faults.map(f => standardRow({
                  internal: getInternal(f.vehicle_plate),
                  plate: f.vehicle_plate,
                  company: getCompanyForPlate(f.vehicle_plate, f.company_name),
                  driver: f.driver_name,
                  eventType: f.fault_type || 'טיפול',
                  date: fmtDate(f.date),
                  status: statusLabel(f.status),
                }))}
              />
            }
          />
        )}

        {showReport('ops_accidents') && (
          <ExpandableReport
            expanded={expandedReport === 'ops_accidents'}
            onToggle={() => toggleExpand('ops_accidents')}
            card={
              <SummaryCard
                icon={AlertTriangle}
                color="bg-destructive/10 text-destructive"
                headline={formatSummaryHeadline(filtered.accidents.length, 'תאונות', period.labelSuffix)}
                expanded={expandedReport === 'ops_accidents'}
              />
            }
            table={
              <DetailTable
                headers={STANDARD_HEADERS}
                rows={filtered.accidents.map(a => standardRow({
                  internal: getInternal(a.vehicle_plate),
                  plate: a.vehicle_plate,
                  company: getCompanyForPlate(a.vehicle_plate, a.company_name),
                  driver: a.driver_name,
                  eventType: 'תאונה',
                  date: fmtDate(a.date),
                  status: statusLabel(a.status),
                }))}
              />
            }
          />
        )}

        {showReport('ops_officer_inspections') && (
          <ExpandableReport
            expanded={expandedReport === 'ops_officer_inspections'}
            onToggle={() => toggleExpand('ops_officer_inspections')}
            card={
              <SummaryCard
                icon={ClipboardList}
                color="bg-primary/10 text-primary"
                headline={formatSummaryHeadline(
                  filtered.inspections.length,
                  'ביקורות קצין רכב',
                  periodMode === 'custom' ? period.labelSuffix : 'בכל הזמנים',
                )}
                expanded={expandedReport === 'ops_officer_inspections'}
                openLabel="פתח טבלת ביקורות קצין רכב"
              />
            }
            table={
              <>
                <p className="text-xs text-muted-foreground px-3 pb-2">
                  דוח זה מציג את כל הביקורות (כולל בלי מועד הבא). סינון תאריכים חל רק בבחירת «טווח תאריכים». מועד הבא חסר מוצג כ־—.
                </p>
                <DetailTable
                  headers={OFFICER_INSPECTION_HEADERS}
                  internalColumnIndex={1}
                  rows={filtered.inspections.map(i => [
                    i.vehicle_plate || '-',
                    getInternal(i.vehicle_plate) || '—',
                    inspectionTypeLabel(i.inspection_type),
                    fmtDate(i.inspection_date),
                    i.next_due_date ? fmtDate(i.next_due_date) : '—',
                    statusLabel(i.overall_status),
                    <button
                      key={`inspection-${i.id}`}
                      type="button"
                      className="font-bold text-primary underline"
                      onClick={() => navigate(inspectionPath(i))}
                    >
                      פתח ביקורת
                    </button>,
                    getVehicleId(i.vehicle_plate, i.vehicle_id) ? (
                      <button
                        key={`vehicle-${i.id}`}
                        type="button"
                        className="font-bold text-primary underline"
                        onClick={() => navigate(buildVehicleHubUrl(getVehicleId(i.vehicle_plate, i.vehicle_id)))}
                      >
                        פתח רכב
                      </button>
                    ) : '—',
                  ])}
                />
              </>
            }
          />
        )}

        {showReport('ops_insurance') && (
          <ExpandableReport
            expanded={expandedReport === 'ops_insurance'}
            onToggle={() => toggleExpand('ops_insurance')}
            card={
              <SummaryCard
                icon={ShieldAlert}
                color="bg-blue-500/10 text-blue-700 dark:text-blue-400"
                headline={formatSummaryHeadline(insuranceInPeriod.length, 'ביטוחים לחידוש', period.labelSuffix)}
                expanded={expandedReport === 'ops_insurance'}
              />
            }
            table={
              <DetailTable
                headers={STANDARD_HEADERS}
                rows={insuranceInPeriod.map(e => standardRow({
                  internal: e.internalNumber, plate: e.vehiclePlate, company: e.companyName,
                  driver: e.driverName, eventType: e.eventType, date: fmtDate(e.date), status: e.status,
                }))}
              />
            }
          />
        )}
      </div>

      {/* Existing financial / operational reports (unified columns) */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold">דוחות נוספים</h2>

        {showReport('expenses') && (
          <ExpandableReport
            expanded={expandedReport === 'expenses'}
            onToggle={() => toggleExpand('expenses')}
            card={
              <ReportCard title="דוח הוצאות כולל" icon={FileText} color="bg-primary/10 text-primary"
                expanded={expandedReport === 'expenses'}
                stats={[
                  { label: 'סה"כ הוצאות', value: `₪${totalExpenses.toLocaleString()}` },
                  { label: 'מספר חשבוניות', value: filtered.expenses.length.toString() },
                  { label: 'ממוצע לחשבונית', value: `₪${filtered.expenses.length > 0 ? Math.round(totalExpenses / filtered.expenses.length).toLocaleString() : 0}` },
                ]}
              />
            }
            table={
              <DetailTable
                headers={STANDARD_HEADERS}
                rows={filtered.expenses.map(e => standardRow({
                  internal: getInternal(e.vehicle_plate),
                  plate: e.vehicle_plate,
                  company: getCompanyForPlate(e.vehicle_plate, e.company_name),
                  driver: e.driver_name,
                  eventType: e.category || 'הוצאה',
                  date: fmtDate(e.date),
                  status: e.invoice_number ? `חשבונית ${e.invoice_number}` : '-',
                }))}
              />
            }
          />
        )}

        {showReport('vehicles') && (
          <ExpandableReport
            expanded={expandedReport === 'vehicles'}
            onToggle={() => toggleExpand('vehicles')}
            card={
              <ReportCard title="דוח רכבים" icon={Car} color="bg-primary/10 text-primary"
                expanded={expandedReport === 'vehicles'}
                stats={[
                  { label: 'רכבים פעילים', value: filtered.vehicles.filter(v => v.status === 'active').length.toString() },
                  { label: 'בטיפול', value: filtered.vehicles.filter(v => v.status === 'in_service').length.toString() },
                  { label: 'סה"כ רכבים', value: filtered.vehicles.length.toString() },
                ]}
              />
            }
            table={
              <DetailTable
                headers={STANDARD_HEADERS}
                rows={filtered.vehicles.map(v => standardRow({
                  internal: v.internal_number,
                  plate: v.license_plate,
                  company: v.company_name,
                  driver: v.assigned_driver_id ? driverById[v.assigned_driver_id] : '',
                  eventType: 'רכב',
                  date: '-',
                  status: statusLabel(v.status),
                }))}
              />
            }
          />
        )}

        {showReport('faults') && (
          <ExpandableReport
            expanded={expandedReport === 'faults'}
            onToggle={() => toggleExpand('faults')}
            card={
              <ReportCard title="דוח טיפולים / תקלות" icon={Wrench} color="bg-warning/10 text-warning"
                expanded={expandedReport === 'faults'}
                stats={[
                  { label: 'פתוחות', value: filtered.faults.filter(f => ['new', 'open', 'in_progress'].includes(f.status)).length.toString() },
                  { label: 'דחופות', value: filtered.faults.filter(f => ['urgent', 'critical'].includes(f.urgency)).length.toString() },
                  { label: 'סה"כ', value: filtered.faults.length.toString() },
                ]}
              />
            }
            table={
              <DetailTable
                headers={STANDARD_HEADERS}
                rows={filtered.faults.map(f => standardRow({
                  internal: getInternal(f.vehicle_plate),
                  plate: f.vehicle_plate,
                  company: getCompanyForPlate(f.vehicle_plate, f.company_name),
                  driver: f.driver_name,
                  eventType: f.fault_type || 'טיפול',
                  date: fmtDate(f.date),
                  status: statusLabel(f.status),
                }))}
              />
            }
          />
        )}

        {showReport('accidents') && (
          <ExpandableReport
            expanded={expandedReport === 'accidents'}
            onToggle={() => toggleExpand('accidents')}
            card={
              <ReportCard title="דוח תאונות" icon={AlertTriangle} color="bg-destructive/10 text-destructive"
                expanded={expandedReport === 'accidents'}
                stats={[
                  { label: 'פתוחות', value: filtered.accidents.filter(a => a.status !== 'closed').length.toString() },
                  { label: 'עלות משוערת', value: `₪${totalAccidentCost.toLocaleString()}` },
                  { label: 'סה"כ', value: filtered.accidents.length.toString() },
                ]}
              />
            }
            table={
              <DetailTable
                headers={STANDARD_HEADERS}
                rows={filtered.accidents.map(a => standardRow({
                  internal: getInternal(a.vehicle_plate),
                  plate: a.vehicle_plate,
                  company: getCompanyForPlate(a.vehicle_plate, a.company_name),
                  driver: a.driver_name,
                  eventType: 'תאונה',
                  date: fmtDate(a.date),
                  status: statusLabel(a.status),
                }))}
              />
            }
          />
        )}

        {showReport('drivers') && (
          <ExpandableReport
            expanded={expandedReport === 'drivers'}
            onToggle={() => toggleExpand('drivers')}
            card={
              <ReportCard title="דוח נהגים" icon={Users} color="bg-primary/10 text-primary"
                expanded={expandedReport === 'drivers'}
                stats={[
                  { label: 'פעילים', value: filtered.drivers.filter(d => d.status === 'active').length.toString() },
                  { label: 'לא פעילים', value: filtered.drivers.filter(d => d.status !== 'active').length.toString() },
                  { label: 'סה"כ', value: filtered.drivers.length.toString() },
                ]}
              />
            }
            table={
              <DetailTable
                headers={STANDARD_HEADERS}
                rows={filtered.drivers.map(d => standardRow({
                  internal: '-',
                  plate: '-',
                  company: d.company_name,
                  driver: d.full_name,
                  eventType: 'נהג',
                  date: fmtDate(d.license_expiry),
                  status: statusLabel(d.status),
                }))}
              />
            }
          />
        )}

        {showReport('service_orders') && (
          <ExpandableReport
            expanded={expandedReport === 'service_orders'}
            onToggle={() => toggleExpand('service_orders')}
            card={
              <ReportCard title="דוח הזמנות שירות" icon={ShoppingCart} color="bg-primary/10 text-primary"
                expanded={expandedReport === 'service_orders'}
                stats={[
                  { label: 'חדשות', value: filtered.serviceOrders.filter(s => s.treatment_status === 'new').length.toString() },
                  { label: 'בטיפול', value: filtered.serviceOrders.filter(s => s.treatment_status === 'in_progress').length.toString() },
                  { label: 'סה"כ', value: filtered.serviceOrders.length.toString() },
                ]}
              />
            }
            table={
              <DetailTable
                headers={STANDARD_HEADERS}
                rows={filtered.serviceOrders.map(s => standardRow({
                  internal: getInternal(s.vehicle_plate),
                  plate: s.vehicle_plate,
                  company: getCompanyForPlate(s.vehicle_plate, s.company_name),
                  driver: s.driver_name,
                  eventType: s.service_category || 'הזמנת שירות',
                  date: fmtDate(s.service_date || s.created_at),
                  status: statusLabel(s.treatment_status),
                }))}
              />
            }
          />
        )}

        {showReport('profit_loss') && (
          <ReportCard title="רווח והפסד" icon={TrendingUp} color="bg-primary/10 text-primary"
            stats={[
              { label: 'הוצאות', value: `₪${totalExpenses.toLocaleString()}` },
              { label: 'עלות תאונות', value: `₪${totalAccidentCost.toLocaleString()}` },
              { label: 'סה"כ עלויות', value: `₪${(totalExpenses + totalAccidentCost).toLocaleString()}` },
            ]}
          />
        )}

        {showReport('vendors') && (
          <ExpandableReport
            expanded={expandedReport === 'vendors'}
            onToggle={() => toggleExpand('vendors')}
            card={
              <ReportCard title="דוח ספקים מרכזי" icon={Package} color="bg-primary/10 text-primary"
                expanded={expandedReport === 'vendors'}
                stats={[
                  { label: 'ספקים פעילים', value: vendorSummary.length.toString() },
                  { label: 'הזמנות עבודה', value: filtered.supplierOrders.length.toString() },
                  { label: 'סה"כ הוצאות', value: `₪${totalSupplierOrdersAmount.toLocaleString()}` },
                ]}
              />
            }
            table={vendorSummary.length > 0 ? (
              <div className="card-elevated -mt-2 border-t-2 border-primary/20 space-y-6 animate-fade-in">
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground mb-3">הוצאות לפי ספק (₪)</h3>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={vendorSummary.slice(0, 8).map(([name, d]) => ({ name: name.length > 12 ? name.slice(0, 12) + '…' : name, total: d.total }))} layout="vertical" margin={{ right: 10, left: 0 }}>
                        <XAxis type="number" tickFormatter={(v: number) => `₪${v.toLocaleString()}`} fontSize={11} />
                        <YAxis type="category" dataKey="name" width={100} fontSize={12} tick={{ fill: 'hsl(var(--foreground))' }} />
                        <Tooltip formatter={(v: number) => [`₪${v.toLocaleString()}`, 'סכום']} />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground mb-3">התפלגות ספקים</h3>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={vendorSummary.slice(0, 6).map(([name, d]) => ({ name, value: d.total }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                          {vendorSummary.slice(0, 6).map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => `₪${v.toLocaleString()}`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <DetailTable
                  headers={['ספק', 'חשבוניות', 'הזמנות', 'סה"כ הזמנות', 'סה"כ']}
                  rows={vendorSummary.map(([name, d]) => [
                    name,
                    d.count.toString(),
                    d.workOrders.toString(),
                    `₪${d.workOrderTotal.toLocaleString()}`,
                    `₪${d.total.toLocaleString()}`,
                  ])}
                />
              </div>
            ) : null}
          />
        )}
      </div>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>שיתוף דוח</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <button type="button" onClick={exportCSV} className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-right">
              <Download size={22} className="text-primary flex-shrink-0" />
              <div>
                <p className="font-bold">ייצוא לקובץ CSV</p>
                <p className="text-xs text-muted-foreground">הורדת גיליון לפתיחה באקסל</p>
              </div>
            </button>
            <button type="button" onClick={shareViaEmail} className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-right">
              <Mail size={22} className="text-primary flex-shrink-0" />
              <div>
                <p className="font-bold">שליחה במייל</p>
                <p className="text-xs text-muted-foreground">פתיחת אפליקציית המייל עם תוכן הדוח</p>
              </div>
            </button>
            <button type="button" onClick={shareViaWhatsApp} className="w-full flex items-center gap-3 p-4 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 transition-colors text-right">
              <MessageSquare size={22} className="text-[#25D366] flex-shrink-0" />
              <div>
                <p className="font-bold">שליחה בוואטסאפ</p>
                <p className="text-xs text-muted-foreground">שיתוף הדוח ישירות דרך WhatsApp</p>
              </div>
            </button>
            <button type="button" onClick={copyToClipboard} className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-right">
              <Share2 size={22} className="text-primary flex-shrink-0" />
              <div>
                <p className="font-bold">העתק ללוח</p>
                <p className="text-xs text-muted-foreground">העתקת תוכן הדוח ללוח ההדבקה</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExpandableReport({ expanded, onToggle, card, table }: {
  expanded: boolean;
  onToggle: () => void;
  card: React.ReactNode;
  table: React.ReactNode | null;
}) {
  return (
    <div>
      <button type="button" onClick={onToggle} className="w-full text-right cursor-pointer">
        {card}
      </button>
      {expanded && table && (
        <div className="animate-fade-in" data-report-table>
          {table}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, color, headline, expanded, openLabel }: {
  icon: any;
  color: string;
  headline: string;
  expanded?: boolean;
  openLabel?: string;
}) {
  return (
    <div className="card-elevated hover:shadow-lg transition-shadow">
      <div className="flex items-center gap-3">
        <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shrink-0', color)}>
          <Icon size={24} />
        </div>
        <h2 className="text-xl font-bold flex-1 leading-snug">{headline}</h2>
        {expanded ? <ChevronUp size={18} className="text-primary shrink-0" /> : <ChevronDown size={18} className="text-muted-foreground shrink-0" />}
      </div>
      <p className="text-xs text-muted-foreground mt-2">{openLabel || 'לחצו לפתיחת הרשימה המסוננת'}</p>
    </div>
  );
}

function ReportCard({ title, icon: Icon, color, stats, expanded }: {
  title: string;
  icon: any;
  color: string;
  stats: { label: string; value: string }[];
  expanded?: boolean;
}) {
  return (
    <div className="card-elevated hover:shadow-lg transition-shadow">
      <div className="flex items-center gap-3 mb-4">
        <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center', color)}><Icon size={24} /></div>
        <h2 className="text-xl font-bold flex-1">{title}</h2>
        {expanded !== undefined && (
          expanded ? <ChevronUp size={18} className="text-primary" /> : <ChevronDown size={18} className="text-muted-foreground" />
        )}
      </div>
      <div className={cn('grid gap-4', stats.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
        {stats.map(stat => (
          <div key={stat.label} className="text-center">
            <p className="text-2xl font-black">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailTable({
  headers,
  rows,
  internalColumnIndex = 0,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  internalColumnIndex?: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="card-elevated -mt-2 border-t-2 border-primary/20 p-4 text-center text-muted-foreground animate-fade-in">
        אין רשומות לתקופה ולסינון שנבחרו
      </div>
    );
  }
  return (
    <div className="card-elevated -mt-2 border-t-2 border-primary/20 overflow-x-auto animate-fade-in">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {headers.map(h => (
              <th key={h} className="text-right p-3 font-bold text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/40">
              {row.map((cell, j) => (
                <td key={j} className="p-3 whitespace-nowrap">
                  {j === internalColumnIndex && typeof cell === 'string' && cell !== '-' && cell !== '—'
                    ? <InternalNumber value={cell} className="text-sm" />
                    : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground p-3">{rows.length} רשומות</p>
    </div>
  );
}
