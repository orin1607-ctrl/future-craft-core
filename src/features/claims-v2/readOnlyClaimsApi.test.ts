import { describe, expect, it, vi } from 'vitest';
import { createReadOnlyClaimsApi, ReadOnlyViolation } from './readOnlyClaimsApi';
import { isClaimsV2Enabled } from './claimsV2Flag';

function fakeApi() {
  const ok = () => Promise.resolve({ success: true, data: [] });
  return {
    getClaims: vi.fn(ok), getNotifications: vi.fn(ok), getTasks: vi.fn(ok), getReminders: vi.fn(ok),
    getHistory: vi.fn(ok), getCommLog: vi.fn(ok), listClaimContacts: vi.fn(ok), listMailFollowups: vi.fn(ok),
    listScheduledMailFollowups: vi.fn(ok), listAssignees: vi.fn(ok),
    getReportData: vi.fn(ok), getInactiveClaims: vi.fn(ok), getTemplates: vi.fn(ok), fillTemplate: vi.fn(ok),
    exportClaimSummary: vi.fn(ok), exportExternalSummary: vi.fn(ok),
    invokeGmail: vi.fn(ok), invokeDocs: vi.fn(ok),
  };
}

describe('read-only claims API for the new UI', () => {
  it('passes read actions through to the existing service', async () => {
    const api = fakeApi();
    const ro = createReadOnlyClaimsApi(api as never);
    await ro.invokeGmail('list_imports', { claim_id: 'C1' });
    await ro.invokeDocs('signed_urls', { claim_id: 'C1', file_ids: ['f'] });
    expect(api.invokeGmail).toHaveBeenCalledWith('list_imports', { claim_id: 'C1' });
    expect(api.invokeDocs).toHaveBeenCalledWith('signed_urls', { claim_id: 'C1', file_ids: ['f'] });
  });

  it('blocks every write / send action before it reaches the service', () => {
    const api = fakeApi();
    const ro = createReadOnlyClaimsApi(api as never);
    for (const a of ['send_claim', 'send', 'send_email', 'scan_inbox', 'import_message', 'assign_pending', 'update_import_note', 'update_send_track', 'ensure_mail_tasks', 'revoke', 'create_draft',
      // look like reads but refresh/persist the Gmail connection
      'preview_sent', 'list_messages', 'suggest_reply', 'package_preview', 'read_message']) {
      expect(() => ro.invokeGmail(a)).toThrow(ReadOnlyViolation);
    }
    for (const a of ['staff_upload', 'create_link', 'revoke_link', 'create_share', 'revoke_share', 'reset_request', 'update_doc_meta', 'set_doc_kind', 'save_doc_requests', 'assign_garage_worker', 'unassign_garage_worker', 'garage_review_approve', 'garage_review_needs_update']) {
      expect(() => ro.invokeDocs(a)).toThrow(ReadOnlyViolation);
    }
    expect(() => ro.invokeGmail('status', { probe: true })).toThrow(ReadOnlyViolation);
    expect(api.invokeGmail).not.toHaveBeenCalled();
    expect(api.invokeDocs).not.toHaveBeenCalled();
  });

  it('exposes no write methods at all', () => {
    const ro = createReadOnlyClaimsApi(fakeApi() as never) as Record<string, unknown>;
    for (const m of ['saveClaim', 'saveTask', 'saveReminder', 'stopRecurringIfReplied', 'markNotificationRead', 'logHistory', 'archiveClaim', 'closeClaim', 'saveTreatmentUpdate', 'upsertMailFollowup']) {
      expect(ro[m]).toBeUndefined();
    }
  });
});

describe('staging-only gate', () => {
  it('is on only for the STAGING Supabase ref', () => {
    expect(isClaimsV2Enabled('usfeoerkpcafxxlyuldl')).toBe(true);
    expect(isClaimsV2Enabled('qasomfndnjuixgjmjwcm')).toBe(false);
    expect(isClaimsV2Enabled('')).toBe(false);
  });
});
