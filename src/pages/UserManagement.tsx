import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Search, Users, Shield, KeyRound, Loader2, Filter, Pencil, Eye, Mail, Copy, UserPlus } from 'lucide-react';
import CreateUserWizardDialog from '@/components/user-management/CreateUserWizardDialog';
import SettingsBackBar from '@/components/user-management/SettingsBackBar';
import TwoFactorApprovalSection from '@/components/user-management/TwoFactorApprovalSection';
import AuthAuditLogPanel from '@/components/user-management/AuthAuditLogPanel';
import { APPROVAL_STATUS_LABELS } from '@/lib/userManagementSchema';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

interface ManagedUser {
  id: string;
  full_name: string;
  email: string;
  company_name: string;
  phone: string;
  is_active: boolean;
  role: string;
  approval_status: string;
  two_factor_approved: boolean;
  two_factor_approved_at: string | null;
  two_factor_approved_by: string | null;
  two_factor_approved_by_name: string | null;
  hasClaimsAccess: boolean;
  claimsWorkerOnly: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'מנהל על',
  fleet_manager: 'מנהל צי',
  driver: 'נהג',
  private_customer: 'לקוח פרטי',
  business_customer: 'לקוח עסקי',
  telemarketing_agent: 'נציג/ת טלמיטינג',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-destructive/10 text-destructive border-destructive/30',
  fleet_manager: 'bg-primary/10 text-primary border-primary/30',
  driver: 'bg-muted text-muted-foreground border-border',
  private_customer: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  business_customer: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  telemarketing_agent: 'bg-sky-500/10 text-sky-700 border-sky-500/30',
};

export default function UserManagement() {
  const { user, impersonate } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [claimsFilter, setClaimsFilter] = useState('all');
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', company_name: '', role: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    loadCompanyOptions();
    loadUsers();
  }, []);

  const loadCompanyOptions = async () => {
    const { data } = await supabase.from('profiles').select('company_name');
    const set = new Set((data || []).map(p => p.company_name).filter(Boolean) as string[]);
    setCompanyOptions(Array.from(set).sort());
  };

  const loadUsers = async () => {
    setLoading(true);
    
    // Fetch profiles and roles
    const [profilesRes, rolesRes, emailsRes, approversRes, claimsAccessRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, phone, company_name, is_active, approval_status, two_factor_approved, two_factor_approved_at, two_factor_approved_by'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.functions.invoke('create-admin-user', { body: { action: 'list-users' } }),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('claims_access' as never).select('user_id, worker_only'),
    ]);

    if (profilesRes.error) {
      toast({ title: 'שגיאה', description: 'לא ניתן לטעון משתמשים', variant: 'destructive' });
      setLoading(false);
      return;
    }

    const roleMap = new Map((rolesRes.data || []).map((r: any) => [r.user_id, r.role]));
    const emailMap: Record<string, string> = emailsRes.data?.emails || {};
    const approverMap = new Map((approversRes.data || []).map((p: any) => [p.id, p.full_name]));
    const claimsAccessIds = new Set(
      ((claimsAccessRes.data || []) as Array<{ user_id: string }>).map((r) => r.user_id),
    );
    const claimsWorkerOnlyIds = new Set(
      ((claimsAccessRes.data || []) as Array<{ user_id: string; worker_only?: boolean }>)
        .filter((r) => r.worker_only)
        .map((r) => r.user_id),
    );

    const mapped: ManagedUser[] = (profilesRes.data || []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name || '',
      email: emailMap[p.id] || '',
      company_name: p.company_name || '',
      phone: p.phone || '',
      is_active: p.is_active ?? true,
      role: roleMap.get(p.id) || 'driver',
      approval_status: p.approval_status || 'pending',
      two_factor_approved: p.two_factor_approved ?? false,
      two_factor_approved_at: p.two_factor_approved_at ?? null,
      two_factor_approved_by: p.two_factor_approved_by ?? null,
      two_factor_approved_by_name: p.two_factor_approved_by
        ? approverMap.get(p.two_factor_approved_by) || null
        : null,
      hasClaimsAccess: (roleMap.get(p.id) || '') === 'super_admin' || claimsAccessIds.has(p.id),
      claimsWorkerOnly: claimsWorkerOnlyIds.has(p.id),
    }));

    setUsers(mapped);
    setLoading(false);
  };

  const companies = useMemo(() => {
    const set = new Set(users.map((u) => u.company_name).filter(Boolean));
    return Array.from(set).sort();
  }, [users]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        !search ||
        u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.company_name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.phone.includes(search);
      const matchCompany = companyFilter === 'all' || u.company_name === companyFilter;
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const matchClaims =
        claimsFilter === 'all'
        || (claimsFilter === 'workers' && u.hasClaimsAccess)
        || (claimsFilter === 'none' && !u.hasClaimsAccess);
      return matchSearch && matchCompany && matchRole && matchClaims;
    });
  }, [users, search, companyFilter, roleFilter, claimsFilter]);

  const openEditDialog = (u: ManagedUser) => {
    setSelectedUser(u);
    setEditForm({
      full_name: u.full_name,
      phone: u.phone,
      company_name: u.company_name,
      role: u.role,
      is_active: u.is_active,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedUser) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('create-admin-user', {
      body: {
        action: 'update-profile',
        user_id: selectedUser.id,
        full_name: editForm.full_name,
        phone: editForm.phone,
        company_name: editForm.company_name,
        role: editForm.role,
        is_active: editForm.is_active,
      },
    });
    setSaving(false);
    if (error || data?.error) {
      const msg = await getEdgeFunctionErrorMessage(error, data);
      toast({ title: 'שגיאה', description: msg || 'לא ניתן לעדכן משתמש', variant: 'destructive' });
      return;
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUser.id
          ? { ...u, full_name: editForm.full_name, phone: editForm.phone, company_name: editForm.company_name, role: editForm.role, is_active: editForm.is_active }
          : u
      )
    );
    toast({ title: '✅ משתמש עודכן', description: `${editForm.full_name} עודכן בהצלחה` });
    setEditDialogOpen(false);
  };

  const openResetDialog = (u: ManagedUser) => {
    setSelectedUser(u);
    setNewPassword('');
    setResetDialogOpen(true);
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword || newPassword.length < 6) {
      toast({ title: 'שגיאה', description: 'סיסמה חייבת להכיל לפחות 6 תווים', variant: 'destructive' });
      return;
    }
    setResetting(true);
    const { data, error } = await supabase.functions.invoke('create-admin-user', {
      body: { action: 'reset-password-by-id', user_id: selectedUser.id, password: newPassword },
    });
    setResetting(false);
    if (error || data?.error) {
      const msg = await getEdgeFunctionErrorMessage(error, data);
      toast({ title: 'שגיאה', description: msg || 'לא ניתן לאפס סיסמה', variant: 'destructive' });
      return;
    }
    toast({ title: '✅ סיסמה אופסה', description: `הסיסמה של ${selectedUser.full_name} עודכנה בהצלחה` });
    setResetDialogOpen(false);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const { data, error } = await supabase.functions.invoke('create-admin-user', {
      body: { action: 'update-role', user_id: userId, role: newRole },
    });
    if (error || data?.error) {
      const msg = await getEdgeFunctionErrorMessage(error, data);
      toast({ title: 'שגיאה', description: msg || 'לא ניתן לעדכן תפקיד', variant: 'destructive' });
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    toast({ title: '✅ תפקיד עודכן', description: `התפקיד שונה ל${ROLE_LABELS[newRole] || newRole}` });
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    const newActive = !currentActive;
    const { data, error } = await supabase.functions.invoke('create-admin-user', {
      body: { action: 'toggle-active', user_id: userId, is_active: newActive },
    });
    if (error || data?.error) {
      const msg = await getEdgeFunctionErrorMessage(error, data);
      toast({ title: 'שגיאה', description: msg || 'לא ניתן לעדכן סטטוס', variant: 'destructive' });
      return;
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, is_active: newActive, approval_status: newActive ? 'approved' : u.approval_status }
          : u,
      ),
    );
    toast({ title: newActive ? '✅ חשבון הופעל' : '⛔ חשבון הושבת', description: `המשתמש ${newActive ? 'הופעל' : 'הושבת'} בהצלחה` });
  };

  const handleToggleClaims = async (u: ManagedUser, enabled: boolean) => {
    if (u.role === 'super_admin') return;
    const { error } = await supabase.rpc('claims_set_access' as never, {
      p_user_id: u.id,
      p_enabled: enabled,
    } as never);
    if (error) {
      toast({ title: 'שגיאה', description: error.message || 'לא ניתן לעדכן הרשאת תביעות', variant: 'destructive' });
      return;
    }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, hasClaimsAccess: enabled, claimsWorkerOnly: enabled ? x.claimsWorkerOnly : false } : x)));
    toast({ title: enabled ? '✅ סומן כעובד תביעות' : 'הוסרה הרשאת עובד תביעות', description: u.full_name });
  };

  const handleImpersonate = (u: ManagedUser) => {
    impersonate({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      phone: u.phone,
      company_name: u.company_name,
      is_active: u.is_active,
      role: u.role as any,
      hasClaimsAccess: u.hasClaimsAccess,
      claimsWorkerOnly: u.claimsWorkerOnly,
    });
    navigate(u.claimsWorkerOnly ? '/claims' : '/dashboard');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'הועתק', description: text });
  };

  if (user?.role !== 'super_admin') {
    return (
      <div className="text-center py-12">
        <Shield size={48} className="mx-auto mb-4 text-destructive" />
        <p className="text-lg font-bold text-foreground">אין לך הרשאה לצפות בעמוד זה</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <SettingsBackBar />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Users size={24} className="text-primary" />
          ניהול משתמשים
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-sm">{filtered.length} משתמשים</Badge>
          <Button onClick={() => setCreateOpen(true)} className="gap-2 font-bold">
            <UserPlus size={18} />
            פתיחת משתמש חדש
          </Button>
        </div>
      </div>

      <CreateUserWizardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyOptions={companyOptions}
        onCreated={loadUsers}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם, אימייל, חברה או טלפון..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
          />
        </div>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter size={14} className="ml-2" />
            <SelectValue placeholder="כל החברות" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל החברות</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="כל התפקידים" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל התפקידים</SelectItem>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={claimsFilter} onValueChange={setClaimsFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="users-claims-filter">
            <SelectValue placeholder="עובדי תביעות" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל המשתמשים</SelectItem>
            <SelectItem value="workers">עובדי תביעות</SelectItem>
            <SelectItem value="none">ללא הרשאת תביעות</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 size={32} className="mx-auto animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">טוען משתמשים...</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">שם</TableHead>
                <TableHead className="text-right">אימייל</TableHead>
                <TableHead className="text-right">חברה</TableHead>
                <TableHead className="text-right">טלפון</TableHead>
                <TableHead className="text-right">תפקיד</TableHead>
                <TableHead className="text-right">עובד תביעות</TableHead>
                <TableHead className="text-right">אישור</TableHead>
                <TableHead className="text-right">2FA</TableHead>
                <TableHead className="text-right">פעיל</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    לא נמצאו משתמשים
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-bold text-foreground">{u.full_name || '—'}</TableCell>
                    <TableCell>
                      {u.email ? (
                        <div className="flex items-center gap-1.5">
                          <Mail size={13} className="text-muted-foreground shrink-0" />
                          <span className="text-sm" dir="ltr">{u.email}</span>
                          <button onClick={() => copyToClipboard(u.email)} className="text-muted-foreground hover:text-primary transition-colors">
                            <Copy size={12} />
                          </button>
                        </div>
                      ) : '—'}
                    </TableCell>
                    <TableCell>{u.company_name || '—'}</TableCell>
                    <TableCell dir="ltr" className="text-right">{u.phone || '—'}</TableCell>
                    <TableCell>
                      {u.claimsWorkerOnly ? (
                        <Badge variant="outline" className="text-xs border-primary/40 text-primary" data-testid={`claims-worker-type-badge-${u.id}`}>
                          עובד ניהול תביעות
                        </Badge>
                      ) : (
                        <Select value={u.role} onValueChange={(val) => handleRoleChange(u.id, val)}>
                          <SelectTrigger className="h-8 w-[120px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ROLE_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.role === 'super_admin' ? (
                        <span className="text-xs text-muted-foreground">מנהל על</span>
                      ) : u.claimsWorkerOnly ? (
                        <Badge variant="outline" className="text-xs border-primary/40 text-primary">Claims בלבד</Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={u.hasClaimsAccess}
                            data-testid={`claims-worker-toggle-${u.id}`}
                            onCheckedChange={(checked) => handleToggleClaims(u, checked)}
                          />
                          {u.hasClaimsAccess ? (
                            <Badge variant="outline" className="text-xs border-primary/40 text-primary" data-testid={`claims-worker-badge-${u.id}`}>עובד תביעות</Badge>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          u.approval_status === 'approved'
                            ? 'border-green-500/40 text-green-700'
                            : u.approval_status === 'rejected'
                              ? 'border-destructive/40 text-destructive'
                              : 'border-amber-500/40 text-amber-700'
                        }
                      >
                        {APPROVAL_STATUS_LABELS[u.approval_status] || u.approval_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={u.two_factor_approved
                          ? 'border-amber-500/40 text-amber-700'
                          : 'border-muted-foreground/30 text-muted-foreground'}
                      >
                        {u.two_factor_approved ? 'מאושר' : 'לא'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.is_active}
                          onCheckedChange={() => handleToggleActive(u.id, u.is_active)}
                        />
                        <span className={`text-xs font-bold ${u.is_active ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                          {u.is_active ? 'פעיל' : 'מושבת'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(u)}
                          className="gap-1.5"
                        >
                          <Pencil size={14} />
                          עריכה
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openResetDialog(u)}
                          className="gap-1.5"
                        >
                          <KeyRound size={14} />
                          סיסמה
                        </Button>
                        {u.id !== user?.id && u.role !== 'super_admin' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleImpersonate(u)}
                            className="gap-1.5"
                          >
                            <Eye size={14} />
                            כניסה כ{ROLE_LABELS[u.role] || u.role}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AuthAuditLogPanel />

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound size={18} className="text-primary" />
              איפוס סיסמה – {selectedUser?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedUser?.email && (
              <div className="p-3 rounded-xl bg-muted text-sm">
                <span className="text-muted-foreground">אימייל: </span>
                <span dir="ltr" className="font-medium">{selectedUser.email}</span>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">סיסמה חדשה</label>
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="לפחות 6 תווים"
                minLength={6}
                dir="ltr"
                className="text-right"
              />
              <p className="text-xs text-muted-foreground mt-1">הסיסמה תוחלף מיידית. שתף את הסיסמה החדשה עם המשתמש.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>חזור</Button>
            <Button onClick={handleResetPassword} disabled={resetting || newPassword.length < 6}>
              {resetting ? <Loader2 size={14} className="animate-spin ml-2" /> : <KeyRound size={14} className="ml-2" />}
              אפס סיסמה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={18} className="text-primary" />
              עריכת משתמש – {selectedUser?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedUser && (
              <TwoFactorApprovalSection
                userId={selectedUser.id}
                approved={selectedUser.two_factor_approved}
                approvedAt={selectedUser.two_factor_approved_at}
                approvedByName={selectedUser.two_factor_approved_by_name}
                onUpdated={(approved) => {
                  setSelectedUser((prev) => prev ? {
                    ...prev,
                    two_factor_approved: approved,
                    two_factor_approved_at: approved ? new Date().toISOString() : null,
                    two_factor_approved_by: approved ? user?.id ?? null : null,
                    two_factor_approved_by_name: approved ? user?.full_name ?? null : null,
                  } : prev);
                  setUsers((prev) => prev.map((u) => u.id === selectedUser.id ? {
                    ...u,
                    two_factor_approved: approved,
                    two_factor_approved_at: approved ? new Date().toISOString() : null,
                    two_factor_approved_by: approved ? user?.id ?? null : null,
                    two_factor_approved_by_name: approved ? user?.full_name ?? null : null,
                  } : u));
                  loadUsers();
                }}
              />
            )}
            {selectedUser?.email && (
              <div className="p-3 rounded-xl bg-muted text-sm">
                <span className="text-muted-foreground">אימייל: </span>
                <span dir="ltr" className="font-medium">{selectedUser.email}</span>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">שם מלא</label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">טלפון</label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                dir="ltr"
                className="text-right"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">חברה</label>
              <Select value={editForm.company_name} onValueChange={(val) => setEditForm((f) => ({ ...f, company_name: val }))}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר חברה" />
                </SelectTrigger>
                <SelectContent>
                  {companyOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">תפקיד</label>
              <Select value={editForm.role} onValueChange={(val) => setEditForm((f) => ({ ...f, role: val }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">משתמש פעיל</label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editForm.is_active}
                  onCheckedChange={(val) => setEditForm((f) => ({ ...f, is_active: val }))}
                />
                <span className={`text-xs font-bold ${editForm.is_active ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                  {editForm.is_active ? 'כן' : 'לא'}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>חזור לרשימה</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editForm.full_name}>
              {saving ? <Loader2 size={14} className="animate-spin ml-2" /> : <Pencil size={14} className="ml-2" />}
              שמור שינויים
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
