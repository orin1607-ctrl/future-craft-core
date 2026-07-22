import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Asterisk, Building2, ChevronDown, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { useRequiredFields } from '@/contexts/RequiredFieldsContext';
import {
  REQUIRED_FIELD_MODULES,
  getModuleDef,
  listFieldsByCategory,
  type RequiredFieldModule,
} from '@/lib/requiredFieldsSchema';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

const MODULE_ADMIN_PATHS: Record<RequiredFieldModule, { hub: string; label: string }> = {
  vehicles: { hub: '/admin/modules/vehicles', label: 'ניהול רכבים' },
  drivers: { hub: '/admin/modules/drivers', label: 'ניהול נהגים' },
  customers: { hub: '/admin/modules/customers', label: 'ניהול לקוחות' },
  accidents: { hub: '/admin/modules/accidents', label: 'תאונות' },
  documents: { hub: '/admin/modules/documents', label: 'מסמכים' },
  treatments: { hub: '/admin/modules/treatments', label: 'טיפולים' },
  insurance: { hub: '/admin/modules/insurance', label: 'ביטוחים' },
  tasks: { hub: '/admin/modules/tasks', label: 'ליקויים / משימות' },
};

type BreadcrumbProps = {
  module: RequiredFieldModule;
};

function AdminBreadcrumb({ module }: BreadcrumbProps) {
  const meta = MODULE_ADMIN_PATHS[module];
  return (
    <nav className="text-sm text-muted-foreground flex flex-wrap items-center gap-1 mb-3">
      <Link to="/admin-home" className="text-primary hover:underline">
        מרכז ניהול
      </Link>
      <span>/</span>
      <Link to="/admin/modules" className="text-primary hover:underline">
        כפתורים ומודולים
      </Link>
      <span>/</span>
      <Link to={meta.hub} className="text-primary hover:underline">
        {meta.label}
      </Link>
      <span>/</span>
      <span className="text-foreground font-medium">שדות חובה</span>
    </nav>
  );
}

function CompanyPicker({
  companies,
  selectedCompany,
  onSelect,
  loading,
}: {
  companies: string[];
  selectedCompany: string;
  onSelect: (name: string) => void;
  loading: boolean;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      companies.filter((c) => !search.trim() || c.toLowerCase().includes(search.trim().toLowerCase())),
    [companies, search],
  );

  return (
    <div className="rounded-xl border bg-card p-4 mb-6">
      <label className="block text-sm font-semibold mb-2 flex items-center gap-2">
        <Building2 size={18} className="text-primary" />
        חברה / עסק
      </label>
      <div className="relative max-w-md">
        <button
          type="button"
          disabled={loading}
          onClick={() => setDropdownOpen((o) => !o)}
          className={`w-full p-3 text-base rounded-xl border-2 text-right flex items-center justify-between transition-colors ${
            selectedCompany
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-input bg-background text-muted-foreground'
          }`}
        >
          <span>{selectedCompany || 'בחר חברה לניהול שדות החובה...'}</span>
          <ChevronDown size={18} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border-2 border-border rounded-xl shadow-lg z-30 max-h-72 overflow-hidden">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש חברה..."
                  className="w-full pr-10 p-2.5 text-sm rounded-lg border border-input bg-background focus:border-primary focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-52">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">לא נמצאו חברות</div>
              ) : (
                filtered.map((company) => (
                  <button
                    key={company}
                    type="button"
                    onClick={() => {
                      onSelect(company);
                      setDropdownOpen(false);
                      setSearch('');
                    }}
                    className={`w-full text-right px-4 py-2.5 text-sm hover:bg-primary/10 transition-colors flex items-center gap-2 ${
                      selectedCompany === company ? 'bg-primary/10 text-primary font-semibold' : ''
                    }`}
                  >
                    <Building2 size={14} />
                    {company}
                    {selectedCompany === company && <span className="mr-auto text-primary">✓</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {!selectedCompany && companies.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {companies.length} חברות — בחר חברה כדי לנהל את שדות החובה שלה בנפרד
        </p>
      )}
    </div>
  );
}

type RequiredFieldsPanelProps = {
  module: RequiredFieldModule;
  title?: string;
  description?: string;
};

export function RequiredFieldsPanel({ module, title, description }: RequiredFieldsPanelProps) {
  const { loading, isFieldRequired, setFieldRequired } = useRequiredFields();
  const { companyOptions, loadingCompanies } = useCompanyScope();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [search, setSearch] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const companies = useMemo(
    () => companyOptions.map((c) => c.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'he')),
    [companyOptions],
  );

  useEffect(() => {
    if (!selectedCompany && companies.length === 1) {
      setSelectedCompany(companies[0]);
    }
  }, [companies, selectedCompany]);

  const modDef = getModuleDef(module);

  const categories = useMemo(() => {
    const all = listFieldsByCategory(module);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all
      .map(({ category, fields }) => ({
        category,
        fields: fields.filter(
          (f) =>
            f.label.toLowerCase().includes(q) ||
            f.key.toLowerCase().includes(q) ||
            (f.group?.toLowerCase().includes(q) ?? false),
        ),
      }))
      .filter((g) => g.fields.length > 0);
  }, [module, search]);

  const handleToggle = async (fieldKey: string, required: boolean) => {
    if (!selectedCompany) {
      toast.error('יש לבחור חברה לפני שינוי שדות חובה');
      return;
    }
    const id = `${module}.${fieldKey}`;
    setSavingKey(id);
    try {
      await setFieldRequired(module, fieldKey, required, selectedCompany);
      toast.success(
        required
          ? `השדה סומן כחובה עבור ${selectedCompany}`
          : `השדה סומן כאופציונלי עבור ${selectedCompany}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה בשמירה';
      toast.error(msg);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <>
      <AdminBreadcrumb module={module} />

      <header className="mb-4">
        <h1 className="page-header flex items-center gap-2 mb-2">
          <Asterisk size={26} className="text-primary" />
          {title ?? `שדות חובה — ${modDef.label}`}
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          {description ??
            'הגדרה לכל שדה: חובה (כוכבית בטופס) או אופציונלי. ההגדרות לפי חברה ומשפיעות על כל המסכים שמשתמשים בשדות חובה.'}
        </p>
      </header>

      <CompanyPicker
        companies={companies}
        selectedCompany={selectedCompany}
        onSelect={setSelectedCompany}
        loading={loadingCompanies}
      />

      {!selectedCompany ? (
        <p className="text-muted-foreground text-sm py-8 text-center">
          בחר חברה / עסק כדי להציג ולערוך את שדות החובה שלה.
        </p>
      ) : (
        <>
          <div className="relative max-w-md mb-6">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש שדה (מספר רכב, ביטוח מקיף...)"
              className="pr-9"
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12">
              <Loader2 className="animate-spin" size={20} />
              טוען הגדרות...
            </div>
          ) : categories.length === 0 ? (
            <p className="text-muted-foreground text-sm">לא נמצאו שדות התואמים לחיפוש.</p>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                עריכה עבור: <span className="font-semibold text-foreground">{selectedCompany}</span>
              </p>
              {categories.map(({ category, fields }) => (
                <section key={category} className="rounded-xl border bg-card p-4 space-y-3">
                  <h2 className="font-semibold text-base border-b pb-2">{category}</h2>
                  <ul className="divide-y">
                    {fields.map((f) => {
                      const required = isFieldRequired(module, f.key, selectedCompany);
                      const rowId = `${module}.${f.key}`;
                      const busy = savingKey === rowId;
                      return (
                        <li
                          key={f.key}
                          className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm flex items-center gap-1">
                              {required && (
                                <Asterisk size={14} className="text-destructive shrink-0" aria-hidden />
                              )}
                              {f.label}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono" dir="ltr">
                              {f.key}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-muted-foreground w-16 text-left">
                              {required ? 'חובה' : 'אופציונלי'}
                            </span>
                            <Switch
                              checked={required}
                              disabled={busy}
                              onCheckedChange={(checked) => void handleToggle(f.key, checked)}
                              aria-label={`${f.label} — ${required ? 'חובה' : 'אופציונלי'}`}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Generic module hub — drivers, customers, etc. */
export function ModuleAdminHub({ module }: { module: RequiredFieldModule }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const meta = MODULE_ADMIN_PATHS[module];
  const modDef = getModuleDef(module);

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in space-y-4 pb-8">
        <Link to="/admin-home" className="text-primary text-sm font-medium">
          ← חזרה למרכז ניהול
        </Link>
        <p className="text-muted-foreground">מודול זה זמין למנהל מערכת בלבד.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <nav className="text-sm text-muted-foreground flex flex-wrap items-center gap-1">
        <Link to="/admin-home" className="text-primary hover:underline">
          מרכז ניהול
        </Link>
        <span>/</span>
        <Link to="/admin/modules" className="text-primary hover:underline">
          כפתורים ומודולים
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{meta.label}</span>
      </nav>

      <header>
        <h1 className="page-header mb-2">{modDef.label}</h1>
        <p className="text-muted-foreground text-sm">הגדרות מודול {modDef.label}</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Link
          to={`${meta.hub}/required-fields`}
          className="card-elevated p-4 hover:border-primary/50 transition-colors block"
        >
          <div className="flex items-center gap-2 font-semibold mb-1">
            <Asterisk size={18} className="text-primary" />
            שדות חובה
          </div>
          <p className="text-sm text-muted-foreground">חובה / אופציונלי לכל שדה בטופס — לפי חברה</p>
        </Link>
      </div>
    </div>
  );
}

export function VehicleRequiredFieldsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in space-y-4 pb-8">
        <Link to="/admin-home" className="text-primary text-sm font-medium">
          ← חזרה למרכז ניהול
        </Link>
        <p className="text-muted-foreground">מודול זה זמין למנהל מערכת בלבד.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <RequiredFieldsPanel
        module="vehicles"
        title="שדות חובה בכרטיס רכב"
        description="כל שדות כרטיס הרכב במקום אחד, לפי חברה / עסק: מספר רכב, רישיון, ביטוח חובה, ביטוח מקיף, ביטוח צד ג׳ ועוד. אותן הגדרות חלות על טופס רכב, כרטיס רכב, חוסרים והתראות."
      />
    </div>
  );
}

export function ModuleRequiredFieldsPage({ module }: { module: RequiredFieldModule }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const modDef = getModuleDef(module);

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in space-y-4 pb-8">
        <Link to="/admin-home" className="text-primary text-sm font-medium">
          ← חזרה למרכז ניהול
        </Link>
        <p className="text-muted-foreground">מודול זה זמין למנהל מערכת בלבד.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <RequiredFieldsPanel module={module} title={`שדות חובה — ${modDef.label}`} />
    </div>
  );
}

/** @deprecated Use module-specific routes under /admin/modules */
export default function RequiredFieldsSettings() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in space-y-4 pb-8">
        <Link to="/admin-home" className="text-primary text-sm font-medium">
          ← חזרה למרכז ניהול
        </Link>
        <p className="text-muted-foreground">מודול זה זמין למנהל מערכת בלבד.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <Link to="/admin/modules" className="text-primary text-sm font-medium">
        ← כפתורים ומודולים
      </Link>
      <p className="text-muted-foreground text-sm">
        בחר מודול מ{' '}
        <Link to="/admin/modules" className="text-primary underline">
          כפתורים ומודולים
        </Link>
        . לרכבים:{' '}
        <Link to="/admin/modules/vehicles/required-fields" className="text-primary underline">
          ניהול רכבים → שדות חובה
        </Link>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REQUIRED_FIELD_MODULES.map((m) => (
          <Link
            key={m.key}
            to={`/admin/modules/${m.key === 'vehicles' ? 'vehicles' : m.key}/required-fields`}
            className="card-elevated p-4 hover:border-primary/50"
          >
            <span className="font-semibold">{m.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
