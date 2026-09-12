import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClaimsScreen } from '@/features/claims/ClaimsScreen';
import { createClaimsApi } from '@/features/claims/claimsService';
import { displayClaimNum, type ClaimRecord, type ClaimsActor } from '@/features/claims/claimsConstants';
import {
  GARAGE_BOOK_PENDING_MESSAGE,
  listCases,
  probeGarageBook,
  type GarageCase,
} from '@/modules/garage-management/garageBook';
import './claimsGarageHub.css';

type HubTab = 'all' | 'claims' | 'garage';

type UnifiedRow = {
  key: string;
  kind: 'תביעת ביטוח' | 'תיק מוסך';
  number: string;
  customerNumber: string;
  customer: string;
  vehicle: string;
  plate: string;
  openedBy: string;
  status: string;
  openedAt: string;
  amount: string;
  href?: string;
  claimId?: string;
};

function formatWhen(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('he-IL');
}

function garageRow(c: GarageCase): UnifiedRow {
  const amount = c.case_data?.workOrderAmount;
  return {
    key: `garage:${c.id}`,
    kind: 'תיק מוסך',
    number: c.case_number || '—',
    customerNumber: '—',
    customer: c.customer_name_snapshot || '—',
    vehicle: c.vehicle_label_snapshot || '—',
    plate: c.vehicle_plate_snapshot || '—',
    openedBy: c.opened_by_name || '—',
    status: c.status || '—',
    openedAt: formatWhen(c.created_at),
    amount: amount === 0 || amount ? String(amount) : '—',
    href: `/garage-management/${c.id}`,
  };
}

function claimRow(c: ClaimRecord): UnifiedRow {
  return {
    key: `claim:${c.id}`,
    kind: 'תביעת ביטוח',
    number: displayClaimNum(c),
    customerNumber: '—',
    customer: c.clientName || '—',
    vehicle: c.vehicleDesc || c.vehicle || '—',
    plate: c.plate || '—',
    openedBy: c.createdByName || c.created_by_name || '—',
    status: c.status || '—',
    openedAt: c.createdAt || formatWhen(c.created_at),
    amount: c.finApproved || c.finClaimed || '—',
    claimId: c.id,
  };
}

function CasesTable({
  rows,
  pending,
  empty,
  onOpen,
}: {
  rows: UnifiedRow[];
  pending?: string;
  empty: string;
  onOpen: (row: UnifiedRow) => void;
}) {
  return (
    <div className="cg-table-wrap">
      {pending ? <div className="cg-pending">{pending}</div> : null}
      {rows.length === 0 && !pending ? <div className="cg-empty">{empty}</div> : null}
      {rows.length > 0 ? (
        <table className="cg-table" data-testid="cases-hub-table">
          <thead>
            <tr>
              <th>סוג תיק</th>
              <th>מספר תיק</th>
              <th>מספר לקוח</th>
              <th>לקוח / חברה</th>
              <th>רכב</th>
              <th>מספר רישוי</th>
              <th>מי פתח</th>
              <th>סטטוס</th>
              <th>תאריך פתיחה</th>
              <th>סכום</th>
              <th>טיפול</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-testid={`hub-row-${row.key}`} onClick={() => onOpen(row)}>
                <td><span className={`cg-kind ${row.kind === 'תיק מוסך' ? 'garage' : 'claim'}`}>{row.kind}</span></td>
                <td>{row.number}</td>
                <td>{row.customerNumber}</td>
                <td>{row.customer}</td>
                <td>{row.vehicle}</td>
                <td>{row.plate}</td>
                <td>{row.openedBy}</td>
                <td>{row.status}</td>
                <td>{row.openedAt}</td>
                <td>{row.amount}</td>
                <td>פתח</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export function ClaimsGarageHub({ actor }: { actor: ClaimsActor }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as HubTab) || 'all';
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [garageCases, setGarageCases] = useState<GarageCase[]>([]);
  const [garagePending, setGaragePending] = useState('');
  const [startNewNonce, setStartNewNonce] = useState(0);
  const openClaimId = params.get('claim') || undefined;

  const setTab = (next: HubTab) => {
    const copy = new URLSearchParams(params);
    copy.set('tab', next);
    if (next !== 'claims') copy.delete('claim');
    setParams(copy, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const api = createClaimsApi(actor);
      const cr = await api.getClaims();
      if (!cancelled) setClaims(cr.data || []);
      const probe = await probeGarageBook();
      if (cancelled) return;
      if (probe.pending) {
        setGaragePending(GARAGE_BOOK_PENDING_MESSAGE);
        setGarageCases([]);
        return;
      }
      setGaragePending(probe.error || '');
      setGarageCases(await listCases());
    })();
    return () => { cancelled = true; };
  }, [actor]);

  const garageRows = useMemo(() => garageCases.map(garageRow), [garageCases]);
  const claimRows = useMemo(() => claims.map(claimRow), [claims]);
  const allRows = useMemo(() => [...claimRows, ...garageRows], [claimRows, garageRows]);

  const openRow = (row: UnifiedRow) => {
    if (row.href) {
      navigate(row.href);
      return;
    }
    if (row.claimId) {
      const copy = new URLSearchParams(params);
      copy.set('tab', 'claims');
      copy.set('claim', row.claimId);
      setParams(copy);
    }
  };

  const openNewClaim = () => {
    const copy = new URLSearchParams(params);
    copy.set('tab', 'claims');
    copy.delete('claim');
    setParams(copy);
    setStartNewNonce((n) => n + 1);
  };

  return (
    <div className="cg-hub" data-testid="claims-garage-hub" dir="rtl">
      <div className="cg-bar">
        <div className="cg-tabs" role="tablist">
          <button type="button" className={`cg-tab ${tab === 'all' ? 'on' : ''}`} data-testid="hub-tab-all" onClick={() => setTab('all')}>הכול</button>
          <button type="button" className={`cg-tab ${tab === 'claims' ? 'on' : ''}`} data-testid="hub-tab-claims" onClick={() => setTab('claims')}>תביעות ביטוח</button>
          <button type="button" className={`cg-tab ${tab === 'garage' ? 'on' : ''}`} data-testid="hub-tab-garage" onClick={() => setTab('garage')}>תיקי מוסך</button>
        </div>
        <div className="cg-actions">
          <button type="button" className="cg-btn" data-testid="hub-new-claim" onClick={openNewClaim}>+ תיק תביעה</button>
          <button type="button" className="cg-btn primary" data-testid="hub-new-garage" onClick={() => navigate('/garage-management?new=1')}>+ תיק מוסך חדש</button>
        </div>
      </div>
      <div className="cg-body">
        <div className={`cg-pane ${tab === 'all' ? '' : 'hidden'}`} data-testid="hub-pane-all">
          <CasesTable
            rows={allRows}
            pending={garagePending}
            empty="אין תיקים להצגה."
            onOpen={openRow}
          />
        </div>
        <div className={`cg-pane ${tab === 'garage' ? '' : 'hidden'}`} data-testid="hub-pane-garage">
          <CasesTable
            rows={garageRows}
            pending={garagePending}
            empty="אין תיקי מוסך עדיין."
            onOpen={openRow}
          />
        </div>
        <div
          className={`cg-pane ${tab === 'claims' ? '' : 'hidden'}`}
          data-testid="hub-pane-claims"
          hidden={tab !== 'claims'}
          {...(tab !== 'claims' ? ({ inert: '' } as Record<string, string>) : {})}
        >
          <ClaimsScreen actor={actor} openClaimId={openClaimId} startNewNonce={startNewNonce} />
        </div>
      </div>
    </div>
  );
}
