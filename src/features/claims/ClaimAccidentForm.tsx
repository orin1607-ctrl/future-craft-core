import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  fetchVehicleFromGov,
  GovVehicleLookupError,
  formatGovDateForInput,
} from '@/lib/govVehicleLookup';
import SignaturePad from './SignaturePad';
import { CLAIM_KINDS } from './claimsConstants';
import {
  CAR_TYPES,
  DAMAGE_ZONES,
  DECLARATION_TEXT,
  INS_TYPES,
  TRIP_PURPOSES,
  customerSteps,
  hasZone,
  toggleCsv,
  type IntakeDraft,
} from './claimIntakeModel';

type Props = {
  mode: 'staff' | 'customer';
  value: IntakeDraft;
  onChange: (next: IntakeDraft) => void;
  stepKey: string;
  onSignature?: (dataUrl: string) => void;
  signatureSet?: boolean;
  staffSlot?: ReactNode;
};

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="fg">
      <label className="fl" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function YesNo({ value, onChange, testid }: { value: string; onChange: (v: string) => void; testid?: string }) {
  return (
    <div className="form-yesno" data-testid={testid} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <label className="pick-row"><input type="radio" checked={value === 'true'} onChange={() => onChange('true')} /><span>כן</span></label>
      <label className="pick-row"><input type="radio" checked={value === 'false'} onChange={() => onChange('false')} /><span>לא</span></label>
    </div>
  );
}

export default function ClaimAccidentForm({ mode, value, onChange, stepKey, onSignature, signatureSet, staffSlot }: Props) {
  const [govLoading, setGovLoading] = useState(false);
  const [govStatus, setGovStatus] = useState<{ type: 'ok' | 'err' | 'idle'; message: string }>({ type: 'idle', message: '' });
  const lastLookupPlateRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const patch = (next: Partial<IntakeDraft>) => onChange({ ...value, ...next });
  const toggleZone = (field: 'damageLocation' | 'thirdDamageLocation', z: string) => {
    set(field, toggleCsv(value[field], z));
  };
  const missing = (flag: string) => (value.missingFlags || '').split(',').includes(flag);
  const toggleMissing = (flag: string) => set('missingFlags', toggleCsv(value.missingFlags, flag));

  const keys = stepKey === 'all'
    ? ['client', 'driver', 'event', 'third', ...(mode === 'customer' || onSignature ? ['sign'] : []), ...(mode === 'customer' ? ['review'] : [])]
    : [stepKey];
  const hideStepTitle = mode === 'customer' && stepKey !== 'all';
  const performGovLookup = useCallback(async (plateToLookup: string, userTriggered = false) => {
    const clean = (plateToLookup || '').replace(/[-\s]/g, '');
    if (!clean || clean.length < 5) {
      if (userTriggered) {
        setGovStatus({ type: 'err', message: 'יש להזין מספר רכב תקין (לפחות 5 ספרות)' });
      }
      return;
    }
    if (!userTriggered && lastLookupPlateRef.current === clean) {
      return;
    }
    setGovLoading(true);
    setGovStatus({ type: 'idle', message: '' });
    try {
      const raw = await fetchVehicleFromGov(clean);
      if (!raw) {
        setGovStatus({ type: 'err', message: 'לא נמצאו נתונים לרכב זה במאגר משרד התחבורה' });
        return;
      }
      lastLookupPlateRef.current = clean;

      const patchData: Partial<IntakeDraft> = {};
      const model = (raw.kinuy_mishari || raw.degem_nm || '').toString().trim();
      const make = (raw.tozeret_nm || '').toString().trim();
      const year = raw.shnat_yitzur ? String(raw.shnat_yitzur) : '';
      const finish = (raw.ramat_gimur || '').toString().trim();
      const road = formatGovDateForInput(raw.moed_aliya_lakvish);
      const baalut = (raw.baalut || '').toString().trim();
      const fuel = (raw.sug_delek_nm || '').toString().trim();
      const color = (raw.tzeva_rechev || '').toString().trim();
      const vin = (raw.misgeret || '').toString().trim();
      const engine = (raw.degem_manoa || '').toString().trim();
      const vehicleType = (raw.sug_rechev_nm || '').toString().trim();

      // Never overwrite fields that were already filled manually
      if (!value.carMake?.trim() && make) patchData.carMake = make;
      if (!value.carModel?.trim() && model) patchData.carModel = model;
      if (!value.carYear?.trim() && year) patchData.carYear = year;
      if (!value.ramatGimur?.trim() && finish) patchData.ramatGimur = finish;
      if (!value.roadDate?.trim() && road) patchData.roadDate = road;
      if (!value.ownershipType?.trim() && baalut) patchData.ownershipType = baalut;
      if (!value.fuelType?.trim() && fuel) patchData.fuelType = fuel;
      if (!value.carColor?.trim() && color) patchData.carColor = color;
      if (!value.vin?.trim() && vin) patchData.vin = vin;
      if (!value.engineNumber?.trim() && engine) patchData.engineNumber = engine;

      // Adapt carType if not manually picked or is standard default
      if (vehicleType) {
        if (vehicleType.includes('משא') || vehicleType.includes('כבד')) {
          if (!value.carType || value.carType === 'פרטי') patchData.carType = 'רכב כבד מעל 4 טון';
        } else if (vehicleType.includes('מסחרי')) {
          if (!value.carType || value.carType === 'פרטי') patchData.carType = 'מסחרי';
        } else if (vehicleType.includes('קל')) {
          if (!value.carType || value.carType === 'פרטי') patchData.carType = 'רכב קל';
        }
      }

      patch(patchData);
      setGovStatus({ type: 'ok', message: '✓ פרטי הרכב נמשכו בהצלחה ממשרד התחבורה' });
    } catch (err) {
      const msg = err instanceof GovVehicleLookupError ? err.message : 'שגיאה בחיבור למשרד התחבורה';
      setGovStatus({ type: 'err', message: msg });
    } finally {
      setGovLoading(false);
    }
  }, [value, patch]);

  const handlePlateChange = (newPlate: string) => {
    set('plate', newPlate);
    const clean = newPlate.replace(/[-\s]/g, '');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if ((clean.length === 7 || clean.length === 8) && clean !== lastLookupPlateRef.current) {
      debounceTimerRef.current = setTimeout(() => {
        void performGovLookup(clean, false);
      }, 500);
    }
  };

  const stepTitle = (text: string) => hideStepTitle ? null : (
    <div className="sdiv" style={{ marginTop: 0 }}><div className="sdiv-t">{text}</div><div className="sdiv-l" /></div>
  );
  return (
    <div className="intake-form" dir="rtl" data-testid="accident-notice-form">
      {keys.includes('client') && (
        <div className="fg2" data-testid="intake-section-insured">
          {stepTitle('א. פרטי המבוטח והפוליסה')}
          <p className="form-hint" style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12, color: 'var(--t3)' }}>
            נא להקפיד למלא טופס זה באופן מדויק ושלם. שדות קיימים במערכת ממולאים אוטומטית — ניתן לבדוק ולתקן לפני פתיחת התיק.
          </p>
          <Field id="in_kind" label="סוג התביעה *">
            <select
              className="fse fi"
              id="in_kind"
              data-testid="intake-kind"
              value={value.claimKind || CLAIM_KINDS[0]}
              onChange={(e) => set('claimKind', e.target.value)}
            >
              {CLAIM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <div style={{ gridColumn: '1 / -1', padding: '10px 12px', borderRadius: 8, background: (value.claimKind || CLAIM_KINDS[0]) === 'תביעת צד ג׳' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(37, 99, 235, 0.08)', border: (value.claimKind || CLAIM_KINDS[0]) === 'תביעת צד ג׳' ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(37, 99, 235, 0.25)', fontSize: 13 }} data-testid="intake-kind-banner">
            {(value.claimKind || CLAIM_KINDS[0]) === 'תביעת צד ג׳' ? (
              <span><strong>תביעת צד ג׳:</strong> התביעה מוגשת מול חברת הביטוח של הרכב הפוגע (צד ג׳). בשלב ד׳ יופיעו שדות החובה של פרטי רכב וביטוח צד ג׳.</span>
            ) : (
              <span><strong>הפעלת פוליסה:</strong> התביעה מוגשת במסגרת פוליסת הביטוח של המבוטח. נא למלא את פרטי הפוליסה וחברת הביטוח של הלקוח.</span>
            )}
          </div>
          <Field id="in_reporter" label="זהות המדווח">
            <input className="fi" id="in_reporter" data-testid="intake-reporter" value={value.reporterName} onChange={(e) => set('reporterName', e.target.value)} placeholder="שם ממלא הטופס" />
          </Field>
          <Field id="in_reporterId" label="ת״ז מדווח"><input className="fi" id="in_reporterId" inputMode="numeric" value={value.reporterId} onChange={(e) => set('reporterId', e.target.value)} /></Field>
          <Field id="in_reporterPhone" label="טלפון מדווח"><input className="fi" id="in_reporterPhone" type="tel" inputMode="tel" value={value.reporterPhone} onChange={(e) => set('reporterPhone', e.target.value)} /></Field>
          <Field id="in_name" label="שם המבוטח *"><input className="fi" id="in_name" data-testid="intake-name" value={value.clientName} onChange={(e) => set('clientName', e.target.value)} autoComplete="name" /></Field>
          <Field id="in_id" label="מס׳ ת.ז."><input className="fi" id="in_id" inputMode="numeric" value={value.clientId} onChange={(e) => set('clientId', e.target.value)} /></Field>
          <div className="fg">
            <div className="fl">עוסק מורשה</div>
            <YesNo value={value.licensedDealer} onChange={(v) => set('licensedDealer', v)} testid="intake-licensed-dealer" />
          </div>
          {(value.claimKind || CLAIM_KINDS[0]) === 'הפעלת פוליסה' ? (
            <>
              <Field id="in_agent" label="שם הסוכן"><input className="fi" id="in_agent" data-testid="intake-agent" value={value.agentName} onChange={(e) => set('agentName', e.target.value)} /></Field>
              <Field id="in_policy" label="מס׳ הפוליסה *"><input className="fi" id="in_policy" value={value.policyNum} onChange={(e) => set('policyNum', e.target.value)} /></Field>
              <Field id="in_policyValid" label="בתוקף עד"><input className="fi" id="in_policyValid" data-testid="intake-policy-valid" type="date" value={value.policyValidUntil} onChange={(e) => set('policyValidUntil', e.target.value)} /></Field>
              <div className="fg full">
                <div className="fl">סוג ביטוח</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {INS_TYPES.map((t) => (
                    <label key={t} className="pick-row"><input type="radio" name="insType" checked={value.insType === t} onChange={() => set('insType', t)} /><span>{t}</span></label>
                  ))}
                </div>
              </div>
              <Field id="in_co" label="חברת הביטוח של הלקוח *">
                <input className="fi" id="in_co" list="dlCoIn" value={value.insCompany} onChange={(e) => set('insCompany', e.target.value)} />
                <datalist id="dlCoIn"><option>מגדל</option><option>הפניקס</option><option>מנורה מבטחים</option><option>הראל</option><option>כלל ביטוח</option><option>איילון</option><option>שירביט</option><option>ביטוח ישיר</option></datalist>
              </Field>
              <Field id="in_claimNum" label="מספר תביעה בחברת הביטוח (לא חובה)">
                <input className="fi" id="in_claimNum" value={value.claimNum} onChange={(e) => set('claimNum', e.target.value)} placeholder="אם עדיין אין — השאירו ריק" />
              </Field>
            </>
          ) : (
            <Field id="in_co" label="חברת הביטוח של הלקוח (לתיעוד בלבד)">
              <input className="fi" id="in_co" list="dlCoIn" value={value.insCompany} onChange={(e) => set('insCompany', e.target.value)} placeholder="אופציונלי בתביעת צד ג׳" />
              <datalist id="dlCoIn"><option>מגדל</option><option>הפניקס</option><option>מנורה מבטחים</option><option>הראל</option><option>כלל ביטוח</option><option>איילון</option><option>שירביט</option><option>ביטוח ישיר</option></datalist>
            </Field>
          )}
          <Field id="in_addr" label="כתובת"><input className="fi" id="in_addr" value={value.clientAddress} onChange={(e) => set('clientAddress', e.target.value)} /></Field>
          <Field id="in_street" label="רחוב"><input className="fi" id="in_street" data-testid="intake-address-street" value={value.addressStreet} onChange={(e) => set('addressStreet', e.target.value)} /></Field>
          <Field id="in_city" label="ישוב"><input className="fi" id="in_city" data-testid="intake-address-city" value={value.addressCity} onChange={(e) => set('addressCity', e.target.value)} /></Field>
          <Field id="in_zip" label="מיקוד"><input className="fi" id="in_zip" inputMode="numeric" value={value.clientZip} onChange={(e) => set('clientZip', e.target.value)} /></Field>
          <Field id="in_phoneHome" label="טלפון בית"><input className="fi" id="in_phoneHome" type="tel" inputMode="tel" value={value.phoneHome} onChange={(e) => set('phoneHome', e.target.value)} /></Field>
          <Field id="in_phone" label="טלפון נייד *">
            <input
              className="fi"
              id="in_phone"
              data-testid="intake-phone"
              type="tel"
              inputMode="tel"
              value={value.phoneMobile || value.clientPhone}
              onChange={(e) => patch({ phoneMobile: e.target.value, clientPhone: e.target.value })}
            />
          </Field>
          <Field id="in_fax" label="פקס"><input className="fi" id="in_fax" type="tel" inputMode="tel" value={value.clientFax} onChange={(e) => set('clientFax', e.target.value)} /></Field>
          <Field id="in_email" label="דואר אלקטרוני"><input className="fi" id="in_email" type="email" inputMode="email" dir="ltr" value={value.clientEmail} onChange={(e) => set('clientEmail', e.target.value)} /></Field>

          {stepTitle('פרטי הרכב')}

          <div className="fg full" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label className="fl" htmlFor="in_plate">מס׳ רישוי רכב המבוטח *</label>
                <input
                  className="fi"
                  id="in_plate"
                  data-testid="intake-plate"
                  value={value.plate}
                  onChange={(e) => handlePlateChange(e.target.value)}
                  onBlur={() => {
                    const clean = (value.plate || '').replace(/[-\s]/g, '');
                    if (clean.length >= 5 && clean !== lastLookupPlateRef.current) {
                      void performGovLookup(clean, false);
                    }
                  }}
                  placeholder="לדוגמה: 12-345-67"
                  dir="ltr"
                  style={{ textAlign: 'right', fontWeight: 'bold' }}
                />
              </div>
              <button
                type="button"
                className="btn-sec"
                data-testid="btn-gov-lookup"
                disabled={govLoading}
                onClick={() => void performGovLookup(value.plate, true)}
                style={{ height: 42, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              >
                {govLoading ? '⏳ שולף נתונים...' : '🔍 שלוף ממשרד התחבורה'}
              </button>
            </div>
            {govStatus.message && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: '0.82rem',
                  padding: '5px 10px',
                  borderRadius: 6,
                  color: govStatus.type === 'ok' ? '#15803d' : '#b91c1c',
                  background: govStatus.type === 'ok' ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${govStatus.type === 'ok' ? '#bbf7d0' : '#fecaca'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {govStatus.message}
              </div>
            )}
          </div>

          <div className="fg full">
            <div className="fl">סוג הרכב</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CAR_TYPES.map((t) => (
                <label key={t} className="pick-row"><input type="radio" name="carType" checked={value.carType === t} onChange={() => set('carType', t)} /><span>{t}</span></label>
              ))}
            </div>
          </div>
          <Field id="in_make" label="תוצר"><input className="fi" id="in_make" value={value.carMake} onChange={(e) => set('carMake', e.target.value)} placeholder="לדוגמה: טויוטה" /></Field>
          <Field id="in_model" label="דגם"><input className="fi" id="in_model" value={value.carModel} onChange={(e) => set('carModel', e.target.value)} placeholder="לדוגמה: קורולה" /></Field>
          <Field id="in_year" label="שנת ייצור"><input className="fi" id="in_year" inputMode="numeric" value={value.carYear} onChange={(e) => set('carYear', e.target.value)} placeholder="לדוגמה: 2022" /></Field>
          <Field id="in_ramat_gimur" label="רמת גימור"><input className="fi" id="in_ramat_gimur" value={value.ramatGimur || ''} onChange={(e) => set('ramatGimur', e.target.value)} placeholder="לדוגמה: GLI / Sunroof" /></Field>
          <Field id="in_road_date" label="עלייה לכביש"><input className="fi" id="in_road_date" type="date" value={value.roadDate || ''} onChange={(e) => set('roadDate', e.target.value)} /></Field>
          <Field id="in_baalut" label="סוג בעלות (רישוי)"><input className="fi" id="in_baalut" value={value.ownershipType || ''} onChange={(e) => set('ownershipType', e.target.value)} placeholder="פרטי / ליסינג / חברה" /></Field>
          <Field id="in_owner" label="שם בעל הרכב"><input className="fi" id="in_owner" data-testid="intake-vehicle-owner" value={value.vehicleOwnerName} onChange={(e) => set('vehicleOwnerName', e.target.value)} placeholder="אם שונה מהמבוטח" /></Field>
          <label className="pick-row"><input type="checkbox" checked={value.driverDifferent === 'true'} onChange={(e) => set('driverDifferent', e.target.checked ? 'true' : 'false')} /><span>הנהג בזמן התאונה שונה מהלקוח</span></label>
        </div>
      )}

      {keys.includes('driver') && (
        <div className="fg2" data-testid="intake-section-driver">
          {stepTitle('ב. פרטי הנהג (חובה למלא את כל הפרטים בפרק זה)')}
          <Field id="in_dname" label="שם הנהג"><input className="fi" id="in_dname" value={value.driverName} onChange={(e) => set('driverName', e.target.value)} /></Field>
          <Field id="in_did" label="מס׳ ת.ז."><input className="fi" id="in_did" inputMode="numeric" value={value.driverId} onChange={(e) => set('driverId', e.target.value)} /></Field>
          <Field id="in_daddr" label="כתובת"><input className="fi" id="in_daddr" value={value.driverAddress} onChange={(e) => set('driverAddress', e.target.value)} /></Field>
          <Field id="in_dstreet" label="רחוב"><input className="fi" id="in_dstreet" value={value.driverStreet} onChange={(e) => set('driverStreet', e.target.value)} /></Field>
          <Field id="in_dcity" label="ישוב"><input className="fi" id="in_dcity" value={value.driverCity} onChange={(e) => set('driverCity', e.target.value)} /></Field>
          <Field id="in_dzip" label="מיקוד"><input className="fi" id="in_dzip" inputMode="numeric" value={value.driverZip} onChange={(e) => set('driverZip', e.target.value)} /></Field>
          <Field id="in_dphoneHome" label="טלפון בית"><input className="fi" id="in_dphoneHome" type="tel" inputMode="tel" value={value.driverPhoneHome} onChange={(e) => set('driverPhoneHome', e.target.value)} /></Field>
          <Field id="in_dphone" label="טלפון נייד">
            <input
              className="fi"
              id="in_dphone"
              type="tel"
              inputMode="tel"
              value={value.driverPhoneMobile || value.driverPhone}
              onChange={(e) => patch({ driverPhoneMobile: e.target.value, driverPhone: e.target.value })}
            />
          </Field>
          <Field id="in_dbirth" label="תאריך לידה"><input className="fi" id="in_dbirth" type="date" value={value.driverBirthDate} onChange={(e) => set('driverBirthDate', e.target.value)} /></Field>
          <Field id="in_dgen" label="מין">
            <select className="fse fi" id="in_dgen" value={value.driverGender} onChange={(e) => set('driverGender', e.target.value)}>
              <option value="">—</option><option>זכר</option><option>נקבה</option>
            </select>
          </Field>
          <Field id="in_dlic" label="מס׳ רישיון נהיגה"><input className="fi" id="in_dlic" value={value.driverLicense} onChange={(e) => set('driverLicense', e.target.value)} /></Field>
          <Field id="in_dlicType" label="סוג רישיון"><input className="fi" id="in_dlicType" value={value.driverLicenseType} onChange={(e) => set('driverLicenseType', e.target.value)} /></Field>
          <Field id="in_dlicValid" label="תוקף רישיון"><input className="fi" id="in_dlicValid" type="date" value={value.driverLicenseValid} onChange={(e) => set('driverLicenseValid', e.target.value)} /></Field>
          <Field id="in_dlicYear" label="שנת הוצאת רישיון"><input className="fi" id="in_dlicYear" inputMode="numeric" value={value.driverLicenseYear} onChange={(e) => set('driverLicenseYear', e.target.value)} /></Field>
          <div className="fg">
            <div className="fl">האם נהג ברשות מבוטח</div>
            <YesNo value={value.driverPermission} onChange={(v) => set('driverPermission', v)} />
          </div>
        </div>
      )}

      {keys.includes('event') && (
        <div className="fg2" data-testid="intake-section-event">
          {stepTitle('ג. פרטי התאונה')}
          <Field id="in_edate" label="תאריך *"><input className="fi" id="in_edate" data-testid="intake-event-date" type="date" value={value.eventDate} onChange={(e) => set('eventDate', e.target.value)} /></Field>
          <Field id="in_etime" label="שעה"><input className="fi" id="in_etime" type="time" value={value.eventTime} onChange={(e) => set('eventTime', e.target.value)} /></Field>
          <Field id="in_eplace" label="מקום / כתובת אתר התאונה"><input className="fi" id="in_eplace" value={value.eventPlace} onChange={(e) => set('eventPlace', e.target.value)} /></Field>
          <Field id="in_ecity" label="ישוב"><input className="fi" id="in_ecity" value={value.eventCity} onChange={(e) => set('eventCity', e.target.value)} /></Field>
          <Field id="in_estreet" label="רחוב"><input className="fi" id="in_estreet" value={value.eventStreet} onChange={(e) => set('eventStreet', e.target.value)} /></Field>
          <div className="fg full">
            <div className="fl">האם היה באירוע?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <label className="pick-row"><input type="checkbox" checked={value.police === 'true'} onChange={(e) => set('police', e.target.checked ? 'true' : 'false')} /><span>משטרה</span></label>
              <label className="pick-row"><input type="checkbox" checked={value.tow === 'true'} onChange={(e) => set('tow', e.target.checked ? 'true' : 'false')} /><span>גרר</span></label>
              <label className="pick-row"><input type="checkbox" data-testid="intake-fire" checked={value.fireDept === 'true'} onChange={(e) => set('fireDept', e.target.checked ? 'true' : 'false')} /><span>מכבי אש</span></label>
            </div>
          </div>
          <Field id="in_pstat" label="נגבתה עדות ע״י משטרת ישראל בתחנת"><input className="fi" id="in_pstat" value={value.policeStation} onChange={(e) => set('policeStation', e.target.value)} /></Field>
          <Field id="in_pfile" label="מס׳ תיק"><input className="fi" id="in_pfile" value={value.policeFile} onChange={(e) => set('policeFile', e.target.value)} /></Field>
          <Field id="in_journal" label="מס׳ יומן"><input className="fi" id="in_journal" data-testid="intake-journal" value={value.journalNumber} onChange={(e) => set('journalNumber', e.target.value)} /></Field>
          <Field id="in_pdate" label="בתאריך"><input className="fi" id="in_pdate" type="date" value={value.policeDate} onChange={(e) => set('policeDate', e.target.value)} /></Field>
          <div className="fg full"><label className="fl">תיאור מפורט של התאונה</label><textarea id="in_edesc" data-testid="intake-event-desc" className="fta" value={value.eventDesc} onChange={(e) => set('eventDesc', e.target.value)} /></div>
          <div className="fg full"><label className="fl">תרשים ממקום התאונה</label><textarea id="in_diagram" data-testid="intake-diagram" className="fta" value={value.accidentDiagramNotes} onChange={(e) => set('accidentDiagramNotes', e.target.value)} placeholder="תיאור כיווני הנסיעה, מיקום הרכבים, ומסלול האירוע" /></div>
          <div className="fg full"><label className="fl">תיאור הנזק / מיקום הנזק ברכב המבוטח</label><textarea id="in_edamage" data-testid="intake-damage-desc" className="fta" value={value.damageDesc} onChange={(e) => set('damageDesc', e.target.value)} /></div>
          <div className="fg full">
            <label className="fl">איזורי פגיעה — רכב מבוטח</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {DAMAGE_ZONES.map((z) => (
                <label key={z} className="pick-row"><input type="checkbox" checked={hasZone(value.damageLocation, z)} onChange={() => toggleZone('damageLocation', z)} /><span>{z}</span></label>
              ))}
            </div>
          </div>
          <Field id="in_w1n" label="עד 1 — שם"><input className="fi" id="in_w1n" data-testid="intake-witness1" value={value.witness1Name} onChange={(e) => set('witness1Name', e.target.value)} /></Field>
          <Field id="in_w1a" label="עד 1 — כתובת"><input className="fi" id="in_w1a" value={value.witness1Address} onChange={(e) => set('witness1Address', e.target.value)} /></Field>
          <Field id="in_w2n" label="עד 2 — שם"><input className="fi" id="in_w2n" value={value.witness2Name} onChange={(e) => set('witness2Name', e.target.value)} /></Field>
          <Field id="in_w2a" label="עד 2 — כתובת"><input className="fi" id="in_w2a" value={value.witness2Address} onChange={(e) => set('witness2Address', e.target.value)} /></Field>
          <div className="fg full"><label className="fl">עדים — הערות נוספות</label><textarea className="fta" value={value.witnesses} onChange={(e) => set('witnesses', e.target.value)} placeholder="שם, טלפון, כתובת נוספים" /></div>
          <div className="fg full">
            <div className="fl">המקרה אירע</div>
            <div data-testid="intake-trip-purpose" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TRIP_PURPOSES.map((p) => (
                <label key={p.key} className="pick-row"><input type="radio" name="tripPurpose" checked={value.tripPurpose === p.key} onChange={() => set('tripPurpose', p.key)} /><span>{p.label}</span></label>
              ))}
            </div>
          </div>
          <Field id="in_garage" label="מוסך"><input className="fi" id="in_garage" data-testid="intake-garage" value={value.garageName} onChange={(e) => set('garageName', e.target.value)} /></Field>
          <Field id="in_survName" label="שמאי"><input className="fi" id="in_survName" value={value.surveyorName} onChange={(e) => set('surveyorName', e.target.value)} /></Field>
        </div>
      )}

      {keys.includes('third') && (
        <div className="fg2" data-testid="intake-section-third">
          {stepTitle('ד. פרטי המעורב — צד ג׳ (חובה למלא את כל הפרטים בפרק זה)')}
          <Field id="in_tdrv" label="שם הנהג"><input className="fi" id="in_tdrv" value={value.thirdDriver} onChange={(e) => set('thirdDriver', e.target.value)} /></Field>
          <Field id="in_tid" label="מס׳ ת.ז."><input className="fi" id="in_tid" inputMode="numeric" value={value.thirdId} onChange={(e) => set('thirdId', e.target.value)} /></Field>
          <label className="pick-row"><input type="checkbox" checked={missing('thirdId')} onChange={() => toggleMissing('thirdId')} /><span>חסר להשלמה</span></label>
          <Field id="in_tlic" label="מס׳ רישיון נהיגה"><input className="fi" id="in_tlic" data-testid="intake-third-license" inputMode="numeric" value={value.thirdLicense} onChange={(e) => set('thirdLicense', e.target.value)} /></Field>
          <Field id="in_tphone" label="טלפון"><input className="fi" id="in_tphone" type="tel" inputMode="tel" value={value.thirdPhone} onChange={(e) => set('thirdPhone', e.target.value)} /></Field>
          <Field id="in_taddr" label="כתובת"><input className="fi" id="in_taddr" data-testid="intake-third-address" value={value.thirdAddress} onChange={(e) => set('thirdAddress', e.target.value)} /></Field>
          <Field id="in_town" label="שם בעל הרכב"><input className="fi" id="in_town" value={value.thirdOwner} onChange={(e) => set('thirdOwner', e.target.value)} /></Field>
          <Field id="in_tplate" label="מס׳ רישוי"><input className="fi" id="in_tplate" value={value.thirdPlate} onChange={(e) => set('thirdPlate', e.target.value)} /></Field>
          <div className="fg full">
            <div className="fl">סוג הרכב</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CAR_TYPES.map((t) => (
                <label key={t} className="pick-row"><input type="radio" name="thirdCarType" checked={value.thirdCarType === t} onChange={() => set('thirdCarType', t)} /><span>{t}</span></label>
              ))}
            </div>
          </div>
          <Field id="in_tmm" label="תוצר ודגם"><input className="fi" id="in_tmm" value={value.thirdMakeModel} onChange={(e) => set('thirdMakeModel', e.target.value)} /></Field>
          <Field id="in_tins" label="שם חברת הביטוח"><input className="fi" id="in_tins" value={value.thirdInsCompany} onChange={(e) => set('thirdInsCompany', e.target.value)} /></Field>
          <Field id="in_tinsd" label="שם המבוטח בפוליסה"><input className="fi" id="in_tinsd" data-testid="intake-third-insured" value={value.thirdInsured} onChange={(e) => set('thirdInsured', e.target.value)} /></Field>
          <Field id="in_tpol" label="מס׳ הפוליסה"><input className="fi" id="in_tpol" value={value.thirdPolicy} onChange={(e) => set('thirdPolicy', e.target.value)} /></Field>
          <div className="fg full">
            <div className="fl">סוג הביטוח</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {INS_TYPES.map((t) => (
                <label key={t} className="pick-row"><input type="radio" name="thirdInsType" checked={value.thirdInsType === t} onChange={() => set('thirdInsType', t)} /><span>{t}</span></label>
              ))}
            </div>
          </div>
          <Field id="in_tcn" label="מספר תביעה אם כבר קיים"><input className="fi" id="in_tcn" value={value.thirdClaimNum} onChange={(e) => set('thirdClaimNum', e.target.value)} /></Field>
          <div className="fg full"><label className="fl">תיאור הנזק / מיקום הנזק לצד ג׳</label><textarea className="fta" value={value.thirdDamage} onChange={(e) => set('thirdDamage', e.target.value)} /></div>
          <div className="fg full">
            <label className="fl">איזורי פגיעה — רכב צד ג׳</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {DAMAGE_ZONES.map((z) => (
                <label key={z} className="pick-row"><input type="checkbox" checked={hasZone(value.thirdDamageLocation, z)} onChange={() => toggleZone('thirdDamageLocation', z)} /><span>{z}</span></label>
              ))}
            </div>
          </div>
        </div>
      )}

      {keys.includes('sign') && (
        <div data-testid="intake-section-sign">
          {stepTitle('הצהרת המבוטח/ת')}
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">הנני מעוניין/ת כי תביעת צד ג׳ שתוגש נגדי תטופל ו/או תשולם על ידי החברה</div>
            <YesNo value={value.thirdClaimAgainstMe} onChange={(v) => set('thirdClaimAgainstMe', v)} testid="intake-third-against" />
          </div>
          <pre className="mail-body" style={{ whiteSpace: 'pre-wrap' }}>{DECLARATION_TEXT}</pre>
          <label className="pick-row" style={{ margin: '12px 0' }}>
            <input type="checkbox" data-testid="intake-ack" checked={value.declarationAck === 'true'} onChange={(e) => set('declarationAck', e.target.checked ? 'true' : 'false')} />
            <span>קראתי ואני מאשר/ת את ההצהרה</span>
          </label>
          <Field id="in_ddate" label="תאריך"><input className="fi" id="in_ddate" data-testid="intake-decl-date" type="date" value={value.declarationDate} onChange={(e) => set('declarationDate', e.target.value)} /></Field>
          <Field id="in_filled" label="הטופס מולא ע״י"><input className="fi" id="in_filled" value={value.formFilledBy} onChange={(e) => set('formFilledBy', e.target.value)} /></Field>
          <div className="fl" style={{ margin: '10px 0 6px' }}>אני מאשר/ת שכל ההודעות הקשורות לנושא בירור התביעה ישלחו אליי באחד האמצעים הבאים:</div>
          <label className="pick-row"><input type="checkbox" checked={value.contactPrefEmail === 'true'} onChange={(e) => set('contactPrefEmail', e.target.checked ? 'true' : 'false')} /><span>דואר אלקטרוני</span></label>
          <label className="pick-row"><input type="checkbox" checked={value.contactPrefMobile === 'true'} onChange={(e) => set('contactPrefMobile', e.target.checked ? 'true' : 'false')} /><span>טלפון נייד</span></label>
          <label className="pick-row"><input type="checkbox" checked={value.contactPrefPost === 'true'} onChange={(e) => set('contactPrefPost', e.target.checked ? 'true' : 'false')} /><span>דואר ישראל</span></label>
          {mode === 'customer' || onSignature ? (
            <div style={{ marginTop: 12 }}>
              <div className="fl">חתימת המבוטח/ת {signatureSet ? '✓' : ''}</div>
              <SignaturePad onChange={(url) => onSignature?.(url)} />
            </div>
          ) : null}
        </div>
      )}

      {keys.includes('review') && (
        <div data-testid="intake-review">
          {stepTitle('בדיקה לפני שליחה')}
          <div><b>מדווח:</b> {value.reporterName || value.clientName || '—'}</div>
          <div><b>מבוטח:</b> {value.clientName || '—'} · {value.phoneMobile || value.clientPhone || '—'}</div>
          <div><b>רכב:</b> {value.plate || '—'} · {[value.carMake, value.carModel].filter(Boolean).join(' ') || '—'}</div>
          <div><b>נהג:</b> {value.driverName || value.clientName || '—'}</div>
          <div><b>סוג:</b> {value.claimKind}</div>
          <div><b>תאריך אירוע:</b> {value.eventDate || '—'} {value.eventTime}</div>
          <div><b>ביטוח:</b> {value.insCompany || '—'} · פוליסה {value.policyNum || '—'}</div>
          <div><b>צד ג׳:</b> {value.thirdDriver || '—'} · {value.thirdPlate || '—'}</div>
          <div><b>הצהרה:</b> {value.declarationAck === 'true' ? 'אושרה' : 'לא אושרה'}</div>
          <div><b>חתימה:</b> {signatureSet ? 'קיימת' : 'חסרה'}</div>
        </div>
      )}

      {(stepKey === 'staff' || stepKey === 'all') && staffSlot}

      {mode === 'staff' && stepKey === 'client' ? (
        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>
          שלבים: {customerSteps(value).map((s) => s.label).join(' → ')}
        </div>
      ) : null}
    </div>
  );
}
