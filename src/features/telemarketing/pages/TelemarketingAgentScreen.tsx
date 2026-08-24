import { useState } from 'react';
import { CustomerCallCard } from '@/features/telemarketing/components/CallerScreen/CustomerCallCard';
import { CallTimerBar } from '@/features/telemarketing/components/CallerScreen/CallTimerBar';
import { CallReportForm } from '@/features/telemarketing/components/CallerScreen/CallReportForm';
import { useActiveCall } from '@/features/telemarketing/hooks/useActiveCall';
import type { CustomerRef, TelemarketingEmployee } from '@/features/telemarketing/types';

const EMPTY_MANUAL_CUSTOMER: CustomerRef = {
  companyName: '',
  contactName: '',
  contactRole: '',
  phone: '',
  email: '',
  vehicleCount: null,
  city: '',
};

export function TelemarketingAgentScreen({ currentEmployee }: { currentEmployee: TelemarketingEmployee }) {
  const [manualCustomer, setManualCustomer] = useState<CustomerRef>(EMPTY_MANUAL_CUSTOMER);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const {
    call,
    elapsedSeconds,
    draft,
    updateDraft,
    beginCall,
    finishCallTiming,
    submitReport,
    submitting,
    starting,
    isRecording,
    error,
  } = useActiveCall(currentEmployee.id);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const handleStart = async () => {
    if (!manualCustomer.companyName && !manualCustomer.phone) {
      showToast('error', 'חובה למלא שם חברה או טלפון לפני התחלת שיחה');
      return;
    }
    try {
      await beginCall({
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.displayName,
        customerId: null,
        companyName: manualCustomer.companyName,
        contactName: manualCustomer.contactName,
        contactRole: manualCustomer.contactRole,
        phone: manualCustomer.phone,
        email: manualCustomer.email,
        vehicleCount: manualCustomer.vehicleCount,
        city: manualCustomer.city,
      });
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'שגיאה בהתחלת שיחה');
    }
  };

  const handleSubmit = async () => {
    const ok = await submitReport();
    if (ok) {
      showToast('success', 'השיחה נשמרה בהצלחה');
      setManualCustomer(EMPTY_MANUAL_CUSTOMER);
    } else {
      showToast('error', 'לא ניתן לשמור - יש לתקן ולנסות שוב. הטקסט שהוזן לא נמחק.');
    }
  };

  const callStatus = !call ? 'idle' : call.endedAt ? 'ended' : 'in_progress';
  const reportOpen = callStatus === 'ended';
  const showManualForm = !call;

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      {toast && (
        <div
          className={`fixed inset-x-4 top-4 z-50 rounded-xl p-3 text-center font-bold text-white ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-destructive'
          }`}
        >
          {toast.text}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-black">טלמיטינג</h1>
        <p className="text-sm text-muted-foreground">
          {currentEmployee.displayName}
          {currentEmployee.employeeCode ? ` · ${currentEmployee.employeeCode}` : ''}
        </p>
      </div>

      {showManualForm && (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <p className="text-base font-black">לקוח / ליד חדש</p>
          <p className="text-xs text-muted-foreground">
            מילאו שם חברה או טלפון, ואז לחצו התחל שיחה. לא נוצר לקוח במערכת הראשית — רק ליד לשיחה.
          </p>
          <label className="block text-xs font-semibold text-muted-foreground">
            שם החברה
            <input
              placeholder="שם החברה"
              value={manualCustomer.companyName}
              onChange={(e) => setManualCustomer((c) => ({ ...c, companyName: e.target.value }))}
              className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              איש קשר
              <input
                placeholder="איש קשר"
                value={manualCustomer.contactName}
                onChange={(e) => setManualCustomer((c) => ({ ...c, contactName: e.target.value }))}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
              />
            </label>
            <label className="block text-xs font-semibold text-muted-foreground">
              תפקיד
              <input
                placeholder="תפקיד"
                value={manualCustomer.contactRole}
                onChange={(e) => setManualCustomer((c) => ({ ...c, contactRole: e.target.value }))}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              טלפון
              <input
                placeholder="טלפון"
                value={manualCustomer.phone}
                onChange={(e) => setManualCustomer((c) => ({ ...c, phone: e.target.value }))}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
                dir="ltr"
              />
            </label>
            <label className="block text-xs font-semibold text-muted-foreground">
              אימייל
              <input
                placeholder="אימייל"
                value={manualCustomer.email}
                onChange={(e) => setManualCustomer((c) => ({ ...c, email: e.target.value }))}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
                dir="ltr"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              מס' רכבים
              <input
                placeholder="מס' רכבים"
                type="number"
                value={manualCustomer.vehicleCount ?? ''}
                onChange={(e) =>
                  setManualCustomer((c) => ({ ...c, vehicleCount: e.target.value ? Number(e.target.value) : null }))
                }
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
              />
            </label>
            <label className="block text-xs font-semibold text-muted-foreground">
              עיר
              <input
                placeholder="עיר"
                value={manualCustomer.city}
                onChange={(e) => setManualCustomer((c) => ({ ...c, city: e.target.value }))}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
              />
            </label>
          </div>
          {error && !call && (
            <p className="rounded-lg bg-destructive/10 p-2 text-sm font-semibold text-destructive">{error}</p>
          )}
          <CallTimerBar
            status="idle"
            elapsedSeconds={elapsedSeconds}
            starting={starting}
            isRecording={false}
            onStart={() => void handleStart()}
            onEnd={() => void finishCallTiming()}
          />
        </div>
      )}

      {callStatus === 'ended' && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-50 p-3 text-sm font-semibold dark:bg-amber-950/30">
          יש להשלים דיווח למטה לפני מעבר ללקוח / ליד הבא
        </p>
      )}

      {(call || manualCustomer.companyName || manualCustomer.phone) && (
        <CustomerCallCard customer={call ? {
          companyName: call.companyName,
          contactName: call.contactName,
          contactRole: call.contactRole,
          phone: call.phone,
          email: call.email,
          vehicleCount: call.vehicleCount,
          city: call.city,
        } : manualCustomer} />
      )}

      {callStatus !== 'idle' && (
        <CallTimerBar
          status={callStatus}
          elapsedSeconds={elapsedSeconds}
          starting={starting}
          isRecording={isRecording}
          onStart={() => void handleStart()}
          onEnd={() => void finishCallTiming()}
        />
      )}

      {reportOpen && (
        <CallReportForm
          draft={draft}
          onChange={updateDraft}
          onSubmit={() => void handleSubmit()}
          submitting={submitting}
          error={error}
        />
      )}
    </div>
  );
}
