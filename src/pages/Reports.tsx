import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Car, Users, FileText, Wrench, AlertTriangle, Download, Filter, ChevronDown, ChevronUp, ShoppingCart, TrendingUp, Package, Mail, MessageSquare, Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface RawData {
  vehicles: any[];
  drivers: any[];
  faults: any[];
  accidents: any[];
  expenses: any[];
  serviceOrders: any[];
  supplierOrders: any[];
}

const reportTypes = [
  { value: 'vehicles', label: 'סיכום רכבים' },
  { value: 'drivers', label: 'סיכום נהגים' },
  { value: 'expenses', label: 'הוצאות לפי תקופה' },
  { value: 'profit_loss', label: 'רווח והפסד' },
  { value: 'faults', label: 'טיפולים' },
  { value: 'accidents', label: 'תאונות' },
  { value: 'service_orders', label: 'הזמנות' },
  { value: 'vendors', label: 'סיכום לפי ספקים' },
];

export default function Reports() {
  const { user } = useAuth();
  const [raw, setRaw] = useState<RawData>({ vehicles: [], drivers: [], faults: [], accidents: [], expenses: [], serviceOrders: [], supplierOrders: [] });
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // Filter state
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [filterReportTypes, setFilterReportTypes] = useState<string[]>([]);
  const [filterVendor, setFilterVendor] = useState('');
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterDriver, setFilterDriver] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [vRes, dRes, fRes, aRes, eRes, soRes, woRes] = await Promise.all([
      supabase.from('vehicles').select('*'),
      supabase.from('drivers').select('*'),
      supabase.from('faults').select('*'),
      supabase.from('accidents').select('*'),
      supabase.from('expenses').select('*'),
      supabase.from('service_orders').select('*'),
      supabase.from('supplier_work_orders').select('*'),
    ]);
    setRaw({
      vehicles: vRes.data || [],
      drivers: dRes.data || [],
      faults: fRes.data || [],
      accidents: aRes.data || [],
      expenses: eRes.data || [],
      serviceOrders: soRes.data || [],
      supplierOrders: woRes.data || [],
    });
    setLoading(false);
  };

  const companies = useMemo(() => [...new Set(raw.vehicles.map(v => v.company_name).filter(Boolean))], [raw]);
  const vendors = useMemo(() => [...new Set([...raw.expenses.map(e => e.vendor), ...raw.serviceOrders.map(s => s.vendor_name)].filter(Boolean))], [raw]);
  const vehiclePlates = useMemo(() => [...new Set(raw.vehicles.map(v => v.license_plate).filter(Boolean))], [raw]);
  const driverNames = useMemo(() => [...new Set(raw.drivers.map(d => d.full_name).filter(Boolean))], [raw]);
  
  // Lookup: vehicle_plate → internal_number
  const plateToInternal = useMemo(() => {
    const map: Record<string, string> = {};
    raw.vehicles.forEach(v => { if (v.license_plate) map[v.license_plate] = v.internal_number || ''; });
    return map;
  }, [raw]);
  const getInternal = (plate: string | null) => plate ? (plateToInternal[plate] || '-') : '-';

  const filtered = useMemo(() => {
    const inDateRange = (dateStr: string | null) => {
      if (!dateStr) return true;
      const d = new Date(dateStr);
      if (filterDateFrom && d < filterDateFrom) return false;
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59, 999);
        if (d > to) return false;
      }
      return true;
    };
    const matchCompany = (c: string | null) => !filterCompany || c === filterCompany;
    const matchVehicle = (v: string | null) => !filterVehicle || v === filterVehicle;
    const matchDriver = (d: string | null) => !filterDriver || d === filterDriver;

    return {
      vehicles: raw.vehicles.filter(v => matchCompany(v.company_name) && matchVehicle(v.license_plate)),
      drivers: raw.drivers.filter(d => matchCompany(d.company_name) && matchDriver(d.full_name)),
      faults: raw.faults.filter(f => matchCompany(f.company_name) && matchVehicle(f.vehicle_plate) && matchDriver(f.driver_name) && inDateRange(f.date)),
      accidents: raw.accidents.filter(a => matchCompany(a.company_name) && matchVehicle(a.vehicle_plate) && matchDriver(a.driver_name) && inDateRange(a.date)),
      expenses: raw.expenses.filter(e => matchCompany(e.company_name) && matchVehicle(e.vehicle_plate) && matchDriver(e.driver_name) && inDateRange(e.date) && (!filterVendor || e.vendor === filterVendor)),
      serviceOrders: raw.serviceOrders.filter(s => matchCompany(s.company_name) && matchVehicle(s.vehicle_plate) && matchDriver(s.driver_name) && inDateRange(s.created_at) && (!filterVendor || s.vendor_name === filterVendor)),
      supplierOrders: raw.supplierOrders.filter(o => matchCompany(o.company_name) && inDateRange(o.created_at) && (!filterVendor || o.supplier_name === filterVendor)),
    };
  }, [raw, filterCompany, filterDateFrom, filterDateTo, filterVendor, filterVehicle, filterDriver]);

  const showReport = (type: string) => filterReportTypes.length === 0 || filterReportTypes.includes(type);
  const toggleReportType = (type: string) => setFilterReportTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);

  const clearFilters = () => {
    setFilterCompany('');
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setFilterReportTypes([]);
    setFilterVendor('');
    setFilterVehicle('');
    setFilterDriver('');
  };

  const hasActiveFilters = filterCompany || filterDateFrom || filterDateTo || filterReportTypes.length > 0 || filterVendor || filterVehicle || filterDriver;

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

  const totalSupplierOrdersAmount = useMemo(() =>
    filtered.supplierOrders.reduce((s: number, o: any) => s + (o.approved_amount || 0), 0), [filtered]);

  const CHART_COLORS = [
    'hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
    'hsl(var(--chart-4))', 'hsl(var(--chart-5))', '#6366f1', '#ec4899', '#14b8a6',
  ];

  // Build CSV content for export/share
  const buildReportText = () => {
    const lines: string[] = [];
    const dateStr = new Date().toLocaleDateString('he-IL');
    lines.push(`דוח דליה - ${dateStr}`);
    lines.push('');

    if (showReport('expenses') && filtered.expenses.length > 0) {
      lines.push('--- הוצאות ---');
      filtered.expenses.forEach(e => {
        lines.push(`${e.date ? new Date(e.date).toLocaleDateString('he-IL') : ''} | ${e.category || ''} | ${e.vendor || ''} | רכב: ${e.vehicle_plate || ''} | ${e.driver_name || ''} | ₪${(e.amount || 0).toLocaleString()}`);
      });
      lines.push(`סה"כ: ₪${totalExpenses.toLocaleString()}`);
      lines.push('');
    }
    if (showReport('faults') && filtered.faults.length > 0) {
      lines.push('--- תקלות ---');
      filtered.faults.forEach(f => {
        lines.push(`${f.date ? new Date(f.date).toLocaleDateString('he-IL') : ''} | ${f.fault_type || ''} | רכב: ${f.vehicle_plate || ''} | ${f.driver_name || ''} | ${f.status || ''}`);
      });
      lines.push('');
    }
    if (showReport('accidents') && filtered.accidents.length > 0) {
      lines.push('--- תאונות ---');
      filtered.accidents.forEach(a => {
        lines.push(`${a.date ? new Date(a.date).toLocaleDateString('he-IL') : ''} | רכב: ${a.vehicle_plate || ''} | ${a.driver_name || ''} | ₪${(a.estimated_cost || 0).toLocaleString()}`);
      });
      lines.push('');
    }
    if (showReport('vehicles')) {
      lines.push('--- רכבים ---');
      filtered.vehicles.forEach(v => {
        lines.push(`${v.license_plate || ''} | ${v.internal_number || ''} | ${v.manufacturer || ''} ${v.model || ''} | ${v.year || ''} | ${v.status === 'active' ? 'פעיל' : v.status || ''} | ${(v.odometer || 0).toLocaleString()} ק"מ`);
      });
      lines.push('');
    }
    return lines.join('\n');
  };

  const exportCSV = () => {
    const rows: string[][] = [];

    if (showReport('expenses') && filtered.expenses.length > 0) {
      rows.push(['--- הוצאות ---']);
      rows.push(['תאריך', 'קטגוריה', 'ספק', 'מספר רכב', 'מס\' פנימי', 'נהג', 'סכום', 'חשבונית']);
      filtered.expenses.forEach(e => rows.push([
        e.date ? new Date(e.date).toLocaleDateString('he-IL') : '',
        e.category || '', e.vendor || '', e.vehicle_plate || '', getInternal(e.vehicle_plate), e.driver_name || '',
        (e.amount || 0).toString(), e.invoice_number || '',
      ]));
      rows.push([]);
    }
    if (showReport('faults') && filtered.faults.length > 0) {
      rows.push(['--- תקלות ---']);
      rows.push(['תאריך', 'סוג', 'תיאור', 'מספר רכב', 'מס\' פנימי', 'נהג', 'סטטוס', 'דחיפות']);
      filtered.faults.forEach(f => rows.push([
        f.date ? new Date(f.date).toLocaleDateString('he-IL') : '',
        f.fault_type || '', f.description || '', f.vehicle_plate || '', getInternal(f.vehicle_plate), f.driver_name || '',
        f.status || '', f.urgency || '',
      ]));
      rows.push([]);
    }
    if (showReport('accidents') && filtered.accidents.length > 0) {
      rows.push(['--- תאונות ---']);
      rows.push(['תאריך', 'תיאור', 'מספר רכב', 'מס\' פנימי', 'נהג', 'מיקום', 'סטטוס', 'עלות']);
      filtered.accidents.forEach(a => rows.push([
        a.date ? new Date(a.date).toLocaleDateString('he-IL') : '',
        a.description || '', a.vehicle_plate || '', getInternal(a.vehicle_plate), a.driver_name || '',
        a.location || '', a.status || '', (a.estimated_cost || 0).toString(),
      ]));
      rows.push([]);
    }
    if (showReport('service_orders') && filtered.serviceOrders.length > 0) {
      rows.push(['--- שירותים ותחזוקה ---']);
      rows.push(['תאריך', 'קטגוריה', 'תיאור', 'מספר רכב', 'מס\' פנימי', 'נהג', 'ספק', 'סטטוס']);
      filtered.serviceOrders.forEach(s => rows.push([
        s.service_date ? new Date(s.service_date).toLocaleDateString('he-IL') : '',
        s.service_category || '', s.description || '', s.vehicle_plate || '', getInternal(s.vehicle_plate),
        s.driver_name || '', s.vendor_name || '', s.treatment_status || '',
      ]));
      rows.push([]);
    }
    if (showReport('vehicles')) {
      rows.push(['--- רכבים ---']);
      rows.push(['מספר רכב', 'מס\' פנימי', 'יצרן', 'דגם', 'שנה', 'סטטוס', 'ק"מ', 'חברה']);
      filtered.vehicles.forEach(v => rows.push([
        v.license_plate || '', v.internal_number || '', v.manufacturer || '', v.model || '',
        (v.year || '').toString(), v.status || '', (v.odometer || 0).toString(), v.company_name || '',
      ]));
      rows.push([]);
    }
    if (showReport('drivers')) {
      rows.push(['--- נהגים ---']);
      rows.push(['שם', 'טלפון', 'רישיון', 'תוקף רישיון', 'סטטוס']);
      filtered.drivers.forEach(d => rows.push([
        d.full_name || '', d.phone || '', d.license_number || '',
        d.license_expiry || '', d.status || '',
      ]));
    }

    if (rows.length === 0) rows.push(['אין נתונים להצגה']);

    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `דוח_דליה_${new Date().toLocaleDateString('he-IL')}.csv`;
    link.click();
  };

  const shareViaWhatsApp = () => {
    const text = buildReportText();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    setShareDialogOpen(false);
  };

  const shareViaEmail = () => {
    const text = buildReportText();
    const subject = `דוח דליה - ${new Date().toLocaleDateString('he-IL')}`;
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    setShareDialogOpen(false);
  };

  const copyToClipboard = () => {
    const text = buildReportText();
    navigator.clipboard.writeText(text).then(() => {
      toast.success('הדוח הועתק ללוח');
    });
    setShareDialogOpen(false);
  };

  if (loading) {
    return <div className="animate-fade-in text-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" /></div>;
  }

  const selectClass = "w-full p-3 text-base rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const toggleExpand = (key: string) => {
    setExpandedReport(expandedReport === key ? null : key);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header !mb-0 flex items-center gap-3"><BarChart3 size={28} /> דוחות כספיים ותפעוליים</h1>
        <div className="flex gap-2">
          <button onClick={() => setShareDialogOpen(true)} className="flex items-center gap-2 px-3 py-3 rounded-xl bg-muted text-foreground text-base font-bold min-h-[48px]">
            <Share2 size={20} />
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-base font-bold min-h-[48px]">
            <Download size={20} /> ייצוא
          </button>
        </div>
      </div>
      <p className="text-muted-foreground mb-4">
        {hasActiveFilters ? 'מציג נתונים מסוננים — ייצוא יכלול רק את הנתונים המוצגים' : 'סקירה כללית מבוססת נתונים חיים — סנן לצפייה ממוקדת'}
      </p>

      {/* Filter Toggle */}
      <button
        onClick={() => setFiltersOpen(!filtersOpen)}
        className={cn(
          "w-full flex items-center justify-between p-4 rounded-xl mb-4 text-lg font-bold transition-colors",
          hasActiveFilters ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        )}
      >
        <span className="flex items-center gap-2">
          <Filter size={20} />
          סינון מתקדם
          {hasActiveFilters && <span className="bg-primary-foreground/20 text-primary-foreground text-xs px-2 py-0.5 rounded-full">פעיל</span>}
        </span>
        {filtersOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {/* Filter Panel */}
      {filtersOpen && (
        <div className="card-elevated mb-6 space-y-4 animate-fade-in">
          {user?.role === 'super_admin' && (
            <div>
              <label className="block text-sm font-medium mb-1">חברה</label>
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className={selectClass}>
                <option value="">הכל</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">מתאריך</label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn(selectClass, "text-right", !filterDateFrom && "text-muted-foreground")}>
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
                  <button className={cn(selectClass, "text-right", !filterDateTo && "text-muted-foreground")}>
                    {filterDateTo ? format(filterDateTo, 'dd/MM/yyyy') : 'בחר...'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={filterDateTo} onSelect={setFilterDateTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">סוג דוח</label>
            <div className="flex flex-wrap gap-2">
              {reportTypes.map(rt => (
                <button key={rt.value} onClick={() => toggleReportType(rt.value)}
                  className={cn(
                    "px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all",
                    filterReportTypes.includes(rt.value) ? "border-primary bg-primary/10 text-primary" : "border-transparent bg-muted text-muted-foreground"
                  )}>{rt.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">ספק</label>
            <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className={selectClass}>
              <option value="">הכל</option>
              {vendors.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">רכב</label>
              <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className={selectClass}>
                <option value="">הכל</option>
                {vehiclePlates.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">נהג</label>
              <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)} className={selectClass}>
                <option value="">הכל</option>
                {driverNames.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="w-full py-3 rounded-xl bg-destructive/10 text-destructive font-bold text-base">
              ✕ נקה סינון
            </button>
          )}
        </div>
      )}

      {/* Report Cards - each with inline expandable table */}
      <div className="space-y-4">

        {/* Expenses */}
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
            table={filtered.expenses.length > 0 ? (
              <DetailTable headers={['תאריך', 'קטגוריה', 'ספק', 'מספר רכב', 'מס\' פנימי', 'נהג', 'סכום']}
                rows={filtered.expenses.map(e => [
                  e.date ? new Date(e.date).toLocaleDateString('he-IL') : '-',
                  e.category || '-', e.vendor || '-', e.vehicle_plate || '-', getInternal(e.vehicle_plate), e.driver_name || '-',
                  `₪${(e.amount || 0).toLocaleString()}`,
                ])} />
            ) : null}
          />
        )}

        {/* Vehicles */}
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
            table={filtered.vehicles.length > 0 ? (
              <DetailTable headers={['מספר רכב', 'מס\' פנימי', 'יצרן', 'דגם', 'שנה', 'סטטוס', 'ק"מ', 'חברה']}
                rows={filtered.vehicles.map(v => [
                  v.license_plate || '-', v.internal_number || '-', v.manufacturer || '-', v.model || '-',
                  (v.year || '-').toString(), v.status === 'active' ? 'פעיל' : v.status || '-',
                  (v.odometer || 0).toLocaleString(), v.company_name || '-',
                ])} />
            ) : null}
          />
        )}

        {/* Faults */}
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
            table={filtered.faults.length > 0 ? (
              <DetailTable headers={['תאריך', 'סוג', 'מספר רכב', 'מס\' פנימי', 'נהג', 'סטטוס', 'דחיפות']}
                rows={filtered.faults.map(f => [
                  f.date ? new Date(f.date).toLocaleDateString('he-IL') : '-',
                  f.fault_type || '-', f.vehicle_plate || '-', getInternal(f.vehicle_plate), f.driver_name || '-', f.status || '-', f.urgency || '-',
                ])} />
            ) : null}
          />
        )}

        {/* Accidents */}
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
            table={filtered.accidents.length > 0 ? (
              <DetailTable headers={['תאריך', 'תיאור', 'מספר רכב', 'מס\' פנימי', 'נהג', 'מיקום', 'עלות']}
                rows={filtered.accidents.map(a => [
                  a.date ? new Date(a.date).toLocaleDateString('he-IL') : '-',
                  a.description || '-', a.vehicle_plate || '-', getInternal(a.vehicle_plate), a.driver_name || '-',
                  a.location || '-', `₪${(a.estimated_cost || 0).toLocaleString()}`,
                ])} />
            ) : null}
          />
        )}

        {/* Drivers */}
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
            table={filtered.drivers.length > 0 ? (
              <DetailTable headers={['שם', 'טלפון', 'רישיון', 'תוקף', 'סטטוס']}
                rows={filtered.drivers.map(d => [
                  d.full_name || '-', d.phone || '-', d.license_number || '-',
                  d.license_expiry || '-', d.status === 'active' ? 'פעיל' : 'לא פעיל',
                ])} />
            ) : null}
          />
        )}

        {/* Service Orders */}
        {showReport('service_orders') && (
          <ExpandableReport
            expanded={expandedReport === 'service_orders'}
            onToggle={() => toggleExpand('service_orders')}
            card={
              <ReportCard title="דוח שירותים ותחזוקה" icon={ShoppingCart} color="bg-primary/10 text-primary"
                expanded={expandedReport === 'service_orders'}
                stats={[
                  { label: 'חדשות', value: filtered.serviceOrders.filter(s => s.treatment_status === 'new').length.toString() },
                  { label: 'בטיפול', value: filtered.serviceOrders.filter(s => s.treatment_status === 'in_progress').length.toString() },
                  { label: 'סה"כ', value: filtered.serviceOrders.length.toString() },
                ]}
              />
            }
            table={filtered.serviceOrders.length > 0 ? (
              <DetailTable headers={['תאריך', 'קטגוריה', 'מספר רכב', 'מס\' פנימי', 'נהג', 'ספק', 'סטטוס']}
                rows={filtered.serviceOrders.map(s => [
                  s.service_date ? new Date(s.service_date).toLocaleDateString('he-IL') : '-',
                  s.service_category || '-', s.vehicle_plate || '-', getInternal(s.vehicle_plate), s.driver_name || '-',
                  s.vendor_name || '-', s.treatment_status || '-',
                ])} />
            ) : null}
          />
        )}

        {/* Profit & Loss */}
        {showReport('profit_loss') && (
          <ReportCard title="רווח והפסד" icon={TrendingUp} color="bg-primary/10 text-primary"
            stats={[
              { label: 'הוצאות', value: `₪${totalExpenses.toLocaleString()}` },
              { label: 'עלות תאונות', value: `₪${totalAccidentCost.toLocaleString()}` },
              { label: 'סה"כ עלויות', value: `₪${(totalExpenses + totalAccidentCost).toLocaleString()}` },
            ]}
          />
        )}

        {/* Vendor Summary */}
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
                {/* Bar Chart - Top suppliers by expense */}
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

                {/* Pie Chart - Distribution */}
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground mb-3">התפלגות הוצאות ספקים</h3>
                  <div style={{ width: '100%', height: 250 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={vendorSummary.slice(0, 6).map(([name, d]) => ({ name, value: d.total }))}
                          dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: any) => `${name.slice(0, 10)} (${(percent * 100).toFixed(0)}%)`}
                          fontSize={11}>
                          {vendorSummary.slice(0, 6).map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [`₪${v.toLocaleString()}`, 'סכום']} />
                        <Legend fontSize={12} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Detailed table */}
                <DetailTable headers={['ספק', 'הוצאות', 'הזמנות עבודה', 'סכום הזמנות', 'סה"כ']}
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

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>שיתוף דוח</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <button onClick={exportCSV}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-right">
              <Download size={22} className="text-primary flex-shrink-0" />
              <div>
                <p className="font-bold">ייצוא לקובץ CSV</p>
                <p className="text-xs text-muted-foreground">הורדת גיליון לפתיחה באקסל או Google Sheets</p>
              </div>
            </button>
            <button onClick={shareViaEmail}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-right">
              <Mail size={22} className="text-primary flex-shrink-0" />
              <div>
                <p className="font-bold">שליחה במייל</p>
                <p className="text-xs text-muted-foreground">פתיחת אפליקציית המייל עם תוכן הדוח</p>
              </div>
            </button>
            <button onClick={shareViaWhatsApp}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 transition-colors text-right">
              <MessageSquare size={22} className="text-[#25D366] flex-shrink-0" />
              <div>
                <p className="font-bold">שליחה בוואטסאפ</p>
                <p className="text-xs text-muted-foreground">שיתוף הדוח ישירות דרך WhatsApp</p>
              </div>
            </button>
            <button onClick={copyToClipboard}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-right">
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

// === Expandable Report Wrapper ===
function ExpandableReport({ expanded, onToggle, card, table }: {
  expanded: boolean;
  onToggle: () => void;
  card: React.ReactNode;
  table: React.ReactNode | null;
}) {
  return (
    <div>
      <div onClick={onToggle} className="cursor-pointer">
        {card}
      </div>
      {expanded && table && (
        <div className="animate-fade-in">
          {table}
        </div>
      )}
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
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", color)}><Icon size={24} /></div>
        <h2 className="text-xl font-bold flex-1">{title}</h2>
        {expanded ? <ChevronUp size={18} className="text-primary" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </div>
      <div className={cn("grid gap-4", stats.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
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

function DetailTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="card-elevated overflow-x-auto animate-fade-in -mt-2 border-t-2 border-primary/20">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {headers.map(h => <th key={h} className="py-2 px-3 text-right font-bold text-muted-foreground">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {row.map((cell, j) => <td key={j} className="py-2 px-3">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
