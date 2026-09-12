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
  defaultRouteForCustomer,
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
  updateCustomerWorkflow,
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
  if (isGarageWorkflowColumnMissing(shaped) || /default_workflow/i.test(message)) {
    return GARAGE_WORKFLOW_PENDING_MESSAGE;
  }
  if (isGarageSchemaMissing(shaped) || isGarageSchemaMissing({ message })) {
    return GARAGE_BOOK_PENDING_MESSAGE;
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
          const customer = await updateCustomerWorkflow(
            String(payload.customerId || ''),
            (payload.default_workflow as GarageRoute) === 'intake_first' ? 'intake_first' : 'quote_first',
          );
          reply(requestId, { ok: true, customer });
          return;
        }
        if (msg.type === 'gm:createCase') {
          if (!actor) throw new Error('אין משתמש מחובר');
          const customer = payload.customer as GarageCustomer;
          const route = (payload.route as GarageRoute)
            || defaultRouteForCustomer(customer);
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
        sandbox="allow-scripts allow-modals allow-same-origin allow-downloads allow-popups"
        allow="camera; microphone; clipboard-write"
        key={caseId || (startCustomer ? 'customer' : startNew ? 'new' : 'home')}
        onLoad={() => { void bootstrap(); }}
      />
    </div>
  );
}
