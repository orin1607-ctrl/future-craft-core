/**
 * "שמירת מסמך בדליה" — Staging only.
 * Multi-module document receiver for Android Web Share Target, file pickers, and mobile cameras.
 * Supports saving directly to:
 * 1. ניהול תביעות (Claims)
 * 2. ניהול מוסך (Garage)
 * 3. ניהול רכבים — דליה (Vehicles)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClaimsApi } from '@/features/claims/claimsService';
import type { ClaimRecord } from '@/features/claims/claimsConstants';
import { readPdfText } from '@/features/claims/claimDocumentRead';
import { deleteShareBatch, listShareBatches } from '@/features/claims/shareInbox/shareStore';
import { isShareTargetEnabled } from '@/features/claims/shareInbox/registerShareTarget';
import { checkSharedFile } from '@/features/claims/shareInbox/shareMatch';
import {
  extractPlate,
  extractCaseNumber,
  suggestDocumentName,
  searchClaimsTargets,
  searchGarageTargets,
  searchVehicleTargets,
  loadUserVehicles,
  loadUserGarageCases,
  saveSharedFileToTarget,
  type ShareModule,
  type ShareTarget,
  type VehicleTarget,
} from '@/features/claims/shareInbox/shareMultiService';
import type { GarageCase } from '@/modules/garage-management/garageBook';
import { usePwaInstall } from '@/features/claims/shareInbox/usePwaInstall';

type ItemStatus = 'reading' | 'saving' | 'saved' | 'duplicate' | 'choose' | 'failed' | 'invalid';

interface ShareItem {
  key: string;
  batchId: string;
  name: string;
  customName: string;
  type: string;
  size: number;
  blob: Blob;
  sharedText: string;
  status: ItemStatus;
  detectedPlate?: string;
  detectedCase?: string;
  savedTargetTitle?: string;
  savedTargetUrl?: string;
  error?: string;
  picked: boolean;
  thumb?: string;
}

const DONE: ItemStatus[] = ['saved', 'duplicate', 'invalid'];

const STATUS_LABEL: Record<ItemStatus, string> = {
  reading: 'מזהה פרטים…',
  saving: 'שומר…',
  saved: 'נשמר בהצלחה',
  duplicate: 'כבר קיים בתיק',
  choose: 'מוכן לשמירה',
  failed: 'השמירה נכשלה',
  invalid: 'קובץ לא נתמך',
};

const COMMON_NAMES = [
  'תמונת נזק',
  'צילום רישיון רכב',
  'הצעת מחיר Car-Part',
  'חשבונית תיקון',
  'דוח שמאי',
  'הזמנת עבודה',
];

let seq = 0;
function makeItem(file: { name: string; type: string; size: number; blob: Blob }, batchId: string, sharedText: string): ShareItem {
  seq += 1;
  const isImage = /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type);
  const initialName = suggestDocumentName(file.name, file.type);
  return {
    key: `i${seq}`,
    batchId,
    name: file.name,
    customName: initialName,
    type: file.type,
    size: file.size,
    blob: file.blob,
    sharedText,
    status: 'reading',
    picked: true,
    thumb: isImage ? URL.createObjectURL(file.blob) : undefined,
  };
}

export default function ClaimsShareInboxPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const enabled = isShareTargetEnabled({ killed: false });
  const { canInstall, isInstalled, triggerInstall } = usePwaInstall();
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const api = useMemo(() => createClaimsApi({
    id: user?.id || '',
    full_name: user?.full_name || '',
    email: user?.email,
    role: user?.role,
    hasClaimsAccess: user?.hasClaimsAccess,
  }), [user?.id, user?.full_name, user?.email, user?.role, user?.hasClaimsAccess]);

  const [activeModule, setActiveModule] = useState<ShareModule>('claims');
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [garageCases, setGarageCases] = useState<GarageCase[]>([]);
  const [vehicles, setVehicles] = useState<VehicleTarget[]>([]);
  const [dataError, setDataError] = useState('');
  
  const [items, setItems] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<ShareTarget | null>(null);
  const [batchName, setBatchName] = useState('');
  const [saveSuccessSummary, setSaveSuccessSummary] = useState<{ count: number; targetTitle: string; targetUrl: string } | null>(null);

  const itemsRef = useRef<ShareItem[]>([]);
  itemsRef.current = items;

  const patch = useCallback((key: string, p: Partial<ShareItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }, []);

  // Identify file content: plate, claim number, and suggested name
  const identify = useCallback(async (item: ShareItem) => {
    const check = checkSharedFile(item);
    if (!check.ok) {
      patch(item.key, { status: 'invalid', error: check.error });
      return;
    }
    let text = '';
    if (check.isPdf) {
      try {
        text = await readPdfText(new Uint8Array(await item.blob.arrayBuffer()));
      } catch {
        text = '';
      }
    }

    const combinedText = `${item.name} ${item.sharedText || ''} ${text}`;
    const detectedPlate = extractPlate(combinedText);
    const detectedCase = extractCaseNumber(combinedText);

    patch(item.key, {
      status: 'choose',
      detectedPlate: detectedPlate || undefined,
      detectedCase: detectedCase || undefined,
    });
  }, [patch]);

  const addItems = useCallback(async (next: ShareItem[]) => {
    setItems((prev) => [...prev, ...next]);
    for (const it of next) await identify(it);
  }, [identify]);

  // Initial load: Claims, Garage, Vehicles & Batches from IndexedDB
  const startedRef = useRef(false);
  useEffect(() => {
    if (!user || !enabled || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const [claimsRes, gCases, vList] = await Promise.all([
          api.getClaims(),
          loadUserGarageCases(),
          loadUserVehicles(),
        ]);

        if (claimsRes.success && claimsRes.data) {
          setClaims(claimsRes.data);
        } else if (claimsRes.error) {
          setDataError(String(claimsRes.error));
        }

        setGarageCases(gCases);
        setVehicles(vList);
      } catch (err: any) {
        setDataError(err?.message || 'טעינת הנתונים נכשלה');
      }

      let batches: Awaited<ReturnType<typeof listShareBatches>> = [];
      try {
        batches = await listShareBatches();
      } catch {
        batches = [];
      }
      setLoading(false);
      const fresh = batches.flatMap((b) => b.files.map((f) => makeItem(f, b.id, `${b.title}\n${b.text}`)));
      await addItems(fresh);
    })();
  }, [user, enabled, api, addItems]);

  // Auto-clean IndexedDB once all items in a batch are processed
  useEffect(() => {
    const ids = [...new Set(items.map((i) => i.batchId).filter(Boolean))];
    for (const id of ids) {
      if (items.filter((i) => i.batchId === id).every((i) => DONE.includes(i.status))) {
        void deleteShareBatch(id).catch(() => undefined);
      }
    }
  }, [items]);

  // Clean object URLs on unmount
  useEffect(() => () => {
    itemsRef.current.forEach((i) => i.thumb && URL.revokeObjectURL(i.thumb));
  }, []);

  // Pickers on screen
  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...list].map((f) => makeItem({ name: f.name, type: f.type, size: f.size, blob: f }, '', ''));
    void addItems(next);
  };

  // Group rename
  const applyBatchName = (name: string) => {
    setBatchName(name);
    if (!name.trim()) return;
    const selected = items.filter((i) => i.picked);
    selected.forEach((it, idx) => {
      const numberedName = selected.length > 1 ? `${name.trim()} ${idx + 1}` : name.trim();
      patch(it.key, { customName: numberedName });
    });
  };

  // Autodetect recommended target if plate/claim found
  const waitingItems = items.filter((i) => i.status === 'choose' || i.status === 'failed');
  const pickedWaiting = waitingItems.filter((i) => i.picked);

  const detectedPlate = useMemo(() => {
    const found = waitingItems.find((i) => i.detectedPlate)?.detectedPlate;
    return found || null;
  }, [waitingItems]);

  const detectedCase = useMemo(() => {
    const found = waitingItems.find((i) => i.detectedCase)?.detectedCase;
    return found || null;
  }, [waitingItems]);

  // Auto-suggest target if exact match exists
  useEffect(() => {
    if (selectedTarget) return;

    if (detectedCase) {
      const matchClaim = claims.find((c) => (c.claimNum || '').toUpperCase() === detectedCase || c.id.toUpperCase() === detectedCase);
      if (matchClaim) {
        setActiveModule('claims');
        setSelectedTarget({
          id: matchClaim.id,
          module: 'claims',
          title: `תביעה ${matchClaim.claimNum || matchClaim.id}`,
          subtitle: `רכב ${matchClaim.plate || '—'} · ${matchClaim.clientName || '—'}`,
          plate: matchClaim.plate,
          raw: matchClaim,
        });
        return;
      }
      const matchGarage = garageCases.find((g) => (g.case_number || '').toUpperCase() === detectedCase);
      if (matchGarage) {
        setActiveModule('garage');
        setSelectedTarget({
          id: matchGarage.id,
          module: 'garage',
          title: `כרטיס מוסך ${matchGarage.case_number}`,
          subtitle: `רכב ${matchGarage.vehicle_plate_snapshot || '—'} · ${matchGarage.customer_name_snapshot || '—'}`,
          plate: matchGarage.vehicle_plate_snapshot,
          raw: matchGarage,
        });
        return;
      }
    }

    if (detectedPlate) {
      const cleanPlate = detectedPlate.replace(/\D/g, '');
      const matchClaim = claims.find((c) => (c.plate || '').replace(/\D/g, '') === cleanPlate);
      if (matchClaim) {
        setActiveModule('claims');
        setSelectedTarget({
          id: matchClaim.id,
          module: 'claims',
          title: `תביעה ${matchClaim.claimNum || matchClaim.id}`,
          subtitle: `רכב ${matchClaim.plate} · ${matchClaim.clientName || '—'}`,
          plate: matchClaim.plate,
          raw: matchClaim,
        });
        return;
      }
      const matchGarage = garageCases.find((g) => (g.vehicle_plate_snapshot || '').replace(/\D/g, '') === cleanPlate);
      if (matchGarage) {
        setActiveModule('garage');
        setSelectedTarget({
          id: matchGarage.id,
          module: 'garage',
          title: `כרטיס מוסך ${matchGarage.case_number}`,
          subtitle: `רכב ${matchGarage.vehicle_plate_snapshot} · ${matchGarage.customer_name_snapshot || '—'}`,
          plate: matchGarage.vehicle_plate_snapshot,
          raw: matchGarage,
        });
        return;
      }
      const matchVehicle = vehicles.find((v) => (v.license_plate || '').replace(/\D/g, '') === cleanPlate);
      if (matchVehicle) {
        setActiveModule('vehicles');
        setSelectedTarget({
          id: matchVehicle.id,
          module: 'vehicles',
          title: `רכב ${matchVehicle.license_plate}`,
          subtitle: `${matchVehicle.manufacturer || ''} ${matchVehicle.model || ''} · ${matchVehicle.company_name || matchVehicle.customer_name || ''}`,
          plate: matchVehicle.license_plate,
          raw: matchVehicle,
        });
        return;
      }
    }
  }, [detectedCase, detectedPlate, claims, garageCases, vehicles, selectedTarget]);

  // Search results based on active module and query
  const targetResults = useMemo(() => {
    if (activeModule === 'claims') return searchClaimsTargets(claims, query);
    if (activeModule === 'garage') return searchGarageTargets(garageCases, query);
    if (activeModule === 'vehicles') return searchVehicleTargets(vehicles, query);
    return [];
  }, [activeModule, claims, garageCases, vehicles, query]);

  // Save selected files
  const handleSave = async () => {
    if (!selectedTarget || pickedWaiting.length === 0 || isSaving) return;
    setIsSaving(true);
    let successCount = 0;
    let lastUrl = '';
    let lastTitle = selectedTarget.title;

    for (const it of pickedWaiting) {
      patch(it.key, { status: 'saving', error: undefined });
      const res = await saveSharedFileToTarget({
        target: selectedTarget,
        file: it,
        customName: it.customName || it.name,
        auto: false,
        reason: 'נשמר ידנית בשיתוף לדליה',
        claimsApi: api,
        userId: user?.id,
      });

      if (res.success) {
        successCount++;
        lastUrl = res.targetUrl || lastUrl;
        patch(it.key, {
          status: res.reused ? 'duplicate' : 'saved',
          savedTargetTitle: res.targetLabel,
          savedTargetUrl: res.targetUrl,
        });
      } else {
        patch(it.key, {
          status: 'failed',
          error: res.error || 'שגיאה בשמירה',
        });
      }
    }

    setIsSaving(false);
    if (successCount > 0) {
      setSaveSuccessSummary({
        count: successCount,
        targetTitle: lastTitle,
        targetUrl: lastUrl,
      });
    }
  };

  const discardWaiting = () => {
    const keys = new Set(waitingItems.map((i) => i.key));
    setItems((prev) => prev.map((i) => (keys.has(i.key) ? { ...i, status: 'invalid', error: 'הוסר' } : i)));
  };

  if (!enabled) {
    return (
      <div dir="rtl" className="p-8 text-center text-muted-foreground">
        מערכת ״שתף לדליה״ פעילה כעת בסביבת הבדיקות (STAGING) בלבד.
      </div>
    );
  }

  return (
    <div dir="rtl" className="mx-auto max-w-xl space-y-4 p-4 pb-20">
      {/* Header */}
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">שמירת מסמך בדליה</h1>
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">STAGING</span>
        </div>
        <p className="text-sm text-muted-foreground">
          שמירה ישירה ומאובטחת לתיקי תביעות, כרטיסי מוסך או מסמכי רכב.
        </p>
      </header>

      {/* PWA Installation Banner for Android / Samsung */}
      {!isInstalled && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">📲</span>
              <span className="font-medium">התקנת דליה בטלפון (להופעה בתפריט השיתוף)</span>
            </div>
            {canInstall && (
              <Button size="sm" onClick={() => void triggerInstall()}>
                התקן עכשיו
              </Button>
            )}
            <button
              type="button"
              onClick={() => setShowInstallGuide((v) => !v)}
              className="text-xs text-primary underline"
            >
              {showInstallGuide ? 'סגור הדרכה' : 'איך להתקין?'}
            </button>
          </div>
          {showInstallGuide && (
            <div className="mt-2.5 space-y-1 border-t border-primary/10 pt-2 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">הוראות התקנה לטלפון Samsung Android ב-Google Chrome:</p>
              <ol className="list-inside list-decimal space-y-0.5">
                <li>פתח את הקישור בדפדפן <strong>Google Chrome</strong>.</li>
                <li>לחץ על <strong>3 הנקודות (⋮)</strong> בפינה העליונה של הדפדפן.</li>
                <li>בחר <strong>״התקן אפליקציה״</strong> (Install app) או ״הוסף למסך הבית״.</li>
                <li>לאחר ההתקנה, דליה תופיע כאפליקציה עצמאית ותתווסף אוטומטית לתפריט <strong>״שתף״</strong> בכל הטלפון.</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Share / Network errors */}
      {params.get('share_error') && (
        <div className="rounded-md border border-destructive p-3 text-sm text-destructive">השיתוף לא נקלט. נסה לשתף שוב.</div>
      )}
      {dataError && <div className="rounded-md border border-destructive p-3 text-sm text-destructive">{dataError}</div>}

      {/* Direct Pickers */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
          <span>📁</span>
          <span>בחר תמונות או PDF</span>
          <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { onPick(e.target.files); e.target.value = ''; }} />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
          <span>📷</span>
          <span>צלם</span>
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPick(e.target.files); e.target.value = ''; }} />
        </label>
        {items.length > 0 && (
          <span className="mr-auto text-xs text-muted-foreground">
            {items.length} קבצים בטיפול ({pickedWaiting.length} נבחרו)
          </span>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">טוען נתונים מהמערכת…</p>}
      {!loading && items.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          אין קבצים ממתינים כרגע.
          <br />
          שתף קובץ מ-WhatsApp, מהגלריה או מהמייל ובחר <strong>״דליה״</strong>, או העלה קובץ באמצעות הכפתורים למעלה.
        </div>
      )}

      {/* Success Summary Card with direct link */}
      {saveSuccessSummary && (
        <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-sm space-y-2">
          <div className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-400">
            <span>✅</span>
            <span>{saveSuccessSummary.count} מסמכים נשמרו בהצלחה ב-{saveSuccessSummary.targetTitle}!</span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            {saveSuccessSummary.targetUrl && (
              <Button
                size="sm"
                onClick={() => navigate(saveSuccessSummary.targetUrl)}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                פתח את התיק עכשיו
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSaveSuccessSummary(null)}
            >
              שתף קבצים נוספים
            </Button>
          </div>
        </div>
      )}

      {/* Items List with Preview and Renaming */}
      {items.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">מסמכים שהתקבלו ({items.length})</h2>
            {items.length > 1 && pickedWaiting.length > 1 && (
              <div className="flex items-center gap-2">
                <Input
                  value={batchName}
                  onChange={(e) => applyBatchName(e.target.value)}
                  placeholder="שם קבוצתי לכל הקבצים..."
                  className="h-8 text-xs w-48"
                />
              </div>
            )}
          </div>

          <ul className="divide-y rounded-md border bg-card" data-testid="share-items">
            {items.map((it) => {
              const selectable = it.status === 'choose' || it.status === 'failed';
              return (
                <li key={it.key} className="p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={it.picked}
                        onChange={(e) => patch(it.key, { picked: e.target.checked })}
                        className="mt-1"
                        aria-label={`בחר ${it.name}`}
                      />
                    )}

                    {/* Preview Thumbnail */}
                    {it.thumb ? (
                      <img src={it.thumb} alt="" className="h-14 w-14 shrink-0 rounded object-cover border" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded border bg-muted text-xs font-bold text-muted-foreground">
                        {/pdf/i.test(it.type) || /\.pdf$/i.test(it.name) ? 'PDF' : 'קובץ'}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Editable Document Name */}
                      {selectable ? (
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">שם המסמך בתיק:</label>
                          <Input
                            value={it.customName}
                            onChange={(e) => patch(it.key, { customName: e.target.value })}
                            placeholder="הזן שם למסמך (למשל: תמונת נזק)"
                            className="h-8 text-xs font-medium"
                          />
                        </div>
                      ) : (
                        <div className="truncate text-sm font-semibold" dir="auto">{it.customName || it.name}</div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{STATUS_LABEL[it.status]}</span>
                        <span className="text-[10px] text-muted-foreground/60">({(it.size / 1024).toFixed(0)} KB)</span>
                        {it.detectedPlate && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-primary">
                            לוחית: {it.detectedPlate}
                          </span>
                        )}
                        {it.detectedCase && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-primary">
                            תיק: {it.detectedCase}
                          </span>
                        )}
                        {it.savedTargetTitle && <span className="font-medium text-green-600">· נשמר ב-{it.savedTargetTitle}</span>}
                        {it.error && <span className="text-destructive">· {it.error}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Quick-pick Name Chips */}
                  {selectable && (
                    <div className="flex flex-wrap items-center gap-1 pr-9 pt-1">
                      <span className="text-[10px] text-muted-foreground ml-1">הצעות:</span>
                      {COMMON_NAMES.map((cName) => (
                        <button
                          key={cName}
                          type="button"
                          onClick={() => patch(it.key, { customName: cName })}
                          className="rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          {cName}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Choose Destination: Area & Target */}
      {waitingItems.length > 0 && (
        <section className="space-y-4 rounded-lg border p-4 bg-card" data-testid="share-choose">
          <div className="space-y-1">
            <h2 className="text-base font-bold">בחירת יעד לשמירה</h2>
            <p className="text-xs text-muted-foreground">
              בחר את אזור המערכת וחפש את התיק או הרכב שבו יישמרו {pickedWaiting.length} הקבצים שנבחרו.
            </p>
          </div>

          {/* Module Selector (3 Areas) */}
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-center text-xs font-medium">
            <button
              type="button"
              onClick={() => { setActiveModule('claims'); setSelectedTarget(null); setQuery(''); }}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 transition-all ${
                activeModule === 'claims' ? 'bg-background shadow text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>🛡️</span>
              <span>ניהול תביעות</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveModule('garage'); setSelectedTarget(null); setQuery(''); }}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 transition-all ${
                activeModule === 'garage' ? 'bg-background shadow text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>🔧</span>
              <span>ניהול מוסך</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveModule('vehicles'); setSelectedTarget(null); setQuery(''); }}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 transition-all ${
                activeModule === 'vehicles' ? 'bg-background shadow text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>🚗</span>
              <span>ניהול רכבים</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="space-y-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                activeModule === 'claims'
                  ? 'חיפוש לפי מספר תביעה, מספר רכב או שם לקוח…'
                  : activeModule === 'garage'
                  ? 'חיפוש לפי מספר כרטיס מוסך, מספר רכב או לקוח…'
                  : 'חיפוש לפי מספר רכב, דגם או חברה…'
              }
              inputMode="search"
              className="text-sm"
            />
          </div>

          {/* Autodetected Recommendation Card */}
          {selectedTarget && !query && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-primary">✨ יעד נבחר:</span>
                <span className="text-[10px] text-muted-foreground">לחץ על יעד אחר ברשימה לשינוי</span>
              </div>
              <div className="font-bold text-sm">{selectedTarget.title}</div>
              <div className="text-xs text-muted-foreground">{selectedTarget.subtitle}</div>
              {selectedTarget.extra && <div className="text-[11px] text-muted-foreground/80">{selectedTarget.extra}</div>}
            </div>
          )}

          {/* Search Results */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {targetResults.length > 0 ? (
              targetResults.map((t) => {
                const isSelected = selectedTarget?.id === t.id && selectedTarget?.module === t.module;
                return (
                  <button
                    key={`${t.module}-${t.id}`}
                    type="button"
                    onClick={() => setSelectedTarget(t)}
                    className={`w-full rounded-md border p-2.5 text-right text-xs transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'hover:bg-accent text-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{t.title}</span>
                      {isSelected && <span className="text-xs">✓ נבחר</span>}
                    </div>
                    <div className="text-muted-foreground text-xs mt-0.5">{t.subtitle}</div>
                    {t.extra && <div className="text-[10px] text-muted-foreground/80 mt-0.5">{t.extra}</div>}
                  </button>
                );
              })
            ) : (
              <p className="text-center py-4 text-xs text-muted-foreground">
                {query.trim() ? 'לא נמצאה תוצאה מתאימה. נסה מילות חיפוש אחרות.' : 'הקלד מספר רכב, מספר תיק או שם לקוח.'}
              </p>
            )}
          </div>

          {/* Save & Discard Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => void handleSave()}
              disabled={!selectedTarget || pickedWaiting.length === 0 || isSaving}
              className="flex-1 py-5 text-sm font-bold"
            >
              {isSaving ? 'שומר בתיק…' : selectedTarget ? `שמור ${pickedWaiting.length} קבצים ב-${selectedTarget.title}` : 'בחר יעד לשמירה'}
            </Button>
            <Button variant="outline" onClick={discardWaiting} disabled={isSaving}>
              הסר
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
