import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import approvedSourceHtml from './approved-source.html?raw';
import './garage.css';
import {
  GARAGE_BOOK_PENDING_MESSAGE,
  createCase,
  createCustomer,
  createVehicle,
  emptyCaseData,
  getCase,
  GARAGE_WORKFLOW_PENDING_MESSAGE,
  isGarageSchemaMissing,
  isGarageWorkflowColumnMissing,
  listCases,
  listCustomerCases,
  listVehicles,
  probeGarageBook,
  searchCustomers,
  updateCase,
  updateCustomerBook,
  type GarageActor,
  type GarageCustomer,
  type GarageRoute,
  type GarageVehicle,
} from './garageBook';
import {
  GARAGE_MEDIA_PENDING_MESSAGE,
  listGarageMedia,
  probeGarageMedia,
  uploadGarageMedia,
  type GarageMediaCategoryId,
} from './garageMedia';
import { scanGarageMailbox, sendGarageMail } from './garageMail';
import { fetchExistingGoogleClientId, isMissingGarageGmailFunction, parseGoogleClientIdFromAuthUrl } from './garageGmailBrowser';
import { supabase } from '@/integrations/supabase/client';

type HostRequest = {
  type: string;
  requestId?: string;
  payload?: Record<string, unknown>;
  buffer?: ArrayBuffer;
};

function actorOf(user: { id: string; full_name?: string; role?: string } | null): GarageActor | null {
  if (!user?.id) return null;
  return { id: user.id, full_name: user.full_name, role: user.role };
}

function asBookError(error: unknown): string {
  const raw = error as { code?: string; message?: string } | Error | string;
  const message = String((raw as Error)?.message || (raw as { message?: string })?.message || raw || 'שגיאה');
  const shaped = raw && typeof raw === 'object' ? raw as { code?: string; message?: string } : { message };
  if (isGarageSchemaMissing(shaped) || isGarageSchemaMissing({ message })) {
    return GARAGE_BOOK_PENDING_MESSAGE;
  }
  if (isGarageWorkflowColumnMissing(shaped) || message === GARAGE_WORKFLOW_PENDING_MESSAGE) {
    return 'המסלול נבחר בכל תיק בנפרד. שמירת הלקוח נמשכת בלי שדה ברירת מחדל.';
  }
  return message;
}

export default function GarageApp() {
  const { caseId } = useParams();
  const [params] = useSearchParams();
  const startNew = params.get('new') === '1';
  const startCustomer = params.get('customer') === '1';
  const navigate = useNavigate();
  const { user } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const actor = actorOf(user);

  const reply = useCallback((requestId: string | undefined, payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'gm:response', requestId, payload }, '*');
  }, []);

  const bootstrap = useCallback(async () => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !actor) return;
    const probe = await probeGarageBook();
    try {
      if (caseId) {
        if (probe.pending) {
          win.postMessage({
            type: 'gm:bootstrap',
            payload: {
              mode: 'case',
              caseId,
              userName: actor.full_name || '',
              bookPending: true,
              error: GARAGE_BOOK_PENDING_MESSAGE,
            },
          }, '*');
          return;
        }
        const loaded = await getCase(caseId);
        win.postMessage({
          type: 'gm:bootstrap',
          payload: { mode: 'case', caseId, userName: actor.full_name || '', loaded, bookPending: false },
        }, '*');
        return;
      }
      const cases = probe.pending ? [] : await listCases();
      win.postMessage({
        type: 'gm:bootstrap',
        payload: {
          mode: 'home',
          userName: actor.full_name || '',
          cases,
          bookPending: probe.pending,
          customerOnly: startCustomer,
          startScreen: startCustomer ? 's-newtype' : startNew ? 's-choose' : 's-home',
          error: probe.pending ? GARAGE_BOOK_PENDING_MESSAGE : undefined,
        },
      }, '*');
    } catch (error) {
      win.postMessage({
        type: 'gm:bootstrap',
        payload: {
          mode: caseId ? 'case' : 'home',
          caseId,
          userName: actor.full_name || '',
          bookPending: probe.pending,
          customerOnly: startCustomer,
          startScreen: startCustomer ? 's-newtype' : startNew ? 's-choose' : 's-home',
          error: asBookError(error),
        },
      }, '*');
    }
  }, [actor, caseId, startCustomer, startNew]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent<HostRequest>) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = event.data || { type: '' };
      const requestId = msg.requestId;
      const payload = msg.payload || {};
      try {
        if (msg.type === 'gm:ready') {
          await bootstrap();
          return;
        }
        if (msg.type === 'gm:searchCustomers') {
          const customers = await searchCustomers(String(payload.q || ''));
          reply(requestId, { ok: true, customers });
          return;
        }
        if (msg.type === 'gm:createCustomer') {
          const draft = payload.draft as Parameters<typeof createCustomer>[0];
          const result = await createCustomer(draft, { force: Boolean(payload.force) });
          reply(requestId, { ok: true, ...result, needsConfirm: result.duplicates.length > 0 && !payload.force });
          return;
        }
        if (msg.type === 'gm:listVehicles') {
          const vehicles = await listVehicles(String(payload.customerId || ''));
          const history = await listCustomerCases(String(payload.customerId || ''));
          reply(requestId, { ok: true, vehicles, history });
          return;
        }
        if (msg.type === 'gm:createVehicle') {
          const vehicle = await createVehicle(payload.draft as Parameters<typeof createVehicle>[0]);
          reply(requestId, { ok: true, vehicle });
          return;
        }
        if (msg.type === 'gm:updateCustomer') {
          const customer = await updateCustomerBook(String(payload.customerId || ''), {
            default_workflow: payload.default_workflow
              ? ((payload.default_workflow as GarageRoute) === 'intake_first' ? 'intake_first' : 'quote_first')
              : undefined,
            contact_person: payload.contact_person != null ? String(payload.contact_person) : undefined,
            notes: payload.notes != null ? String(payload.notes) : undefined,
            contacts: Array.isArray(payload.contacts) ? payload.contacts as never : undefined,
          });
          reply(requestId, { ok: true, customer });
          return;
        }
        if (msg.type === 'gm:createCase') {
          if (!actor) throw new Error('אין משתמש מחובר');
          const customer = payload.customer as GarageCustomer;
          const route: GarageRoute = (payload.route as GarageRoute) === 'intake_first' ? 'intake_first' : 'quote_first';
          const created = await createCase({
            customer,
            vehicle: payload.vehicle as GarageVehicle,
            actor,
            caseData: { ...emptyCaseData(), ...(payload.caseData as object || {}), route },
          });
          reply(requestId, { ok: true, created });
          navigate(`/garage-management/${created.id}`, { replace: true });
          return;
        }
        if (msg.type === 'gm:saveCase') {
          const id = String(payload.caseId || caseId || '');
          if (!id) throw new Error('אין מזהה תיק לשמירה');
          const saved = await updateCase(id, { case_data: payload.caseData as never });
          reply(requestId, { ok: true, saved });
          return;
        }
        if (msg.type === 'gm:listMedia') {
          const id = String(payload.garageCaseId || caseId || '');
          const probe = await probeGarageMedia();
          const items = probe.pending ? [] : await listGarageMedia(id);
          reply(requestId, {
            ok: true,
            garage_case_id: id,
            items,
            pending: probe.pending,
            error: probe.pending ? GARAGE_MEDIA_PENDING_MESSAGE : probe.error,
          });
          return;
        }
        if (msg.type === 'gm:uploadMedia') {
          const id = String(payload.garageCaseId || caseId || '');
          const buffer = msg.buffer;
          if (!buffer) throw new Error('אין קובץ להעלאה');
          const bytes = buffer.slice(0);
          const item = await uploadGarageMedia({
            garageCaseId: id,
            category: String(payload.category || 'other') as GarageMediaCategoryId,
            title: String(payload.title || payload.name || 'קובץ'),
            fileName: String(payload.name || 'file'),
            mimeType: String(payload.type || 'application/octet-stream'),
            bytes,
            actorId: actor?.id,
          });
          let extract: Record<string, unknown> | undefined;
          if (String(payload.category || '') === 'customer_order') {
            try {
              const { extractCustomerOrderDocument } = await import('./garageOrderExtract');
              extract = await extractCustomerOrderDocument({
                bytes: new Uint8Array(buffer),
                mimeType: String(payload.type || ''),
                fileName: String(payload.name || ''),
              });
            } catch {
              extract = {
                source: 'none',
                fields: { order_number: '', case_ref: '', order_date: '' },
                note: 'קריאת המסמך נכשלה. מלא ידנית. לא משתמשים בשם הקובץ. הלקוח כבר ידוע מהתיק ולא משתנה.',
              };
            }
          }
          reply(requestId, { ok: true, item, extract });
          return;
        }
        if (msg.type === 'gm:openCase') {
          const id = String(payload.caseId || '');
          if (id) navigate(`/garage-management/${id}`);
          return;
        }
        if (msg.type === 'gm:goHome') {
          navigate('/garage-management');
          return;
        }
        if (msg.type === 'gm:goManager') {
          navigate('/claims?tab=garage');
          return;
        }
        if (msg.type === 'gm:scanGarageMail') {
          const scanned = await scanGarageMailbox({
            currentCaseId: String(payload.caseId || caseId || ''),
            actorName: actor?.full_name,
            googleAccessToken: String(payload.googleAccessToken || ''),
          });
          reply(requestId, scanned);
          return;
        }
        if (msg.type === 'gm:sendGarageMail') {
          const sent = await sendGarageMail({
            caseId: String(payload.caseId || caseId || ''),
            to: String(payload.to || ''),
            cc: String(payload.cc || ''),
            subject: String(payload.subject || ''),
            body: String(payload.body || ''),
            mediaIds: Array.isArray(payload.mediaIds) ? payload.mediaIds.map((id) => String(id || '')).filter(Boolean) : [],
            kind: String(payload.kind || 'mail'),
            threadId: String(payload.threadId || ''),
          });
          reply(requestId, sent);
          return;
        }
        if (msg.type === 'gm:garageGmailStatus') {
          const existing = await fetchExistingGoogleClientId();
          const { data, error } = await supabase.functions.invoke('garage-gmail', { body: { action: 'status' } });
          const row = (data && typeof data === 'object') ? data as Record<string, unknown> : {};
          const clientId = String(row.clientId || '')
            || parseGoogleClientIdFromAuthUrl(String(row.authUrl || ''))
            || existing.clientId;
          if (isMissingGarageGmailFunction(error)) {
            reply(requestId, {
              ok: Boolean(clientId),
              connected: false,
              pending: true,
              mailbox: 'yoni191177@gmail.com',
              functionMissing: true,
              browserToken: Boolean(clientId),
              clientId,
              error: clientId
                ? 'תיבת המוסך עדיין לא מחוברת לסריקה. לחצו לחיבור Google של yoni191177@gmail.com בלבד.'
                : (existing.error || 'חסר חיבור Google קיים ב-Staging'),
            });
            return;
          }
          reply(requestId, {
            ...row,
            ok: !error || Boolean(clientId),
            connected: row.connected === true,
            canSend: row.canSend === true,
            pending: row.connected === true ? false : true,
            email: row.email,
            mailbox: row.mailbox || 'yoni191177@gmail.com',
            clientId,
            browserToken: Boolean(clientId),
            error: error ? String((error as { message?: string }).message || error) : (row.error as string | undefined),
          });
          return;
        }
        if (msg.type === 'gm:garageGmailOauthStart') {
          const existing = await fetchExistingGoogleClientId();
          const { data, error } = await supabase.functions.invoke('garage-gmail', {
            body: { action: 'oauth_start', preferPages: true },
          });
          const row = (data && typeof data === 'object') ? data as Record<string, unknown> : {};
          const authUrl = String(row.authUrl || '');
          const clientId = String(row.clientId || '')
            || parseGoogleClientIdFromAuthUrl(authUrl)
            || existing.clientId;
          reply(requestId, {
            ok: Boolean(clientId || authUrl),
            browserToken: Boolean(clientId),
            clientId,
            authUrl: authUrl || undefined,
            mailbox: 'yoni191177@gmail.com',
            redirectUri: row.redirectUri,
            clientSource: row.clientSource,
            error: (clientId || authUrl)
              ? undefined
              : (existing.error || (error ? String((error as Error).message || error) : 'oauth_client_missing')),
          });
          return;
        }
      } catch (error) {
        reply(requestId, { ok: false, error: asBookError(error) });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [actor, bootstrap, caseId, navigate, reply]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <div className="gm-root" dir="rtl">
      <iframe
        ref={iframeRef}
        title="ניהול מוסך"
        className="gm-approved-frame"
        srcDoc={approvedSourceHtml}
        sandbox="allow-scripts allow-modals allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-top-navigation-by-user-activation"
        allow="camera; microphone; clipboard-write"
        key={caseId || (startCustomer ? 'customer' : startNew ? 'new' : 'home')}
        onLoad={() => { void bootstrap(); }}
      />
    </div>
  );
}
