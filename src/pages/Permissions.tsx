import { useState, useEffect } from 'react';
import { Shield, Building2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface UserWithRole {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  is_active: boolean;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  driver: 'נהג',
  fleet_manager: 'מנהל צי',
  super_admin: 'מנהל על',
  private_customer: 'לקוח פרטי',
  business_customer: 'לקוח עסקי',
  telemarketing_agent: 'נציג/ת טלמיטינג',
};

const ROLE_COLORS: Record<string, string> = {
  driver: 'bg-muted text-muted-foreground',
  fleet_manager: 'bg-primary/10 text-primary',
  super_admin: 'bg-destructive/10 text-destructive',
};

export default function Permissions() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterCompany, setFilterCompany] = useState<string>('');
  const [saving, setSaving] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: roles } = await supabase.from('user_roles').select('*');

    if (!profiles || !roles) {
      setLoading(false);
      return;
    }

    const roleMap = new Map<string, string>();
    roles.forEach((r: any) => roleMap.set(r.user_id, r.role as string));

    const merged: UserWithRole[] = profiles.map((p: any) => ({
      id: p.id,
      full_name: p.full_name || '',
      email: '',
      phone: p.phone || '',
      company_name: p.company_name || '',
      is_active: p.is_active ?? true,
      role: roleMap.get(p.id) || 'driver',
    }));

    setUsers(merged);
    setLoading(false);
  };

  const updateRole = async (userId: string, newRole: string) => {
    setSaving(userId);
    const { error } = await supabase
      .from('user_roles')
      .update({ role: newRole as any })
      .eq('user_id', userId);

    if (error) {
      toast.error('שגיאה בעדכון תפקיד');
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast.success('התפקיד עודכן בהצלחה');

      await supabase.from('system_logs').insert({
        user_id: user?.id,
        user_name: user?.full_name || '',
        company_name: user?.company_name || '',
        action_type: 'update_role',
        entity_type: 'user',
        entity_id: userId,
        new_status: newRole,
        details: `שינוי תפקיד ל-${ROLE_LABELS[newRole] || newRole}`,
      });
    }
    setSaving(null);
  };

  const toggleActive = async (userId: string, isActive: boolean) => {
    setSaving(userId);
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', userId);

    if (error) {
      toast.error('שגיאה בעדכון סטטוס');
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: isActive } : u));
      toast.success(isActive ? 'המשתמש הופעל' : 'המשתמש הושהה');
    }
    setSaving(null);
  };

  const companies = [...new Set(users.map(u => u.company_name).filter(Boolean))];

  const filtered = users.filter(u => {
    if (filterRole && u.role !== filterRole) return false;
    if (filterCompany && u.company_name !== filterCompany) return false;
    if (search && !u.full_name.includes(search) && !u.phone.includes(search) && !u.company_name.includes(search)) return false;
    return true;
  });

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-16">
        <Shield size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין הרשאה — דף זה זמין למנהלי על בלבד</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="page-header flex items-center gap-3"><Shield size={28} /> ניהול הרשאות</h1>
      <p className="text-muted-foreground">צפייה ועריכת תפקידים וסטטוס משתמשים בכל החברות</p>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם, טלפון או חברה..."
          className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
          <option value="">כל התפקידים</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
          className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
          <option value="">כל החברות</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <div key={role} className="card-elevated p-4 text-center">
            <p className="text-2xl font-black text-foreground">{users.filter(u => u.role === role).length}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated text-center py-12 text-muted-foreground">לא נמצאו משתמשים</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => (
            <div key={u.id} className={`card-elevated border-2 ${!u.is_active ? 'opacity-60 border-border' : 'border-border'}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-lg">{u.full_name || 'ללא שם'}</p>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${ROLE_COLORS[u.role] || ''}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                    {!u.is_active && (
                      <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-destructive/10 text-destructive">מושהה</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Building2 size={14} /> {u.company_name || '—'}</span>
                    {u.phone && <span>📞 {u.phone}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={u.role}
                    onChange={e => updateRole(u.id, e.target.value)}
                    disabled={saving === u.id || u.id === user?.id}
                    className="p-2 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => toggleActive(u.id, !u.is_active)}
                    disabled={saving === u.id || u.id === user?.id}
                    className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
                      u.is_active
                        ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    } disabled:opacity-50`}
                  >
                    {u.is_active ? 'השהה' : 'הפעל'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
