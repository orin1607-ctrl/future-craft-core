import { useCallback, useEffect, useState } from 'react';
import { listLeadDirectory } from '@/features/telemarketing/services/leadDirectoryService';
import { lookupLeadNumber } from '@/features/telemarketing/lib/leadLabel';
import type { LeadDirectoryRecord } from '@/features/telemarketing/lib/leadImport/types';

export function useLeadNumberLookup() {
  const [rows, setRows] = useState<LeadDirectoryRecord[]>([]);
  useEffect(() => {
    void listLeadDirectory().then(setRows).catch(() => setRows([]));
  }, []);
  return useCallback(
    (phone?: string | null, companyName?: string | null) => lookupLeadNumber(rows, phone, companyName),
    [rows],
  );
}
