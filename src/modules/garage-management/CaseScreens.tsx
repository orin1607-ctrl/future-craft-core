import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { DamagePart, PartState, PhotoTopic, QuotePartLine, QuoteWorkLine } from './types';
import { ANGLE_KEYS, CAR_PARTS, EXTRA_ANGLE_KEYS, PHOTO_TOPICS } from './types';
import { Field, HiddenCapture, IdPin, Shell, SignaturePad, StatusPin } from './ui';
import { fileToDataUrl, mockBackendToast, todayLabel, useGarage } from './store';
import {
  formatMoney,
  nextAction,
  partClass,
  quoteTotals,
  requiredAnglesDone,
  stateBadge,
  stateLabel,
  STATUS_META,
  uid,
} from './logic';
import { toast } from '@/hooks/use-toast';

function useCaseOrRedirect() {
  const { caseId = '' } = useParams();
  const nav = useNavigate();
  const { getCase } = useGarage();
  const c = getCase(caseId);
  return { c, nav, caseId };
}

function backend() {
  toast(mockBackendToast());
}

function waLink(phone: string, text: string) {
  const n = phone.replace(/[^\d]/g, '').replace(/^0/, '972');
  return `https://wa.me/${n || '972500000000'}?text=${encodeURIComponent(text)}`;
}

export function CaseHubScreen() {
  const { c, nav } = useCaseOrRedirect();
  if (!c) return <Missing />;
  const nxt = nextAction(c);
  const totals = quoteTotals(c);
  const angles = requiredAnglesDone(c);
  const go = (path: string) => nav(`/garage-management/cases/${c.id}${path ? `/${path}` : ''}`);

  return (
    <Shell
      title={`תיק #${c.number}`}
      onBack={() => nav('/garage-management')}
      pin={<StatusPin c={c} />}
      footer={
        <>
          <button className="btn-outline" onClick={() => go('quote/send')}>
            שלח הצעה
          </button>
          <button className="btn" onClick={() => go(nxt.path || 'inspect')}>
            {nxt.path === 'inspect' ? 'המשך לבדיקת רכב' : 'בצע ←'}
          </button>
        </>
      }
    >
      <IdPin c={c} />
      <div className="card next-card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--white50)', marginBottom: 5 }}>הפעולה הבאה</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{nxt.label}</div>
          <button className="btn" style={{ flex: '0 0 auto', padding: '11px 16px', minHeight: 0 }} onClick={() => go(nxt.path)}>
            בצע ←
          </button>
        </div>
      </div>

      <div className="quick-grid">
        <button className="quick-btn" onClick={() => go('inspect')}><span className="qi">📷</span>צלם</button>
        <button className="quick-btn" onClick={() => go('quote')}><span className="qi">💰</span>הצעת מחיר</button>
        <button className="quick-btn" onClick={() => go('gallery')}><span className="qi">🖼️</span>גלריה</button>
        <button className="quick-btn" onClick={() => go('complete')}><span className="qi">✅</span>סיום עבודה</button>
      </div>

      <div className="hub-actions">
        <button onClick={() => go('inspect')}>בדיקת רכב</button>
        <button onClick={() => go('map')}>מפת נזקים</button>
        <button onClick={() => go('quote')}>הצעת מחיר</button>
        <button onClick={() => go('order')}>הזמנת עבודה</button>
        <button onClick={() => go('gallery')}>גלריה</button>
        <button onClick={() => go('comm')}>תקשורת</button>
        <button onClick={() => go('share')}>שיתוף מאובטח</button>
        <button onClick={() => go('intake')}>קבלת רכב</button>
        <button onClick={() => go('history')}>היסטוריה</button>
        <button onClick={() => go('complete')}>סיום / סגירה</button>
      </div>

      <details className="acc" open>
        <summary>סקירת תיק</summary>
        <div className="acc-body">
          <div className="srow"><span>עבודות</span><span>{formatMoney(totals.works)}</span></div>
          <div className="srow"><span>חלקים</span><span>{formatMoney(totals.parts)}</span></div>
          <div className="srow total"><span>סה"כ הצעה</span><span>{formatMoney(totals.total)}</span></div>
        </div>
      </details>
      <details className="acc">
        <summary>בדיקת רכב</summary>
        <div className="acc-body">
          <div className="progress-wrap">
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${(angles / 4) * 100}%` }} /></div>
            <div className="progress-txt">{angles}/4</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--white50)' }}>{angles} מתוך 4 תמונות חובה הושלמו</div>
        </div>
      </details>
      <details className="acc">
        <summary>הזמנות עבודה</summary>
        <div className="acc-body">
          {c.orders[0] ? (
            <div className="qline">
              <div>
                <div className="l-l">הזמנה {c.orders[0].number} (V{c.orders[0].version})</div>
                <div className="l-s">עודכן {c.orders[0].createdAt}</div>
              </div>
              <span className="badge b-green">נוכחית</span>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--white50)' }}>טרם התקבלה הזמנה</div>
          )}
        </div>
      </details>
      <details className="acc">
        <summary>מיילים</summary>
        <div className="acc-body" style={{ fontSize: 12.5, color: 'var(--white80)', lineHeight: 2 }}>
          {c.mails.length
            ? c.mails.slice(0, 4).map((m) => (
                <div key={m.id}>
                  {m.at} — {m.subject}
                </div>
              ))
            : 'אין מיילים בתיק עדיין'}
        </div>
      </details>
      <details className="acc">
        <summary>היסטוריית תיק</summary>
        <div className="acc-body">
          <div className="timeline">
            {c.history.slice(0, 6).map((h) => (
              <div key={h.id} className="tl-item">
                <div className="tl-time">{h.at}</div>
                <div className="tl-text">{h.text}</div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </Shell>
  );
}

export function InspectionScreen() {
  const { c, nav } = useCaseOrRedirect();
  const { setAngle, addPhoto } = useGarage();
  if (!c) return <Missing />;
  const done = requiredAnglesDone(c);
  const nextMissing = ANGLE_KEYS.find((a) => !c.angles[a.id]);

  const capture = async (file: File, key: string, label: string, extra = false) => {
    const dataUrl = await fileToDataUrl(file);
    if (extra) addPhoto(c.id, { topic: 'inspection', label, dataUrl });
    else setAngle(c.id, key, dataUrl, label);
  };

  return (
    <Shell
      title="בדיקת רכב"
      onBack={() => nav(`/garage-management/cases/${c.id}`)}
      pin={<StatusPin c={c} meta={`${c.customer.companyName || c.customer.name} · ${c.vehicle.plate}`} />}
      footer={
        <button
          className="btn"
          onClick={() => {
            if (nextMissing) document.getElementById(`cap-${nextMissing.id}`)?.click();
            else nav(`/garage-management/cases/${c.id}/map`);
          }}
        >
          {nextMissing ? `📷 צלם — ${nextMissing.label}` : 'המשך למפת נזקים ←'}
        </button>
      }
    >
      <div className="progress-wrap">
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${(done / 4) * 100}%` }} /></div>
        <div className="progress-txt">{done}/4 חובה</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--white50)', marginBottom: 8 }}>4 זוויות חובה</div>
      <div className="angle-grid">
        {ANGLE_KEYS.map((a) => {
          const src = c.angles[a.id];
          return (
            <button key={a.id} className={`angle-box ${src ? 'done' : ''}`} onClick={() => document.getElementById(`cap-${a.id}`)?.click()}>
              {src ? <img className="angle-thumb" src={src} alt={a.label} /> : <div className="ac-ico">📷</div>}
              {src ? <span className="achk">✓</span> : <div className="ac-lbl">{a.label}</div>}
              {src ? <div className="ac-lbl-overlay">{a.label}</div> : null}
              <HiddenCapture id={`cap-${a.id}`} onFile={(f) => capture(f, a.id, a.label)} />
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--white35)', margin: '14px 0 8px' }}>תמונות נוספות (אופציונלי)</div>
      <div className="angle-grid">
        {EXTRA_ANGLE_KEYS.map((a) => (
          <button key={a.id} className="angle-box small" onClick={() => document.getElementById(`cap-${a.id}`)?.click()}>
            {c.extraPhotos[a.id] ? <img className="angle-thumb" src={c.extraPhotos[a.id]} alt={a.label} /> : <div className="ac-ico">📷</div>}
            <div className="ac-lbl">{a.label}</div>
            <HiddenCapture id={`cap-${a.id}`} onFile={(f) => capture(f, a.id, a.label, true)} />
          </button>
        ))}
      </div>
    </Shell>
  );
}

export function DamageMapScreen() {
  const { c, nav } = useCaseOrRedirect();
  const { setPart, addPhoto, upsertWork } = useGarage();
  const [open, setOpen] = useState<DamagePart | null>(null);
  const [desc, setDesc] = useState('');
  const [state, setState] = useState<PartState>('ok');
  if (!c) return <Missing />;

  const partState = (id: string, name: string): PartState => c.parts.find((p) => p.id === id)?.state || 'ok';

  const openPart = (id: string, name: string) => {
    const existing = c.parts.find((p) => p.id === id);
    setOpen(existing || { id, name, state: 'ok', description: '', photoIds: [] });
    setDesc(existing?.description || '');
    setState(existing?.state || 'ok');
  };

  return (
    <Shell
      title="מפת רכב"
      onBack={() => nav(`/garage-management/cases/${c.id}/inspect`)}
      pin={
        <div className="status-pin">
          <div>
            <div className="case-no">תיק #{c.number}</div>
            <div className="case-meta">הקש על אזור לתיעוד</div>
          </div>
          <span className={`badge ${STATUS_META[c.status].badge}`}>{STATUS_META[c.status].label}</span>
        </div>
      }
      footer={
        <button className="btn" onClick={() => nav(`/garage-management/cases/${c.id}/quote`)}>
          המשך להצעת מחיר ←
        </button>
      }
    >
      <div className="legend">
        <span><i className="dotc" style={{ background: '#f87171' }} />נזק קיים</span>
        <span><i className="dotc" style={{ background: '#60a5fa' }} />מיועד לתיקון</span>
        <span><i className="dotc" style={{ background: '#365087' }} />תקין</span>
      </div>
      <div className="carbox" style={{ padding: '18px 10px' }}>
        <svg viewBox="0 0 220 420" style={{ width: '100%', maxWidth: 340, height: 'auto', maxHeight: '56dvh' }}>
          {CAR_PARTS.map((p) => (
            <rect
              key={p.id}
              className={partClass(partState(p.id, p.name))}
              data-name={p.name}
              x={p.x}
              y={p.y}
              width={p.w}
              height={p.h}
              rx={8}
              onClick={() => openPart(p.id, p.name)}
            />
          ))}
        </svg>
      </div>
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--white35)' }}>
        {c.parts.filter((p) => p.state !== 'ok').length} חלקים מתועדים כרגע כלא-תקינים
      </p>

      <div className={`sheet-backdrop ${open ? 'show' : ''}`} onClick={() => setOpen(null)} />
      <div className={`sheet ${open ? 'show' : ''}`}>
        <div className="sheet-handle" />
        {open && (
          <>
            <div className="status-pin" style={{ marginBottom: 4 }}>
              <div className="case-no">{open.name}</div>
              <span className={`badge ${stateBadge(state)}`}>{stateLabel(state)}</span>
            </div>
            <div className="radiog">
              {(['ok', 'damaged', 'fix'] as PartState[]).map((s) => (
                <label key={s}>
                  <input type="radio" name="sst" checked={state === s} onChange={() => setState(s)} /> {stateLabel(s)}
                </label>
              ))}
            </div>
            <Field label="תיאור הנזק" value={desc} onChange={setDesc} textarea />
            <div className="thumbrow">
              {c.photos.filter((p) => p.topic === 'damage' && p.label.includes(open.name)).map((p) => (
                <img key={p.id} className="thumb" src={p.dataUrl} alt="" />
              ))}
              <button className="thumb add" onClick={() => document.getElementById('cap-part')?.click()}>＋</button>
              <HiddenCapture
                id="cap-part"
                onFile={async (f) => {
                  const dataUrl = await fileToDataUrl(f);
                  addPhoto(c.id, { topic: 'damage', label: open.name, dataUrl });
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn-outline" onClick={() => document.getElementById('cap-part')?.click()}>📷 צלם</button>
              <button
                className="btn"
                onClick={() => {
                  const part = { ...open, state, description: desc };
                  setPart(c.id, part);
                  if (state !== 'ok') {
                    upsertWork(c.id, {
                      id: `w-${part.id}`,
                      part: part.name,
                      workType: state === 'fix' ? 'תיקון + צבע' : 'תיקון',
                      detail: desc || part.name,
                      price: 0,
                    });
                  }
                  setOpen(null);
                  toast({ title: 'נשמר', description: `${part.name} עודכן במפת הנזקים` });
                }}
              >
                שמור
              </button>
            </div>
            <button
              className="dashed-add"
              style={{ marginTop: 10 }}
              onClick={() => {
                upsertWork(c.id, {
                  id: `w-${open.id}`,
                  part: open.name,
                  workType: 'תיקון + צבע',
                  detail: desc || open.name,
                  price: 0,
                });
                toast({ title: 'נוסף להצעת מחיר', description: open.name });
                setOpen(null);
                nav(`/garage-management/cases/${c.id}/quote`);
              }}
            >
              הוסף להצעת מחיר
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}

export function QuoteScreen() {
  const { c, nav } = useCaseOrRedirect();
  const { upsertWork, removeWork, upsertPartLine, removePartLine, updateCase } = useGarage();
  const [tab, setTab] = useState<'works' | 'parts' | 'photos'>('works');
  const [editing, setEditing] = useState<QuoteWorkLine | null>(null);
  const [partEdit, setPartEdit] = useState<QuotePartLine | null>(null);
  if (!c) return <Missing />;
  const totals = quoteTotals(c);

  return (
    <Shell
      title="הצעת מחיר"
      onBack={() => nav(`/garage-management/cases/${c.id}`)}
      pin={<StatusPin c={c} />}
      footer={
        <>
          <button
            className="btn-outline"
            onClick={() => {
              updateCase(c.id, { status: 'quote_draft' });
              toast({ title: 'טיוטה נשמרה', description: 'ההצעה נשמרה בדמו המקומי' });
            }}
          >
            שמור טיוטה
          </button>
          <button className="btn" onClick={() => nav(`/garage-management/cases/${c.id}/quote/send`)}>
            שלח הצעה
          </button>
        </>
      }
    >
      <div className="tabscroll">
        {(['works', 'parts', 'photos'] as const).map((t) => (
          <button key={t} className={`tabchip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t === 'works' ? 'עבודות' : t === 'parts' ? 'חלקים' : 'תמונות'}
          </button>
        ))}
      </div>

      {tab === 'works' && (
        <>
          {c.works.map((w) => (
            <div key={w.id} className="card qcard">
              <div className="qfield"><span className="qf-l">חלק</span><span className="qf-v">{w.part}</span></div>
              <div className="qfield"><span className="qf-l">סוג עבודה</span><span className="qf-v">{w.workType}</span></div>
              <div className="qfield"><span className="qf-l">תיאור</span><span className="qf-v">{w.detail}</span></div>
              <div className="qcard-foot">
                <span className="l-p">{formatMoney(w.price)}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-ghost" style={{ padding: '7px 12px', fontSize: 11.5, flex: '0 0 auto' }} onClick={() => setEditing(w)}>✎ ערוך</button>
                  <button className="btn-ghost" style={{ padding: '7px 12px', fontSize: 11.5, flex: '0 0 auto' }} onClick={() => removeWork(c.id, w.id)}>מחק</button>
                </div>
              </div>
            </div>
          ))}
          <button className="dashed-add" onClick={() => setEditing({ id: uid('w'), part: '', workType: 'תיקון + צבע', detail: '', price: 0 })}>
            ＋ הוסף עבודה
          </button>
          <div style={{ fontSize: 12, color: 'var(--white50)', margin: '14px 0 8px' }}>חלקים נדרשים</div>
          {c.partsLines.map((p) => (
            <div key={p.id} className="card qcard">
              <div className="qfield"><span className="qf-l">חלק</span><span className="qf-v">{p.name}</span></div>
              <div className="qfield"><span className="qf-l">מק"ט</span><span className="qf-v">{p.sku || '—'}</span></div>
              <div className="qfield"><span className="qf-l">כמות</span><span className="qf-v">{p.qty}</span></div>
              <div className="qcard-foot">
                <span className={`badge ${p.supplier === 'us' ? 'b-blue' : 'b-gray'}`}>
                  {p.supplier === 'us' ? 'אנחנו מספקים' : p.supplierLabel || 'הלקוח / החברה מספקים'}
                </span>
                <span className={`l-p ${p.supplier === 'customer' ? 'muted' : ''}`}>{p.supplier === 'us' ? formatMoney(p.price) : '—'}</span>
              </div>
            </div>
          ))}
          <button className="dashed-add" onClick={() => setPartEdit({ id: uid('p'), name: '', sku: '', qty: 1, price: 0, supplier: 'us' })}>
            ＋ הוסף חלק
          </button>
        </>
      )}

      {tab === 'parts' && (
        <>
          {c.partsLines.map((p) => (
            <div key={p.id} className="card qcard">
              <div className="qfield"><span className="qf-l">חלק</span><span className="qf-v">{p.name}</span></div>
              <div className="qfield"><span className="qf-l">מק"ט</span><span className="qf-v">{p.sku || '—'}</span></div>
              <div className="qfield"><span className="qf-l">כמות</span><span className="qf-v">{p.qty}</span></div>
              <div className="qcard-foot">
                <span className={`badge ${p.supplier === 'us' ? 'b-blue' : 'b-gray'}`}>
                  {p.supplier === 'us' ? 'אנחנו מספקים' : p.supplierLabel || 'הלקוח / החברה מספקים'}
                </span>
                <span className={`l-p ${p.supplier === 'customer' ? 'muted' : ''}`}>{p.supplier === 'us' ? formatMoney(p.price) : '—'}</span>
              </div>
              <button className="btn-ghost" style={{ marginTop: 8, padding: '7px 12px', fontSize: 11.5 }} onClick={() => setPartEdit(p)}>✎ ערוך</button>
            </div>
          ))}
          <button className="dashed-add" onClick={() => setPartEdit({ id: uid('p'), name: '', sku: '', qty: 1, price: 0, supplier: 'us' })}>
            ＋ הוסף חלק
          </button>
        </>
      )}

      {tab === 'photos' && (
        <>
          <p style={{ fontSize: 12, color: 'var(--white50)' }}>בחרו תמונות מהגלריה לצירוף להצעה</p>
          <div className="gal-grid">
            {c.photos.map((p) => {
              const on = c.quotePhotoIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  className={`gal-thumb ${on ? 'selected' : ''}`}
                  style={{ backgroundImage: `url(${p.dataUrl})`, backgroundSize: 'cover' }}
                  onClick={() =>
                    updateCase(c.id, {
                      quotePhotoIds: on ? c.quotePhotoIds.filter((id) => id !== p.id) : [...c.quotePhotoIds, p.id],
                    })
                  }
                />
              );
            })}
          </div>
        </>
      )}

      <div className="summary-sheet" style={{ marginTop: 14 }}>
        <div className="srow"><span>עבודות</span><span>{formatMoney(totals.works)}</span></div>
        <div className="srow"><span>חלקים</span><span>{formatMoney(totals.parts)}</span></div>
        <div className="srow"><span>מע"מ</span><span>{formatMoney(totals.vat)}</span></div>
        <div className="srow total"><span>סה"כ</span><span>{formatMoney(totals.total)}</span></div>
      </div>

      {editing && (
        <LineEditor
          title="עבודה"
          fields={[
            ['חלק', editing.part, (v) => setEditing({ ...editing, part: v })],
            ['סוג עבודה', editing.workType, (v) => setEditing({ ...editing, workType: v })],
            ['פירוט', editing.detail, (v) => setEditing({ ...editing, detail: v })],
            ['מחיר', String(editing.price || ''), (v) => setEditing({ ...editing, price: Number(v) || 0 })],
          ]}
          onCancel={() => setEditing(null)}
          onSave={() => {
            upsertWork(c.id, editing);
            setEditing(null);
          }}
        />
      )}
      {partEdit && (
        <LineEditor
          title="חלק"
          extra={
            <div className="two-col">
              <button className={`chip ${partEdit.supplier === 'us' ? 'on' : ''}`} onClick={() => setPartEdit({ ...partEdit, supplier: 'us' })}>
                אנחנו מספקים
              </button>
              <button className={`chip ${partEdit.supplier === 'customer' ? 'on' : ''}`} onClick={() => setPartEdit({ ...partEdit, supplier: 'customer' })}>
                הלקוח / החברה מספקים
              </button>
            </div>
          }
          fields={[
            ['שם', partEdit.name, (v) => setPartEdit({ ...partEdit, name: v })],
            ['מק"ט', partEdit.sku, (v) => setPartEdit({ ...partEdit, sku: v })],
            ['כמות', String(partEdit.qty), (v) => setPartEdit({ ...partEdit, qty: Number(v) || 1 })],
            ['מחיר', String(partEdit.price || ''), (v) => setPartEdit({ ...partEdit, price: Number(v) || 0 })],
          ]}
          onCancel={() => setPartEdit(null)}
          onSave={() => {
            upsertPartLine(c.id, partEdit);
            setPartEdit(null);
          }}
        />
      )}
    </Shell>
  );
}

function LineEditor({
  title,
  fields,
  extra,
  onCancel,
  onSave,
}: {
  title: string;
  fields: [string, string, (v: string) => void][];
  extra?: React.ReactNode;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className="sheet-backdrop show" onClick={onCancel} />
      <div className="sheet show">
        <div className="sheet-handle" />
        <div className="app-title" style={{ marginBottom: 10 }}>{title}</div>
        {fields.map(([label, value, onChange]) => (
          <Field key={label} label={label} value={value} onChange={onChange} />
        ))}
        {extra}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn-outline" onClick={onCancel}>ביטול</button>
          <button className="btn" onClick={onSave}>שמור</button>
        </div>
      </div>
    </>
  );
}

export function QuoteSendScreen() {
  const { c, nav } = useCaseOrRedirect();
  const { updateCase, addHistory } = useGarage();
  const [preview, setPreview] = useState(false);
  if (!c) return <Missing />;
  const totals = quoteTotals(c);
  const shareText = `הצעת מחיר תיק #${c.number} ל${c.customer.name} — ${c.vehicle.plate}. סה"כ ${formatMoney(totals.total)}`;

  return (
    <Shell
      title="הצעת מחיר מוכנה"
      onBack={() => nav(`/garage-management/cases/${c.id}/quote`)}
      pin={<StatusPin c={c} />}
      footer={
        <>
          <button className="btn-outline" onClick={() => { updateCase(c.id, { status: 'quote_draft' }); toast({ title: 'טיוטה נשמרה' }); }}>שמור טיוטה</button>
          <button className="btn" onClick={() => { updateCase(c.id, { status: 'awaiting_approval' }); addHistory(c.id, 'הצעה סומנה כמוכנה'); nav(`/garage-management/cases/${c.id}`); }}>סיום</button>
        </>
      }
    >
      {preview && (
        <div className="preview-box">
          <h3>דליה — הצעת מחיר #{c.number}</h3>
          <p>{c.customer.name} · {c.vehicle.plate} · {c.vehicle.manufacturer} {c.vehicle.model}</p>
          {c.works.map((w) => (
            <div key={w.id} className="srow"><span>{w.part} — {w.workType}</span><span>{formatMoney(w.price)}</span></div>
          ))}
          {c.partsLines.filter((p) => p.supplier === 'us').map((p) => (
            <div key={p.id} className="srow"><span>{p.name}</span><span>{formatMoney(p.price)}</span></div>
          ))}
          <div className="srow total"><span>סה"כ כולל מע"מ</span><span>{formatMoney(totals.total)}</span></div>
        </div>
      )}
      <div className="summary-sheet">
        <div className="srow"><span>עבודות</span><span>{formatMoney(totals.works)}</span></div>
        <div className="srow"><span>חלקים</span><span>{formatMoney(totals.parts)}</span></div>
        <div className="srow"><span>מע"מ</span><span>{formatMoney(totals.vat)}</span></div>
        <div className="srow total"><span>סה"כ</span><span>{formatMoney(totals.total)}</span></div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--white35)', marginTop: 10 }}>
        ההצעה נשמרת במערכת גם אם הלקוח לא חוזר לבצע את העבודה. הפקת PDF אמיתית תחובר ב-Backend באישור נפרד.
      </p>
      <div className="sec-lbl">שיתוף ושליחה</div>
      <div className="action-stack">
        <button className="btn-outline" onClick={() => setPreview(true)}>Preview</button>
        <button className="btn-outline" onClick={() => { backend(); addHistory(c.id, 'הפקת PDF סומנה בדמו'); }}>הפק PDF</button>
        <button className="btn-outline" onClick={backend}>⬇ הורד PDF</button>
        <a className="btn-outline" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }} href={`mailto:${c.customer.email || ''}?subject=${encodeURIComponent('הצעת מחיר #' + c.number)}&body=${encodeURIComponent(shareText)}`}>שלח במייל</a>
        <a className="wa-btn" href={waLink(c.customer.phone, shareText)} target="_blank" rel="noreferrer">🟢 שלח הצעת מחיר ב-WhatsApp</a>
        <button className="btn-outline" onClick={() => nav(`/garage-management/cases/${c.id}/share`)}>שיתוף מאובטח</button>
      </div>
    </Shell>
  );
}

export function WorkOrderScreen() {
  const { c, nav } = useCaseOrRedirect();
  const { addOrder, addPhoto } = useGarage();
  const [number, setNumber] = useState(c?.orders[0]?.number || '');
  const [date, setDate] = useState(todayLabel());
  const [company, setCompany] = useState(c?.customer.companyName || c?.customer.name || '');
  const [amount, setAmount] = useState(String(c?.orders[0]?.approvedAmount || quoteTotals(c || { works: [], partsLines: [] }).total));
  const [contact, setContact] = useState(c?.orders[0]?.contact || '');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState(false);
  if (!c) return <Missing />;
  const nextV = (c.orders[0]?.version || 0) + 1;

  const save = (asNewVersion = true) => {
    addOrder(c.id, {
      number: number || `A-${c.number}`,
      date,
      company,
      plate: c.vehicle.plate,
      approvedAmount: Number(amount) || 0,
      contact,
      notes,
      version: asNewVersion ? nextV : c.orders[0]?.version,
    });
    toast({ title: `הזמנה נשמרה כ-V${asNewVersion ? nextV : c.orders[0]?.version || 1}`, description: 'הגרסה הקודמת לא נדרסת' });
  };

  return (
    <Shell
      title="הזמנת עבודה"
      onBack={() => nav(`/garage-management/cases/${c.id}`)}
      pin={<StatusPin c={c} />}
      footer={<button className="btn" onClick={() => save(true)}>שמור כ-V{nextV}</button>}
    >
      <Field label="מספר הזמנה" value={number} onChange={setNumber} placeholder="A-8821" />
      <Field label="מספר רכב" value={c.vehicle.plate} onChange={() => undefined} />
      <Field label="תאריך" value={date} onChange={setDate} />
      <Field label="חברה" value={company} onChange={setCompany} />
      <Field label="סכום מאושר" value={amount} onChange={setAmount} />
      <Field label="איש קשר" value={contact} onChange={setContact} placeholder="שם + טלפון" />
      <Field label="הערות" value={notes} onChange={setNotes} textarea />

      <div className="two-col mt">
        <button className="btn-outline" onClick={() => document.getElementById('cap-order')?.click()}>צלם הזמנה</button>
        <button className="btn-outline" onClick={() => document.getElementById('up-order')?.click()}>העלה הזמנה</button>
        <HiddenCapture id="cap-order" onFile={async (f) => addPhoto(c.id, { topic: 'orders', label: `הזמנה V${nextV}`, dataUrl: await fileToDataUrl(f) })} />
        <input id="up-order" className="hidden-file" type="file" accept="image/*,.pdf" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) addPhoto(c.id, { topic: 'orders', label: f.name, dataUrl: await fileToDataUrl(f) });
        }} />
      </div>
      <div className="action-stack mt">
        <button className="btn-outline" onClick={() => setPreview((v) => !v)}>Preview</button>
        <button className="btn-outline" onClick={backend}>הורד</button>
        <button className="btn-outline" onClick={() => save(true)}>גרסה מתוקנת (V{nextV})</button>
        <button className="btn-outline" onClick={() => nav(`/garage-management/cases/${c.id}/share`)}>שיתוף</button>
        <a className="btn-outline" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }} href={`mailto:${c.customer.email || ''}?subject=${encodeURIComponent('הזמנת עבודה ' + (number || c.number))}`}>שליחה במייל</a>
      </div>
      {preview && (
        <div className="preview-box mt">
          <h3>הזמנה {number || '—'} · V{nextV}</h3>
          <p>{company} · {c.vehicle.plate}</p>
          <p>סכום מאושר: {amount} ₪</p>
          <p>{notes}</p>
        </div>
      )}
      <div className="sec-lbl">גרסאות קיימות</div>
      {c.orders.map((o) => (
        <div key={`${o.number}-v${o.version}`} className="card">
          <div className="qline">
            <div>
              <div className="l-l">{o.number} (V{o.version})</div>
              <div className="l-s">{o.createdAt} · {o.approvedAmount.toLocaleString('he-IL')} ₪</div>
            </div>
            {o === c.orders[0] ? <span className="badge b-green">נוכחית</span> : <span className="badge b-gray">ארכיון</span>}
          </div>
        </div>
      ))}
    </Shell>
  );
}

export function GalleryScreen() {
  const { c, nav } = useCaseOrRedirect();
  const { addPhoto } = useGarage();
  const [topic, setTopic] = useState<PhotoTopic | 'all'>('all');
  const [pick, setPick] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [light, setLight] = useState<string | null>(null);
  if (!c) return <Missing />;
  const photos = topic === 'all' ? c.photos : c.photos.filter((p) => p.topic === topic);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Shell
      title="תמונות התיק"
      onBack={() => nav(`/garage-management/cases/${c.id}`)}
      footer={
        <>
          <button className="btn-outline" onClick={() => document.getElementById('cap-gal')?.click()}>📷 צילום</button>
          <button className="btn" onClick={() => document.getElementById('up-gal')?.click()}>העלאה</button>
          <HiddenCapture id="cap-gal" onFile={async (f) => addPhoto(c.id, { topic: topic === 'all' ? 'other' : topic, label: 'צילום', dataUrl: await fileToDataUrl(f) })} />
          <input id="up-gal" className="hidden-file" type="file" accept="image/*" multiple onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            for (const f of files) addPhoto(c.id, { topic: topic === 'all' ? 'other' : topic, label: f.name, dataUrl: await fileToDataUrl(f) });
          }} />
        </>
      }
    >
      <div className="chiprow">
        <button className={`chip ${topic === 'all' ? 'on' : ''}`} onClick={() => setTopic('all')}>הכל</button>
        {PHOTO_TOPICS.map((t) => (
          <button key={t.id} className={`chip ${topic === t.id ? 'on' : ''}`} onClick={() => setTopic(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="two-col" style={{ marginBottom: 10 }}>
        <button className="btn-ghost" style={{ padding: 10 }} onClick={() => setPick((v) => !v)}>{pick ? 'בטל בחירה' : 'בחירה'}</button>
        <button className="btn-ghost" style={{ padding: 10 }} onClick={() => setSelected(photos.map((p) => p.id))}>בחר הכל</button>
      </div>
      <div className="gal-grid">
        {photos.map((p) => (
          <button
            key={p.id}
            className={`gal-thumb ${selected.includes(p.id) ? 'selected' : ''}`}
            style={{ backgroundImage: `url(${p.dataUrl})`, backgroundSize: 'cover' }}
            onClick={() => (pick ? toggle(p.id) : setLight(p.dataUrl))}
          />
        ))}
      </div>
      <div className="action-stack mt">
        <button className="btn-outline" onClick={() => selected[0] && setLight(photos.find((p) => p.id === selected[0])?.dataUrl || null)}>Preview</button>
        <button className="btn-outline" onClick={backend}>הורדה</button>
        <a className="btn-outline" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }} href={`mailto:${c.customer.email || ''}?subject=${encodeURIComponent('תמונות תיק #' + c.number)}`}>שלח במייל</a>
        <a className="wa-btn" href={waLink(c.customer.phone, `תמונות מתיק #${c.number}`)} target="_blank" rel="noreferrer">WhatsApp</a>
        <button className="btn-outline" onClick={() => nav(`/garage-management/cases/${c.id}/share`)}>שיתוף מאובטח</button>
      </div>
      <div className={`lightbox ${light ? 'show' : ''}`} onClick={() => setLight(null)}>
        <button className="lightbox-close">✕</button>
        {light ? <img className="lightbox-img" src={light} alt="" /> : <div className="lightbox-img" />}
      </div>
    </Shell>
  );
}

export function CommunicationScreen() {
  const { c, nav } = useCaseOrRedirect();
  const { addMail } = useGarage();
  const [to, setTo] = useState(c?.customer.email || '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(c ? `תיק #${c.number} — ${c.vehicle.plate}` : '');
  const [body, setBody] = useState('');
  const [attachQuote, setAttachQuote] = useState(true);
  const [attachPhotos, setAttachPhotos] = useState(false);
  const [attachDocs, setAttachDocs] = useState(false);
  const [attachLink, setAttachLink] = useState(false);
  if (!c) return <Missing />;

  return (
    <Shell
      title="תקשורת"
      onBack={() => nav(`/garage-management/cases/${c.id}`)}
      footer={
        <button
          className="btn"
          onClick={() => {
            addMail(c.id, {
              from: 'garage@dalia-car.online',
              to,
              cc,
              subject,
              body,
              direction: 'out',
            });
            toast({
              title: 'המייל הוכן בדמו',
              description: 'אין שינוי ב-Gmail/OAuth. נפתח mailto בלבד.',
            });
            const extra = [
              attachQuote ? 'צירוף הצעה' : '',
              attachPhotos ? 'צירוף תמונות' : '',
              attachDocs ? 'צירוף מסמכים' : '',
              attachLink ? 'צירוף קישור' : '',
            ].filter(Boolean).join(', ');
            window.location.href = `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + (extra ? `\n\n[${extra}]` : ''))}`;
          }}
        >
          מייל חדש
        </button>
      }
    >
      <Field label="אל" value={to} onChange={setTo} />
      <Field label="CC" value={cc} onChange={setCc} />
      <Field label="נושא" value={subject} onChange={setSubject} />
      <Field label="תוכן" value={body} onChange={setBody} textarea />
      <label className="checkline"><input type="checkbox" checked={attachQuote} onChange={(e) => setAttachQuote(e.target.checked)} /> צירוף הצעה</label>
      <label className="checkline"><input type="checkbox" checked={attachPhotos} onChange={(e) => setAttachPhotos(e.target.checked)} /> צירוף תמונות</label>
      <label className="checkline"><input type="checkbox" checked={attachDocs} onChange={(e) => setAttachDocs(e.target.checked)} /> צירוף מסמכים</label>
      <label className="checkline"><input type="checkbox" checked={attachLink} onChange={(e) => setAttachLink(e.target.checked)} /> צירוף קישור</label>
      <div className="sec-lbl">Thread</div>
      {c.mails.map((m) => (
        <div key={m.id} className="mail-item">
          <div className="l-l">{m.subject}</div>
          <div className="l-s">{m.at} · {m.direction === 'in' ? 'התקבל מ-' : 'נשלח אל '}{m.direction === 'in' ? m.from : m.to}</div>
          <div style={{ fontSize: 12.5, color: 'var(--white80)', marginTop: 4 }}>{m.body}</div>
        </div>
      ))}
    </Shell>
  );
}

export function ShareScreen() {
  const { c, nav } = useCaseOrRedirect();
  const { addShare, revokeShare } = useGarage();
  const [items, setItems] = useState<string[]>(['תמונות']);
  const [name, setName] = useState(c?.customer.name || '');
  const [company, setCompany] = useState(c?.customer.companyName || '');
  const [email, setEmail] = useState(c?.customer.email || '');
  const [phone, setPhone] = useState(c?.customer.phone || '');
  const [ttl, setTtl] = useState('48 שעות');
  const [custom, setCustom] = useState('');
  const [lastToken, setLastToken] = useState('');
  if (!c) return <Missing />;

  const toggle = (label: string) => setItems((s) => (s.includes(label) ? s.filter((x) => x !== label) : [...s, label]));
  const hours: Record<string, number> = { '24 שעות': 24, '48 שעות': 48, '72 שעות': 72, '7 ימים': 24 * 7 };

  const create = () => {
    const h = ttl === 'מותאם' ? Number(custom) || 24 : hours[ttl] || 48;
    const expires = new Date(Date.now() + h * 3600_000).toISOString();
    const share = addShare(c.id, {
      recipientName: name,
      recipientCompany: company,
      email,
      phone,
      ttlLabel: ttl === 'מותאם' ? `${custom} שעות` : ttl,
      expiresAt: expires,
      items,
    });
    setLastToken(share.token);
    toast({ title: 'נוצר קישור פנימי', description: 'אין URL ציבורי. הטוקן נשמר בתיק בלבד.' });
  };

  return (
    <Shell title="שיתוף מאובטח" onBack={() => nav(`/garage-management/cases/${c.id}`)} footer={<button className="btn" onClick={create}>צור קישור</button>}>
      <div className="sec-lbl" style={{ marginTop: 0 }}>בחר מה לשתף</div>
      {['תמונות', 'PDF', 'הזמנה', 'מסמכים'].map((label) => (
        <label key={label} className="checkline">
          <input type="checkbox" checked={items.includes(label)} onChange={() => toggle(label)} /> {label}
        </label>
      ))}
      <div className="sec-lbl">נשלח אל</div>
      <Field label="שם" value={name} onChange={setName} />
      <Field label="חברה" value={company} onChange={setCompany} />
      <Field label="Email" value={email} onChange={setEmail} />
      <Field label="טלפון" value={phone} onChange={setPhone} />
      <div className="sec-lbl">תוקף</div>
      <div className="chiprow">
        {['24 שעות', '48 שעות', '72 שעות', '7 ימים', 'מותאם'].map((t) => (
          <button key={t} className={`chip ${ttl === t ? 'on' : ''}`} onClick={() => setTtl(t)}>{t}</button>
        ))}
      </div>
      {ttl === 'מותאם' && <Field label="שעות" value={custom} onChange={setCustom} placeholder="96" />}
      {lastToken && (
        <div className="card">
          <div className="l-s">טוקן פנימי (לא URL ציבורי)</div>
          <div className="l-l" style={{ wordBreak: 'break-all' }}>{lastToken}</div>
          <div className="two-col mt">
            <button className="btn-outline" onClick={() => { navigator.clipboard.writeText(lastToken); toast({ title: 'הועתק' }); }}>העתק</button>
            <a className="wa-btn" href={waLink(phone, `שיתוף מאובטח לתיק #${c.number}. טוקן: ${lastToken}`)} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
          <a className="btn-outline mt" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }} href={`mailto:${email}?subject=${encodeURIComponent('שיתוף מאובטח תיק #' + c.number)}&body=${encodeURIComponent('טוקן פנימי: ' + lastToken)}`}>שלח Email</a>
        </div>
      )}
      <div className="sec-lbl">קישורים בתיק</div>
      {c.shares.map((s) => (
        <div key={s.id} className="card">
          <div className="qline">
            <div>
              <div className="l-l">{s.recipientName}</div>
              <div className="l-s">{s.ttlLabel} · {s.items.join(', ')}</div>
            </div>
            {s.revoked ? <span className="badge b-gray">בוטל</span> : <button className="btn-ghost" style={{ padding: '8px 12px', fontSize: 12 }} onClick={() => revokeShare(c.id, s.id)}>ביטול קישור</button>}
          </div>
        </div>
      ))}
    </Shell>
  );
}

export function IntakeScreen() {
  const { c, nav } = useCaseOrRedirect();
  const { saveIntake } = useGarage();
  const [odometer, setOdometer] = useState(c?.intake?.odometer || '');
  const [fuel, setFuel] = useState(c?.intake?.fuel || '');
  const [keys, setKeys] = useState(c?.intake?.keys || '2');
  const [lights, setLights] = useState(c?.intake?.warningLights || '');
  const [items, setItems] = useState(c?.intake?.itemsInCar || '');
  const [interior, setInterior] = useState(c?.intake?.interior || '');
  const [notes, setNotes] = useState(c?.intake?.notes || '');
  const [date, setDate] = useState(c?.intake?.date || todayLabel());
  const [time, setTime] = useState(c?.intake?.time || new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
  const [worker, setWorker] = useState(c?.intake?.worker || c?.worker || '');
  const [ok, setOk] = useState(Boolean(c?.intake?.approved));
  const [sig, setSig] = useState(c?.intake?.signatureDataUrl || '');
  if (!c) return <Missing />;
  const angles = requiredAnglesDone(c);

  return (
    <Shell
      title="קבלת רכב"
      onBack={() => nav(`/garage-management/cases/${c.id}`)}
      pin={<StatusPin c={c} />}
      footer={
        <button
          className="btn"
          onClick={() => {
            saveIntake(c.id, {
              odometer, fuel, keys, warningLights: lights, itemsInCar: items, interior, notes, date, time, worker, signatureDataUrl: sig, approved: ok,
            });
            toast({ title: 'הרכב התקבל לעבודה' });
            nav(`/garage-management/cases/${c.id}/inspect`);
          }}
        >
          המשך לצילום 4 זוויות ←
        </button>
      }
    >
      <Field label="קילומטראז'" value={odometer} onChange={setOdometer} placeholder="84,210" />
      <Field label="דלק" value={fuel} onChange={setFuel} placeholder="¾" />
      <Field label="מספר מפתחות" value={keys} onChange={setKeys} />
      <Field label="נורות אזהרה" value={lights} onChange={setLights} placeholder="אין" />
      <Field label="חפצים ברכב" value={items} onChange={setItems} placeholder="—" />
      <Field label="מצב פנים" value={interior} onChange={setInterior} />
      <Field label="הערות" value={notes} onChange={setNotes} textarea />
      <div className="two-col">
        <Field label="תאריך" value={date} onChange={setDate} />
        <Field label="שעה" value={time} onChange={setTime} />
      </div>
      <Field label="עובד" value={worker} onChange={setWorker} />
      <div className="checkline">בדיקת השלמת 4 זוויות: {angles}/4 {angles >= 4 ? '✓' : '— חסר'}</div>
      <button className="dashed-add" onClick={() => nav(`/garage-management/cases/${c.id}/map`)}>מפת נזקים</button>
      <div style={{ fontSize: 12, color: 'var(--white50)', margin: '14px 0 8px' }}>חתימת לקוח</div>
      <label className="checkline"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> קראתי ואני מאשר</label>
      <SignaturePad value={sig} onChange={setSig} />
      <button className="btn-outline mt" onClick={backend}>PDF קבלת רכב</button>
    </Shell>
  );
}

export function HistoryScreen() {
  const { c, nav } = useCaseOrRedirect();
  if (!c) return <Missing />;
  return (
    <Shell title="היסטוריית תיק" onBack={() => nav(`/garage-management/cases/${c.id}`)} pin={<StatusPin c={c} />}>
      <div className="timeline">
        {c.history.map((h) => (
          <div key={h.id} className="tl-item">
            <div className="tl-time">{h.at}</div>
            <div className="tl-text">{h.text}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function CompleteScreen() {
  const { c, nav } = useCaseOrRedirect();
  const { updateCase, addHistory } = useGarage();
  const [notes, setNotes] = useState(c?.closeNotes || 'העבודה בוצעה במלואה, הרכב נבדק ותועד לפני מסירה.');
  if (!c) return <Missing />;
  const totals = quoteTotals(c);
  const finishPhotos = c.photos.filter((p) => p.topic === 'after_work').length;

  return (
    <Shell
      title="סיום עבודה"
      onBack={() => nav(`/garage-management/cases/${c.id}`)}
      pin={<StatusPin c={c} />}
      footer={
        <button
          className="btn"
          onClick={() => {
            const closing = c.status === 'done' || c.status === 'closed';
            updateCase(c.id, { status: closing || c.status === 'in_work' || c.status === 'done' ? 'closed' : 'done', closeNotes: notes });
            addHistory(c.id, c.status === 'done' || c.status === 'closed' ? 'התיק נסגר' : 'העבודה הסתיימה');
            toast({ title: c.status === 'done' || c.status === 'closed' ? 'התיק נסגר' : 'העבודה הסתיימה', description: 'שום מידע לא נמחק' });
            nav(`/garage-management/cases/${c.id}`);
          }}
        >
          {c.status === 'done' || c.status === 'closed' ? 'סגירת תיק' : 'סיום עבודה'}
        </button>
      }
    >
      <div className="summary-sheet">
        <div className="srow"><span>עבודות שבוצעו</span><span>{c.works.length}</span></div>
        <div className="srow"><span>תמונות גמר</span><span>{finishPhotos || c.photos.length}</span></div>
        <div className="srow"><span>חלקים</span><span>{c.partsLines.length}</span></div>
        <div className="srow"><span>מספר הזמנה</span><span>{c.orders[0] ? `${c.orders[0].number} (V${c.orders[0].version})` : '—'}</span></div>
        <div className="srow total"><span>סכום מאושר</span><span>{formatMoney(c.orders[0]?.approvedAmount || totals.subtotal)}</span></div>
      </div>
      <Field label="הערות סיום" value={notes} onChange={setNotes} textarea />
      <p style={{ fontSize: 11, color: 'var(--white35)' }}>שום מידע לא נמחק בסגירה — כל התמונות וההיסטוריה נשארים בתיק.</p>
    </Shell>
  );
}

function Missing() {
  const nav = useNavigate();
  return (
    <Shell title="תיק לא נמצא" onBack={() => nav('/garage-management')}>
      <p style={{ color: 'var(--white50)' }}>התיק אינו קיים בדמו המקומי.</p>
    </Shell>
  );
}

export function CompanyWorkDetailsScreen() {
  const nav = useNavigate();
  const { draft, patchDraft, addCustomer, addVehicle, openCase } = useGarage();
  const company = draft.customer.companyName || draft.customer.name || 'חברה';
  return (
    <Shell
      title={`${company} — פרטי עבודה`}
      onBack={() => nav('/garage-management/open/company')}
      pin={
        <div className="id-pin">
          <div className="id-row"><span>חברה</span><b>{company}</b></div>
          <div className="id-grid">
            <div><span>מס' רכב</span><b>{draft.vehicle.plate || '—'}</b></div>
            <div><span>סוג רכב</span><b>{draft.vehicle.type || '—'}</b></div>
            <div><span>מס' הזמנה</span><b className="muted">טרם התקבל</b></div>
            <div><span>תאריך</span><b>{todayLabel()}</b></div>
          </div>
        </div>
      }
      footer={
        <button
          className="btn"
          disabled={!draft.vehicle.plate}
          onClick={() => {
            const customer = {
              id: draft.customer.id || uid('c'),
              kind: 'company' as const,
              name: draft.customer.name || company,
              phone: draft.customer.phone || '',
              companyName: company,
              email: draft.customer.email,
            };
            const vehicle = {
              id: uid('v'),
              plate: draft.vehicle.plate || '',
              manufacturer: draft.vehicle.manufacturer || '',
              model: draft.vehicle.model || '',
              type: draft.vehicle.type,
              year: draft.vehicle.year,
              customerId: customer.id,
            };
            addCustomer(customer);
            addVehicle(vehicle);
            const created = openCase({ customer, vehicle });
            nav(`/garage-management/cases/${created.id}/inspect`);
          }}
        >
          המשך לבדיקת רכב ←
        </button>
      }
    >
      <div className="sec-lbl" style={{ marginTop: 0 }}>פרטי הרכב</div>
      <Field label="מספר רכב" value={draft.vehicle.plate || ''} onChange={(v) => patchDraft({ vehicle: { ...draft.vehicle, plate: v } })} />
      <div className="two-col">
        <Field label="יצרן" value={draft.vehicle.manufacturer || ''} onChange={(v) => patchDraft({ vehicle: { ...draft.vehicle, manufacturer: v } })} placeholder="יונדאי" />
        <Field label="דגם" value={draft.vehicle.model || ''} onChange={(v) => patchDraft({ vehicle: { ...draft.vehicle, model: v } })} placeholder="i10" />
      </div>
      <div className="checkline">מספר ההזמנה יתעדכן כאן אוטומטית ברגע שיתקבל מהחברה</div>
      <button className="dashed-add" onClick={() => toast({ title: 'מספר הזמנה', description: 'יחובר כשיתקבל מסמך הזמנה בתיק' })}>＋ הוסף מספר הזמנה עכשיו</button>
    </Shell>
  );
}
