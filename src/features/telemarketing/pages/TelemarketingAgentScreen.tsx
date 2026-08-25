import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CustomerCallCard } from '@/features/telemarketing/components/CallerScreen/CustomerCallCard';
import { CallTimerBar } from '@/features/telemarketing/components/CallerScreen/CallTimerBar';
import { CallReportForm } from '@/features/telemarketing/components/CallerScreen/CallReportForm';
import { WorkTimerBar } from '@/features/telemarketing/components/WorkSession/WorkTimerBar';
import { WorkReportForm } from '@/features/telemarketing/components/WorkSession/WorkReportForm';
import { MyFollowUps } from '@/features/telemarketing/components/FollowUp/MyFollowUps';
import { LeadTimeline } from '@/features/telemarketing/components/FollowUp/LeadTimeline';
import { LeadsBoard } from '@/features/telemarketing/components/Leads/LeadsBoard';
import { AgentChatEntry, DaliaChatBoard } from '@/features/telemarketing/components/DaliaCare/DaliaChatBoard';
import { DALIA_CHAT_PARAM } from '@/features/telemarketing/lib/daliaChatNav';
import { useActiveCall } from '@/features/telemarketing/hooks/useActiveCall';
import { useActiveWorkSession } from '@/features/telemarketing/hooks/useActiveWorkSession';
import { getFollowUpWorkItems, getLeadHistory } from '@/features/telemarketing/services/telemarketingService';
import type { CustomerRef, FollowUpWorkItem, TelemarketingEmployee } from '@/features/telemarketing/types';

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
  const navigate = useNavigate();
  const location = useLocation();
  const [manualCustomer, setManualCustomer] = useState<CustomerRef>(EMPTY_MANUAL_CUSTOMER);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [followUpReload, setFollowUpReload] = useState(0);
  const [returnHint, setReturnHint] = useState<FollowUpWorkItem | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
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
  const {
    session: workSession,
    elapsedSeconds: workElapsed,
    draft: workDraft,
    updateDraft: updateWorkDraft,
    beginWork,
    finishWorkTiming,
    submitWork,
    submitting: workSubmitting,
    starting: workStarting,
    error: workError,
  } = useActiveWorkSession(currentEmployee.id, currentEmployee.displayName);

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    setChatOpen(false);
    window.scrollTo(0, 0);
    const params = new URLSearchParams(location.search);
    const dirty =
      params.has(DALIA_CHAT_PARAM) ||
      params.has('v') ||
      /dalia/i.test(location.hash);
    if (dirty) {
      navigate({ pathname: '/telemarketing', search: '', hash: '' }, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (chatOpen) return;
    window.scrollTo(0, 0);
  }, [chatOpen]);

  useEffect(() => {
    const onPop = () => {
      setChatOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openChats = () => {
    setChatOpen(true);
    window.history.pushState({ teleAgentChat: true }, '');
    window.scrollTo(0, 0);
  };

  const backToWork = () => {
    if (window.history.state?.teleAgentChat) {
      window.history.back();
      return;
    }
    setChatOpen(false);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (!call?.sourceFollowUpId) {
      setReturnHint(null);
      return;
    }
    let cancelled = false;
    void getFollowUpWorkItems().then((rows) => {
      if (cancelled) return;
      const found = rows.find((row) => row.id === call.sourceFollowUpId);
      if (found) setReturnHint(found);
    });
    return () => {
      cancelled = true;
    };
  }, [call?.sourceFollowUpId]);

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

  const handleStartReturn = async (item: FollowUpWorkItem) => {
    const history = await getLeadHistory(item.phone, item.companyName);
    const last = history[history.length - 1];
    const lead: CustomerRef = {
      companyName: item.companyName || last?.companyName || '',
      contactName: item.contactName || last?.contactName,
      contactRole: last?.contactRole,
      phone: item.phone || last?.phone || '',
      email: last?.email,
      vehicleCount: last?.vehicleCount ?? null,
      city: last?.city,
    };
    setManualCustomer(lead);
    setReturnHint(item);
    try {
      await beginCall({
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.displayName,
        customerId: last?.customerId ?? null,
        companyName: lead.companyName,
        contactName: lead.contactName,
        contactRole: lead.contactRole,
        phone: lead.phone,
        email: lead.email,
        vehicleCount: lead.vehicleCount,
        city: lead.city,
        sourceFollowUpId: item.id,
      });
    } catch (e) {
      setReturnHint(null);
      showToast('error', e instanceof Error ? e.message : 'שגיאה בהתחלת שיחת חזרה');
    }
  };

  const handleStartWork = async () => {
    try {
      await beginWork({
        companyName: manualCustomer.companyName,
        contactName: manualCustomer.contactName,
        phone: manualCustomer.phone,
      });
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'שגיאה בהתחלת משימה');
    }
  };

  const handleSubmitWork = async () => {
    const ok = await submitWork();
    if (ok) {
      showToast('success', 'משימת העבודה נשמרה');
      setFollowUpReload((n) => n + 1);
    } else {
      showToast('error', 'לא ניתן לשמור את המשימה');
    }
  };

  const handleSubmit = async () => {
    const ok = await submitReport();
    if (ok) {
      showToast('success', 'השיחה נשמרה בהצלחה');
      setManualCustomer(EMPTY_MANUAL_CUSTOMER);
      setReturnHint(null);
      setFollowUpReload((n) => n + 1);
    } else {
      showToast('error', 'לא ניתן לשמור - יש לתקן ולנסות שוב. הטקסט שהוזן לא נמחק.');
    }
  };

  const callStatus = !call ? 'idle' : call.endedAt ? 'ended' : 'in_progress';
  const reportOpen = callStatus === 'ended';
  const workStatus = !workSession ? 'idle' : workSession.endedAt ? 'ended' : 'in_progress';
  const workReportOpen = workStatus === 'ended';
  const showIdleBoards = !call && !workSession;

  if (chatOpen) {
    return (
      <DaliaChatBoard
        currentUserId={currentEmployee.id}
        currentUserName={currentEmployee.displayName}
        isAdmin={false}
        reloadToken={followUpReload}
        onBackToWork={backToWork}
      />
    );
  }

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

      <div
        data-testid="telemarketing-agent-home"
        data-tele-build={String(import.meta.env.VITE_BUILD_COMMIT || '').slice(0, 7)}
        id="tele-work-home"
        className="scroll-mt-28"
      >
        <h1 className="text-2xl font-black">טלמיטינג</h1>
        <p className="text-sm text-muted-foreground">
          {currentEmployee.displayName}
          {currentEmployee.employeeCode ? ` · ${currentEmployee.employeeCode}` : ''}
        </p>
        {showIdleBoards && (
          <>
            <div className="mt-3 space-y-2">
              <CallTimerBar
                status="idle"
                elapsedSeconds={elapsedSeconds}
                starting={starting}
                isRecording={false}
                employeeName={currentEmployee.displayName}
                onStart={() => void handleStart()}
                onEnd={() => void finishCallTiming()}
              />
              <WorkTimerBar
                status="idle"
                elapsedSeconds={workElapsed}
                starting={workStarting}
                employeeName={currentEmployee.displayName}
                onStart={() => void handleStartWork()}
                onEnd={() => void finishWorkTiming()}
              />
              <AgentChatEntry currentUserId={currentEmployee.id} onOpen={openChats} reloadToken={followUpReload} />
            </div>
            {(error || workError) && !call && !workSession && (
              <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm font-semibold text-destructive">{error || workError}</p>
            )}
          </>
        )}
      </div>

      {call?.sourceFollowUpId && (
        <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
          <p className="font-black">שיחת חזרה — נוצרת רשומת שיחה חדשה. הסיכום הקודם נשמר בהיסטוריה.</p>
          {returnHint && (
            <>
              <p>
                מועד החזרה: {returnHint.dueDate}
                {returnHint.dueTime ? ` ${returnHint.dueTime}` : ''} · {returnHint.urgency}
              </p>
              {returnHint.actionNeeded && <p className="font-semibold">מה צריך לבצע: {returnHint.actionNeeded}</p>}
              {returnHint.lastSummary && <p>סיכום קודם: {returnHint.lastSummary}</p>}
            </>
          )}
          {returnHint && (
            <details className="rounded-lg bg-background/70 p-2">
              <summary className="cursor-pointer font-bold">היסטוריית שיחות</summary>
              <div className="mt-2">
                <LeadTimeline followUp={returnHint} actor={{ id: currentEmployee.id, displayName: currentEmployee.displayName }} />
              </div>
            </details>
          )}
        </div>
      )}

      {showIdleBoards && (
        <div id="new-lead" className="space-y-2 rounded-2xl border border-border bg-card p-4">
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
        </div>
      )}

      {showIdleBoards && <MyFollowUps onStartReturn={(item) => void handleStartReturn(item)} reloadToken={followUpReload} currentEmployee={currentEmployee} />}

      {showIdleBoards && <LeadsBoard currentEmployee={currentEmployee} hideEmployeeFilter />}

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
          startedAt={call?.startedAt}
          endedAt={call?.endedAt}
          employeeName={call?.employeeName || currentEmployee.displayName}
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

      {workStatus !== 'idle' && (
        <WorkTimerBar
          status={workStatus}
          elapsedSeconds={workElapsed}
          starting={workStarting}
          startedAt={workSession?.startedAt}
          endedAt={workSession?.endedAt}
          employeeName={workSession?.employeeName || currentEmployee.displayName}
          onStart={() => void handleStartWork()}
          onEnd={() => void finishWorkTiming()}
        />
      )}
      {workReportOpen && (
        <WorkReportForm
          draft={workDraft}
          onChange={updateWorkDraft}
          onSubmit={() => void handleSubmitWork()}
          submitting={workSubmitting}
          error={workError}
        />
      )}
    </div>
  );
}
