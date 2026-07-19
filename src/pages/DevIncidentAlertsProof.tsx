/**
 * Public visual proof (no login) — incident alerts feature on Staging branch.
 * Route: /dev/incident-alerts-proof
 */
import type { ReactNode } from 'react';
import IncidentSubmitSuccess from '@/components/incidents/IncidentSubmitSuccess';
import { FAULT_TYPE_PICKER } from '@/lib/faultTypes';
import { buildWhatsAppPreview, buildEmailSubject, buildEmailPreviewHtml } from '@/lib/incidentNotify';

const DEMO = {
  eventNumber: 'FLT-2026-000001',
  accidentEvent: 'ACC-2026-000001',
  driver: 'יוני אטיאס',
  plate: '12-345-67',
  internal: '101',
  company: 'מוסך יוני',
  faultType: 'פנצ׳ר',
  id: 'demo-fault-id',
  createdAt: new Date().toISOString(),
  description: 'פנצ׳ר בגלגל ימין קדמי — בדיקת Demo Staging',
};

const waPreview = buildWhatsAppPreview(
  'fault',
  {
    event_number: DEMO.eventNumber,
    company_name: DEMO.company,
    driver_name: DEMO.driver,
    vehicle_plate: DEMO.plate,
    vehicle_internal_number: DEMO.internal,
    fault_type: DEMO.faultType,
    description: DEMO.description,
    created_at: DEMO.createdAt,
  },
  `https://orin1607-ctrl.github.io/future-craft-core/faults?id=${DEMO.id}`,
);

const emailSubject = buildEmailSubject('fault', {
  event_number: DEMO.eventNumber,
  company_name: DEMO.company,
  vehicle_plate: DEMO.plate,
  fault_type: DEMO.faultType,
});

const emailHtml = buildEmailPreviewHtml(
  'fault',
  {
    event_number: DEMO.eventNumber,
    company_name: DEMO.company,
    driver_name: DEMO.driver,
    vehicle_plate: DEMO.plate,
    vehicle_internal_number: DEMO.internal,
    fault_type: DEMO.faultType,
    description: DEMO.description,
    created_at: DEMO.createdAt,
  },
  `https://orin1607-ctrl.github.io/future-craft-core/faults?id=${DEMO.id}`,
);

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-2 border-primary/20 rounded-2xl overflow-hidden bg-card">
      <div className="bg-primary/10 px-4 py-3 font-bold text-primary">{title}</div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MockForm({ kind }: { kind: 'fault' | 'accident' }) {
  const isFault = kind === 'fault';
  return (
    <div className="space-y-3 max-w-lg" dir="rtl">
      <h3 className="text-xl font-bold">{isFault ? 'דיווח תקלה חדש' : 'דיווח תאונה חדש'}</h3>
      <label className="block text-sm font-medium">רכב</label>
      <div className="w-full p-4 text-lg rounded-2xl border-2 border-input bg-muted/30">
        {DEMO.plate} {DEMO.internal ? `(פנימי: ${DEMO.internal})` : ''}
      </div>
      <label className="block text-sm font-medium">נהג</label>
      <div className="w-full p-4 text-lg rounded-2xl border-2 border-input bg-muted/30">{DEMO.driver}</div>
      {isFault && (
        <>
          <label className="block text-sm font-medium">סוג תקלה</label>
          <select className="w-full p-4 text-lg rounded-2xl border-2 border-primary bg-background" defaultValue={DEMO.faultType}>
            {FAULT_TYPE_PICKER.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </>
      )}
      {!isFault && (
        <>
          <label className="block text-sm font-medium">מיקום</label>
          <div className="w-full p-4 text-lg rounded-2xl border-2 border-input bg-muted/30">כביש 6 · מחלף קסם</div>
        </>
      )}
      <label className="block text-sm font-medium">תיאור</label>
      <div className="w-full p-4 text-lg rounded-2xl border-2 border-input bg-muted/30 min-h-[88px]">
        {DEMO.description}
      </div>
      <button type="button" className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground font-bold text-lg">
        {isFault ? 'שלח דיווח תקלה' : 'שלח דיווח תאונה'}
      </button>
    </div>
  );
}

export default function DevIncidentAlertsProof() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="sticky top-0 z-50 bg-emerald-700 text-white text-center text-sm font-bold py-3 px-4">
        הוכחה ויזואלית — Incident Alerts (Branch feat/incident-alerts-staging) · Demo: {DEMO.driver} / {DEMO.faultType}
      </div>
      <div className="max-w-3xl mx-auto p-4 space-y-8 pb-20">
        <p className="text-sm text-muted-foreground">
          דף זה ציבורי (ללא Login) ומציג את רכיבי ה-UI החדשים. המסכים המלאים במערכת דורשים Login אחרי פריסת GitHub Pages.
        </p>

        <Section id="fault-form" title="1. מסך פתיחת תקלה">
          <MockForm kind="fault" />
        </Section>

        <Section id="accident-form" title="2. מסך פתיחת תאונה">
          <MockForm kind="accident" />
        </Section>

        <Section id="success" title="3. מסך אישור + מספר אירוע">
          <IncidentSubmitSuccess
            kind="fault"
            eventNumber={DEMO.eventNumber}
            createdAt={DEMO.createdAt}
            statusLabel="חדש"
            viewPath={`/faults?id=${DEMO.id}`}
            onClose={() => {}}
            whatsappPreview={waPreview}
            emailSubject={emailSubject}
            emailHtml={emailHtml}
            showNotifyPreview={false}
          />
        </Section>

        <Section id="tracking" title="4. מעקב רכבים → תקלות פתוחות (כולל status opened)">
          <div className="rounded-xl border overflow-hidden">
            <div className="bg-muted/50 px-3 py-2 text-sm font-semibold">פילטר: תקלות · סטטוס פתוח</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-2 text-right">מספר אירוע</th>
                  <th className="p-2 text-right">רכב</th>
                  <th className="p-2 text-right">סוג</th>
                  <th className="p-2 text-right">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-amber-500/10">
                  <td className="p-2 font-bold tracking-wide">{DEMO.eventNumber}</td>
                  <td className="p-2">
                    {DEMO.plate} <span className="text-muted-foreground">(פנימי: {DEMO.internal})</span>
                  </td>
                  <td className="p-2">{DEMO.faultType}</td>
                  <td className="p-2">
                    <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-800 dark:text-amber-200">opened</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">תיקון: סטטוס opened נכלל ברשימת תקלות פתוחות במעקב.</p>
        </Section>

        <Section id="vehicle-card" title="5. כרטיס רכב (Vehicle Hub) — עמודת מספר אירוע">
          <div className="rounded-xl border p-3 space-y-2">
            <p className="font-bold">
              רכב {DEMO.plate} · פנימי {DEMO.internal}
            </p>
            <p className="text-sm text-muted-foreground">טאב תקלות</p>
            <div className="rounded-lg bg-muted/40 p-3 flex justify-between items-center text-sm">
              <span className="font-bold">{DEMO.eventNumber}</span>
              <span>{DEMO.faultType}</span>
              <span className="text-amber-700">opened</span>
            </div>
          </div>
        </Section>

        <Section id="driver-card" title="6. כרטיס נהג — אירוע משויך">
          <div className="rounded-xl border p-3 space-y-2">
            <p className="font-bold">{DEMO.driver}</p>
            <p className="text-sm text-muted-foreground">תקלות / אירועים אחרונים</p>
            <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
              <p>
                <b>מספר אירוע:</b> {DEMO.eventNumber}
              </p>
              <p>
                <b>רכב:</b> {DEMO.plate}
              </p>
              <p>
                <b>סוג:</b> {DEMO.faultType}
              </p>
            </div>
          </div>
        </Section>

        <Section id="fleet-dash" title="7. דשבורד מנהל הצי — תקלות פתוחות לחברה">
          <div className="rounded-xl border p-3">
            <p className="font-bold mb-2">חברה: {DEMO.company}</p>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between p-2 rounded-lg bg-muted/40">
                <span>
                  {DEMO.eventNumber} · {DEMO.driver}
                </span>
                <span>{DEMO.faultType}</span>
              </li>
            </ul>
          </div>
        </Section>

        <Section id="driver-dash" title="8. דשבורד נהג — דיווחים אחרונים">
          <div className="rounded-xl border p-3 space-y-2">
            <p className="font-bold">דיווחים אחרונים</p>
            <a
              className="block rounded-lg bg-muted/40 p-3 text-sm hover:bg-muted/60"
              href={`#success`}
            >
              <span className="font-bold">{DEMO.eventNumber}</span>
              <span className="mx-2">·</span>
              <span>תקלה · {DEMO.faultType}</span>
              <span className="mx-2">·</span>
              <span className="text-muted-foreground">{DEMO.plate}</span>
            </a>
          </div>
        </Section>

        <Section id="alert-settings" title="9. AlertSettings — התראות תאונות/תקלות">
          <div className="space-y-3 max-w-lg">
            <h3 className="font-bold text-lg">הגדרות התראות על תאונות ותקלות</h3>
            <p className="text-sm text-muted-foreground">
              מתג WhatsApp נפרד ממתג החירום — תוספת בתשלום לדיווחי תאונות/תקלות בלבד.
            </p>
            {[
              ['התראה בתוך המערכת — פעיל', true],
              ['Email — פעיל', true],
              ['WhatsApp (תוספת בתשלום) — כבוי', false],
            ].map(([label, on]) => (
              <label key={String(label)} className="flex items-center gap-3 p-3 rounded-xl bg-muted">
                <input type="checkbox" checked={Boolean(on)} readOnly className="rounded w-5 h-5 accent-primary" />
                <span className="font-medium">{label}</span>
              </label>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">נמעני Email</label>
                <div className="p-3 rounded-xl border-2">מנהלי צי</div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">נמעני WhatsApp</label>
                <div className="p-3 rounded-xl border-2">דליה</div>
              </div>
            </div>
          </div>
        </Section>

        <Section id="wa-preview" title="10. Preview WhatsApp (לא נשלח)">
          <pre className="whitespace-pre-wrap text-sm bg-muted/30 rounded-xl p-4" dir="rtl">
            {waPreview}
          </pre>
        </Section>

        <Section id="email-preview" title="11. Preview מייל (לא נשלח)">
          <p className="text-sm font-semibold mb-2">נושא: {emailSubject}</p>
          <div
            className="rounded-xl border bg-white text-black p-3 overflow-auto"
            dangerouslySetInnerHTML={{ __html: emailHtml }}
          />
        </Section>
      </div>
    </div>
  );
}
