import type { ClaimsApi } from '@/features/claims/claimsService';

/**
 * Stage 1 of the new claims UI is read-only. It reaches the existing claimsService
 * only through this allowlist, so no write action can be called by mistake.
 * Every method here was checked to only read (no insert/update/delete, no mail send).
 */
export const READ_GMAIL_ACTIONS = ['status', 'list_imports', 'list_sends', 'list_pending'] as const;
export const READ_DOCS_ACTIONS = [
  'list_docs',
  'list_shares',
  'get_link',
  'get_garage_assignment',
  'list_garage_reviews',
  'signed_url',
  'signed_urls',
] as const;

export class ReadOnlyViolation extends Error {
  constructor(what: string) {
    super(`read_only_violation: ${what}`);
    this.name = 'ReadOnlyViolation';
  }
}

type ReadApi = Pick<ClaimsApi,
  | 'getClaims'
  | 'getNotifications'
  | 'getTasks'
  | 'getReminders'
  | 'getHistory'
  | 'getCommLog'
  | 'listClaimContacts'
  | 'listMailFollowups'
  | 'listScheduledMailFollowups'
  | 'listAssignees'
  | 'invokeGmail'
  | 'invokeDocs'
>;

export type ReadOnlyClaimsApi = ReturnType<typeof createReadOnlyClaimsApi>;

export function createReadOnlyClaimsApi(api: ReadApi) {
  return {
    getClaims: () => api.getClaims(),
    getNotifications: () => api.getNotifications(),
    getTasks: (claimId: string | null) => api.getTasks(claimId),
    getReminders: (claimId: string | null) => api.getReminders(claimId),
    getHistory: (claimId: string) => api.getHistory(claimId),
    getCommLog: (claimId: string) => api.getCommLog(claimId),
    listClaimContacts: (claimId: string) => api.listClaimContacts(claimId),
    listMailFollowups: (claimId?: string | null) => api.listMailFollowups(claimId),
    listScheduledMailFollowups: () => api.listScheduledMailFollowups(),
    listAssignees: () => api.listAssignees(),
    invokeGmail(action: string, body: Record<string, unknown> = {}) {
      if (!(READ_GMAIL_ACTIONS as readonly string[]).includes(action)) throw new ReadOnlyViolation(`claims-gmail:${action}`);
      // status with probe:true refreshes the OAuth token and writes; never send it.
      if (action === 'status' && 'probe' in body) throw new ReadOnlyViolation('claims-gmail:status.probe');
      return api.invokeGmail(action, body);
    },
    invokeDocs(action: string, body: Record<string, unknown> = {}) {
      if (!(READ_DOCS_ACTIONS as readonly string[]).includes(action)) throw new ReadOnlyViolation(`claims-docs:${action}`);
      return api.invokeDocs(action, body);
    },
  };
}
