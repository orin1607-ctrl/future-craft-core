import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { buildDriverDashboardUrl } from '@/lib/entityNavContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface DriverRow {
  id: string;
  full_name: string;
  company_name: string;
}

export default function DriverDashboardPicker({
  companyName,
  className,
}: {
  companyName: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !companyName) return;
    setLoading(true);
    supabase
      .from('drivers')
      .select('id, full_name, company_name')
      .eq('company_name', companyName)
      .order('full_name')
      .then(({ data }) => {
        setDrivers((data || []) as DriverRow[]);
        setLoading(false);
      });
  }, [open, companyName]);

  const filtered = drivers.filter(
    (d) => !search || d.full_name.includes(search) || d.company_name.includes(search),
  );

  const pick = (d: DriverRow) => {
    setOpen(false);
    setSearch('');
    navigate(buildDriverDashboardUrl({ driverId: d.id, driverName: d.full_name }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="default" className={className}>
          <LayoutDashboard size={18} className="ml-2" />
          פתח דשבורד נהג
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>בחר נהג — {companyName}</DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש נהג..."
            className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-input bg-background text-sm"
          />
        </div>
        {loading ? (
          <p className="text-center text-muted-foreground py-6 text-sm">טוען...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">אין נהגים בחברה זו</p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filtered.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => pick(d)}
                className="w-full text-right p-3 rounded-xl bg-muted/50 hover:bg-muted font-medium"
              >
                {d.full_name}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
