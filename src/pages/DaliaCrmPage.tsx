import { Navigate, useSearchParams } from 'react-router-dom';

/** Legacy /dalia-crm → מנהל השיווק (CRM embedded) */
export default function DaliaCrmPage() {
  const [searchParams] = useSearchParams();
  const customer = searchParams.get('customer');
  const q = customer ? `?customer=${encodeURIComponent(customer)}&tab=crm` : '?tab=crm';
  return <Navigate to={`/ai-marketing${q}`} replace />;
}
