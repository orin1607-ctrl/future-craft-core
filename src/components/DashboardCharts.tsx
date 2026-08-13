import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart,
} from 'recharts';
import { TrendingUp, PieChart as PieIcon, Activity } from 'lucide-react';
import { applyExcludeArchivedVehicles } from '@/lib/vehicleArchive';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--destructive))',
  'hsl(210, 70%, 55%)',
  'hsl(150, 60%, 45%)',
  'hsl(45, 80%, 55%)',
  'hsl(280, 60%, 55%)',
  'hsl(0, 60%, 50%)',
  'hsl(180, 50%, 45%)',
];

interface Props {
  companyName: string;
  isSuperAdminView: boolean;
}

interface MonthlyExpense {
  month: string;
  total: number;
}

interface FaultByType {
  name: string;
  value: number;
}

interface VehicleStatusData {
  name: string;
  value: number;
}

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const STATUS_LABELS: Record<string, string> = {
  active: 'פעיל',
  inactive: 'לא פעיל',
  maintenance: 'בתחזוקה',
  in_service: 'בטיפול',
  disabled: 'מושבת',
};

export default function DashboardCharts({ companyName, isSuperAdminView }: Props) {
  const [monthlyExpenses, setMonthlyExpenses] = useState<MonthlyExpense[]>([]);
  const [faultsByType, setFaultsByType] = useState<FaultByType[]>([]);
  const [vehicleStatuses, setVehicleStatuses] = useState<VehicleStatusData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyName && !isSuperAdminView) return;
    loadChartData();
  }, [companyName]);

  const withScope = (query: any) =>
    companyName ? query.eq('company_name', companyName) : query;

  const loadChartData = async () => {
    setLoading(true);
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

    const [expensesRes, faultsRes, vehiclesRes] = await Promise.all([
      withScope(supabase.from('expenses').select('amount, date').gte('date', sixMonthsAgo)),
      withScope(supabase.from('faults').select('fault_type')),
      withScope(applyExcludeArchivedVehicles(supabase.from('vehicles').select('status'))),
    ]);

    // Monthly expenses
    const monthMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, 0);
    }
    (expensesRes.data || []).forEach((e) => {
      if (!e.date) return;
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthMap.has(key)) {
        monthMap.set(key, (monthMap.get(key) || 0) + (Number(e.amount) || 0));
      }
    });
    setMonthlyExpenses(
      Array.from(monthMap.entries()).map(([key, total]) => ({
        month: HEBREW_MONTHS[parseInt(key.split('-')[1]) - 1],
        total: Math.round(total),
      }))
    );

    // Faults by type
    const typeCount = new Map<string, number>();
    (faultsRes.data || []).forEach((f) => {
      const t = f.fault_type?.trim() || 'אחר';
      typeCount.set(t, (typeCount.get(t) || 0) + 1);
    });
    setFaultsByType(
      Array.from(typeCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, value]) => ({ name, value }))
    );

    // Vehicle statuses
    const statusCount = new Map<string, number>();
    (vehiclesRes.data || []).forEach((v) => {
      const s = v.status?.trim() || 'active';
      const label = STATUS_LABELS[s.toLowerCase()] || s;
      statusCount.set(label, (statusCount.get(label) || 0) + 1);
    });
    setVehicleStatuses(
      Array.from(statusCount.entries()).map(([name, value]) => ({ name, value }))
    );

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card-elevated p-6 h-64 animate-pulse bg-muted/30 rounded-2xl" />
        ))}
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-xl px-3 py-2 shadow-lg text-sm">
        <p className="font-semibold text-foreground">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-muted-foreground">
            {typeof p.value === 'number' ? `₪${p.value.toLocaleString()}` : p.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Activity size={18} className="text-primary" />
        גרפים ותרשימים
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Expenses Chart */}
        <div className="card-elevated p-4">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />
            הוצאות חודשיות (6 חודשים אחרונים)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyExpenses} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#expenseGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Vehicle Status Pie */}
        <div className="card-elevated p-4">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <PieIcon size={16} className="text-primary" />
            סטטוס רכבים
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={vehicleStatuses}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {vehicleStatuses.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, 'כמות']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Faults by Type */}
        <div className="card-elevated p-4 lg:col-span-2">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Activity size={16} className="text-destructive" />
            התפלגות תקלות לפי סוג
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={faultsByType} layout="vertical" margin={{ top: 5, right: 5, left: 60, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={80} />
                <Tooltip formatter={(value: number) => [value, 'כמות']} />
                <Bar dataKey="value" fill="hsl(var(--destructive))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
