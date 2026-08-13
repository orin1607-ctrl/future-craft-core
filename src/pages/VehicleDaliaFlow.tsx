/**
 * Unified new + edit vehicle flow — Dalia full form only.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import VehicleNewFormDalia from '@/components/vehicles/vehicleNewDalia/VehicleNewFormDalia';
import { loadDaliaFromVehicleRow } from '@/lib/daliaVehicleLoad';
import { logVehicleEvent } from '@/lib/vehicleEventLog';
import {
  fetchVehicleFromGov,
  GovVehicleLookupError,
  type GovVehicleData,
} from '@/lib/govVehicleLookup';
import { VehiclePlateLine } from '@/components/vehicles/vehiclePlateDisplay';
import { useVehicleTypes } from '@/hooks/useVehicleTypes';

type VehicleRow = Record<string, unknown> & {
  id: string;
  license_plate: string;
  internal_number?: string | null;
  assigned_driver_id?: string | null;
};

const inputClass =
  'w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none';

export function VehicleDaliaFlow({
  vehicle,
  onDone,
  onBack,
  user,
  previewMode,
  previewInitialStep,
  previewMockGov,
}: {
  vehicle: VehicleRow | null;
  onDone: (savedVehicleId?: string) => void;
  onBack: () => void;
  user: { id?: string; full_name?: string; company_name?: string } | null;
  previewMode?: boolean;
  previewInitialStep?: 'intro' | 'full';
  previewMockGov?: boolean;
}) {
  const isEdit = !!vehicle;
  const loaded = useMemo(
    () => (vehicle ? loadDaliaFromVehicleRow(vehicle as Record<string, unknown>) : null),
    [vehicle],
  );
  const [driverEnrichedValues, setDriverEnrichedValues] = useState<Record<string, string> | undefined>();
  const driverFetchRef = useRef<string | null>(null);

  useEffect(() => {
    if (!vehicle || previewMode) {
      setDriverEnrichedValues(undefined);
      return;
    }
    const driverId = vehicle.assigned_driver_id as string | null | undefined;
    if (!driverId) {
      setDriverEnrichedValues(undefined);
      return;
    }
    if (loaded?.values.assigned_driver) {
      setDriverEnrichedValues(undefined);
      return;
    }
    if (driverFetchRef.current === driverId) return;
    driverFetchRef.current = driverId;
    supabase
      .from('drivers')
      .select('full_name')
      .eq('id', driverId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) {
          setDriverEnrichedValues({ assigned_driver: data.full_name });
        }
      });
  }, [vehicle, loaded, previewMode]);

  const mergedLoadedValues = useMemo(() => {
    const base = { ...(loaded?.values || {}), ...(driverEnrichedValues || {}) };
    if (introVehicleType) base.vehicle_type = introVehicleType;
    return Object.keys(base).length ? base : undefined;
  }, [loaded, driverEnrichedValues, introVehicleType]);

  const { types: vehicleTypes } = useVehicleTypes();
  const [introVehicleType, setIntroVehicleType] = useState(
    String((vehicle as { vehicle_type?: string } | null)?.vehicle_type || ''),
  );
  const [licensePlate, setLicensePlate] = useState(vehicle?.license_plate || '');
  const [internalNumber, setInternalNumber] = useState(vehicle?.internal_number || '');
  const [govData, setGovData] = useState<GovVehicleData | null>(null);
  const [govDialogOpen, setGovDialogOpen] = useState(false);
  const [govLoading, setGovLoading] = useState(false);
  const [govDataApplied, setGovDataApplied] = useState(false);
  const [formStep, setFormStep] = useState<'intro' | 'full'>(
    isEdit ? 'full' : previewInitialStep || 'intro',
  );

  useEffect(() => {
    if (!previewMockGov || isEdit) return;
    setLicensePlate('12-345-67');
    setInternalNumber('VH-099');
    setGovDataApplied(true);
    setFormStep('full');
  }, [previewMockGov, isEdit]);

  const showIntro = !isEdit && formStep === 'intro';
  const showFullForm = isEdit || formStep === 'full';

  const handleCancelFlow = async () => {
    const hasDraft =
      !isEdit &&
      (licensePlate || internalNumber || govDataApplied);
    if (hasDraft && !confirm('ביטול פתיחת רכב — השינויים לא יישמרו. להמשיך?')) return;
    if (!isEdit && !previewMode && licensePlate.replace(/[-\s]/g, '')) {
      await logVehicleEvent({
        vehiclePlate: licensePlate,
        companyName: user?.company_name || '',
        action: 'ביטול פתיחת רכב',
        details: internalNumber ? `מספר פנימי: ${internalNumber}` : undefined,
        userId: user?.id,
        userName: user?.full_name,
      });
    }
    onBack();
  };

  const goToFullForm = () => {
    if (!licensePlate.replace(/[-\s]/g, '')) {
      toast.error('יש להזין מספר רכב לפני המשך');
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setFormStep('full');
  };

  const handleGovLookup = async () => {
    if (!licensePlate.replace(/[-\s]/g, '')) {
      toast.error('יש להזין מספר רכב לפני החיפוש');
      return;
    }
    setGovLoading(true);
    try {
      const data = await fetchVehicleFromGov(licensePlate);
      if (data) {
        setGovData(data);
        setGovDialogOpen(true);
      } else {
        toast.error('לא נמצא רכב עם מספר זה במאגר הממשלתי');
      }
    } catch (err) {
      toast.error(
        err instanceof GovVehicleLookupError ? err.message : 'שגיאה בחיפוש במאגר הממשלתי',
      );
    }
    setGovLoading(false);
  };

  const applyGovData = () => {
    if (!govData) return;
    setGovDataApplied(true);
    setGovDialogOpen(false);
    if (!isEdit) setFormStep('full');
    toast.success('פרטי הרכב מולאו בהצלחה');
  };

  const govDialog = (
    <Dialog open={govDialogOpen} onOpenChange={setGovDialogOpen}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>נתונים ממשרד הרישוי</DialogTitle>
        </DialogHeader>
        {govData && (
          <div className="space-y-2 text-sm">
            <p>
              <strong>יצרן:</strong> {govData.tozeret_nm}
            </p>
            <p>
              <strong>דגם:</strong> {govData.kinuy_mishari || govData.degem_nm}
            </p>
            <p>
              <strong>שנה:</strong> {govData.shnat_yitzur}
            </p>
            <div className="flex gap-2 pt-3">
              <Button onClick={applyGovData} className="flex-1">
                מלא פרטים בטופס
              </Button>
              <Button variant="outline" onClick={() => setGovDialogOpen(false)}>
                סגור
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  return (
    <div className={`animate-fade-in ${showFullForm ? 'pb-8' : ''}`}>
      {govDialog}

      {showIntro && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => void handleCancelFlow()}
              className="flex items-center gap-2 text-primary text-lg font-medium min-h-[48px]"
            >
              <ArrowRight size={20} /> ביטול
            </button>
          </div>
          <h1 className="text-2xl font-bold mb-2">הוספת רכב חדש</h1>
          <div className="card-elevated p-4 mb-6 border-primary/30 bg-primary/5">
            <p className="text-sm font-bold text-primary mb-1">שלב 1 — מספר רכב ורישוי</p>
            <p className="text-sm text-muted-foreground">
              אחרי המשך — טופס פתיחת רכב חדש (Dalia · כל השדות).
            </p>
          </div>
          <div className="space-y-5 card-elevated p-4">
            <div>
              <label className="block text-lg font-medium mb-2">מספר רכב (רישוי) *</label>
              <div className="flex gap-2 flex-wrap">
                <input
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  placeholder="12-345-67"
                  className={`${inputClass} flex-1 min-w-[140px]`}
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
                <Button
                  type="button"
                  onClick={handleGovLookup}
                  disabled={govLoading}
                  variant="outline"
                  className="h-auto px-4 text-lg rounded-xl border-2 whitespace-nowrap"
                >
                  {govLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Search className="h-5 w-5 ml-1" />
                  )}
                  משרד הרישוי / התחבורה
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-lg font-medium mb-2">מספר פנימי</label>
              <input
                value={internalNumber}
                onChange={(e) => setInternalNumber(e.target.value)}
                placeholder="מספר פנימי בארגון..."
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-lg font-medium mb-2">סוג רכב</label>
              <select
                value={introVehicleType}
                onChange={(e) => setIntroVehicleType(e.target.value)}
                className={inputClass}
              >
                <option value="">בחרו סוג רכב...</option>
                {vehicleTypes.map((t) => (
                  <option key={t.id} value={t.label}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                כולל נגרר, טרקטור, ציוד הנדסי ורכב זעיר. אפשר לשנות גם בטופס המלא.
              </p>
            </div>
            <Button type="button" onClick={goToFullForm} className="w-full py-5 text-xl font-bold">
              המשך לטופס המלא →
            </Button>
            <Link
              to="/vehicle-import"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-border font-bold text-primary"
            >
              <Upload size={18} /> יבוא רכבים
            </Link>
            <button
              type="button"
              onClick={() => void handleCancelFlow()}
              className="w-full py-3 text-destructive font-bold"
            >
              ביטול פתיחת רכב
            </button>
          </div>
        </>
      )}

      {showFullForm && (
        <>
          <div className="mb-3 px-1">
            {!isEdit ? (
              <button
                type="button"
                onClick={() => setFormStep('intro')}
                className="flex items-center gap-2 text-primary text-sm font-medium mb-2 min-h-[44px]"
              >
                <ArrowRight size={18} /> חזרה לשלב 1 (מספר רכב)
              </button>
            ) : (
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-2 text-primary text-sm font-medium mb-2 min-h-[44px]"
              >
                <ArrowRight size={18} /> חזרה לכרטיס הרכב
              </button>
            )}
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {isEdit ? 'עריכת רכב: ' : 'פותח רכב: '}
              </span>
              <span className="font-bold">
                <VehiclePlateLine
                  plate={(licensePlate || vehicle?.license_plate || '').trim()}
                  internal={(internalNumber || vehicle?.internal_number || '').toString().trim() || null}
                  className="text-sm font-bold"
                />
              </span>
            </div>
          </div>
          <VehicleNewFormDalia
            key={vehicle?.id || `new-${licensePlate}`}
            initialPlate={licensePlate || vehicle?.license_plate || ''}
            initialInternal={internalNumber || String(vehicle?.internal_number || '')}
            initialGovData={govDataApplied && govData ? govData : null}
            loadedValues={mergedLoadedValues}
            loadedExtras={loaded?.extras}
            vehicleId={vehicle?.id}
            isEdit={isEdit}
            onBackToStep1={() => (isEdit ? onBack() : setFormStep('intro'))}
            onCancel={() => void handleCancelFlow()}
            onGovFetched={(data) => {
              setGovData(data);
              setGovDataApplied(true);
            }}
            onSaved={onDone}
            showPreviewBanner={!isEdit}
            previewMode={previewMode}
          />
        </>
      )}
    </div>
  );
}

/** Back-compat export for dev previews */
export function VehicleForm(props: Parameters<typeof VehicleDaliaFlow>[0] & { drivers?: unknown[]; onDone: (id?: string) => void }) {
  const { drivers: _d, ...rest } = props;
  return <VehicleDaliaFlow {...rest} />;
}
