import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DaliaFormValuesProvider, useDaliaFormValuesRequired } from './DaliaFormValuesContext';
import { toast } from 'sonner';
import {
  Fld,
  FileWrap,
  InsuranceBlock,
  LeasingRouteFields,
  LoanFields,
  OwnershipBasicFields,
  PledgeFields,
  ROUTE_MAP,
} from './vehicleNewDaliaBlocks';
import './vehicle-new-dalia.css';
import {
  fetchVehicleFromGov,
  GovVehicleLookupError,
  mapGovDataToNewFormFields,
  type GovVehicleData,
} from '@/lib/govVehicleLookup';
import { useAuth } from '@/contexts/AuthContext';
import { uploadDocument } from '@/lib/uploadDocument';
import {
  collectDaliaFormValues,
  persistDaliaVehicle,
  formatVehiclePersistError,
  type DaliaPersistExtras,
} from '@/lib/daliaVehiclePersist';

export type DaliaDoc = {
  category: string;
  name: string;
  link: string;
  file: string;
  notes: string;
  date: string;
};

const SECTION_SAVE_LABELS: Record<number, string> = {
  1: 'שמור פרטי רכב',
  2: 'שמור בעלות ומימון',
  3: 'שמור ביטוחים ורישיונות',
  4: 'שמור ציוד וכלים מיוחדים',
  5: 'שמור טיפולים ותחזוקה',
  6: 'שמור מסמך',
};

const STEP_SEC: Record<string, string> = {
  '1': 'sec1',
  '2': 'sec2',
  '3': 'sec3',
  '4': 'sec4',
  '5': 'sec5',
  '6': 'sec6',
  '7': 'sec7',
};

export type VehicleNewFormDaliaProps = {
  initialPlate?: string;
  initialInternal?: string;
  onBackToStep1: () => void;
  onCancel: () => void;
  /** נקרא אחרי שליפה מוצלחת — לשמירת מצב בזרימת Vehicles (דיאלוג שלב 1 וכו') */
  onGovFetched?: (data: GovVehicleData) => void;
  /** אם כבר נמשכו נתונים בשלב 1 — ממלא את הטופס בכניסה */
  initialGovData?: GovVehicleData | null;
  showPreviewBanner?: boolean;
  /** לאחר שמירה מוצלחת ל-Supabase — מזהה רכב */
  onSaved?: (vehicleId: string) => void;
  /** תצוגת dev בלבד — ללא שמירה ל-DB */
  previewMode?: boolean;
  /** עריכת רכב קיים — טעינה מ-Supabase */
  vehicleId?: string;
  isEdit?: boolean;
  loadedValues?: Record<string, string>;
  loadedExtras?: Partial<DaliaPersistExtras>;
};

export default function VehicleNewFormDalia(props: VehicleNewFormDaliaProps) {
  const initialValues = useMemo(
    () => ({
      vehicle_plate: props.initialPlate || '',
      internal_number: props.initialInternal || '',
      vehicle_status: 'פעיל',
      maintenance_method: 'דליה',
      mandatory_insurance_type: 'ביטוח חובה',
      comprehensive_insurance_type: 'ביטוח מקיף',
      third_party_insurance_type: 'ביטוח צד ג',
      ...props.loadedValues,
    }),
    [props.initialPlate, props.initialInternal, props.loadedValues],
  );

  return (
    <DaliaFormValuesProvider initialValues={initialValues}>
      <VehicleNewFormDaliaInner {...props} />
    </DaliaFormValuesProvider>
  );
}

function VehicleNewFormDaliaInner({
  initialPlate = '',
  initialInternal = '',
  initialGovData = null,
  onBackToStep1,
  onCancel,
  onGovFetched,
  showPreviewBanner = true,
  onSaved,
  previewMode = false,
  vehicleId,
  isEdit = false,
  loadedValues,
  loadedExtras,
}: VehicleNewFormDaliaProps) {
  const { user } = useAuth();
  const { getValue, setValue, setValues, values } = useDaliaFormValuesRequired();
  const formRef = useRef<HTMLFormElement>(null);
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>({ sec1: true });
  const [activeStep, setActiveStep] = useState('1');
  const [route, setRoute] = useState('');
  const [saveMsg, setSaveMsg] = useState('מוכן להזנת רכב חדש');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sectionSaved, setSectionSaved] = useState<Record<number, boolean>>({});
  const [docs, setDocs] = useState<DaliaDoc[]>([]);
  const [editingDocIndex, setEditingDocIndex] = useState<number | null>(null);
  const [deptList, setDeptList] = useState<string[]>([]);
  const [newDept, setNewDept] = useState('');
  const [qsMsg, setQsMsg] = useState('');
  const [qsLoading, setQsLoading] = useState(false);
  const [summaryHtml, setSummaryHtml] = useState('לחץ על בדוק נתונים כדי לראות סיכום.');
  const [pledgeOpen, setPledgeOpen] = useState<Record<string, boolean>>({});
  const [loanOpen, setLoanOpen] = useState<Record<string, boolean>>({});

  const [docCategory, setDocCategory] = useState('ביטוח חובה');
  const [docName, setDocName] = useState('');
  const [docLink, setDocLink] = useState('');
  const [docFileName, setDocFileName] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docUploading, setDocUploading] = useState(false);

  const handleDocFileUpload = async (file: File) => {
    if (previewMode) {
      setDocFileName(file.name);
      toast.info('תצוגת פיתוח — הקובץ לא הועלה ל-Storage');
      return;
    }
    if (!user?.id) {
      toast.error('יש להתחבר כדי להעלות קבצים');
      return;
    }
    setDocUploading(true);
    const plate = getValue('vehicle_plate').replace(/[-\s]/g, '') || 'vehicle';
    const result = await uploadDocument({
      file,
      storageFolder: `vehicles/${plate}`,
      category: docCategory,
      companyName: user.company_name || '',
      vehiclePlate: plate,
      manufacturer: getValue('manufacturer'),
      model: getValue('model'),
    });
    setDocUploading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDocFileName(file.name);
    if (!docLink) setDocLink(result.publicUrl);
    toast.success('הקובץ הועלה ונרשם במערכת המסמכים');
  };

  useEffect(() => {
    if (initialPlate) setValue('vehicle_plate', initialPlate);
    if (initialInternal) setValue('internal_number', initialInternal);
  }, [initialPlate, initialInternal, setValue]);

  useEffect(() => {
    if (!loadedValues) return;
    setValues(loadedValues);
    if (loadedExtras?.docs) setDocs(loadedExtras.docs);
    if (loadedExtras?.departments) setDeptList(loadedExtras.departments);
    if (loadedExtras?.route) setRoute(loadedExtras.route);
    if (loadedExtras?.maintMethod) setValue('maintenance_method', loadedExtras.maintMethod);
    if (loadedExtras?.sectionSaved) setSectionSaved(loadedExtras.sectionSaved);
    if (isEdit) setSaveMsg('טוען נתוני רכב לעריכה');
  }, [loadedValues, loadedExtras, isEdit, setValues, setValue]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setOpenSecs((p) => ({ ...p, sec1: true }));
  }, []);

  const maintMethod = getValue('maintenance_method') || 'דליה';

  useEffect(() => {
    if (!initialGovData) return;
    const plate = initialPlate.replace(/[-\s]/g, '') || String(initialGovData.mispar_rechev ?? '');
    if (!plate) return;
    setValues(mapGovDataToNewFormFields(plate, initialGovData));
    setOpenSecs((p) => ({ ...p, sec1: true, sec3: true }));
  }, [initialGovData, initialPlate, setValues]);

  const toggleSec = (id: string) => {
    setOpenSecs((p) => ({ ...p, [id]: !p[id] }));
  };

  const goSec = (secId: string, step: string) => {
    setOpenSecs((p) => ({ ...p, [secId]: true }));
    setActiveStep(step);
    document.getElementById(secId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fillFromGov = useCallback(
    (data: Record<string, string>) => {
      setValues(data);
      setOpenSecs((p) => ({ ...p, sec1: true, sec3: true }));
      setQsMsg('נתוני הרכב נמשכו בהצלחה ממשרד התחבורה ✓');
      toast.success('השדות מולאו מנתוני משרד התחבורה');
      setTimeout(() => document.getElementById('sec1')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    },
    [setValues],
  );

  const fetchFromMOT = async () => {
    const plate = getValue('vehicle_plate').replace(/[-\s]/g, '');
    if (!plate) {
      setQsMsg('נא להזין מספר רכב');
      return;
    }
    setQsLoading(true);
    setQsMsg('');
    try {
      const raw = await fetchVehicleFromGov(plate);
      if (!raw) {
        setQsMsg('לא נמצאו נתונים לרכב זה');
        toast.error('לא נמצא רכב עם מספר זה במאגר הממשלתי');
        return;
      }
      onGovFetched?.(raw);
      fillFromGov(mapGovDataToNewFormFields(plate, raw));
    } catch (err) {
      const msg =
        err instanceof GovVehicleLookupError
          ? err.message
          : 'שגיאה בחיבור למשרד התחבורה';
      setQsMsg(msg);
      toast.error(msg);
    } finally {
      setQsLoading(false);
    }
  };

  const quickContinue = () => {
    if (!getValue('vehicle_plate').trim()) {
      setQsMsg('נא להזין מספר רכב');
      return;
    }
    goSec('sec1', '1');
  };

  const saveSection = (n: number) => {
    setSectionSaved((p) => ({ ...p, [n]: true }));
    const label = SECTION_SAVE_LABELS[n] || `סעיף ${n}`;
    setSaveMsg(`${label} — סומן; שמירה סופית בלחיצה על "שמור רכב"`);
    toast.info(`${label} — יישמר עם שמירת הרכב המלאה`);
  };

  const saveVehicle = async () => {
    if (previewMode) {
      toast.info('תצוגת פיתוח — שמירה דרך /vehicles עם התחברות');
      return;
    }
    if (!user) {
      toast.error('יש להתחבר כדי לשמור רכב');
      return;
    }
    const fd = formRef.current ? new FormData(formRef.current) : null;
    const allValues = collectDaliaFormValues(values, fd);
    const plate = (allValues.vehicle_plate || '').replace(/[-\s]/g, '');
    if (!plate) {
      toast.error('חסר מספר רכב');
      goSec('sec1', '1');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const { id } = await persistDaliaVehicle({
        allValues,
        extras: {
          docs,
          departments: deptList,
          route,
          maintMethod,
          sectionSaved,
        },
        user: {
          id: user.id,
          company_name: user.company_name,
          full_name: user.full_name,
          role: user.role,
        },
        vehicleId: isEdit ? vehicleId : undefined,
      });
      setSaveMsg(`הרכב ${plate} ${isEdit ? 'עודכן' : 'נשמר'} בהצלחה`);
      toast.success(isEdit ? 'הרכב עודכן בהצלחה' : 'הרכב נשמר — נפתח כרטיס הרכב');
      onSaved?.(id);
    } catch (err) {
      const msg = formatVehiclePersistError(err);
      console.error('[VehicleNewFormDalia] save', err);
      setSaveError(msg);
      setSaveMsg('שגיאה בשמירה');
      toast.error(`שגיאה בשמירת הרכב: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const buildSummary = () => {
    const fd = new FormData(formRef.current!);
    setSummaryHtml(
      `<div><b>מספר רכב:</b> ${(fd.get('vehicle_plate') as string) || 'חסר'}</div>
       <div><b>יצרן:</b> ${(fd.get('manufacturer') as string) || 'חסר'}</div>
       <div><b>דגם:</b> ${(fd.get('model') as string) || 'חסר'}</div>
       <div><b>מסלול:</b> ${route || (fd.get('ownership_route') as string) || 'לא נבחר'}</div>
       <div><b>מחלקות:</b> ${deptList.join(', ') || 'לא הוזנו'}</div>
       <div><b>מסמכים:</b> ${docs.length}</div>
       <div><b>סעיפים שנשמרו בתצוגה:</b> ${Object.keys(sectionSaved).filter((k) => sectionSaved[Number(k)]).join(', ') || 'אין'}</div>`,
    );
    goSec('sec7', '7');
  };

  const addDept = () => {
    const val = newDept.trim();
    if (!val) return;
    if (deptList.includes(val)) {
      setNewDept('');
      return;
    }
    setDeptList((p) => [...p, val]);
    setValue('department', val);
    setNewDept('');
  };

  const addDoc = () => {
    if (!docName.trim()) {
      toast.error('נא לרשום שם מסמך');
      return;
    }
    const doc: DaliaDoc = {
      category: docCategory,
      name: docName.trim(),
      link: docLink,
      file: docFileName,
      notes: docNotes,
      date: new Date().toLocaleString('he-IL'),
    };
    if (editingDocIndex !== null) {
      setDocs((p) => p.map((d, i) => (i === editingDocIndex ? doc : d)));
      setEditingDocIndex(null);
    } else {
      setDocs((p) => [...p, doc]);
    }
    setDocName('');
    setDocLink('');
    setDocFileName('');
    setDocNotes('');
  };

  const secClass = (id: string) => `d-sec${openSecs[id] ? ' open' : ''}`;

  return (
    <div className="vehicle-new-dalia pb-28">
      {showPreviewBanner && (
        <div className="d-preview-banner">
          <strong>
            {previewMode ? 'תצוגת פיתוח' : isEdit ? 'עריכת רכב' : 'פתיחת רכב חדש'}
          </strong>
          {previewMode
            ? ' — אין שמירה ל-Supabase'
            : ' — שמירה ל-dalia-staging (vehicles + import_buffer)'}
        </div>
      )}

      <div className="d-header">
        <div className="d-hrow">
          <div style={{ flex: 1 }}>
            <div className="d-title">פתיחת רכב חדש</div>
            <div className="d-sub">טופס יצירת רכב חדש · סעיפים 1–7</div>
          </div>
          <button type="button" className="d-btn" onClick={onBackToStep1}>
            ← שלב 1
          </button>
          <button type="button" className="d-btn danger" onClick={onCancel}>
            ביטול
          </button>
        </div>
        <div className="d-steps">
          {[
            ['1', 'פרטי רכב'],
            ['2', 'בעלות'],
            ['3', 'ביטוחים'],
            ['4', 'ציוד'],
            ['5', 'תחזוקה'],
            ['6', 'מסמכים'],
            ['7', 'שמירה'],
          ].map(([step, label]) => (
            <button
              key={step}
              type="button"
              className={`d-step${activeStep === step ? ' active' : ''}`}
              onClick={() => goSec(STEP_SEC[step], step)}
            >
              {step} {label}
            </button>
          ))}
        </div>
      </div>

      <form ref={formRef} id="newVehicleForm" onSubmit={(e) => e.preventDefault()}>
        <div id="dalia-main">
          <div className="d-quick" id="quick-start">
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>התחלה מהירה</div>
            <div style={{ fontSize: 12, color: 'var(--d-lo)', marginBottom: 12 }}>
              הזן מספר רכב ולחץ משיכה — נתונים יימשכו ממשרד התחבורה (אותו API כמו במערכת).
            </div>
            <div className="d-g2" style={{ marginBottom: 12 }}>
              <div className="d-fld d-required">
                <label>מספר רכב *</label>
                <input
                  name="vehicle_plate"
                  value={getValue('vehicle_plate')}
                  onChange={(e) => setValue('vehicle_plate', e.target.value)}
                  placeholder="123-45-678"
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
              </div>
              <div className="d-fld">
                <label>מספר פנימי</label>
                <input
                  name="internal_number"
                  value={getValue('internal_number')}
                  onChange={(e) => setValue('internal_number', e.target.value)}
                  placeholder="לדוגמה: 12"
                />
              </div>
            </div>
            <div className="d-row-actions">
              <button type="button" className="d-btn" disabled={qsLoading} onClick={() => void fetchFromMOT()}>
                {qsLoading ? 'מושך...' : 'משוך נתונים ממשרד התחבורה'}
              </button>
              <button type="button" className="d-btn primary" onClick={quickContinue}>
                המשך לסעיף 1 ←
              </button>
              {qsMsg && <span style={{ fontSize: 12, color: qsMsg.includes('✓') ? 'var(--d-ok)' : 'var(--d-danger)' }}>{qsMsg}</span>}
            </div>
          </div>

          {/* ── סעיף 1 ── */}
          <section className={secClass('sec1')} id="sec1">
            <button type="button" className="d-sec-head" onClick={() => toggleSec('sec1')}>
              <span className="d-sec-title">1. פרטי רכב</span>
              <span className="d-chev">▼</span>
            </button>
            <div className="d-sec-body">
              <div className="d-block-title">פרטי זיהוי</div>
              <div className="d-g2">
                <Fld label="מספר רכב" name="vehicle_plate" required />
                <Fld label="מספר פנימי" name="internal_number" />
                <Fld label="מספר שלדה VIN" name="vin" />
                <Fld label="מספר מנוע" name="engine_number" />
                <Fld label="יצרן" name="manufacturer" />
                <Fld label="דגם" name="model" />
                <Fld label="שנתון" name="year" type="number" />
                <Fld label="כינוי רכב" name="vehicle_nickname" />
                <Fld label="סוג רכב" name="vehicle_type" />
                <Fld label="סגמנט רכב" name="vehicle_segment" />
                <Fld label="צבע רכב" name="vehicle_color" />
                <Fld label="סוג דלק" name="fuel_type" />
                <Fld label="משקל" name="weight" />
                <Fld label="סוג בעלות" name="ownership_type_text" />
                <Fld label="חברה" name="company" />
                <Fld label="שיוך מיקום" name="location_assignment" />
                <Fld label="נהג משויך" name="assigned_driver" />
                <Fld label="ממונה רכב" name="vehicle_supervisor" />
                <Fld label="מיקום נוכחי" name="current_location" />
                <Fld label="אתר עבודה" name="work_site" />
                <Fld label="סוג שימוש" name="usage_type" />
                <Fld label="מחלקה" name="department" />
                <div className="d-fld d-full">
                  <label>הוסף מחלקה חדשה</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="שם מחלקה" />
                    <button type="button" className="d-btn small" onClick={addDept}>
                      +
                    </button>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {deptList.map((d) => (
                      <span key={d} className="d-dept-tag">
                        {d}
                        <button type="button" onClick={() => setDeptList((p) => p.filter((x) => x !== d))}>
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                <Fld label="אזור עבודה" name="work_area" />
                <Fld label="סטטוס" name="vehicle_status">
                  <select name="vehicle_status" defaultValue="פעיל">
                    <option>פעיל</option>
                    <option>מושבת</option>
                    <option>בטיפול</option>
                    <option>בבדיקה</option>
                    <option>ממתין</option>
                  </select>
                </Fld>
                <Fld label="תאריך רכישה" name="purchase_date" type="date" />
                <Fld label="תאריך עליה לכביש" name="road_date" type="date" />
                <Fld label="תאריך בדיקה" name="inspection_date" type="date" />
                <Fld label="תאריך סיום / גריעה" name="end_or_scrap_date" type="date" />
              </div>
              <div className="d-row-actions">
                <button type="button" className="d-btn primary" onClick={() => saveSection(1)}>
                  {SECTION_SAVE_LABELS[1]}
                </button>
              </div>
            </div>
          </section>

          {/* ── סעיף 2 ── */}
          <section className={secClass('sec2')} id="sec2">
            <button type="button" className="d-sec-head" onClick={() => toggleSec('sec2')}>
              <span className="d-sec-title">2. בעלות, ליסינג ומימון</span>
              <span className="d-chev">▼</span>
            </button>
            <div className="d-sec-body">
              <div className="d-fld d-full">
                <label>בחר מסלול</label>
                <select
                  name="ownership_route"
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                >
                  <option value="">בחר מסלול</option>
                  {Object.keys(ROUTE_MAP).map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>

              {route === 'ליסינג תפעולי' && (
                <div className="d-dynamic show">
                  <div className="d-block-title">ליסינג תפעולי</div>
                  <LeasingRouteFields prefix="op" />
                  <PledgeToggle id="op" pledgeOpen={pledgeOpen} setPledgeOpen={setPledgeOpen} />
                </div>
              )}
              {route === 'ליסינג מימוני' && (
                <div className="d-dynamic show">
                  <div className="d-block-title">ליסינג מימוני</div>
                  <div className="d-g2">
                    <LeasingRouteFields prefix="fl" />
                  </div>
                  <PledgeToggle id="fl" pledgeOpen={pledgeOpen} setPledgeOpen={setPledgeOpen} />
                </div>
              )}
              {route === 'הלוואה / מימון' && (
                <div className="d-dynamic show">
                  <div className="d-block-title">הלוואה / מימון</div>
                  <PledgeToggle id="loan" pledgeOpen={pledgeOpen} setPledgeOpen={setPledgeOpen} />
                  <LoanToggle id="loan" loanOpen={loanOpen} setLoanOpen={setLoanOpen} />
                </div>
              )}
              {route === 'תחזוקה עצמאית' && (
                <div className="d-dynamic show">
                  <div className="d-block-title">תחזוקה עצמאית</div>
                  <PledgeToggle id="self" pledgeOpen={pledgeOpen} setPledgeOpen={setPledgeOpen} />
                  <LoanToggle id="self" loanOpen={loanOpen} setLoanOpen={setLoanOpen} prefix="self" />
                </div>
              )}
              {route === 'שירות ותחזוקה' && (
                <div className="d-dynamic show">
                  <div className="d-block-title">שירות ותחזוקה</div>
                  <div className="d-g2">
                    <Fld label="ספק שירות" name="svc_provider" />
                    <Fld label="איש קשר" name="svc_contact" />
                    <Fld label="טלפון" name="svc_phone" />
                    <Fld label="סוג שירות" name="svc_type" />
                    <Fld label="תנאי שירות" name="svc_terms" />
                    <Fld label="SLA" name="svc_sla" />
                    <Fld label="הערות" name="svc_notes" className="d-full">
                      <textarea name="svc_notes" />
                    </Fld>
                  </div>
                  <PledgeToggle id="svc" pledgeOpen={pledgeOpen} setPledgeOpen={setPledgeOpen} />
                </div>
              )}
              {route === 'בעלות חברה' && (
                <div className="d-dynamic show">
                  <div className="d-block-title">בעלות חברה</div>
                  <OwnershipBasicFields prefix="company" ownerLabel="בעלים" />
                  <PledgeToggle id="company" pledgeOpen={pledgeOpen} setPledgeOpen={setPledgeOpen} />
                  <LoanToggle id="company" loanOpen={loanOpen} setLoanOpen={setLoanOpen} prefix="company" />
                </div>
              )}
              {route === 'בעלות פרטית' && (
                <div className="d-dynamic show">
                  <div className="d-block-title">בעלות פרטית</div>
                  <OwnershipBasicFields prefix="private" ownerLabel="בעלים רשומים" />
                  <PledgeToggle id="private" pledgeOpen={pledgeOpen} setPledgeOpen={setPledgeOpen} />
                  <LoanToggle id="private" loanOpen={loanOpen} setLoanOpen={setLoanOpen} prefix="private" />
                </div>
              )}
              {route === 'השכרה' && (
                <div className="d-dynamic show">
                  <div className="d-block-title">השכרה</div>
                  <LeasingRouteFields prefix="rent" />
                </div>
              )}
              {route === 'אחר' && (
                <div className="d-dynamic show">
                  <div className="d-block-title">אחר</div>
                  <div className="d-g2">
                    <Fld label="שם חברה / ספק" name="other_company" />
                    <Fld label="מספר הסכם" name="other_agreement" />
                    <Fld label="תאריך התחלה" name="other_start" type="date" />
                    <Fld label="תאריך סיום" name="other_end" type="date" />
                    <Fld label="קישור למסמך" name="other_doc_link" />
                    <Fld label="העלאת קובץ" name="other_file_name">
                      <FileWrap name="other_file" textName="other_file_name" />
                    </Fld>
                    <Fld label="הערות" name="other_route_notes" className="d-full">
                      <textarea name="other_route_notes" />
                    </Fld>
                  </div>
                </div>
              )}

              <div className="d-row-actions">
                <button type="button" className="d-btn primary" onClick={() => saveSection(2)}>
                  {SECTION_SAVE_LABELS[2]}
                </button>
              </div>
            </div>
          </section>

          {/* ── סעיף 3 ── */}
          <section className={secClass('sec3')} id="sec3">
            <button type="button" className="d-sec-head" onClick={() => toggleSec('sec3')}>
              <span className="d-sec-title">3. ביטוחים ורישיונות</span>
              <span className="d-chev">▼</span>
            </button>
            <div className="d-sec-body">
              <InsuranceBlock title="ביטוח חובה" prefix="mandatory_insurance" />
              <InsuranceBlock title="ביטוח מקיף" prefix="comprehensive_insurance" />
              <InsuranceBlock title="ביטוח צד ג" prefix="third_party_insurance" />
              <div className="d-card">
                <div className="d-block-title">כיסויים נוספים</div>
                <div className="d-check-grid">
                  <label>
                    <input type="checkbox" name="coverage_glass" /> אחריות שמשות
                  </label>
                  <label>
                    <input type="checkbox" name="coverage_replacement" /> רכב חלופי
                  </label>
                  <label>
                    <input type="checkbox" name="coverage_new_driver" /> כיסוי נהג חדש
                  </label>
                  <label>
                    <input type="checkbox" name="coverage_licensing" /> רישוי וטסטים
                  </label>
                  <label>
                    <input type="checkbox" name="coverage_roadside" /> גרירה ושירותי דרך
                  </label>
                  <label>
                    <input type="checkbox" name="coverage_lights" /> אחריות פנסים
                  </label>
                </div>
                <Fld label="אחר" name="coverage_other" className="d-full" />
              </div>
              <div className="d-card">
                <div className="d-block-title">הדר תביעות</div>
                <label className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                  <input
                    type="checkbox"
                    name="has_no_claims"
                    checked={getValue('has_no_claims') === 'true'}
                    onChange={(e) => setValue('has_no_claims', e.target.checked ? 'true' : 'false')}
                  />
                  <span>מאשר/ת: לרכב זה הדר תביעות (ללא תביעות) — נדרש לפי הגדרות חברה</span>
                </label>
              </div>
              <div className="d-card">
                <div className="d-block-title">רישיון רכב וטסט</div>
                <div className="d-g2">
                  <Fld label="קישור למסמך רישיון" name="license_link" />
                  <Fld label="העלאת קובץ רישיון" name="license_file_name">
                    <FileWrap name="license_file" textName="license_file_name" />
                  </Fld>
                  <Fld label="טסט אחרון" name="last_test" type="date" />
                  <Fld label="טסט הבא" name="next_test" type="date" />
                  <Fld label="סטטוס טסט" name="test_status" />
                  <Fld label="קישור מסמך טסט" name="test_doc_link" />
                  <Fld label="העלאת קובץ טסט" name="test_file_name">
                    <FileWrap name="test_file" textName="test_file_name" />
                  </Fld>
                </div>
              </div>
              <div className="d-card">
                <div className="d-block-title">תזכורות וציוד חובה</div>
                <div className="d-g2">
                  <Fld label="תזכיר מנהל" name="manager_reminder" />
                  <Fld label="תאריך תזכיר מנהל" name="manager_reminder_date" type="date" />
                  <Fld label="תזכיר הרמה" name="lifting_reminder" />
                  <Fld label="תאריך תזכיר הרמה" name="lifting_reminder_date" type="date" />
                  <Fld label="תוקף אביזרים" name="accessories_validity" />
                  <Fld label="תאריך תוקף אביזרים" name="accessories_validity_date" type="date" />
                  <Fld label="תוקף ציוד ייעודי" name="dedicated_equipment_validity" />
                  <Fld label="תאריך תוקף ציוד ייעודי" name="dedicated_equipment_validity_date" type="date" />
                </div>
              </div>
              <div className="d-row-actions">
                <button type="button" className="d-btn primary" onClick={() => saveSection(3)}>
                  {SECTION_SAVE_LABELS[3]}
                </button>
              </div>
            </div>
          </section>

          {/* ── סעיפים 4–7 — המשך בקובץ נפרד אם נדרש; כוללים כאן ── */}
          <Section4 open={openSecs.sec4} onToggle={() => toggleSec('sec4')} onSave={() => saveSection(4)} />
          <Section5
            open={openSecs.sec5}
            onToggle={() => toggleSec('sec5')}
            onSave={() => saveSection(5)}
            maintMethod={maintMethod}
            onMaintMethodChange={(v) => setValue('maintenance_method', v)}
          />
          <Section6
            open={openSecs.sec6}
            onToggle={() => toggleSec('sec6')}
            onSave={() => saveSection(6)}
            docs={docs}
            docCategory={docCategory}
            setDocCategory={setDocCategory}
            docName={docName}
            setDocName={setDocName}
            docLink={docLink}
            setDocLink={setDocLink}
            docFileName={docFileName}
            setDocFileName={setDocFileName}
            docNotes={docNotes}
            setDocNotes={setDocNotes}
            onAddDoc={addDoc}
            editingDocIndex={editingDocIndex}
            setEditingDocIndex={setEditingDocIndex}
            setDocs={setDocs}
            docUploading={docUploading}
            onDocFileUpload={handleDocFileUpload}
          />
          <section className={secClass('sec7')} id="sec7">
            <button type="button" className="d-sec-head" onClick={() => toggleSec('sec7')}>
              <span className="d-sec-title">7. סיכום ושמירת רכב</span>
              <span className="d-chev">▼</span>
            </button>
            <div className="d-sec-body">
              <div className="d-card" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
              <div className="d-row-actions">
                <button type="button" className="d-btn" onClick={buildSummary}>
                  בדוק נתונים
                </button>
                <button type="button" className="d-btn primary" onClick={() => void saveVehicle()} disabled={saving}>
                  {saving ? 'שומר...' : 'שמור רכב חדש'}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="d-savebar">
          <div className="d-savebar-inner">
            <div className="d-save-msg">
              {saveError ? (
                <span style={{ color: 'var(--d-danger)' }}>⚠ {saveError}</span>
              ) : (
                saveMsg
              )}
            </div>
            <button type="button" className="d-btn" onClick={onCancel}>
              ביטול
            </button>
            <button type="button" className="d-btn primary" onClick={() => void saveVehicle()} disabled={saving}>
              {saving ? 'שומר...' : 'שמור רכב חדש'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function PledgeToggle({
  id,
  pledgeOpen,
  setPledgeOpen,
}: {
  id: string;
  pledgeOpen: Record<string, boolean>;
  setPledgeOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  return (
    <div className="d-card">
      <label className="d-inline-check">
        <input type="checkbox" checked={!!pledgeOpen[id]} onChange={(e) => setPledgeOpen((p) => ({ ...p, [id]: e.target.checked }))} />
        האם הרכב משועבד
      </label>
      {pledgeOpen[id] && (
        <div className="d-dynamic show" style={{ marginTop: 8 }}>
          <PledgeFields prefix={id} />
        </div>
      )}
    </div>
  );
}

function LoanToggle({
  id,
  loanOpen,
  setLoanOpen,
  prefix,
}: {
  id: string;
  loanOpen: Record<string, boolean>;
  setLoanOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  prefix?: string;
}) {
  const p = prefix || id;
  return (
    <div className="d-card">
      <label className="d-inline-check">
        <input type="checkbox" checked={!!loanOpen[id]} onChange={(e) => setLoanOpen((p) => ({ ...p, [id]: e.target.checked }))} />
        קיימת הלוואת מימון
      </label>
      {loanOpen[id] && (
        <div className="d-dynamic show" style={{ marginTop: 8 }}>
          <LoanFields prefix={p} />
        </div>
      )}
    </div>
  );
}

function Section4({ open, onToggle, onSave }: { open?: boolean; onToggle: () => void; onSave: () => void }) {
  return (
    <section className={`d-sec${open ? ' open' : ''}`} id="sec4">
      <button type="button" className="d-sec-head" onClick={onToggle}>
        <span className="d-sec-title">4. ציוד וכלים מיוחדים</span>
        <span className="d-chev">▼</span>
      </button>
      <div className="d-sec-body">
        <div className="d-g2">
          <Fld label="מסוג / ייעודי" name="special_type" />
          <Fld label="כוח סוס" name="horse_power" type="number" />
          <Fld label="נפח מנוע (CC)" name="engine_volume" type="number" />
          <Fld label="משקל / טון" name="weight_ton" type="number" />
          <Fld label="KVA" name="kva" type="number" />
          <Fld label="שעות מנוע" name="equipment_engine_hours" type="number" />
          <Fld label="מספר סידורי ציוד" name="equipment_serial" />
          <Fld label="דלקן (ספק / מספר)" name="eq_fuel_dispenser" />
          <Fld label="איתוראן (ספק / מזהה)" name="eq_tracker" />
          <Fld label="כרטיס תדלוק (מספר / ספק)" name="eq_fuel_card" />
          <Fld label="ציוד ייעודי" name="dedicated_equipment" />
          <Fld label="ציוד נוסף" name="eq_extra" className="d-full">
            <textarea name="eq_extra" />
          </Fld>
          <Fld label="ציוד ייעודי — פירוט" name="dedicated_equipment_details" className="d-full">
            <textarea name="dedicated_equipment_details" />
          </Fld>
          <Fld label="הערות" name="equipment_notes" className="d-full">
            <textarea name="equipment_notes" />
          </Fld>
        </div>
        <div className="d-row-actions">
          <button type="button" className="d-btn primary" onClick={onSave}>
            {SECTION_SAVE_LABELS[4]}
          </button>
        </div>
      </div>
    </section>
  );
}

function Section5({
  open,
  onToggle,
  onSave,
  maintMethod,
  onMaintMethodChange,
}: {
  open?: boolean;
  onToggle: () => void;
  onSave: () => void;
  maintMethod: string;
  onMaintMethodChange: (v: string) => void;
}) {
  return (
    <section className={`d-sec${open ? ' open' : ''}`} id="sec5">
      <button type="button" className="d-sec-head" onClick={onToggle}>
        <span className="d-sec-title">5. טיפולים ותחזוקה</span>
        <span className="d-chev">▼</span>
      </button>
      <div className="d-sec-body">
        <div className="d-g2">
          <Fld label='ק"מ נוכחי' name="current_km" type="number" />
          <Fld label="שעות מנוע" name="maintenance_engine_hours" type="number" />
          <Fld label="סוג מונה" name="meter_type">
            <select name="meter_type" defaultValue="ק&quot;מ">
              <option>ק&quot;מ</option>
              <option>שעות</option>
              <option>שניהם</option>
            </select>
          </Fld>
          <Fld label="תאריך עדכון מונה" name="meter_update_date" type="date" />
          <Fld label="טיפול אחרון" name="last_service" type="date" />
          <Fld label="טיפול הבא" name="next_service" type="date" />
          <Fld label='טיפול הבא בק"מ' name="next_service_km" type="number" />
          <Fld label="שעות מנוע לטיפול הבא" name="next_service_engine_hours" type="number" />
          <Fld label="סוג טיפול" name="service_type">
            <select name="service_type" defaultValue="שגרתי">
              <option>שגרתי</option>
              <option>גדול</option>
              <option>אחזקה מונעת</option>
              <option>תיקון</option>
              <option>אחר</option>
            </select>
          </Fld>
          <Fld label="סטטוס התראות" name="alert_status">
            <select name="alert_status" defaultValue="עדכני">
              <option>עדכני</option>
              <option>נדרש בקרוב</option>
              <option>באיחור</option>
              <option>בטיפול</option>
            </select>
          </Fld>
          <Fld label="הערות טיפול" name="service_notes" className="d-full">
            <textarea name="service_notes" />
          </Fld>
          <Fld label="שיטת תחזוקה" name="maintenance_method">
            <select
              name="maintenance_method"
              value={maintMethod}
              onChange={(e) => onMaintMethodChange(e.target.value)}
            >
              <option>דליה</option>
              <option>תחזוקה עצמאית</option>
              <option>ליסינג</option>
              <option>מוסך חיצוני</option>
            </select>
          </Fld>
        </div>
        {maintMethod === 'תחזוקה עצמאית' && (
          <div className="d-g2" style={{ marginTop: 10 }}>
            <Fld label="ממונה תחזוקה" name="maint_supervisor" />
            <Fld label="מוסך מטפל" name="maint_garage" />
            <Fld label="טלפון מוסך" name="maint_phone" type="tel" />
            <Fld label="אחריות" name="maint_warranty">
              <select name="maint_warranty">
                <option>באחריות</option>
                <option>מחוץ לאחריות</option>
                <option>אחריות חלקית</option>
                <option>לא רלוונטי</option>
              </select>
            </Fld>
            <Fld label="פירוט אחריות" name="maint_warranty_details" className="d-full" />
            <Fld label="הערות תחזוקה" name="maint_notes" className="d-full">
              <textarea name="maint_notes" />
            </Fld>
            <Fld label="הערות מוסך" name="maint_garage_notes" className="d-full">
              <textarea name="maint_garage_notes" />
            </Fld>
          </div>
        )}
        {maintMethod === 'ליסינג' && (
          <div className="d-g2" style={{ marginTop: 10 }}>
            <Fld label="חברת ליסינג" name="maint_lease_company" />
            <Fld label="מוקד שירות" name="maint_service_center" />
            <Fld label="טלפון" name="maint_lease_phone" type="tel" />
            <Fld label="איש קשר" name="maint_lease_contact" />
            <Fld label="הערות תחזוקה" name="maint_lease_notes" className="d-full">
              <textarea name="maint_lease_notes" />
            </Fld>
          </div>
        )}
        <div className="d-row-actions">
          <button type="button" className="d-btn primary" onClick={onSave}>
            {SECTION_SAVE_LABELS[5]}
          </button>
        </div>
      </div>
    </section>
  );
}

function Section6({
  open,
  onToggle,
  onSave,
  docs,
  docCategory,
  setDocCategory,
  docName,
  setDocName,
  docLink,
  setDocLink,
  docFileName,
  setDocFileName,
  docNotes,
  setDocNotes,
  onAddDoc,
  editingDocIndex,
  setEditingDocIndex,
  setDocs,
  docUploading,
  onDocFileUpload,
}: {
  open?: boolean;
  onToggle: () => void;
  onSave: () => void;
  docs: DaliaDoc[];
  docCategory: string;
  setDocCategory: (v: string) => void;
  docName: string;
  setDocName: (v: string) => void;
  docLink: string;
  setDocLink: (v: string) => void;
  docFileName: string;
  setDocFileName: (v: string) => void;
  docNotes: string;
  setDocNotes: (v: string) => void;
  onAddDoc: () => void;
  editingDocIndex: number | null;
  setEditingDocIndex: (v: number | null) => void;
  setDocs: React.Dispatch<React.SetStateAction<DaliaDoc[]>>;
  docUploading?: boolean;
  onDocFileUpload?: (file: File) => void;
}) {
  const categories = [
    'ביטוח חובה',
    'ביטוח מקיף',
    'ביטוח צד ג',
    'ליסינג',
    'הלוואות',
    'שעבודים',
    'טיפולים',
    'תזכירים',
    'רישיון רכב',
    'טסט',
    'מסמכים כלליים',
  ];

  return (
    <section className={`d-sec${open ? ' open' : ''}`} id="sec6">
      <button type="button" className="d-sec-head" onClick={onToggle}>
        <span className="d-sec-title">6. מסמכים וקבצים</span>
        <span className="d-chev">▼</span>
      </button>
      <div className="d-sec-body">
        {docs.length === 0 ? (
          <div className="d-card">אין מסמכים בהיסטוריה עדיין</div>
        ) : (
          docs.map((d, i) => (
            <div key={i} className="d-doc-row">
              <div style={{ flex: 1 }}>
                <b>{d.name}</b>
                <div style={{ color: 'var(--d-lo)', fontSize: 12 }}>
                  {d.category}
                  {d.file ? ` | ${d.file}` : ''}
                </div>
              </div>
              <button
                type="button"
                className="d-btn small"
                onClick={() => {
                  setDocCategory(d.category);
                  setDocName(d.name);
                  setDocLink(d.link);
                  setDocFileName(d.file);
                  setDocNotes(d.notes);
                  setEditingDocIndex(i);
                }}
              >
                ערוך
              </button>
              <button type="button" className="d-btn small danger" onClick={() => setDocs((p) => p.filter((_, j) => j !== i))}>
                מחק
              </button>
            </div>
          ))
        )}
        <div className="d-card">
          <div className="d-block-title">{editingDocIndex !== null ? 'עריכת מסמך' : 'הוספת מסמך'}</div>
          <div className="d-g2">
            <div className="d-fld">
              <label>קטגוריה</label>
              <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="d-fld">
              <label>שם מסמך</label>
              <input value={docName} onChange={(e) => setDocName(e.target.value)} />
            </div>
            <div className="d-fld">
              <label>קישור</label>
              <input value={docLink} onChange={(e) => setDocLink(e.target.value)} />
            </div>
            <div className="d-fld">
              <label>קובץ</label>
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                disabled={docUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f && onDocFileUpload) onDocFileUpload(f);
                }}
              />
              {docFileName ? (
                <span className="text-xs text-muted-foreground mt-1 block">{docFileName}</span>
              ) : null}
            </div>
            <div className="d-fld d-full">
              <label>הערות</label>
              <textarea value={docNotes} onChange={(e) => setDocNotes(e.target.value)} />
            </div>
          </div>
          <div className="d-row-actions">
            <button type="button" className="d-btn" onClick={onAddDoc}>
              {editingDocIndex !== null ? 'שמור עריכה' : 'הוסף להיסטוריה'}
            </button>
          </div>
        </div>
        <div className="d-row-actions">
          <button type="button" className="d-btn primary" onClick={onSave}>
            {SECTION_SAVE_LABELS[6]}
          </button>
        </div>
      </div>
    </section>
  );
}
