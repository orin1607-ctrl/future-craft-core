import type { ReactNode } from 'react';
import SignaturePad from './SignaturePad';
import { CLAIM_KINDS } from './claimsConstants';
import { DAMAGE_ZONES, DECLARATION_TEXT, customerSteps, type IntakeDraft } from './claimIntakeModel';

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

export default function ClaimAccidentForm({ mode, value, onChange, stepKey, onSignature, signatureSet, staffSlot }: Props) {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const toggleZone = (z: string) => {
    const cur = String(value.damageLocation || '').split(',').map((s) => s.trim()).filter(Boolean);
    const next = cur.includes(z) ? cur.filter((x) => x !== z) : [...cur, z];
    set('damageLocation', next.join(','));
  };
  const missing = (flag: string) => (value.missingFlags || '').split(',').includes(flag);
  const toggleMissing = (flag: string) => {
    const cur = (value.missingFlags || '').split(',').map((s) => s.trim()).filter(Boolean);
    const next = cur.includes(flag) ? cur.filter((x) => x !== flag) : [...cur, flag];
    set('missingFlags', next.join(','));
  };

  const keys = stepKey === 'all'
    ? ['client', ...(value.driverDifferent === 'true' ? ['driver'] : []), 'event', ...(value.claimKind === 'תביעת צד ג׳' ? ['third'] : []), ...(mode === 'customer' ? ['sign', 'review'] : [])]
    : [stepKey];
  const hideStepTitle = mode === 'customer' && stepKey !== 'all';
  const stepTitle = (text: string) => hideStepTitle ? null : (
    <div className="sdiv" style={{ marginTop: 0 }}><div className="sdiv-t">{text}</div><div className="sdiv-l" /></div>
  );
  return (
    <div className="intake-form" dir="rtl">
      {keys.includes('client') && (
        <div className="fg2">
          {stepTitle('הלקוח שלנו / פרטי המבוטח')}
          <Field id="in_kind" label="סוג התביעה *">
            <select className="fse fi" id="in_kind" data-testid="intake-kind" value={value.claimKind} onChange={(e) => set('claimKind', e.target.value)}>
              {CLAIM_KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </Field>
          <Field id="in_name" label="שם מלא *"><input className="fi" id="in_name" data-testid="intake-name" value={value.clientName} onChange={(e) => set('clientName', e.target.value)} autoComplete="name" /></Field>
          <Field id="in_id" label="ת״ז / ח.פ."><input className="fi" id="in_id" inputMode="numeric" value={value.clientId} onChange={(e) => set('clientId', e.target.value)} /></Field>
          <Field id="in_phone" label="טלפון *"><input className="fi" id="in_phone" data-testid="intake-phone" type="tel" inputMode="tel" value={value.clientPhone} onChange={(e) => set('clientPhone', e.target.value)} /></Field>
          <Field id="in_email" label="דואר אלקטרוני"><input className="fi" id="in_email" type="email" inputMode="email" dir="ltr" value={value.clientEmail} onChange={(e) => set('clientEmail', e.target.value)} /></Field>
          <Field id="in_addr" label="כתובת"><input className="fi" id="in_addr" value={value.clientAddress} onChange={(e) => set('clientAddress', e.target.value)} /></Field>
          <Field id="in_zip" label="מיקוד"><input className="fi" id="in_zip" inputMode="numeric" value={value.clientZip} onChange={(e) => set('clientZip', e.target.value)} /></Field>
          <Field id="in_plate" label="מספר רכב *"><input className="fi" id="in_plate" data-testid="intake-plate" value={value.plate} onChange={(e) => set('plate', e.target.value)} /></Field>
          <Field id="in_make" label="יצרן"><input className="fi" id="in_make" value={value.carMake} onChange={(e) => set('carMake', e.target.value)} /></Field>
          <Field id="in_model" label="דגם"><input className="fi" id="in_model" value={value.carModel} onChange={(e) => set('carModel', e.target.value)} /></Field>
          <Field id="in_year" label="שנת ייצור"><input className="fi" id="in_year" inputMode="numeric" value={value.carYear} onChange={(e) => set('carYear', e.target.value)} /></Field>
          <Field id="in_type" label="סוג הרכב">
            <select className="fse fi" id="in_type" value={value.carType} onChange={(e) => set('carType', e.target.value)}>
              <option>פרטי</option><option>מסחרי</option><option>רכב כבד מעל 4 טון</option><option>רכב קל</option>
            </select>
          </Field>
          <Field id="in_co" label="חברת הביטוח של הלקוח">
            <input className="fi" id="in_co" list="dlCoIn" value={value.insCompany} onChange={(e) => set('insCompany', e.target.value)} />
            <datalist id="dlCoIn"><option>מגדל</option><option>הפניקס</option><option>מנורה מבטחים</option><option>הראל</option><option>כלל ביטוח</option><option>איילון</option><option>שירביט</option><option>ביטוח ישיר</option></datalist>
          </Field>
          <Field id="in_insType" label="סוג ביטוח">
            <select className="fse fi" id="in_insType" value={value.insType} onChange={(e) => set('insType', e.target.value)}>
              <option value="">—</option><option>חובה</option><option>מקיף</option><option>צד ג'</option>
            </select>
          </Field>
          <Field id="in_policy" label="מספר פוליסה"><input className="fi" id="in_policy" value={value.policyNum} onChange={(e) => set('policyNum', e.target.value)} /></Field>
          <Field id="in_claimNum" label="מספר תביעה בחברת הביטוח (לא חובה)">
            <input className="fi" id="in_claimNum" value={value.claimNum} onChange={(e) => set('claimNum', e.target.value)} placeholder="אם עדיין אין — השאירו ריק" />
          </Field>
          <label className="pick-row"><input type="checkbox" checked={value.driverDifferent === 'true'} onChange={(e) => set('driverDifferent', e.target.checked ? 'true' : 'false')} /><span>הנהג בזמן התאונה שונה מהלקוח</span></label>
        </div>
      )}

      {keys.includes('driver') && (
        <div className="fg2">
          {stepTitle('פרטי הנהג')}
          <Field id="in_dname" label="שם מלא"><input className="fi" id="in_dname" value={value.driverName} onChange={(e) => set('driverName', e.target.value)} /></Field>
          <Field id="in_did" label="ת״ז"><input className="fi" id="in_did" inputMode="numeric" value={value.driverId} onChange={(e) => set('driverId', e.target.value)} /></Field>
          <Field id="in_dphone" label="טלפון"><input className="fi" id="in_dphone" type="tel" inputMode="tel" value={value.driverPhone} onChange={(e) => set('driverPhone', e.target.value)} /></Field>
          <Field id="in_dlic" label="מספר רישיון נהיגה"><input className="fi" id="in_dlic" value={value.driverLicense} onChange={(e) => set('driverLicense', e.target.value)} /></Field>
          <Field id="in_dlicType" label="סוג רישיון"><input className="fi" id="in_dlicType" value={value.driverLicenseType} onChange={(e) => set('driverLicenseType', e.target.value)} /></Field>
          <Field id="in_dlicValid" label="תוקף רישיון"><input className="fi" id="in_dlicValid" type="date" value={value.driverLicenseValid} onChange={(e) => set('driverLicenseValid', e.target.value)} /></Field>
          <Field id="in_dlicYear" label="שנת הוצאת רישיון"><input className="fi" id="in_dlicYear" inputMode="numeric" value={value.driverLicenseYear} onChange={(e) => set('driverLicenseYear', e.target.value)} /></Field>
          <Field id="in_dbirth" label="תאריך לידה"><input className="fi" id="in_dbirth" type="date" value={value.driverBirthDate} onChange={(e) => set('driverBirthDate', e.target.value)} /></Field>
          <Field id="in_dgen" label="מין">
            <select className="fse fi" id="in_dgen" value={value.driverGender} onChange={(e) => set('driverGender', e.target.value)}>
              <option value="">—</option><option>זכר</option><option>נקבה</option>
            </select>
          </Field>
          <label className="pick-row"><input type="checkbox" checked={value.driverPermission === 'true'} onChange={(e) => set('driverPermission', e.target.checked ? 'true' : 'false')} /><span>נהג ברשות המבוטח</span></label>
        </div>
      )}

      {keys.includes('event') && (
        <div className="fg2">
          {stepTitle('פרטי האירוע')}
          <Field id="in_edate" label="תאריך התאונה *"><input className="fi" id="in_edate" data-testid="intake-event-date" type="date" value={value.eventDate} onChange={(e) => set('eventDate', e.target.value)} /></Field>
          <Field id="in_etime" label="שעת התאונה"><input className="fi" id="in_etime" type="time" value={value.eventTime} onChange={(e) => set('eventTime', e.target.value)} /></Field>
          <Field id="in_eplace" label="מקום / כתובת"><input className="fi" id="in_eplace" value={value.eventPlace} onChange={(e) => set('eventPlace', e.target.value)} /></Field>
          <Field id="in_ecity" label="יישוב"><input className="fi" id="in_ecity" value={value.eventCity} onChange={(e) => set('eventCity', e.target.value)} /></Field>
          <Field id="in_estreet" label="רחוב"><input className="fi" id="in_estreet" value={value.eventStreet} onChange={(e) => set('eventStreet', e.target.value)} /></Field>
          <div className="fg full"><label className="fl">תיאור מפורט של התאונה</label><textarea className="fta" value={value.eventDesc} onChange={(e) => set('eventDesc', e.target.value)} /></div>
          <div className="fg full"><label className="fl">תיאור הנזק</label><textarea className="fta" value={value.damageDesc} onChange={(e) => set('damageDesc', e.target.value)} /></div>
          <div className="fg full">
            <label className="fl">מיקום הנזק ברכב</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {DAMAGE_ZONES.map((z) => (
                <label key={z} className="pick-row"><input type="checkbox" checked={String(value.damageLocation || '').split(',').includes(z)} onChange={() => toggleZone(z)} /><span>{z}</span></label>
              ))}
            </div>
          </div>
          <label className="pick-row"><input type="checkbox" checked={value.police === 'true'} onChange={(e) => set('police', e.target.checked ? 'true' : 'false')} /><span>הייתה משטרה</span></label>
          {value.police === 'true' && (
            <>
              <Field id="in_pstat" label="תחנת משטרה"><input className="fi" id="in_pstat" value={value.policeStation} onChange={(e) => set('policeStation', e.target.value)} /></Field>
              <Field id="in_pfile" label="מספר אירוע / תיק"><input className="fi" id="in_pfile" value={value.policeFile} onChange={(e) => set('policeFile', e.target.value)} /></Field>
              <Field id="in_pdate" label="תאריך דיווח"><input className="fi" id="in_pdate" type="date" value={value.policeDate} onChange={(e) => set('policeDate', e.target.value)} /></Field>
            </>
          )}
          <label className="pick-row"><input type="checkbox" checked={value.tow === 'true'} onChange={(e) => set('tow', e.target.checked ? 'true' : 'false')} /><span>היה גרר</span></label>
          <div className="fg full"><label className="fl">עדים</label><textarea className="fta" value={value.witnesses} onChange={(e) => set('witnesses', e.target.value)} placeholder="שם, טלפון, כתובת" /></div>
        </div>
      )}

      {keys.includes('third') && (
        <div className="fg2">
          {stepTitle('פרטי צד ג׳')}
          <Field id="in_tdrv" label="שם נהג צד ג׳"><input className="fi" id="in_tdrv" value={value.thirdDriver} onChange={(e) => set('thirdDriver', e.target.value)} /></Field>
          <Field id="in_town" label="שם בעל הרכב"><input className="fi" id="in_town" value={value.thirdOwner} onChange={(e) => set('thirdOwner', e.target.value)} /></Field>
          <Field id="in_tid" label="ת״ז אם ידועה"><input className="fi" id="in_tid" inputMode="numeric" value={value.thirdId} onChange={(e) => set('thirdId', e.target.value)} /></Field>
          <label className="pick-row"><input type="checkbox" checked={missing('thirdId')} onChange={() => toggleMissing('thirdId')} /><span>חסר להשלמה</span></label>
          <Field id="in_tphone" label="טלפון"><input className="fi" id="in_tphone" type="tel" inputMode="tel" value={value.thirdPhone} onChange={(e) => set('thirdPhone', e.target.value)} /></Field>
          <Field id="in_tplate" label="מספר רכב"><input className="fi" id="in_tplate" value={value.thirdPlate} onChange={(e) => set('thirdPlate', e.target.value)} /></Field>
          <Field id="in_tmm" label="יצרן / דגם"><input className="fi" id="in_tmm" value={value.thirdMakeModel} onChange={(e) => set('thirdMakeModel', e.target.value)} /></Field>
          <Field id="in_tins" label="חברת הביטוח"><input className="fi" id="in_tins" value={value.thirdInsCompany} onChange={(e) => set('thirdInsCompany', e.target.value)} /></Field>
          <Field id="in_tpol" label="מספר פוליסה"><input className="fi" id="in_tpol" value={value.thirdPolicy} onChange={(e) => set('thirdPolicy', e.target.value)} /></Field>
          <Field id="in_tcn" label="מספר תביעה אם כבר קיים"><input className="fi" id="in_tcn" value={value.thirdClaimNum} onChange={(e) => set('thirdClaimNum', e.target.value)} /></Field>
          <div className="fg full"><label className="fl">תיאור נזק לצד ג׳</label><textarea className="fta" value={value.thirdDamage} onChange={(e) => set('thirdDamage', e.target.value)} /></div>
        </div>
      )}

      {keys.includes('sign') && (
        <div>
          {stepTitle('הצהרה וחתימה')}
          <pre className="mail-body" style={{ whiteSpace: 'pre-wrap' }}>{DECLARATION_TEXT}</pre>
          <label className="pick-row" style={{ margin: '12px 0' }}>
            <input type="checkbox" data-testid="intake-ack" checked={value.declarationAck === 'true'} onChange={(e) => set('declarationAck', e.target.checked ? 'true' : 'false')} />
            <span>קראתי ואני מאשר/ת את ההצהרה</span>
          </label>
          <Field id="in_filled" label="הטופס מולא ע״י"><input className="fi" id="in_filled" value={value.formFilledBy} onChange={(e) => set('formFilledBy', e.target.value)} /></Field>
          <div className="fl" style={{ margin: '10px 0 6px' }}>אמצעי קבלת הודעות</div>
          <label className="pick-row"><input type="checkbox" checked={value.contactPrefEmail === 'true'} onChange={(e) => set('contactPrefEmail', e.target.checked ? 'true' : 'false')} /><span>דואר אלקטרוני</span></label>
          <label className="pick-row"><input type="checkbox" checked={value.contactPrefMobile === 'true'} onChange={(e) => set('contactPrefMobile', e.target.checked ? 'true' : 'false')} /><span>טלפון נייד</span></label>
          <label className="pick-row"><input type="checkbox" checked={value.contactPrefPost === 'true'} onChange={(e) => set('contactPrefPost', e.target.checked ? 'true' : 'false')} /><span>דואר ישראל</span></label>
          {mode === 'customer' || onSignature ? (
            <div style={{ marginTop: 12 }}>
              <div className="fl">חתימה {signatureSet ? '✓' : ''}</div>
              <SignaturePad onChange={(url) => onSignature?.(url)} />
            </div>
          ) : null}
        </div>
      )}

      {keys.includes('review') && (
        <div data-testid="intake-review">
          {stepTitle('בדיקה לפני שליחה')}
          <div><b>לקוח:</b> {value.clientName || '—'} · {value.clientPhone || '—'}</div>
          <div><b>רכב:</b> {value.plate || '—'} · {[value.carMake, value.carModel].filter(Boolean).join(' ') || '—'}</div>
          <div><b>סוג:</b> {value.claimKind}</div>
          <div><b>תאריך אירוע:</b> {value.eventDate || '—'} {value.eventTime}</div>
          <div><b>ביטוח:</b> {value.insCompany || '—'} · פוליסה {value.policyNum || '—'}</div>
          {value.claimKind === 'תביעת צד ג׳' ? <div><b>צד ג׳:</b> {value.thirdDriver || '—'} · {value.thirdPlate || '—'}</div> : null}
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
