import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CustomerKind, GarageCustomer, GarageVehicle } from './types';
import { Field, Shell } from './ui';
import { useGarage } from './store';
import { matchesQuery, STATUS_META, uid } from './logic';

export function HomeScreen() {
  const nav = useNavigate();
  const { cases, resetDraft, patchDraft } = useGarage();

  return (
    <Shell
      title="ניהול מוסך"
      sub="Oren Car · פתיחת עבודה"
      onBack={() => nav('/dashboard')}
      footer={
        <button
          className="btn"
          onClick={() => {
            resetDraft();
            nav('/garage-management/open');
          }}
        >
          + פתח תיק
        </button>
      }
    >
      <div className="route-card">
        <div className="route-ico">💬</div>
        <div className="route-t">הצעת מחיר ללקוח חדש</div>
        <div className="route-s">לקוח שמגיע לבדיקה / הצעת מחיר בלבד</div>
        <button
          className="btn route-btn"
          onClick={() => {
            resetDraft();
            patchDraft({ customerMode: 'new', customerKind: 'private' });
            nav('/garage-management/open/new');
          }}
        >
          פתח הצעת מחיר ←
        </button>
      </div>
      <div className="route-card">
        <div className="route-ico">🚗</div>
        <div className="route-t">קבלת רכב לעבודה</div>
        <div className="route-s">לקוח שכבר קיבל הצעה וחזר לביצוע</div>
        <button className="btn route-btn" onClick={() => nav('/garage-management/quotes')}>
          מצא הצעה קיימת ←
        </button>
      </div>
      <div className="route-card">
        <div className="route-ico">🏢</div>
        <div className="route-t">חברה קבועה</div>
        <div className="route-s">לקוח עסקי שכבר קיים במערכת (למשל אלדן)</div>
        <button
          className="btn route-btn"
          onClick={() => {
            resetDraft();
            patchDraft({ customerMode: 'company', customerKind: 'company' });
            nav('/garage-management/open/company');
          }}
        >
          בחר חברה ←
        </button>
      </div>

      <div className="sec-lbl">תיקים פתוחים בדמו</div>
      {cases.map((c) => (
        <div key={c.id} className="card case-card">
          <div className="top">
            <div>
              <div className="name">
                {c.customer.companyName || c.customer.name}
              </div>
              <div className="meta">
                תיק #{c.number} · {c.vehicle.plate}
              </div>
            </div>
            <span className={`badge ${STATUS_META[c.status].badge}`}>{STATUS_META[c.status].label}</span>
          </div>
          <div className="foot">
            <span style={{ fontSize: 11, color: 'var(--white35)' }}>{c.vehicle.manufacturer} {c.vehicle.model}</span>
            <button className="btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => nav(`/garage-management/cases/${c.id}`)}>
              פתח ←
            </button>
          </div>
        </div>
      ))}
    </Shell>
  );
}

export function OpenCaseScreen() {
  const nav = useNavigate();
  const { patchDraft } = useGarage();
  return (
    <Shell title="פתח תיק" sub="בחירת לקוח" onBack={() => nav('/garage-management')}>
      <div className="sec-lbl" style={{ marginTop: 0 }}>
        לקוח קיים או חדש
      </div>
      <button
        className="bigpick"
        onClick={() => {
          patchDraft({ customerMode: 'existing' });
          nav('/garage-management/open/existing');
        }}
      >
        <div className="ico">🔎</div>
        <div>
          <div className="t">לקוח קיים</div>
          <div className="s">חיפוש ובחירה מתוך הלקוחות בדמו</div>
        </div>
      </button>
      <button
        className="bigpick"
        onClick={() => {
          patchDraft({ customerMode: 'new', customerKind: 'private' });
          nav('/garage-management/open/new');
        }}
      >
        <div className="ico">👤</div>
        <div>
          <div className="t">לקוח חדש — פרטי</div>
          <div className="s">שם, טלפון, אופציונלי מייל</div>
        </div>
      </button>
      <button
        className="bigpick"
        onClick={() => {
          patchDraft({ customerMode: 'new', customerKind: 'business' });
          nav('/garage-management/open/new?kind=business');
        }}
      >
        <div className="ico">🧾</div>
        <div>
          <div className="t">לקוח חדש — עסקי</div>
          <div className="s">עוסק / חברה חד פעמית</div>
        </div>
      </button>
      <button
        className="bigpick"
        onClick={() => {
          patchDraft({ customerMode: 'company', customerKind: 'company' });
          nav('/garage-management/open/company');
        }}
      >
        <div className="ico">🏢</div>
        <div>
          <div className="t">חברה קבועה</div>
          <div className="s">למשל אלדן — בלי לפתוח לקוח חדש</div>
        </div>
      </button>
    </Shell>
  );
}

export function ExistingCustomerScreen() {
  const nav = useNavigate();
  const { customers, vehicles, patchDraft } = useGarage();
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      customers.filter((c) =>
        matchesQuery(`${c.name} ${c.phone} ${c.email || ''} ${c.companyName || ''}`, q),
      ),
    [customers, q],
  );

  const choose = (c: GarageCustomer) => {
    const owned = vehicles.filter((v) => v.customerId === c.id);
    patchDraft({
      customerMode: 'existing',
      customerKind: c.kind,
      customer: c,
      vehicleMode: owned.length ? 'existing' : 'new',
      vehicle: owned[0] || {},
    });
    nav('/garage-management/open/vehicle');
  };

  return (
    <Shell title="לקוח קיים" onBack={() => nav('/garage-management/open')} pin={<input className="search" placeholder="שם / טלפון / חברה" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 8 }} />}>
      {list.map((c) => (
        <div key={c.id} className="card case-card">
          <div className="top">
            <div>
              <div className="name">{c.name}</div>
              <div className="meta">
                {c.phone} {c.companyName ? `· ${c.companyName}` : ''}
              </div>
            </div>
            <span className="badge b-slate">{c.kind === 'company' ? 'חברה' : c.kind === 'business' ? 'עסקי' : 'פרטי'}</span>
          </div>
          <div className="foot">
            <span style={{ fontSize: 11, color: 'var(--white35)' }}>{c.email || '—'}</span>
            <button className="btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => choose(c)}>
              בחר ←
            </button>
          </div>
        </div>
      ))}
      {list.length === 0 && <p style={{ color: 'var(--white50)', textAlign: 'center' }}>לא נמצא לקוח בדמו</p>}
    </Shell>
  );
}

export function NewCustomerScreen() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { draft, patchDraft } = useGarage();
  const kind = (params.get('kind') as CustomerKind) || draft.customerKind || 'private';
  const c = draft.customer;
  const title = kind === 'business' ? 'לקוח עסקי חדש' : 'הצעת מחיר ללקוח חדש';

  return (
    <Shell
      title={title}
      onBack={() => nav('/garage-management/open')}
      footer={
        <button
          className="btn"
          disabled={!c.name || !c.phone}
          onClick={() => {
            patchDraft({
              customerMode: 'new',
              customerKind: kind,
              customer: { ...c, id: c.id || uid('c'), kind, name: c.name || '', phone: c.phone || '' },
            });
            nav('/garage-management/open/vehicle');
          }}
        >
          המשך לרכב ←
        </button>
      }
    >
      <div className="sec-lbl" style={{ marginTop: 0 }}>
        פרטי לקוח
      </div>
      {(kind === 'business' || kind === 'company') && (
        <Field
          label="שם חברה"
          value={c.companyName || ''}
          onChange={(v) => patchDraft({ customer: { ...c, companyName: v } })}
          placeholder="שם החברה"
        />
      )}
      <Field label="שם מלא" value={c.name || ''} onChange={(v) => patchDraft({ customer: { ...c, name: v } })} placeholder="ישראל ישראלי" />
      <Field label="טלפון" value={c.phone || ''} onChange={(v) => patchDraft({ customer: { ...c, phone: v } })} placeholder="050-0000000" />
      <Field label="Email (אופציונלי)" value={c.email || ''} onChange={(v) => patchDraft({ customer: { ...c, email: v } })} placeholder="name@mail.com" />
      <div className="sec-lbl">פרטי הנזק (אופציונלי בשלב זה)</div>
      <Field label="אזור הנזק" value={draft.damageArea || ''} onChange={(v) => patchDraft({ damageArea: v })} placeholder="כנף קדמית שמאל" />
      <Field label="תיאור הנזק" value={draft.damageDescription || ''} onChange={(v) => patchDraft({ damageDescription: v })} textarea />
      <Field label="הערות" value={draft.notes || ''} onChange={(v) => patchDraft({ notes: v })} placeholder="—" />
    </Shell>
  );
}

export function CompanyPickScreen() {
  const nav = useNavigate();
  const { customers, patchDraft } = useGarage();
  const [q, setQ] = useState('');
  const companies = customers.filter((c) => c.kind === 'company' || c.kind === 'business');
  const list = companies.filter((c) => matchesQuery(`${c.name} ${c.companyName || ''}`, q));

  return (
    <Shell title="חברה קבועה" onBack={() => nav('/garage-management/open')} pin={<input className="search" placeholder="חיפוש חברה..." value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 8 }} />}>
      {list.map((c) => (
        <div key={c.id} className="card case-card">
          <div className="top">
            <div>
              <div className="name">{c.companyName || c.name}</div>
              <div className="meta">{c.kind === 'company' ? 'ליסינג / צי' : 'לקוח עסקי'}</div>
            </div>
          </div>
          <div className="foot">
            <span style={{ fontSize: 11, color: 'var(--white35)' }}>{c.phone}</span>
            <button
              className="btn-ghost"
              style={{ padding: '8px 14px', fontSize: 12 }}
              onClick={() => {
                patchDraft({ customerMode: 'company', customerKind: 'company', customer: c, vehicleMode: 'new' });
                nav('/garage-management/open/company-work');
              }}
            >
              בחר ←
            </button>
          </div>
        </div>
      ))}
    </Shell>
  );
}

export function VehicleScreen() {
  const nav = useNavigate();
  const { draft, vehicles, patchDraft, addCustomer, addVehicle, openCase } = useGarage();
  const [mode, setMode] = useState<'existing' | 'new'>(draft.vehicleMode);
  const owned = vehicles.filter((v) => v.customerId && v.customerId === draft.customer.id);
  const [q, setQ] = useState('');
  const list = (owned.length ? owned : vehicles).filter((v) =>
    matchesQuery(`${v.plate} ${v.manufacturer} ${v.model}`, q),
  );

  const finish = (vehicle: GarageVehicle) => {
    const customer: GarageCustomer = {
      id: draft.customer.id || uid('c'),
      kind: draft.customerKind,
      name: draft.customer.name || draft.customer.companyName || 'לקוח',
      phone: draft.customer.phone || '',
      email: draft.customer.email,
      companyName: draft.customer.companyName,
    };
    addCustomer(customer);
    addVehicle({ ...vehicle, customerId: customer.id });
    const created = openCase({ customer, vehicle: { ...vehicle, customerId: customer.id } });
    nav(`/garage-management/cases/${created.id}`, { replace: true });
  };

  return (
    <Shell
      title="רכב"
      sub={draft.customer.name || draft.customer.companyName}
      onBack={() => nav(-1)}
      footer={
        mode === 'new' ? (
          <button
            className="btn"
            disabled={!draft.vehicle.plate}
            onClick={() =>
              finish({
                id: uid('v'),
                plate: draft.vehicle.plate || '',
                manufacturer: draft.vehicle.manufacturer || '',
                model: draft.vehicle.model || '',
                year: draft.vehicle.year,
                type: draft.vehicle.type,
              })
            }
          >
            פתח תיק עבודה ←
          </button>
        ) : undefined
      }
    >
      <div className="two-col" style={{ marginBottom: 12 }}>
        <button className={`chip ${mode === 'existing' ? 'on' : ''}`} onClick={() => setMode('existing')}>
          רכב קיים
        </button>
        <button className={`chip ${mode === 'new' ? 'on' : ''}`} onClick={() => setMode('new')}>
          רכב חדש
        </button>
      </div>

      {mode === 'existing' ? (
        <>
          <input className="search" placeholder="מספר רכב / יצרן / דגם" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ height: 10 }} />
          {list.map((v) => (
            <div key={v.id} className="card case-card">
              <div className="top">
                <div>
                  <div className="name">{v.plate}</div>
                  <div className="meta">
                    {v.manufacturer} {v.model} {v.year || ''}
                  </div>
                </div>
              </div>
              <div className="foot">
                <span style={{ fontSize: 11, color: 'var(--white35)' }}>{v.type || 'רכב'}</span>
                <button className="btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => finish(v)}>
                  בחר ופתח תיק ←
                </button>
              </div>
            </div>
          ))}
          {list.length === 0 && <p style={{ color: 'var(--white50)' }}>אין רכב תואם — ניתן להוסיף רכב חדש</p>}
        </>
      ) : (
        <>
          <div className="sec-lbl" style={{ marginTop: 0 }}>
            פרטי רכב
          </div>
          <Field label="מספר רכב" value={draft.vehicle.plate || ''} onChange={(v) => patchDraft({ vehicle: { ...draft.vehicle, plate: v } })} placeholder="12-345-67" />
          <div className="two-col">
            <Field label="יצרן" value={draft.vehicle.manufacturer || ''} onChange={(v) => patchDraft({ vehicle: { ...draft.vehicle, manufacturer: v } })} placeholder="טויוטה" />
            <Field label="דגם" value={draft.vehicle.model || ''} onChange={(v) => patchDraft({ vehicle: { ...draft.vehicle, model: v } })} placeholder="קורולה" />
          </div>
          <div className="two-col">
            <Field label="סוג רכב" value={draft.vehicle.type || ''} onChange={(v) => patchDraft({ vehicle: { ...draft.vehicle, type: v } })} placeholder="פרטי" />
            <Field label="שנתון" value={draft.vehicle.year || ''} onChange={(v) => patchDraft({ vehicle: { ...draft.vehicle, year: v } })} placeholder="2021" />
          </div>
        </>
      )}
    </Shell>
  );
}

export function QuoteSearchScreen() {
  const nav = useNavigate();
  const { cases } = useGarage();
  const [q, setQ] = useState('');
  const list = cases.filter((c) =>
    matchesQuery(`${c.customer.name} ${c.vehicle.plate} ${c.number} ${c.customer.phone}`, q),
  );
  return (
    <Shell title="מצא הצעה קיימת" onBack={() => nav('/garage-management')} pin={<input className="search" placeholder="מספר רכב / שם לקוח / טלפון / מספר הצעה" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 8 }} />}>
      {list.map((c) => (
        <div key={c.id} className="card case-card">
          <div className="top">
            <div>
              <div className="name">{c.customer.name}</div>
              <div className="meta">
                הצעה #{c.number} · {c.vehicle.plate}
              </div>
            </div>
            <span className={`badge ${STATUS_META[c.status].badge}`}>{STATUS_META[c.status].label}</span>
          </div>
          <div className="foot">
            <span style={{ fontSize: 11, color: 'var(--white35)' }}>{c.openedAt}</span>
            <button className="btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => nav(`/garage-management/quotes/${c.id}`)}>
              פתח ←
            </button>
          </div>
        </div>
      ))}
    </Shell>
  );
}

export function ApprovedQuoteScreen({ caseId }: { caseId: string }) {
  const nav = useNavigate();
  const { getCase } = useGarage();
  const c = getCase(caseId);
  if (!c) return <Shell title="לא נמצא" onBack={() => nav('/garage-management/quotes')}>הצעה לא נמצאה בדמו</Shell>;
  return (
    <Shell
      title={`הצעה #${c.number}`}
      onBack={() => nav('/garage-management/quotes')}
      pin={
        <div className="status-pin">
          <div>
            <div className="case-no">
              {c.customer.name} · {c.vehicle.plate}
            </div>
            <div className="case-meta">
              {c.vehicle.manufacturer} {c.vehicle.model}
            </div>
          </div>
          <span className={`badge ${STATUS_META[c.status].badge}`}>{STATUS_META[c.status].label}</span>
        </div>
      }
      footer={
        <button className="btn" onClick={() => nav(`/garage-management/cases/${c.id}/intake`)}>
          קבל רכב לעבודה ←
        </button>
      }
    >
      <div className="sec-lbl" style={{ marginTop: 0 }}>
        הנזק שתועד
      </div>
      <div className="card">
        <div style={{ fontSize: 12.8, color: 'var(--white80)' }}>{c.damageDescription || '—'}</div>
      </div>
      <div className="sec-lbl">תמונות קודמות</div>
      <div className="gal-grid">
        {c.photos.slice(0, 6).map((p) => (
          <img key={p.id} className="gal-thumb" src={p.dataUrl} alt={p.label} />
        ))}
      </div>
      <div className="sec-lbl">ההצעה שאושרה</div>
      <div className="summary-sheet">
        {c.works.map((w) => (
          <div key={w.id} className="srow">
            <span>{w.part}</span>
            <span>{w.price.toLocaleString('he-IL')} ₪</span>
          </div>
        ))}
        <div className="srow total">
          <span>סה"כ מאושר</span>
          <span>
            {c.works.reduce((s, w) => s + w.price, 0) + c.partsLines.filter((p) => p.supplier === 'us').reduce((s, p) => s + p.price, 0)} ₪
          </span>
        </div>
      </div>
    </Shell>
  );
}
