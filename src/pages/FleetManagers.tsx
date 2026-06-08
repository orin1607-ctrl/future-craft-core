import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Search, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope, useCompanyFilter } from '@/hooks/useCompanyFilter';

interface FleetManagerRow {
  id: string;
  full_name: string;
  phone: string | null;
  company_name: string;
  email?: string;
}

export default function FleetManagers() {
  const companyFilter = useCompanyFilter();
  const [rows, setRows] = useState<FleetManagerRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FleetManagerRow | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'fleet_manager');
      const ids = (roles || []).map((r) => r.user_id);
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      let q = supabase.from('profiles').select('id, full_name, phone, company_name').in('id', ids);
      q = applyCompanyScope(q, companyFilter);
      const { data: profiles } = await q.order('full_name');

      const emailsRes = await supabase.functions.invoke('create-admin-user', {
        body: { action: 'list-users' },
      });
      const emailMap = new Map<string, string>();
      (emailsRes.data?.users || []).forEach((u: { id: string; email: string }) => {
        emailMap.set(u.id, u.email);
      });

      setRows(
        (profiles || []).map((p) => ({
          id: p.id,
          full_name: p.full_name || '—',
          phone: p.phone,
          company_name: p.company_name || '—',
          email: emailMap.get(p.id),
        })),
      );
      setLoading(false);
    };
    load();
  }, [companyFilter]);

  const filtered = rows.filter(
    (r) =>
      !search ||
      r.full_name.includes(search) ||
      r.company_name.includes(search) ||
      (r.phone || '').includes(search),
  );

  if (selected) {
    const m = selected;
    return (
      <div className="animate-fade-in pb-8">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-primary font-medium mb-4 min-h-[48px]"
        >
          <ArrowRight size={20} /> חזרה לרשימה
        </button>
        <div className="card-elevated">
          <h1 className="text-2xl font-bold mb-4">{m.full_name}</h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-base">
            <div>
              <span className="text-muted-foreground text-sm">חברה</span>
              <p className="font-bold">{m.company_name}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-sm">טלפון</span>
              <p className="font-bold">{m.phone || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-sm">אימייל</span>
              <p className="font-bold">{m.email || '—'}</p>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-border">
            <h2 className="font-bold mb-3">פעולות מנהל צי</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { to: '/customers', label: 'לקוחות' },
                { to: '/routes', label: 'מסלולים' },
                { to: '/work-orders', label: 'סידור עבודה' },
                { to: '/reports', label: 'דוחות חברה' },
                { to: '/suppliers', label: 'ספקים' },
                { to: '/approval-settings', label: 'הגדרות אישורים' },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="card-elevated py-3 px-4 text-sm font-bold text-center hover:border-primary/40 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-8">
      <Link to="/dashboard" className="text-primary text-sm font-medium inline-block mb-4">
        ← חזרה לדשבורד
      </Link>
      <h1 className="page-header flex items-center gap-3">
        <Building2 size={28} className="text-primary" />
        מנהלי צי
      </h1>
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם או חברה..."
          className="w-full pr-10 pl-4 py-3 rounded-xl border-2 border-input bg-background"
        />
      </div>
      {loading ? (
        <p className="text-muted-foreground text-center py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">אין מנהלי צי להצגה</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m)}
              className="w-full card-elevated text-right flex items-center justify-between gap-3 hover:border-primary/30 transition-colors min-h-[64px]"
            >
              <ArrowRight size={18} className="text-primary shrink-0 rotate-180" />
              <div className="flex-1">
                <p className="font-bold">{m.full_name}</p>
                <p className="text-sm text-muted-foreground">{m.company_name}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
