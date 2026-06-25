import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Asterisk, ChevronLeft, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useRequiredFields } from '@/contexts/RequiredFieldsContext';
import {
  REQUIRED_FIELD_MODULES,
  listFieldsByCategory,
  type RequiredFieldModule,
} from '@/lib/requiredFieldsSchema';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

export default function RequiredFieldsSettings() {
  const { user } = useAuth();
  const { loading, isFieldRequired, setFieldRequired } = useRequiredFields();
  const [activeModule, setActiveModule] = useState<RequiredFieldModule>('vehicles');
  const [search, setSearch] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';

  const categories = useMemo(() => {
    const all = listFieldsByCategory(activeModule);
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
  }, [activeModule, search]);

  const handleToggle = async (module: RequiredFieldModule, fieldKey: string, required: boolean) => {
    const id = `${module}.${fieldKey}`;
    setSavingKey(id);
    try {
      await setFieldRequired(module, fieldKey, required);
      toast.success(required ? 'השדה סומן כחובה' : 'השדה סומן כאופציונלי');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה בשמירה';
      toast.error(msg);
    } finally {
      setSavingKey(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in space-y-4 pb-8">
        <Link to="/admin-home" className="text-primary text-sm font-medium inline-flex items-center gap-1">
          <ChevronLeft size={16} /> חזרה למרכז ניהול
        </Link>
        <p className="text-muted-foreground">מודול זה זמין למנהל מערכת בלבד.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <div>
        <Link to="/admin-home" className="text-primary text-sm font-medium inline-flex items-center gap-1 mb-3">
          <ChevronLeft size={16} /> חזרה למרכז ניהול
        </Link>
        <h1 className="page-header flex items-center gap-2 mb-2">
          <Asterisk size={26} className="text-primary" />
          ניהול שדות חובה
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          הגדרה מרכזית לשדות חובה בכל מודולי המערכת. שינוי כאן מתעדכן מיידית בטפסים הרלוונטיים.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש שדה..."
          className="pr-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12">
          <Loader2 className="animate-spin" size={20} />
          טוען הגדרות...
        </div>
      ) : (
        <Tabs value={activeModule} onValueChange={(v) => setActiveModule(v as RequiredFieldModule)}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            {REQUIRED_FIELD_MODULES.map((m) => (
              <TabsTrigger key={m.key} value={m.key} className="text-sm">
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {REQUIRED_FIELD_MODULES.map((m) => (
            <TabsContent key={m.key} value={m.key} className="space-y-6 mt-4">
              {categories.length === 0 ? (
                <p className="text-muted-foreground text-sm">לא נמצאו שדות התואמים לחיפוש.</p>
              ) : (
                categories.map(({ category, fields }) => (
                  <section key={category} className="rounded-xl border bg-card p-4 space-y-3">
                    <h2 className="font-semibold text-base border-b pb-2">{category}</h2>
                    <ul className="divide-y">
                      {fields.map((f) => {
                        const required = isFieldRequired(m.key, f.key);
                        const rowId = `${m.key}.${f.key}`;
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
                                {f.group ? ` · ${f.group}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs text-muted-foreground w-16 text-left">
                                {required ? 'חובה' : 'אופציונלי'}
                              </span>
                              <Switch
                                checked={required}
                                disabled={busy}
                                onCheckedChange={(checked) => void handleToggle(m.key, f.key, checked)}
                                aria-label={`${f.label} — ${required ? 'חובה' : 'אופציונלי'}`}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
