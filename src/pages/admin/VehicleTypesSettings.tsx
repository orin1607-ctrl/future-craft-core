import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, ChevronLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_VEHICLE_TYPES,
  saveVehicleTypes,
  fetchVehicleTypes,
  type VehicleTypeOption,
} from '@/lib/vehicleTypesConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function VehicleTypesSettings() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [types, setTypes] = useState<VehicleTypeOption[]>(DEFAULT_VEHICLE_TYPES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    fetchVehicleTypes()
      .then(setTypes)
      .finally(() => setLoading(false));
  }, []);

  const addType = () => {
    const label = newLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/\s+/g, '_');
    if (types.some((t) => t.label === label || t.id === id)) {
      toast.error('סוג רכב זה כבר קיים');
      return;
    }
    setTypes((prev) => [...prev, { id, label }]);
    setNewLabel('');
  };

  const removeType = (id: string) => {
    if (types.length <= 1) {
      toast.error('חייב להישאר לפחות סוג רכב אחד');
      return;
    }
    setTypes((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveVehicleTypes(types, user?.id);
      toast.success('סוגי הרכב נשמרו — יופיעו ב-Dalia New');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setTypes([...DEFAULT_VEHICLE_TYPES]);
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
      <nav className="text-sm text-muted-foreground flex flex-wrap items-center gap-1">
        <Link to="/admin-home" className="text-primary hover:underline">
          מרכז ניהול
        </Link>
        <span>/</span>
        <Link to="/admin/modules" className="text-primary hover:underline">
          כפתורים ומודולים
        </Link>
        <span>/</span>
        <Link to="/admin/modules/vehicles" className="text-primary hover:underline">
          ניהול רכבים
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">סוגי רכב</span>
      </nav>

      <header>
        <h1 className="page-header flex items-center gap-3 mb-2">
          <Car size={28} className="text-primary" />
          סוגי רכב
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          רשימת סוגי הרכב לבחירה בטופס Dalia New. נשמר ב-Supabase (dalia_form_config) ומסונכרן עם Staging.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> טוען...
        </div>
      ) : (
        <>
          <ul className="space-y-2 max-w-lg">
            {types.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <span className="font-medium">{t.label}</span>
                <button
                  type="button"
                  onClick={() => removeType(t.id)}
                  className="text-muted-foreground hover:text-destructive p-1"
                  aria-label={`הסר ${t.label}`}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2 max-w-lg">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="סוג רכב חדש..."
              onKeyDown={(e) => e.key === 'Enter' && addType()}
            />
            <Button type="button" variant="outline" onClick={addType}>
              <Plus size={16} className="ml-1" /> הוסף
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="animate-spin ml-2" size={16} /> : null}
              שמור
            </Button>
            <Button type="button" variant="outline" onClick={resetDefaults}>
              איפוס לברירת מחדל
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
