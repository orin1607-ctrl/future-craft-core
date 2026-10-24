import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import approvedSourceHtml from './approved-source.html?raw';
import './garage.css';
import {
  GARAGE_BOOK_PENDING_MESSAGE,
  createCase,
  createCustomer,
  createVehicle,
  detectCustomerDuplicates,
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
  type GarageCase,
  type GarageCustomer,
  type GarageRoute,
  type GarageVehicle,
} from './garageBook';
import { ClaimsAiWorkspace } from '@/features/claims/ClaimsAiWorkspace';
import { garageShopScopeOf } from './garageTenant';
import { createGarageVoiceActions } from './garageVoiceActions';
import {
  GARAGE_MEDIA_PENDING_MESSAGE,
  listGarageMedia,
  probeGarageMedia,
  uploadGarageMedia,
  type GarageMediaCategoryId,
} from './garageMedia';
import { scanGarageMailbox, sendGarageMail } from './garageMail';
import { closeGarageCase, createGarageInvoice, createGarageSupplier, listGarageInvoices, listGarageSuppliers } from './garageLedger';
import { fetchExistingGoogleClientId, isMissingGarageGmailFunction, parseGoogleClientIdFromAuthUrl } from './garageGmailBrowser';
import { supabase } from '@/integrations/supabase/client';

type HostRequest = {
  type: string;
  requestId?: string;
  payload?: Record<string, unknown>;
  buffer?: ArrayBuffer;
};

function actorOf(user: { id: string; full_name?: string; role?: string; company_name?: string } | null): GarageActor | null {
  if (!user?.id) return null;
  return { id: user.id, full_name: user.full_name, role: user.role, company_name: user.company_name };
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
  const shopScope = garageShopScopeOf(user);
  const [aiOpen, setAiOpen] = useState(false);
  const [loadedCase, setLoadedCase] = useState<GarageCase | null>(null);
  const activeCaseIdRef = useRef<string | null>(caseId || null);

  const reply = useCallback((requestId: string | undefined, payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'gm:response', requestId, payload }, '*');
  }, []);

  const bootstrap = useCallback(async () => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !actor) return;
    const probe = await probeGarageBook();
    try {
      const effectiveCaseId = activeCaseIdRef.current || caseId;
      if (effectiveCaseId) {
        const targetId = effectiveCaseId;
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
        const loaded = await getCase(targetId, shopScope);
        setLoadedCase(loaded);
        win.postMessage({
          type: 'gm:bootstrap',
          payload: { mode: 'case', caseId: targetId, userName: actor.full_name || '', loaded, bookPending: false },
        }, '*');
        return;
      }
      setLoadedCase(null);
      const cases = probe.pending ? [] : await listCases(shopScope);
      let initialSuppliers: any[] = [];
      let initialInvoices: any[] = [];
      try {
        const [sRes, iRes] = await Promise.all([
          supabase.from('garage_suppliers').select('*').order('name'),
          supabase.from('garage_invoices').select('*').order('created_at', { ascending: false })
        ]);
        initialSuppliers = sRes.data || [];
        initialInvoices = iRes.data || [];
      } catch (e) { console.warn('Error loading initial suppliers/invoices:', e); }
      win.postMessage({
        type: 'gm:bootstrap',
        payload: {
          mode: 'home',
          userName: actor.full_name || '',
          cases,
          suppliers: initialSuppliers,
          invoices: initialInvoices,
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
  }, [actor, caseId, shopScope, startCustomer, startNew]);

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
          const customers = await searchCustomers(String(payload.q || ''), shopScope);
          reply(requestId, { ok: true, customers });
          return;
        }
        if (msg.type === 'gm:createCustomer') {
          const draft = payload.draft as Parameters<typeof createCustomer>[0];
          const result = await createCustomer(
            { ...draft, shop_company_name: draft.shop_company_name || actor?.company_name || '' },
            { force: Boolean(payload.force) },
          );
          reply(requestId, { ok: true, ...result, needsConfirm: result.duplicates.length > 0 && !payload.force });
          return;
        }
        if (msg.type === 'gm:checkCustomerDuplicates') {
          const draft = payload.draft as Parameters<typeof detectCustomerDuplicates>[0];
          const duplicates = await detectCustomerDuplicates(draft);
          reply(requestId, { ok: true, duplicates });
          return;
        }
        if (msg.type === 'gm:listVehicles') {
          const vehicles = await listVehicles(String(payload.customerId || ''), shopScope);
          const history = await listCustomerCases(String(payload.customerId || ''), shopScope);
          reply(requestId, { ok: true, vehicles, history });
          return;
        }
        if (msg.type === 'gm:createVehicle') {
          const draft = payload.draft as Parameters<typeof createVehicle>[0];
          const vehicle = await createVehicle({
            ...draft,
            shop_company_name: draft.shop_company_name || actor?.company_name || '',
          });
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
            shopCompanyName: actor.company_name,
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
        if (msg.type === 'gm:saveOrder') {
          const cId = String(payload.caseId || activeCaseIdRef.current || caseId || '');
          const orderNumber = String(payload.orderNumber || '').trim();
          if (orderNumber) {
            try {
              let customerId: string | null = null;
              let vehicleId: string | null = null;
              if (cId) {
                const { data: cRow } = await supabase.from('garage_cases').select('customer_id, vehicle_id, case_data').eq('id', cId).maybeSingle();
                customerId = cRow?.customer_id || null;
                vehicleId = cRow?.vehicle_id || null;
                if (cRow) {
                  const existingCaseData = (cRow.case_data as Record<string, unknown>) || {};
                  await supabase.from('garage_cases').update({
                    case_data: {
                      ...existingCaseData,
                      workOrderSaved: true,
                      workOrderNumber: orderNumber,
                      workOrderAmount: String(payload.approvedAmount || ''),
                      workOrderRef: String(payload.caseRef || ''),
                      workOrderDate: String(payload.orderDate || ''),
                      workOrderContact: String(payload.contactName || ''),
                      workOrderNotes: String(payload.notes || ''),
                      workOrderStatus: String(payload.status || 'received'),
                      workOrderItems: Array.isArray(payload.orderItems) ? payload.orderItems : ((existingCaseData.workOrderItems as unknown[]) || []),
                    }
                  }).eq('id', cId);
                }
              }
              const orderInsert: Record<string, unknown> = {
                case_id: cId || null,
                customer_id: customerId,
                vehicle_id: vehicleId,
                order_number: orderNumber,
                case_ref: String(payload.caseRef || ''),
                order_date: String(payload.orderDate || ''),
                approved_amount: Number(payload.approvedAmount) || 0,
                contact_name: String(payload.contactName || ''),
                notes: String(payload.notes || ''),
                status: String(payload.status || 'received'),
                shop_company_name: actor?.company_name || '',
                created_by: actor?.id || null,
              };
              if (Array.isArray(payload.orderItems) && payload.orderItems.length > 0) {
                try {
                  const withItems = { ...orderInsert, order_items: payload.orderItems };
                  const { error: insErr } = await supabase.from('garage_orders').insert(withItems as never);
                  if (insErr) {
                    await supabase.from('garage_orders').insert(orderInsert as never);
                  }
                } catch {
                  await supabase.from('garage_orders').insert(orderInsert as never);
                }
              } else {
                await supabase.from('garage_orders').insert(orderInsert as never);
              }
            } catch (e) {
              console.warn('Sync to garage_orders table:', e);
            }
          }
          reply(requestId, { ok: true });
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
          if (id) {
            activeCaseIdRef.current = id;
            void getCase(id, shopScope).then((loaded) => {
              setLoadedCase(loaded);
            }).catch(console.error);
            try {
              window.history.pushState({ gmCaseId: id }, '', `${import.meta.env.BASE_URL}garage-management/${id}`);
            } catch {}
          }
          return;
        }
        if (msg.type === 'gm:openReports') {
          navigate('/claims?view=reports');
          return;
        }
        if (msg.type === 'gm:openClaims') {
          navigate('/claims');
          return;
        }
        if (msg.type === 'gm:goHome') {
          activeCaseIdRef.current = null;
          setLoadedCase(null);
          try {
            window.history.pushState(null, '', `${import.meta.env.BASE_URL}garage-management`);
          } catch {}
          return;
        }
        if (msg.type === 'gm:goManager') {
          navigate(user?.garageOps ? '/garage-management' : '/claims?tab=garage');
          return;
        }
        if (msg.type === 'gm:goOpsCenter') {
          navigate(user?.garageOps ? '/dashboard' : '/claims?tab=garage');
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

        if (msg.type === 'gm:listSuppliers') {
          const { suppliers, error } = await listGarageSuppliers(shopScope);
          reply(requestId, { ok: !error, suppliers, error });
          return;
        }

        if (msg.type === 'gm:createSupplier') {
          const result = await createGarageSupplier(payload, actor, shopScope);
          reply(requestId, result.alreadyExisted
            ? { ok: true, supplier: result.supplier, alreadyExisted: true }
            : { ok: true, supplier: result.supplier });
          return;
        }

        if (msg.type === 'gm:listInvoices') {
          const { invoices, error } = await listGarageInvoices(shopScope);
          reply(requestId, { ok: !error, invoices, error });
          return;
        }

        if (msg.type === 'gm:createInvoice') {
          const invoice = await createGarageInvoice(payload, actor);
          reply(requestId, { ok: true, invoice });
          return;
        }

        if (msg.type === 'gm:closeCase') {
          await closeGarageCase(String(payload.caseId || caseId || ''), actor, payload.closeNote ? String(payload.closeNote) : undefined);
          reply(requestId, { ok: true });
          return;
        }

        if (msg.type === 'gm:reopenCase') {
          const cId = String(payload.caseId || caseId || '');
          if (!cId) throw new Error('אין מזהה תיק לפתיחה מחדש');
          const { data: cRow, error: cErr } = await supabase.from('garage_cases').select('*').eq('id', cId).single();
          if (cErr || !cRow) throw new Error('תיק לא נמצא');
          const cd = cRow.case_data || {};
          cd.caseClosed = false;
          cd.workFinished = false;
          cd.reopenHistory = cd.reopenHistory || [];
          cd.reopenHistory.push({
            at: new Date().toISOString(),
            by: actor?.full_name || 'מנהל מוסך',
            reason: String(payload.reason || ''),
          });
          const { error: updErr } = await supabase.from('garage_cases').update({
            status: 'בעבודה',
            case_data: cd,
          }).eq('id', cId);
          if (updErr) throw updErr;
          reply(requestId, { ok: true });
          return;
        }

        if (msg.type === 'gm:open_ai') {
          setAiOpen(true);
          return;
        }
      } catch (error) {
        reply(requestId, { ok: false, error: asBookError(error) });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [actor, bootstrap, caseId, navigate, reply, shopScope, user?.garageOps]);

  useEffect(() => {
    activeCaseIdRef.current = caseId || null;
    void bootstrap();
  }, [caseId, bootstrap]);

  useEffect(() => {
    const handlePop = () => {
      const match = window.location.pathname.match(/\/garage-management\/([0-9a-f-]{36})/i);
      const targetCaseId = match?.[1] || activeCaseIdRef.current || caseId || null;
      if (targetCaseId) {
        iframeRef.current?.contentWindow?.postMessage({
          type: 'gm:bootstrap',
          payload: { mode: 'case', caseId: targetCaseId },
        }, '*');
      } else {
        iframeRef.current?.contentWindow?.postMessage({
          type: 'gm:bootstrap',
          payload: { mode: 'home' },
        }, '*');
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  return (
    <div className="gm-root" dir="rtl">
      <iframe
        ref={iframeRef}
        title="ניהול מוסך"
        className="gm-approved-frame"
        srcDoc={approvedSourceHtml}
        sandbox="allow-scripts allow-modals allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-top-navigation-by-user-activation"
        allow="camera; microphone; clipboard-write"
        key="garage-management-main-frame"
        onLoad={() => { void bootstrap(); }}
      />

      <button
        type="button"
        className="gm-ai-fab-btn"
        data-testid="garage-ai-launch-btn"
        onClick={() => setAiOpen(true)}
        title="דליה AI · עוזר אישי לניהול מוסך"
      >
        <span className="gm-ai-fab-icon">✨</span>
        <span className="gm-ai-fab-text">דליה AI</span>
      </button>

      {aiOpen && (
        <div className="claims-root">
          <ClaimsAiWorkspace
            open={aiOpen}
            onClose={() => setAiOpen(false)}
            claim={null}
            userId={actor?.id || ''}
            companyName={null}
            module="garage"
            garageVoiceActions={actor ? createGarageVoiceActions(actor, shopScope) : null}
            garageCase={loadedCase ? {
              id: loadedCase.id,
              caseNumber: loadedCase.case_number,
              customerName: loadedCase.customer_name_snapshot,
              plate: loadedCase.vehicle_plate_snapshot,
              status: loadedCase.status,
            } : (activeCaseIdRef.current ? {
              id: activeCaseIdRef.current,
              caseNumber: '',
              customerName: '',
              plate: '',
              status: '',
            } : null)}
            onActionExecuted={(pending) => {
              const targetId = (pending?.parameters?.case_id as string) || (pending?.parameters?.existing_case_id as string) || activeCaseIdRef.current;
              if (targetId && !activeCaseIdRef.current) {
                activeCaseIdRef.current = targetId;
              }
              void bootstrap();
            }}
            onOpenGarageCase={(targetCaseId) => {
              activeCaseIdRef.current = targetCaseId;
              navigate(`/garage-management/${targetCaseId}`);
              void bootstrap();
            }}
          />
        </div>
      )}
    </div>
  );
}
