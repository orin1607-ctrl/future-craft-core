import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Car,
  ClipboardList,
  FilePlus2,
  Route,
  UserPlus,
  Users,
  Wrench,
  ArrowRightLeft,
  Bell,
  Check,
  ChevronsUpDown,
  Eye,
  Plus,
} from 'lucide-react';
import { useAuth, type AppRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import DriverDashboard from '@/components/DriverDashboard';
import PrivateCustomerDashboard from '@/components/PrivateCustomerDashboard';
import DashboardCharts from '@/components/DashboardCharts';
import CreateUserModal from '@/components/CreateUserModal';
import CreateAlertModal from '@/components/CreateAlertModal';
import type { CreateUserFormState } from '@/components/CreateUserModal';
import { toast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

const OPEN_TREATMENT_STATUSES = ['new', 'open', 'in_progress', 'pending', 'חדש', 'פתוח', 'בטיפול'];
const MAINTENANCE_STATUSES = ['maintenance', 'in_service', 'בתחזוקה', 'בטיפול'];

interface SuperAdminStats {
  companiesCount: number;
  usersCount: number;
  emergencyOpenCount: number;
  vehiclesInTreatmentCount: number;
}

interface FleetVehiclePreview {
  id: string;
  manufacturer: string;
  model: string;
  year: number | null;
  odometer: number;
}

interface FleetStats {
  vehiclesCount: number;
  driversCount: number;
}

interface FleetAlertRow {
  key: string;
  label: string;
  count: number;
  link: string;
}


const isOpenStatus = (status: string | null | undefined) =>
  OPEN_TREATMENT_STATUSES.includes((status || '').toLowerCase()) ||
  OPEN_TREATMENT_STATUSES.includes(status || '');

const isClosedAccident = (status: string | null | undefined) => {
  const normalized = (status || '').toLowerCase();
  return normalized === 'closed' || status === 'סגור';
};

const daysUntil = (dateValue: string | null | undefined) => {
  if (!dateValue) return null;
  const diff = new Date(dateValue).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
};

export default function Dashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  if (!user) return null;

  if (user.role === 'driver') {
    return <DriverDashboard />;
  }

  if (user.role === 'private_customer') {
    return <PrivateCustomerDashboard />;
  }

  if (user.role === 'super_admin') {
    const isFleetMode = searchParams.get('mode') === 'fleet';
    const fleetCompany = searchParams.get('company') || '';

    if (isFleetMode) {
      return <FleetManagerDashboard isActingAsFleetManager preselectedCompany={fleetCompany} />;
    }

    return (
      <SuperAdminDashboard
        onEnterFleetMode={(company: string) => setSearchParams({ mode: 'fleet', company })}
      />
    );
  }

  return <FleetManagerDashboard isActingAsFleetManager={false} />;
}

function SuperAdminDashboard({ onEnterFleetMode }: { onEnterFleetMode: (company: string) => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [creatingUser, setCreatingUser] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showFleetCompanyPicker, setShowFleetCompanyPicker] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showCreateAlert, setShowCreateAlert] = useState(false);
  const [stats, setStats] = useState<SuperAdminStats>({
    companiesCount: 0,
    usersCount: 0,
    emergencyOpenCount: 0,
    vehiclesInTreatmentCount: 0,
  });
  const [form, setForm] = useState<CreateUserFormState>({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    companyName: '',
    role: 'fleet_manager',
    isActive: true,
    userNumber: '',
    noEmail: false,
  });
  const [createCompanyOptions, setCreateCompanyOptions] = useState<{ name: string; businessId: string }[]>([]);
  const [createCompanyPickerOpen, setCreateCompanyPickerOpen] = useState(false);
  

  useEffect(() => {
    const loadCompaniesForCreate = async () => {
      const [profilesRes, customersRes] = await Promise.all([
        supabase.from('profiles').select('company_name'),
        supabase.from('customers').select('name, company_name, business_id'),
      ]);
      // Merge company names from profiles and customer names
      const companySet = new Map<string, string>();
      // Add from profiles
      (profilesRes.data || []).forEach(r => {
        const name = r.company_name?.trim();
        if (name) companySet.set(name, '');
      });
      // Add from customers (name field = the actual customer/company name)
      (customersRes.data || []).forEach((c) => {
        const name = c.name?.trim();
        const companyName = c.company_name?.trim();
        const bid = c.business_id?.trim() || '';
        if (name) companySet.set(name, bid);
        if (companyName && companyName !== name) companySet.set(companyName, bid);
      });
      setCreateCompanyOptions(
        Array.from(companySet.entries()).map(([name, businessId]) => ({ name, businessId }))
      );
    };
    loadCompaniesForCreate();
  }, []);

  const loadSuperAdminStats = async () => {
    setLoading(true);

    const [profilesRes, usersCountRes, emergencyRes, treatmentVehiclesRes] = await Promise.all([
      supabase.from('profiles').select('company_name'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase
        .from('service_orders')
        .select('id', { count: 'exact', head: true })
        .ilike('vendor_name', '%דליה%')
        .in('treatment_status', OPEN_TREATMENT_STATUSES)
        .or('service_category.ilike.%חירום%,description.ilike.%חירום%'),
      supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'in_service'),
    ]);

    if (profilesRes.error || usersCountRes.error || emergencyRes.error || treatmentVehiclesRes.error) {
      toast({
        title: 'שגיאה בטעינת נתונים',
        description: 'לא הצלחנו לטעון את נתוני הדשבורד כרגע.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    const companies = new Set(
      (profilesRes.data || [])
        .map((row) => row.company_name?.trim())
        .filter((company): company is string => Boolean(company))
    );

    setStats({
      companiesCount: companies.size,
      usersCount: usersCountRes.count || 0,
      emergencyOpenCount: emergencyRes.count || 0,
      vehiclesInTreatmentCount: treatmentVehiclesRes.count || 0,
    });

    setLoading(false);
  };

  useEffect(() => {
    loadSuperAdminStats();
  }, []);

  const submitCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();

    if ((!form.noEmail && !form.email) || !form.password || !form.fullName || (form.role !== 'private_customer' && !form.companyName)) {
      toast({
        title: 'חסרים פרטים',
        description: 'יש למלא את כל השדות לפני יצירת המשתמש.',
        variant: 'destructive',
      });
      return;
    }
    if (form.noEmail && !form.phone) {
      toast({ title: 'חסר טלפון', description: 'כשאין אימייל, יש למלא מספר טלפון.', variant: 'destructive' });
      return;
    }

    // Check if phone already exists (warn but don't block)
    if (form.phone) {
      const { data: existingPhone } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('phone', form.phone)
        .limit(1);
      if (existingPhone && existingPhone.length > 0) {
        toast({
          title: '⚠️ מספר טלפון קיים',
          description: `מספר הטלפון כבר משויך ל-${existingPhone[0].full_name}. המשתמש ייווצר בכל זאת.`,
        });
      }
    }

    setCreatingUser(true);
    const effectiveEmail = form.noEmail
      ? `${form.phone.replace(/[^0-9]/g, '')}@nomail.fleet.local`
      : form.email;
    const { data, error } = await supabase.functions.invoke('create-admin-user', {
      body: {
        email: effectiveEmail,
        password: form.password,
        full_name: form.fullName,
        phone: form.phone,
        company_name: form.companyName,
        role: form.role,
        is_active: form.isActive,
        user_number: form.userNumber || null,
      },
    });
    setCreatingUser(false);

    if (error || data?.error) {
      const errMsg = data?.error || error?.message || '';
      let hebrewMsg = 'אירעה שגיאה לא צפויה.';
      if (errMsg.toLowerCase().includes('already registered') || errMsg.toLowerCase().includes('already been registered') || errMsg.toLowerCase().includes('unique')) {
        hebrewMsg = 'כתובת האימייל כבר קיימת במערכת. נסה כתובת אחרת.';
      } else if (errMsg) {
        hebrewMsg = errMsg;
      }
      toast({
        title: 'יצירת משתמש נכשלה',
        description: hebrewMsg,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'המשתמש נוצר בהצלחה',
      description: `מזהה משתמש: ${data?.user_id?.slice(0, 8) || '-'} | ניתן להתחבר עם הפרטים החדשים מיד.`,
    });

    setForm({ email: '', password: '', fullName: '', phone: '', companyName: '', role: 'fleet_manager', isActive: true, userNumber: '', noEmail: false });
    setShowCreateUserModal(false);
    loadSuperAdminStats();
  };

  const superAdminActions = [
    { label: 'פתיחת משתמש חדש', icon: UserPlus, action: () => setShowCreateUserModal(true), type: 'button' as const },
    { label: 'כניסה למנהל צי רכב', icon: ArrowRightLeft, action: () => setShowFleetCompanyPicker(true), type: 'button' as const },
    { label: 'דוחות כל החברות', icon: BarChart3, href: '/reports', type: 'link' as const },
    { label: 'ניהול הזמנות לקוחות', icon: ClipboardList, href: '/service-orders', type: 'link' as const },
    { label: 'ניהול חירום כל החברות', icon: AlertTriangle, href: '/emergency', type: 'link' as const },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black text-foreground">דשבורד מנהל על</h1>
        <p className="text-muted-foreground text-base">{user?.full_name}</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'חברות', value: stats.companiesCount, icon: Building2 },
          { label: 'משתמשים', value: stats.usersCount, icon: Users },
          { label: 'חירום פתוח (דליה)', value: stats.emergencyOpenCount, icon: AlertTriangle },
          { label: 'רכבים בטיפול בדליה', value: stats.vehiclesInTreatmentCount, icon: Wrench },
        ].map((card) => (
          <div key={card.label} className="card-elevated p-4">
            <div className="flex items-center justify-between">
              <card.icon size={18} className="text-primary" />
              <span className="text-2xl font-black text-foreground">{loading ? '...' : card.value}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{card.label}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        {superAdminActions.map((item) =>
          item.type === 'link' ? (
            <Link key={item.label} to={item.href!} className="big-action-btn bg-card text-foreground border border-border">
              <item.icon size={26} />
              <span>{item.label}</span>
            </Link>
          ) : (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className="w-full big-action-btn bg-card text-foreground border border-border"
            >
              <item.icon size={26} />
              <span>{item.label}</span>
            </button>
          )
        )}
      </section>

      {showCreateUserModal && (
        <CreateUserModal
          form={form}
          setForm={setForm}
          showCreatePassword={showCreatePassword}
          setShowCreatePassword={setShowCreatePassword}
          createCompanyOptions={createCompanyOptions}
          createCompanyPickerOpen={createCompanyPickerOpen}
          setCreateCompanyPickerOpen={setCreateCompanyPickerOpen}
          creatingUser={creatingUser}
          onSubmit={submitCreateUser}
          onClose={() => setShowCreateUserModal(false)}
          callerRole="super_admin"
          onCompanyCreated={(name) => {
            setCreateCompanyOptions(prev => [...prev, { name, businessId: '' }]);
            setForm(prev => ({ ...prev, companyName: name }));
          }}
        />
      )}

      {showFleetCompanyPicker && (
        <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-5">
            <h2 className="text-xl font-bold mb-4">בחירת חברה לצפייה כמנהל צי</h2>
            <Popover open={true} onOpenChange={() => {}}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full p-3 rounded-xl border border-input bg-background flex items-center justify-between text-right"
                >
                  <ChevronsUpDown size={16} className="text-muted-foreground shrink-0" />
                  <span className="flex-1 text-right">בחר חברה...</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[60]" align="start">
                <Command dir="rtl">
                  <CommandInput placeholder="חיפוש חברה..." />
                  <CommandList>
                    <CommandEmpty>לא נמצאו חברות</CommandEmpty>
                    <CommandGroup>
                      {createCompanyOptions.map((option) => (
                        <CommandItem
                          key={option.name}
                          value={`${option.name} ${option.businessId}`}
                          onSelect={() => {
                            setShowFleetCompanyPicker(false);
                            onEnterFleetMode(option.name);
                          }}
                          className="flex items-center justify-between"
                        >
                          <div className="flex-1 text-right">
                            <span className="font-medium">{option.name}</span>
                            {option.businessId && (
                              <span className="text-xs text-muted-foreground mr-2">({option.businessId})</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={() => setShowFleetCompanyPicker(false)}
              className="w-full mt-3 py-3 rounded-xl border border-input bg-background"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Floating + button for alerts */}
      <button
        onClick={() => setShowCreateAlert(true)}
        className="fixed bottom-24 left-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl hover:shadow-2xl transition-all flex items-center justify-center text-3xl font-bold hover:scale-110"
        title="יצירת התראה חדשה"
      >
        <Plus size={28} />
      </button>

      {showCreateAlert && (
        <CreateAlertModal onClose={() => setShowCreateAlert(false)} onCreated={() => {}} />
      )}
    </div>
  );
}

function FleetManagerDashboard({
  isActingAsFleetManager,
  preselectedCompany,
}: {
  isActingAsFleetManager: boolean;
  preselectedCompany?: string;
}) {
  const { user, impersonate } = useAuth();
  const isSuperAdminView = user?.role === 'super_admin' && isActingAsFleetManager;

  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState(preselectedCompany || user?.company_name || '');
  const [companyOptions, setCompanyOptions] = useState<{ name: string; businessId: string }[]>([]);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [driverOptions, setDriverOptions] = useState<{ id: string; full_name: string; phone: string }[]>([]);
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);
  const [stats, setStats] = useState<FleetStats>({ vehiclesCount: 0, driversCount: 0 });
  const [vehiclePreview, setVehiclePreview] = useState<FleetVehiclePreview[]>([]);
  const [alerts, setAlerts] = useState<FleetAlertRow[]>([]);

  useEffect(() => {
    if (!isSuperAdminView) {
      setSelectedCompany(user?.company_name || '');
      return;
    }

    const loadCompanies = async () => {
      const [profilesRes, customersRes] = await Promise.all([
        supabase.from('profiles').select('company_name'),
        supabase.from('customers').select('company_name, business_id'),
      ]);

      const companyNames = Array.from(
        new Set(
          (profilesRes.data || [])
            .map((row) => row.company_name?.trim())
            .filter((c): c is string => Boolean(c))
        )
      );

      const customerMap = new Map<string, string>();
      (customersRes.data || []).forEach((c) => {
        if (c.company_name?.trim()) {
          customerMap.set(c.company_name.trim(), c.business_id?.trim() || '');
        }
      });

      const options = companyNames.map((name) => ({
        name,
        businessId: customerMap.get(name) || '',
      }));

      setCompanyOptions(options);
      if (!selectedCompany && options.length > 0) {
        setSelectedCompany(options[0].name);
      }
    };

    loadCompanies();
  }, [isSuperAdminView, user?.company_name]);

  useEffect(() => {
    if (!user) return;
    if (isSuperAdminView && !selectedCompany) return;

    const loadFleetDashboard = async () => {
      setLoading(true);

      const withCompanyScope = (query: any) =>
        isSuperAdminView ? query.eq('company_name', selectedCompany) : query;

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [
        vehiclesRes,
        driversCountRes,
        faultsRes,
        accidentsRes,
        serviceOrdersRes,
        expensesRes,
      ] = await Promise.all([
        withCompanyScope(
          supabase
            .from('vehicles')
            .select('id, manufacturer, model, year, odometer, status, test_expiry, insurance_expiry, next_service_date, internal_number')
        ),
        withCompanyScope(supabase.from('drivers').select('*', { count: 'exact', head: true })),
        withCompanyScope(supabase.from('faults').select('id, status')),
        withCompanyScope(supabase.from('accidents').select('id, status')),
        withCompanyScope(
          supabase
            .from('service_orders')
            .select('id, service_category, treatment_status, service_date, vehicle_plate')
        ),
        withCompanyScope(supabase.from('expenses').select('id, amount').gte('date', monthStart)),
      ]);

      if (
        vehiclesRes.error ||
        driversCountRes.error ||
        faultsRes.error ||
        accidentsRes.error ||
        serviceOrdersRes.error ||
        expensesRes.error
      ) {
        toast({
          title: 'שגיאה בטעינת נתונים',
          description: 'לא הצלחנו לטעון את נתוני דשבורד מנהל הצי.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const vehicles = vehiclesRes.data || [];
      const faults = faultsRes.data || [];
      const accidents = accidentsRes.data || [];
      const serviceOrders = serviceOrdersRes.data || [];
      const expenses = expensesRes.data || [];

      const insuranceDue = vehicles.filter((vehicle) => {
        const days = daysUntil(vehicle.insurance_expiry);
        return days !== null && days <= 30;
      }).length;

      const testDue = vehicles.filter((vehicle) => {
        const days = daysUntil(vehicle.test_expiry);
        return days !== null && days <= 30;
      }).length;

      const inspectionDue = vehicles.filter((vehicle) => {
        const days = daysUntil(vehicle.next_service_date);
        return days !== null && days <= 30;
      }).length;

      const vehiclesInGarage = vehicles.filter((vehicle) =>
        MAINTENANCE_STATUSES.includes((vehicle.status || '').toLowerCase()) ||
        MAINTENANCE_STATUSES.includes(vehicle.status || '')
      ).length;

      const openFaults = faults.filter((fault) => isOpenStatus(fault.status)).length;
      const openAccidents = accidents.filter((accident) => !isClosedAccident(accident.status)).length;

      const expenseAmounts = expenses.map((item) => Number(item.amount) || 0).filter((value) => value > 0);
      const averageExpense = expenseAmounts.length
        ? expenseAmounts.reduce((sum, value) => sum + value, 0) / expenseAmounts.length
        : 0;
      const unusualExpenses = expenseAmounts.filter(
        (value) => value > Math.max(averageExpense * 1.8, 3000)
      ).length;

      setStats({
        vehiclesCount: vehicles.length,
        driversCount: driversCountRes.count || 0,
      });

      setVehiclePreview(
        vehicles.slice(0, 8).map((vehicle) => ({
          id: vehicle.id,
          manufacturer: vehicle.manufacturer || '-',
          model: vehicle.model || '-',
          year: vehicle.year,
          odometer: Number(vehicle.odometer) || 0,
        }))
      );

      setAlerts([
        { key: 'insurance', label: 'ביטוח מתקרב', count: insuranceDue, link: '/alerts' },
        { key: 'test', label: 'טסט מתקרב', count: testDue, link: '/alerts' },
        { key: 'inspection', label: 'ביקורת / טיפול מתקרב', count: inspectionDue, link: '/alerts' },
        { key: 'garage', label: 'רכב שנמצא כרגע במוסך', count: vehiclesInGarage, link: '/vehicles' },
        { key: 'faults', label: 'תקלות פתוחות', count: openFaults, link: '/faults' },
        { key: 'accidents', label: 'תאונות פתוחות', count: openAccidents, link: '/accidents' },
        { key: 'expenses', label: 'הוצאות חריגות', count: unusualExpenses, link: '/expenses' },
      ]);

      setLoading(false);
    };

    loadFleetDashboard();
  }, [user?.id, isSuperAdminView, selectedCompany]);

  const loadDrivers = async () => {
    const companyFilter = isSuperAdminView ? selectedCompany : user?.company_name || '';
    const { data } = await supabase
      .from('drivers')
      .select('id, full_name, phone')
      .eq('company_name', companyFilter)
      .order('full_name');
    setDriverOptions(data || []);
  };

  const handleOpenDriverPicker = async () => {
    await loadDrivers();
    setShowDriverPicker(true);
  };

  const handleSelectDriver = (driver: { id: string; full_name: string; phone: string }) => {
    setShowDriverPicker(false);
    // Create a UserProfile-like object for impersonation
    impersonate({
      id: driver.id,
      email: '',
      full_name: driver.full_name,
      phone: driver.phone || '',
      company_name: isSuperAdminView ? selectedCompany : user?.company_name || '',
      is_active: true,
      role: 'driver',
    });
  };

  // Fleet manager create user state
  const [showCreateAlert, setShowCreateAlert] = useState(false);
  const [showFleetCreateUser, setShowFleetCreateUser] = useState(false);
  const [fleetCreatingUser, setFleetCreatingUser] = useState(false);
  const [showFleetCreatePassword, setShowFleetCreatePassword] = useState(false);
  const [fleetForm, setFleetForm] = useState<CreateUserFormState>({
    email: '', password: '', fullName: '', phone: '',
    companyName: user?.company_name || '', role: 'driver', isActive: false, userNumber: '', noEmail: false,
  });
  const [fleetCompanyPickerOpen, setFleetCompanyPickerOpen] = useState(false);

  const fleetCompanyOptions = user?.company_name ? [{ name: user.company_name, businessId: '' }] : [];

  const submitFleetCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!fleetForm.noEmail && !fleetForm.email) || !fleetForm.password || !fleetForm.fullName) {
      toast({ title: 'חסרים פרטים', description: 'יש למלא את כל השדות.', variant: 'destructive' });
      return;
    }
    if (fleetForm.noEmail && !fleetForm.phone) {
      toast({ title: 'חסר טלפון', description: 'כשאין אימייל, יש למלא מספר טלפון.', variant: 'destructive' });
      return;
    }
    setFleetCreatingUser(true);
    const effectiveEmail = fleetForm.noEmail
      ? `${fleetForm.phone.replace(/[^0-9]/g, '')}@nomail.fleet.local`
      : fleetForm.email;
    const { data, error } = await supabase.functions.invoke('create-admin-user', {
      body: {
        email: effectiveEmail, password: fleetForm.password, full_name: fleetForm.fullName,
        phone: fleetForm.phone, company_name: user?.company_name || '',
        role: fleetForm.role, is_active: false, user_number: fleetForm.userNumber || null,
      },
    });
    setFleetCreatingUser(false);
    if (error || data?.error) {
      const errMsg = data?.error || error?.message || '';
      let hebrewMsg = 'אירעה שגיאה.';
      if (errMsg.toLowerCase().includes('already registered') || errMsg.toLowerCase().includes('unique')) {
        hebrewMsg = 'כתובת האימייל כבר קיימת במערכת.';
      } else if (errMsg) hebrewMsg = errMsg;
      toast({ title: 'יצירת משתמש נכשלה', description: hebrewMsg, variant: 'destructive' });
      return;
    }
    toast({ title: '✅ הבקשה נשלחה', description: 'המשתמש נוצר בסטטוס "ממתין לאישור". מנהל על יקבל התראה ויאשר.' });
    setFleetForm({ email: '', password: '', fullName: '', phone: '', companyName: user?.company_name || '', role: 'driver', isActive: false, userNumber: '', noEmail: false });
    setShowFleetCreateUser(false);
  };

  const fleetActions = useMemo(
    () => [
      { label: 'הצמדת נהג לרכב', icon: ArrowRightLeft, href: '/attach-car' },
      { label: 'הזמנת שירותים / השוואת מחירים', icon: ClipboardList, href: '/service-orders' },
      { label: 'דיווח תאונה', icon: AlertTriangle, href: '/accidents' },
      { label: 'היסטוריה – כל הרכבים בחברה', icon: Car, href: '/history' },
      { label: 'דוחות – של החברה בלבד', icon: BarChart3, href: '/reports' },
      { label: 'ניהול מסלול וסידור עבודה לנהגים', icon: Route, href: '/routes' },
      { label: 'צירוף לקוח חדש', icon: FilePlus2, href: '/customers' },
      { label: 'הצמדת נהג ללקוח בתוך סידור עבודה', icon: Users, href: '/work-orders' },
    ],
    []
  );

  return (
    <div className="animate-fade-in space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black text-foreground">דשבורד מנהל צי רכב</h1>
        <p className="text-muted-foreground text-base">{user?.full_name}</p>
        <p className="text-muted-foreground text-sm">
          חברה: {isSuperAdminView ? selectedCompany || 'בחר חברה' : user?.company_name || '-'}
        </p>
      </header>

      {isSuperAdminView && (
        <section className="card-elevated p-4">
          <label className="text-sm font-semibold text-muted-foreground block mb-2">בחירת חברה להצגת נתונים</label>
          <Popover open={companyPickerOpen} onOpenChange={setCompanyPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="w-full p-3 rounded-xl border border-input bg-background flex items-center justify-between text-right"
              >
                <ChevronsUpDown size={16} className="text-muted-foreground shrink-0" />
                <span className="flex-1 text-right">
                  {selectedCompany || 'בחר חברה...'}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command dir="rtl">
                <CommandInput placeholder="חיפוש לפי שם חברה או מספר..." />
                <CommandList>
                  <CommandEmpty>לא נמצאו חברות</CommandEmpty>
                  <CommandGroup>
                    {companyOptions.map((option) => (
                      <CommandItem
                        key={option.name}
                        value={`${option.name} ${option.businessId}`}
                        onSelect={() => {
                          setSelectedCompany(option.name);
                          setCompanyPickerOpen(false);
                        }}
                        className="flex items-center justify-between"
                      >
                        <Check size={16} className={cn("shrink-0", selectedCompany === option.name ? "opacity-100" : "opacity-0")} />
                        <div className="flex-1 text-right">
                          <span className="font-medium">{option.name}</span>
                          {option.businessId && (
                            <span className="text-xs text-muted-foreground mr-2">({option.businessId})</span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </section>
      )}

      <section className="card-elevated overflow-x-auto">
        <h2 className="text-lg font-bold mb-3">פרטי רכבים בצי</h2>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="py-2 text-right">יצרן</th>
              <th className="py-2 text-right">דגם</th>
              <th className="py-2 text-right">מודל</th>
              <th className="py-2 text-right">קילומטראז'</th>
            </tr>
          </thead>
          <tbody>
            {vehiclePreview.length > 0 ? (
              vehiclePreview.map((vehicle) => (
                <tr key={vehicle.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2">{vehicle.manufacturer}</td>
                  <td className="py-2">{vehicle.model}</td>
                  <td className="py-2">{vehicle.year || '-'}</td>
                  <td className="py-2">{vehicle.odometer.toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                  {loading ? 'טוען נתוני צי...' : 'אין נתוני רכבים להצגה'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-elevated p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">כמות רכבים</p>
            <p className="text-3xl font-black">{loading ? '...' : stats.vehiclesCount}</p>
          </div>
          <Link to="/vehicles" className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold">
            הוספת רכב
          </Link>
        </div>
        <div className="card-elevated p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">כמות נהגים</p>
            <p className="text-3xl font-black">{loading ? '...' : stats.driversCount}</p>
          </div>
          <Link to="/drivers" className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold">
            הוספת נהג
          </Link>
        </div>
      </section>

      <section className="card-elevated p-4">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Bell size={18} className="text-primary" />
          התראות דשבורד
        </h2>
        <div className="space-y-2">
          {alerts.map((alert) => (
            <Link
              key={alert.key}
              to={alert.link}
              className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-muted/50 transition-colors"
            >
              <span className="font-medium">{alert.label}</span>
              <span className={`text-sm font-bold ${alert.count > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {alert.count}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Custom Alert Modal */}
      {showCreateAlert && (
        <CreateAlertModal onClose={() => setShowCreateAlert(false)} onCreated={() => {}} />
      )}

      <DashboardCharts
        companyName={isSuperAdminView ? selectedCompany : (user?.company_name || '')}
        isSuperAdminView={isSuperAdminView}
      />

      {/* Floating + button for alerts */}
      <button
        onClick={() => setShowCreateAlert(true)}
        className="fixed bottom-24 left-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl hover:shadow-2xl transition-all flex items-center justify-center text-3xl font-bold hover:scale-110"
        title="יצירת התראה חדשה"
      >
        <Plus size={28} />
      </button>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fleetActions.map((action) => (
          <Link key={action.label} to={action.href} className="big-action-btn bg-card text-foreground border border-border">
            <action.icon size={24} />
            <span>{action.label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={handleOpenDriverPicker}
          className="big-action-btn bg-card text-foreground border border-border"
        >
          <Eye size={24} />
          <span>כניסה לדשבורד נהג</span>
        </button>
        <button
          type="button"
          onClick={() => setShowFleetCreateUser(true)}
          className="big-action-btn bg-card text-foreground border border-border"
        >
          <UserPlus size={24} />
          <span>פתיחת משתמש חדש</span>
        </button>
      </section>

      {showFleetCreateUser && (
        <CreateUserModal
          form={fleetForm}
          setForm={setFleetForm}
          showCreatePassword={showFleetCreatePassword}
          setShowCreatePassword={setShowFleetCreatePassword}
          createCompanyOptions={fleetCompanyOptions}
          createCompanyPickerOpen={fleetCompanyPickerOpen}
          setCreateCompanyPickerOpen={setFleetCompanyPickerOpen}
          creatingUser={fleetCreatingUser}
          onSubmit={submitFleetCreateUser}
          onClose={() => setShowFleetCreateUser(false)}
          callerRole="fleet_manager"
        />
      )}

      {showDriverPicker && (
        <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-5">
            <h2 className="text-xl font-bold mb-4">בחירת נהג לצפייה</h2>
            <Popover open={driverPickerOpen} onOpenChange={setDriverPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full p-3 rounded-xl border border-input bg-background flex items-center justify-between text-right"
                >
                  <ChevronsUpDown size={16} className="text-muted-foreground shrink-0" />
                  <span className="flex-1 text-right">בחר נהג...</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[60]" align="start">
                <Command dir="rtl">
                  <CommandInput placeholder="חיפוש לפי שם נהג..." />
                  <CommandList>
                    <CommandEmpty>לא נמצאו נהגים</CommandEmpty>
                    <CommandGroup>
                      {driverOptions.map((driver) => (
                        <CommandItem
                          key={driver.id}
                          value={driver.full_name}
                          onSelect={() => handleSelectDriver(driver)}
                          className="flex items-center justify-between"
                        >
                          <span className="flex-1 text-right font-medium">{driver.full_name}</span>
                          {driver.phone && (
                            <span className="text-xs text-muted-foreground mr-2">{driver.phone}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={() => setShowDriverPicker(false)}
              className="w-full mt-3 py-3 rounded-xl border border-input bg-background"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
