import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import approvedSourceHtml from './approved-source.html?raw';
import './garage.css';
import {
  createCase,
  createCustomer,
  createVehicle,
  emptyCaseData,
  getCase,
  listCases,
  listCustomerCases,
  listVehicles,
  searchCustomers,
  updateCase,
  type GarageActor,
  type GarageCustomer,
  type GarageVehicle,
} from './garageBook';

type HostRequest = {
  type: string;
  requestId?: string;
  payload?: Record<string, unknown>;
};

function actorOf(user: { id: string; full_name?: string; role?: string } | null): GarageActor | null {
  if (!user?.id) return null;
  return { id: user.id, full_name: user.full_name, role: user.role };
}

export default function GarageApp() {
  const { caseId } = useParams();
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
    try {
      if (caseId) {
        const loaded = await getCase(caseId);
        win.postMessage({ type: 'gm:bootstrap', payload: { mode: 'case', userName: actor.full_name || '', loaded } }, '*');
        return;
      }
      const cases = await listCases();
      win.postMessage({ type: 'gm:bootstrap', payload: { mode: 'home', userName: actor.full_name || '', cases } }, '*');
    } catch (error) {
      win.postMessage({
        type: 'gm:bootstrap',
        payload: { mode: caseId ? 'case' : 'home', userName: actor.full_name || '', error: String((error as Error).message || error) },
      }, '*');
    }
  }, [actor, caseId]);

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
        if (msg.type === 'gm:createCase') {
          if (!actor) throw new Error('אין משתמש מחובר');
          const created = await createCase({
            customer: payload.customer as GarageCustomer,
            vehicle: payload.vehicle as GarageVehicle,
            actor,
            caseData: emptyCaseData(),
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
        if (msg.type === 'gm:openCase') {
          const id = String(payload.caseId || '');
          if (id) navigate(`/garage-management/${id}`);
          return;
        }
        if (msg.type === 'gm:goHome') {
          navigate('/garage-management');
        }
      } catch (error) {
        reply(requestId, { ok: false, error: String((error as Error).message || error) });
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
        sandbox="allow-scripts allow-modals allow-same-origin"
        key={caseId || 'home'}
        onLoad={() => { void bootstrap(); }}
      />
    </div>
  );
}
