import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Eye, LayoutDashboard, Search, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buildDriverDashboardUrl } from '@/lib/entityNavContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PickUser {
  id: string;
  full_name: string;
  company_name: string;
}

export default function RoleViewLauncher() {
  const { user, impersonate } = useAuth();
  const navigate = useNavigate();
  const [fleetManagers, setFleetManagers] = useState<PickUser[]>([]);
  const [drivers, setDrivers] = useState<PickUser[]>([]);
  const [fmOpen, setFmOpen] = useState(false);
  const [driverOpen, setDriverOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user?.role !== 'super_admin') return;

    const load = async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id, role');
      const fmIds = (roles || []).filter((r) => r.role === 'fleet_manager').map((r) => r.user_id);
      const driverIds = (roles || []).filter((r) => r.role === 'driver').map((r) => r.user_id);

      const loadProfiles = async (ids: string[]) => {
        if (ids.length === 0) return [];
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, company_name')
          .in('id', ids)
          .order('full_name');
        return (data || []) as PickUser[];
      };

      const [fm, dr] = await Promise.all([loadProfiles(fmIds), loadProfiles(driverIds)]);
      setFleetManagers(fm);
      setDrivers(dr);
    };

    load();
  }, [user?.role]);

  if (user?.role !== 'super_admin') return null;

  const filterList = (list: PickUser[]) =>
    list.filter(
      (u) =>
        !search ||
        u.full_name.includes(search) ||
        u.company_name.includes(search),
    );

  const impersonateFleetManager = (u: PickUser) => {
    impersonate({
      id: u.id,
      email: '',
      full_name: u.full_name,
      phone: '',
      company_name: u.company_name,
      is_active: true,
      role: 'fleet_manager',
    });
    setFmOpen(false);
    setSearch('');
    navigate('/dashboard');
  };

  const openDriverDashboard = (u: PickUser) => {
    setDriverOpen(false);
    setSearch('');
    navigate(buildDriverDashboardUrl({ driverId: u.id, driverName: u.full_name }));
  };

  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-foreground border-b border-border pb-2 flex items-center gap-2">
        <Eye size={18} className="text-primary" />
        צפייה כמשתמש
      </h2>
      <p className="text-sm text-muted-foreground">
        בדיקת דשבורד מנהל צי או נהג — בדיוק כפי שהמשתמש רואה במערכת.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setFmOpen(true)}
          className="card-elevated text-right p-4 hover:border-primary/40 transition-colors min-h-[88px]"
        >
          <Building2 size={24} className="text-primary mb-2" />
          <p className="font-bold">צפייה כמנהל צי</p>
          <p className="text-sm text-muted-foreground">בחר מנהל צi — מעבר לדשבורד שלו</p>
        </button>
        <button
          type="button"
          onClick={() => setDriverOpen(true)}
          className="card-elevated text-right p-4 hover:border-primary/40 transition-colors min-h-[88px]"
        >
          <LayoutDashboard size={24} className="text-primary mb-2" />
          <p className="font-bold">צפייה כנהג</p>
          <p className="text-sm text-muted-foreground">בחר נהג — דשבורד נהג (צפייה מנהל)</p>
        </button>
      </div>

      <PickerDialog
        open={fmOpen}
        onOpenChange={setFmOpen}
        title="בחר מנהל צi"
        emptyLabel="אין מנהלי צi"
        items={filterList(fleetManagers)}
        search={search}
        onSearch={setSearch}
        onPick={impersonateFleetManager}
        pickLabel="צפייה כמנהל צi"
      />

      <PickerDialog
        open={driverOpen}
        onOpenChange={setDriverOpen}
        title="בחר נהג"
        emptyLabel="אין נהגים"
        items={filterList(drivers)}
        search={search}
        onSearch={setSearch}
        onPick={openDriverDashboard}
        pickLabel="פתח דשבורד נהג"
      />
    </section>
  );
}

function PickerDialog({
  open,
  onOpenChange,
  title,
  emptyLabel,
  items,
  search,
  onSearch,
  onPick,
  pickLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  emptyLabel: string;
  items: PickUser[];
  search: string;
  onSearch: (v: string) => void;
  onPick: (u: PickUser) => void;
  pickLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="חיפוש לפי שם או חברה..."
            className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-input bg-background text-sm"
          />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {items.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">{emptyLabel}</p>
          ) : (
            items.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted"
              >
                <Button type="button" size="sm" onClick={() => onPick(u)}>
                  {pickLabel}
                </Button>
                <div className="text-right flex-1 min-w-0">
                  <p className="font-bold truncate">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.company_name}</p>
                </div>
                <Users size={16} className="text-muted-foreground shrink-0" />
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
