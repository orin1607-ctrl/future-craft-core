import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, User, Building2, Phone, Mail, Moon, Sun, LogOut, Shield, Save, ChevronLeft, Download, Database, FolderDown, BookOpen, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
  const { user, realUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [companyName, setCompanyName] = useState(user?.company_name || '');
  const [saving, setSaving] = useState(false);

  // Password change
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setPhone(user.phone);
      setCompanyName(user.company_name);
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, phone, company_name: companyName, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      toast.error('שגיאה בעדכון הפרופיל');
      console.error(error);
    } else {
      toast.success('הפרופיל עודכן בהצלחה');
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('הסיסמאות לא תואמות');
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      toast.error('שגיאה בשינוי הסיסמה');
    } else {
      toast.success('הסיסמה שונתה בהצלחה');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordSection(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const roleLabels: Record<string, string> = {
    driver: 'נהג',
    fleet_manager: 'מנהל צי',
    super_admin: 'מנהל על',
  };

  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  return (
    <div className="animate-fade-in">
      <h1 className="page-header flex items-center gap-3">
        <SettingsIcon size={28} />
        הגדרות
      </h1>

      {/* Profile Section */}
      <div className="card-elevated mb-4">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <User size={24} className="text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">פרטים אישיים</h2>
            <p className="text-muted-foreground">{user?.email}</p>
          </div>
          <span className="mr-auto status-badge status-active">{roleLabels[user?.role || 'driver']}</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-base font-medium mb-1.5">שם מלא</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} className={inputClass} placeholder="השם שלך..." />
          </div>
          <div>
            <label className="block text-base font-medium mb-1.5">טלפון</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="050-..." dir="ltr" style={{ textAlign: 'right' }} />
          </div>
          <div>
            <label className="block text-base font-medium mb-1.5">שם חברה</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputClass} placeholder="שם החברה..." />
          </div>
          <button onClick={handleSaveProfile} disabled={saving}
            className="w-full py-4 rounded-xl bg-primary text-primary-foreground text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            <Save size={20} />
            {saving ? 'שומר...' : 'שמור שינויים'}
          </button>
        </div>
      </div>

      {/* Theme */}
      <div className="card-elevated mb-4">
        <button onClick={toggleTheme} className="w-full flex items-center gap-4 min-h-[56px]">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
            {theme === 'dark' ? <Moon size={24} className="text-accent-foreground" /> : <Sun size={24} className="text-accent-foreground" />}
          </div>
          <div className="flex-1 text-right">
            <p className="text-lg font-bold">מצב תצוגה</p>
            <p className="text-muted-foreground">{theme === 'dark' ? 'מצב כהה' : 'מצב בהיר'}</p>
          </div>
          <div className={`w-14 h-8 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-primary' : 'bg-muted'}`}>
            <div className={`absolute top-1 w-6 h-6 rounded-full bg-background shadow transition-all ${theme === 'dark' ? 'right-1' : 'left-1'}`} />
          </div>
        </button>
      </div>

      {/* Password */}
      <div className="card-elevated mb-4">
        <button onClick={() => setShowPasswordSection(!showPasswordSection)} className="w-full flex items-center gap-4 min-h-[56px]">
          <div className="w-12 h-12 rounded-2xl bg-warning/10 flex items-center justify-center">
            <Shield size={24} className="text-warning" />
          </div>
          <div className="flex-1 text-right">
            <p className="text-lg font-bold">שינוי סיסמה</p>
            <p className="text-muted-foreground">עדכן את סיסמת הכניסה שלך</p>
          </div>
          <ChevronLeft size={20} className={`text-muted-foreground transition-transform ${showPasswordSection ? 'rotate-90' : ''}`} />
        </button>

        {showPasswordSection && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <div>
              <label className="block text-base font-medium mb-1.5">סיסמה חדשה</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} placeholder="לפחות 6 תווים..." />
            </div>
            <div>
              <label className="block text-base font-medium mb-1.5">אימות סיסמה</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} placeholder="הקלד שוב..." />
            </div>
            <button onClick={handleChangePassword} disabled={changingPassword || !newPassword}
              className="w-full py-4 rounded-xl bg-warning text-warning-foreground text-lg font-bold disabled:opacity-50">
              {changingPassword ? 'משנה...' : 'שנה סיסמה'}
            </button>
          </div>
        )}
      </div>

      {/* Backup section - super_admin only */}
      {(realUser?.role === 'super_admin' && user?.role === 'super_admin') && (
        <div className="card-elevated space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Download size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">גיבוי מערכת</p>
              <p className="text-sm text-muted-foreground">הורדת גיבוי מלא של הנתונים והקבצים</p>
            </div>
          </div>
          <BackupButton type="data" label="גיבוי נתונים (DATA)" icon={<Database size={20} />} description="כל הטבלאות בפורמט JSON" />
          <BackupButton type="files" label="גיבוי קבצים (FILES)" icon={<FolderDown size={20} />} description="רשימת קבצים + קישורי הורדה" />
          <EnglishExportGuideButton />
          <FullExportButton />

          <div className="border-t border-border pt-3 mt-2">
            <RestoreGuideButton />
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="card-elevated">
        <button onClick={handleLogout} className="w-full flex items-center gap-4 min-h-[56px] text-destructive">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <LogOut size={24} />
          </div>
          <p className="text-lg font-bold">התנתקות</p>
        </button>
      </div>

      {/* App info */}
      <p className="text-center text-sm text-muted-foreground mt-8">דליה v1.0 • פתרונות מימון ותפעול לרכב</p>
    </div>
  );
}

function RestoreGuideButton() {
  const [open, setOpen] = useState(false);

  const guideContent = `
# 📘 מדריך שחזור גיבוי — דליה מערכת ניהול צי

## שלב 1: הקמת פרויקט Supabase חדש
1. היכנסו ל-supabase.com וצרו חשבון + פרויקט חדש
2. ב-SQL Editor, צרו את כל הטבלאות (ניתן לייצא Schema מהפרויקט הישן)
3. הגדירו את הפונקציות (handle_new_user, has_role, get_user_company)
4. צרו Storage Bucket בשם "documents" (Public)

## שלב 2: שחזור נתונים (DATA)
1. התקינו Node.js על המחשב
2. צרו קובץ restore-data.js:

\`\`\`javascript
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const supabase = createClient('https://YOUR_PROJECT.supabase.co', 'SERVICE_ROLE_KEY');

const TABLE_ORDER = [
  'profiles','user_roles','vehicles','drivers','customers','suppliers',
  'companions','company_settings','company_subscriptions','faults',
  'fault_messages','fault_status_log','fault_referrals','expenses',
  'accidents','service_orders','service_order_messages','vehicle_handovers',
  'vehicle_exchanges','vehicle_inspections','inspection_items','routes',
  'trip_logs','customer_deals','customer_agreements','vehicle_companions',
  'custom_alerts','document_metadata','driver_health_declarations',
  'driver_declarations','driver_notifications','internal_messages',
  'emergency_categories','emergency_logs','promotions','system_logs',
  'temporary_drivers','dev_tasks','approval_requests','work_assignments',
  'work_assignment_messages','work_assignment_status_log','supplier_work_orders'
];

async function restore() {
  const backup = JSON.parse(fs.readFileSync('backup_data_YYYY-MM-DD.json','utf8'));
  for (const table of TABLE_ORDER) {
    const rows = backup.tables[table];
    if (!rows?.length) continue;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(table).upsert(rows.slice(i,i+500),{onConflict:'id'});
      if (error) console.error(table, error.message);
    }
    console.log(table + ': ' + rows.length + ' rows');
  }
}
restore();
\`\`\`

3. הריצו: npm install @supabase/supabase-js && node restore-data.js

## שלב 3: שחזור קבצים (FILES)
⚠️ קישורי ההורדה תקפים לשעה בלבד! הורידו מיד.

1. צרו קובץ restore-files.js בדומה לנ"ל
2. הסקריפט מוריד כל קובץ ומעלה ל-Storage החדש

## שלב 4: הגדרת שרת (VPS)
1. שרת VPS (Hostinger / DigitalOcean)
2. התקנת Nginx + Node.js + Certbot
3. שכפול הקוד מ-GitHub
4. עדכון .env עם פרטי Supabase החדש
5. npm install && npm run build
6. העתקת dist/ ל-/var/www/dalia/
7. הגדרת Nginx + SSL

## שלב 5: חיבור
1. ב-Supabase: הגדרת Site URL + Redirect URLs
2. פריסת Edge Functions: supabase functions deploy
3. הגדרת Secrets (RESEND_API_KEY וכו')

## שלב 6: בדיקות
✅ התחברות עם super_admin
✅ נתונים מופיעים (נהגים, רכבים, לקוחות)
✅ קבצים ותמונות נטענים
✅ התראות ואימיילים עובדים

⚠️ סיסמאות משתמשים: לא ניתנות לייצוא. שלחו "שכחתי סיסמה" או הגדירו חדשות.
`;

  const handleDownloadGuide = () => {
    const blob = new Blob([guideContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restore_guide_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-primary/30 hover:bg-primary/5 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <BookOpen size={20} className="text-primary" />
        </div>
        <div className="text-right flex-1">
          <p className="font-bold text-sm">📘 מדריך שחזור גיבוי</p>
          <p className="text-xs text-muted-foreground">איך להעביר את הגיבוי לשרת + Supabase פרטי</p>
        </div>
        <ChevronLeft size={18} className={`text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 p-4 rounded-xl bg-muted/50 border border-border space-y-3 text-sm leading-relaxed">
          <div className="space-y-2">
            <h4 className="font-bold text-base">🔄 תהליך שחזור מלא:</h4>
            <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
              <li><strong>הקמת Supabase חדש</strong> — צרו פרויקט ב-supabase.com, צרו את הטבלאות והפונקציות</li>
              <li><strong>שחזור DATA</strong> — הריצו סקריפט Node.js שמכניס את כל הנתונים מקובץ הגיבוי</li>
              <li><strong>שחזור FILES</strong> — הורדת כל הקבצים והעלאתם ל-Storage החדש</li>
              <li><strong>הגדרת שרת</strong> — VPS עם Nginx, בנייה מ-GitHub, חיבור ל-Supabase החדש</li>
              <li><strong>Edge Functions</strong> — פריסה עם Supabase CLI + הגדרת Secrets</li>
              <li><strong>בדיקות</strong> — התחברות, נתונים, קבצים, התראות</li>
            </ol>
          </div>

          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
            <p className="text-warning font-medium text-xs">⚠️ קישורי הורדת קבצים תקפים לשעה בלבד! הורידו מיד אחרי יצירת הגיבוי.</p>
          </div>
          
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs text-muted-foreground">💡 סיסמאות משתמשים לא ניתנות לייצוא. אחרי שחזור, שלחו "שכחתי סיסמה" לכל המשתמשים או הגדירו סיסמאות חדשות.</p>
          </div>

          <button
            onClick={handleDownloadGuide}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2"
          >
            <Download size={16} />
            הורד מדריך מלא (עם סקריפטים)
          </button>
        </div>
      )}
    </>
  );
}

function BackupButton({ type, label, icon, description }: { type: 'data' | 'files'; label: string; icon: React.ReactNode; description: string }) {
  const [loading, setLoading] = useState(false);

  const handleBackup = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('יש להתחבר מחדש');
        return;
      }

      const res = await supabase.functions.invoke('backup-data', {
        body: { type },
      });

      if (res.error) {
        toast.error('שגיאה בגיבוי: ' + res.error.message);
        return;
      }

      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${type}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const tableCount = res.data?.table_counts
        ? Object.values(res.data.table_counts as Record<string, number>).reduce((a: number, b: number) => a + b, 0)
        : res.data?.total_files || 0;
      toast.success(`גיבוי הושלם! ${type === 'data' ? `${tableCount} רשומות` : `${tableCount} קבצים`}`);
    } catch (e) {
      toast.error('שגיאה בלתי צפויה');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleBackup}
      disabled={loading}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-accent/50 transition-colors disabled:opacity-50"
    >
      <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="text-right flex-1">
        <p className="font-bold text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {loading && <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
    </button>
  );
}

function FullExportButton() {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!confirm('ייצוא Supabase מלא כולל מפתחות שירות (Service Role) ו-Database URL. שמור את הקובץ במקום מאובטח. להמשיך?')) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('יש להתחבר מחדש'); return; }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/full-supabase-export`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await res.text();
        toast.error('שגיאה בייצוא: ' + err);
        return;
      }

      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `full_supabase_export_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dlUrl);
      toast.success('ייצוא Supabase מלא הושלם!');
    } catch (e) {
      toast.error('שגיאה בלתי צפויה');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors disabled:opacity-50"
    >
      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
        <Package size={20} className="text-primary" />
      </div>
      <div className="text-right flex-1">
        <p className="font-bold text-sm">Full Supabase Export (ZIP)</p>
        <p className="text-xs text-muted-foreground">Schema DDL + Migrations + Auth + RLS + Storage + Secrets keys + Config</p>
      </div>
      {loading && <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
    </button>
  );
}

function EnglishExportGuideButton() {
  const [open, setOpen] = useState(false);

  const guide = `# Full Supabase Export — Recovery & Migration Guide (English)

This guide explains how to use the **Full Supabase Export (ZIP)** archive to fully recreate the project on a fresh Supabase instance.

---

## 1. What's inside the ZIP

| Path | Purpose |
|------|---------|
| \`README.md\` | Quick overview |
| \`schema/schema.sql\` | Complete DDL: tables, columns, indexes, constraints, FKs, sequences, extensions, functions, triggers, RLS toggles |
| \`schema/schema_meta.json\` | Raw pg-meta snapshot (machine-readable) |
| \`supabase/migrations/*_full_schema.sql\` | Drop-in migration with the full schema |
| \`supabase/migrations/*_rls_policies.sql\` | Row-Level Security policies as a separate migration |
| \`auth/users.json\` | All Auth users (id, email, phone, metadata, identities, confirmation timestamps) |
| \`security/policies.{sql,json}\` | RLS policies in SQL + JSON form |
| \`security/roles.json\` | Database roles snapshot |
| \`storage/buckets.sql\` | SQL to recreate every bucket with public/private flags + MIME limits |
| \`storage/buckets_metadata.json\` | All objects per bucket (path, size, mimetype, etag) — file *contents* are not in the ZIP |
| \`config/project.json\` | Project URL, ref, anon key, **service-role key**, **DB connection string**, list of edge functions, list of configured secrets |
| \`config/edge_function_secrets.env.example\` | Names of every secret used (PayPal, Resend, Twilio, ElevenLabs, Lovable, Supabase). Values are intentionally omitted. |
| \`config/supabase_config.toml\` | Stub for \`supabase/config.toml\` |
| \`data/<table>.json\` | Per-table JSON dump of every public table |
| \`EXPORT_ERRORS.log\` | Only present if anything failed during export |

---

## 2. Recreate the project — step by step

### 2.1 Create a new Supabase project
1. Sign in to [supabase.com](https://supabase.com) and create a new project (or run \`supabase init\` locally for self-hosted).
2. Note the new \`project ref\`, \`SUPABASE_URL\`, \`anon key\`, and \`service_role key\`.

### 2.2 Apply the schema
\`\`\`bash
# Option A — via Supabase CLI (recommended)
cp -r ./supabase/migrations <your-new-project>/supabase/migrations
cd <your-new-project>
supabase link --project-ref <NEW_REF>
supabase db push

# Option B — direct psql
psql "$NEW_DATABASE_URL" -f schema/schema.sql
psql "$NEW_DATABASE_URL" -f security/policies.sql
\`\`\`

### 2.3 Restore Auth users
Two strategies:

**A. Metadata-only restore (fastest, no password hashes):**
\`\`\`js
import { createClient } from '@supabase/supabase-js';
import users from './auth/users.json' assert { type: 'json' };
const admin = createClient(NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY);
for (const u of users.users) {
  await admin.auth.admin.createUser({
    email: u.email, phone: u.phone,
    email_confirm: !!u.email_confirmed_at,
    phone_confirm: !!u.phone_confirmed_at,
    user_metadata: u.user_metadata,
    app_metadata: u.app_metadata,
  });
}
// Then trigger password-reset emails for everyone.
\`\`\`

**B. Full restore including password hashes:** run \`pg_dump --schema=auth\` against the source DB and \`psql\` it into the new one. This preserves bcrypt hashes so users keep their existing passwords.

### 2.4 Recreate storage buckets
\`\`\`bash
psql "$NEW_DATABASE_URL" -f storage/buckets.sql
\`\`\`
Then re-upload each file. Generate signed URLs from the **source** project for every entry in \`storage/buckets_metadata.json\` and pipe them to the new bucket. Example loop:
\`\`\`js
for (const f of buckets_metadata.objects.documents) {
  const { data } = await sourceAdmin.storage.from('documents').createSignedUrl(f.path, 3600);
  const blob = await fetch(data.signedUrl).then(r => r.blob());
  await targetAdmin.storage.from('documents').upload(f.path, blob, { contentType: f.mimetype, upsert: true });
}
\`\`\`

### 2.5 Configure edge function secrets
In **Project Settings → Edge Functions → Secrets**, add every key listed in \`config/edge_function_secrets.env.example\`. Values must be supplied from your own vault — they are not exported for security reasons. Required keys typically include:
- \`RESEND_API_KEY\`
- \`PAYPAL_CLIENT_ID\`, \`PAYPAL_SECRET\`
- \`TWILIO_ACCOUNT_SID\`, \`TWILIO_AUTH_TOKEN\`, \`TWILIO_PHONE_NUMBER\`
- \`ELEVENLABS_API_KEY\`, \`ELEVENLABS_AGENT_ID\`, \`ELEVENLABS_AGENT_PHONE_NUMBER_ID\`
- \`LOVABLE_API_KEY\`
- \`SUPABASE_URL\`, \`SUPABASE_ANON_KEY\`, \`SUPABASE_SERVICE_ROLE_KEY\` (auto-provisioned)

### 2.6 Deploy edge functions
The function names are listed in \`config/project.json.edge_functions\`. After cloning the source code:
\`\`\`bash
supabase functions deploy <function-name> --project-ref <NEW_REF>
\`\`\`

### 2.7 Import data
Foreign-key order matters. Recommended order: \`profiles → user_roles → drivers → customers → vehicles → suppliers → companions → company_settings → company_subscriptions → faults → fault_messages → ...\` (depend-on first).

\`\`\`js
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const admin = createClient(NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY);
const order = ['profiles','user_roles','drivers','customers','vehicles', /* … */];
for (const t of order) {
  const rows = JSON.parse(fs.readFileSync(\`./data/\${t}.json\`, 'utf8'));
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500);
    const { error } = await admin.from(t).upsert(slice, { onConflict: 'id' });
    if (error) console.error(t, error.message);
  }
}
\`\`\`

### 2.8 Update the front-end
Point the front-end to the new project:
- \`VITE_SUPABASE_URL\`
- \`VITE_SUPABASE_PUBLISHABLE_KEY\` (anon key)
- \`VITE_SUPABASE_PROJECT_ID\`

Rebuild and redeploy.

---

## 3. Verification checklist
- [ ] Super-admin can log in
- [ ] All tables show expected row counts (compare with \`data/_summary.json\`)
- [ ] Storage files load (open a couple of documents)
- [ ] Email notifications send (Resend secret correct)
- [ ] PayPal billing cron runs
- [ ] Twilio outbound voice works
- [ ] Edge functions return 200 from a smoke test

---

## 4. Security warnings
- \`config/project.json\` contains the **service-role key** and the **database connection string**. Anyone with these has full admin access. **Store the archive in encrypted storage and rotate keys after migration.**
- Storage signed URLs in \`backup_files\` exports expire after 1 hour. Download files immediately or regenerate.
- Auth password hashes are only restored via the \`pg_dump --schema=auth\` path; otherwise users must reset their passwords.

---

## 5. Troubleshooting
| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| \`relation "x" does not exist\` during data import | Schema migration not applied | Re-run \`supabase db push\` |
| FK violation during import | Wrong table order | Insert parents (profiles, drivers, vehicles) before children (faults, accidents) |
| Edge function returns 500 | Missing secret | Compare deployed secrets with \`edge_function_secrets.env.example\` |
| Users cannot log in | Password hashes not restored | Trigger password-reset email or use pg_dump approach |
| Files 404 | Bucket not created or files not re-uploaded | Run \`storage/buckets.sql\` then re-upload |
`;

  const handleDownload = () => {
    const blob = new Blob([guide], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `full_supabase_export_guide_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-primary/40 hover:bg-primary/5 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <BookOpen size={20} className="text-primary" />
        </div>
        <div className="text-right flex-1" dir="ltr">
          <p className="font-bold text-sm">📗 Full Export Guide (English)</p>
          <p className="text-xs text-muted-foreground">Step-by-step recovery instructions for the ZIP archive</p>
        </div>
        <ChevronLeft size={18} className={`text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 p-4 rounded-xl bg-muted/50 border border-border space-y-3 text-sm leading-relaxed" dir="ltr">
          <h4 className="font-bold text-base">🛠 Recovery Workflow</h4>
          <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
            <li><strong>Create a new Supabase project</strong> and note URL, anon & service-role keys.</li>
            <li><strong>Apply schema:</strong> copy <code>supabase/migrations/*</code> and run <code>supabase db push</code> (or <code>psql -f schema/schema.sql</code>).</li>
            <li><strong>Restore Auth users</strong> via <code>auth.admin.createUser</code>, or use <code>pg_dump --schema=auth</code> for full password-hash restore.</li>
            <li><strong>Recreate buckets</strong> with <code>storage/buckets.sql</code> and re-upload files using signed URLs from the source project.</li>
            <li><strong>Set every secret</strong> listed in <code>config/edge_function_secrets.env.example</code> in the new project's Edge Functions settings.</li>
            <li><strong>Deploy edge functions</strong> from <code>config/project.json.edge_functions</code>.</li>
            <li><strong>Import data</strong> from <code>data/*.json</code> respecting foreign-key order (profiles → drivers → vehicles → children).</li>
            <li><strong>Re-point the front-end</strong> to the new <code>VITE_SUPABASE_URL</code> and rebuild.</li>
          </ol>

          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
            <p className="text-warning font-medium text-xs">⚠ The ZIP contains the service-role key and DB connection string. Store it encrypted and rotate keys after migration.</p>
          </div>

          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs text-muted-foreground">💡 Storage file contents are not in the ZIP — use signed URLs from the source project to copy each object listed in <code>storage/buckets_metadata.json</code>.</p>
          </div>

          <button
            onClick={handleDownload}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2"
          >
            <Download size={16} />
            Download full English guide (.md)
          </button>
        </div>
      )}
    </>
  );
}
