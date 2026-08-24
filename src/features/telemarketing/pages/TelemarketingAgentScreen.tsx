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
  } = useActiveCall();

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
    } catch {
      showToast('error', 'שגיאה בהתחלת שיחה');
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
          <p className="text-xs font-semibold text-muted-foreground">הזנת לקוח לשיחה</p>
          <input
            placeholder="שם החברה"
            value={manualCustomer.companyName}
            onChange={(e) => setManualCustomer((c) => ({ ...c, companyName: e.target.value }))}
            className="min-h-12 w-full rounded-lg border border-border bg-background p-3"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="איש קשר"
              value={manualCustomer.contactName}
              onChange={(e) => setManualCustomer((c) => ({ ...c, contactName: e.target.value }))}
              className="min-h-12 rounded-lg border border-border bg-background p-3"
            />
            <input
              placeholder="תפקיד"
              value={manualCustomer.contactRole}
              onChange={(e) => setManualCustomer((c) => ({ ...c, contactRole: e.target.value }))}
              className="min-h-12 rounded-lg border border-border bg-background p-3"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="טלפון"
              value={manualCustomer.phone}
              onChange={(e) => setManualCustomer((c) => ({ ...c, phone: e.target.value }))}
              className="min-h-12 rounded-lg border border-border bg-background p-3"
              dir="ltr"
            />
            <input
              placeholder="אימייל"
              value={manualCustomer.email}
              onChange={(e) => setManualCustomer((c) => ({ ...c, email: e.target.value }))}
              className="min-h-12 rounded-lg border border-border bg-background p-3"
              dir="ltr"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="מס' רכבים"
              type="number"
              value={manualCustomer.vehicleCount ?? ''}
              onChange={(e) =>
                setManualCustomer((c) => ({ ...c, vehicleCount: e.target.value ? Number(e.target.value) : null }))
              }
              className="min-h-12 rounded-lg border border-border bg-background p-3"
            />
            <input
              placeholder="עיר"
              value={manualCustomer.city}
              onChange={(e) => setManualCustomer((c) => ({ ...c, city: e.target.value }))}
              className="min-h-12 rounded-lg border border-border bg-background p-3"
            />
          </div>
        </div>
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

      <CallTimerBar
        status={callStatus}
        elapsedSeconds={elapsedSeconds}
        starting={starting}
        isRecording={isRecording}
        onStart={() => void handleStart()}
        onEnd={() => void finishCallTiming()}
      />

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
