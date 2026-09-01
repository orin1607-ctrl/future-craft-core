import { supabase } from '@/integrations/supabase/client';
import { CLOSE_REASONS, TEMPLATES, type ClaimRecord, type ClaimsActor, type ClaimsVehicleHit } from './claimsConstants';

export type MailJobRow = {
  id: string;
  reminder_id: string;
  planned_at: string;
  status: string;
  fail_reason?: string | null;
  preview?: Record<string, unknown> | null;
  finished_at?: string | null;
  created_at?: string;
  retry_count?: number;
};

export type MailFollowupRow = {
  id: string;
  claim_id: string;
  mail_kind: string;
  mail_to: string;
  mail_subject: string;
  mail_body: string;
  attach_mode: string;
  repeat_every_days: string;
  stop_at: string;
  next_run_at: string;
  status: string;
  allow_on_closed: boolean;
  defined_by: string;
  cancelled_at: string;
  created_at: string;
  jobs: MailJobRow[];
};

function tbl(name: string) {
  return supabase.from(name as never);
}

function asText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function rowFromData(data: Record<string, unknown> | null | undefined): ClaimRecord {
  const src = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  Object.keys(src).forEach((k) => {
    out[k] = asText(src[k]);
  });
  return out as ClaimRecord;
}

function nowHe(): string {
  return new Date().toLocaleString('he-IL');
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function bumpClaimId(): Promise<string> {
  const { data } = await tbl('claims_config').select('key, value').eq('key', 'CLAIM_COUNTER').maybeSingle();
  const n = parseInt(asText((data as { value?: string } | null)?.value) || '0', 10) + 1;
  await tbl('claims_config').upsert({
    key: 'CLAIM_COUNTER',
    value: String(n),
    updated_at: new Date().toISOString(),
  } as never);
  return `DAL-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
}

async function loadChild(table: string, claimId?: string | null): Promise<ClaimRecord[]> {
  let q = tbl(table).select('id, claim_id, row_data').order('created_at', { ascending: false });
  if (claimId) q = q.eq('claim_id', claimId);
  const { data, error } = await q;
  if (error) return [];
  return ((data || []) as Array<{ id: string; row_data: Record<string, unknown> }>).map((r) => {
    const row = rowFromData(r.row_data);
    row.id = row.id || r.id;
    return row;
  });
}

export function createClaimsApi(actor: ClaimsActor) {
  const actorName = actor.full_name || actor.email || actor.id;
  const actorEmail = actor.email || actorName;

  async function appendHistory(claimId: string, action: string, note: string, type: string, before = '', after = '') {
    const id = generateId('HIS');
    const entry = {
      id,
      claimId,
      action,
      note: note || '',
      type: type || '',
      valueBefore: before,
      valueAfter: after,
      by: actorEmail,
      at: nowHe(),
    };
    await tbl('claims_history').insert({
      id,
      claim_id: claimId || null,
      row_data: entry,
    } as never);
    if (claimId) {
      await tbl('claims_records').update({
        last_activity_at: new Date().toISOString(),
        updated_by: actor.id,
        updated_by_name: actorName,
      } as never).eq('id', claimId);
    }
  }

  async function createNotification(claimId: string, type: string, message: string) {
    const id = generateId('NTF');
    await tbl('claims_notifications').insert({
      id,
      claim_id: claimId || null,
      row_data: {
        id,
        claimId: claimId || '',
        type,
        message,
        read: 'false',
        createdAt: nowHe(),
      },
    } as never);
  }

  async function getAllClaims(): Promise<ClaimRecord[]> {
    const { data, error } = await tbl('claims_records')
      .select('id, vehicle_id, plate, client_name, status, company_name, row_data, created_by, created_by_name, updated_by_name, assigned_to, assigned_to_name, assigned_at, created_at, updated_at, last_activity_at, gmail_message_id, gmail_thread_id')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => {
      const row = rowFromData(r.row_data as Record<string, unknown>);
      row.id = asText(r.id);
      row.vehicle_id = asText(r.vehicle_id);
      row.plate = row.plate || asText(r.plate);
      row.clientName = row.clientName || asText(r.client_name);
      row.status = row.status || asText(r.status);
      row.company_name = row.company_name || asText(r.company_name);
      row.createdByName = asText(r.created_by_name);
      row.updatedByName = asText(r.updated_by_name);
      row.assigned_to = asText(r.assigned_to);
      row.assigned_to_name = asText(r.assigned_to_name);
      row.assigned_at = asText(r.assigned_at);
      row.gmail_message_id = asText(r.gmail_message_id);
      row.gmail_thread_id = asText(r.gmail_thread_id);
      if (!row.createdAt && r.created_at) row.createdAt = new Date(asText(r.created_at)).toLocaleString('he-IL');
      if (!row.updatedAt && r.updated_at) row.updatedAt = new Date(asText(r.updated_at)).toLocaleString('he-IL');
      if (!row.lastActivityAt && r.last_activity_at) {
        row.lastActivityAt = new Date(asText(r.last_activity_at)).toLocaleString('he-IL');
      }
      return row;
    });
  }

  async function getClaimById(id: string): Promise<ClaimRecord | null> {
    const all = await getAllClaims();
    return all.find((c) => c.id === id) || null;
  }

  return {
    async getSystemStatus() {
      return {
        initialized: true,
        version: '4.0-oren-car',
        initDate: 'Oren Car Staging',
        spreadsheetId: 'supabase:claims_records',
        spreadsheetUrl: '—',
        rootFolderId: '—',
        gmailRootLabel: 'דליה תביעות (ייחובר בשלב Google)',
        sheets: {
          Claims: 'Supabase',
          Gmail: 'ממתין לאישור OAuth',
        },
      };
    },

    async initSystem() {
      return { success: true };
    },

    async getClaims() {
      try {
        return { success: true, data: await getAllClaims() };
      } catch (e) {
        return { success: false, error: String((e as Error).message || e), data: [] as ClaimRecord[] };
      }
    },

    async saveClaim(data: Record<string, string>) {
      const incoming = { ...(data || {}) };
      const isNew = !incoming.id;
      if (isNew) incoming.id = await bumpClaimId();
      incoming.updatedAt = nowHe();
      incoming.lastActivityAt = nowHe();
      incoming.finBalance = String((Number(incoming.finApproved) || 0) - (Number(incoming.finPaid) || 0));
      if (isNew) incoming.createdAt = nowHe();
      incoming.updatedByName = actorName;
      if (isNew) incoming.createdByName = actorName;
      if (isNew && !incoming.source) incoming.source = 'Staff';

      const payload = {
        id: incoming.id,
        vehicle_id: incoming.vehicle_id || null,
        plate: incoming.plate || null,
        client_name: incoming.clientName || null,
        status: incoming.status || 'חדש',
        company_name: incoming.company_name || incoming.insCompany || null,
        row_data: incoming,
        updated_by: actor.id,
        updated_by_name: actorName,
        last_activity_at: new Date().toISOString(),
      };

      const existing = await getClaimById(incoming.id);
      if (existing) {
        const { error } = await tbl('claims_records').update(payload as never).eq('id', incoming.id);
        if (error) return { success: false, error: error.message };
        if (existing.status !== incoming.status) {
          await appendHistory(incoming.id, 'שינוי סטטוס', incoming.status, 'status', existing.status, incoming.status);
          await createNotification(incoming.id, 'status', `סטטוס שונה ל: ${incoming.status}`);
        } else {
          await appendHistory(incoming.id, 'עדכון פרטי תיק', '', 'update', '', '');
        }
      } else {
        const { error } = await tbl('claims_records').insert({
          ...payload,
          created_by: actor.id,
          created_by_name: actorName,
        } as never);
        if (error) return { success: false, error: error.message };
        await appendHistory(incoming.id, 'פתיחת תיק', '', 'new', '', '');
        await createNotification(incoming.id, 'new', `תיק חדש נפתח: ${incoming.clientName || incoming.id}`);
      }
      return { success: true, id: incoming.id, data: incoming };
    },

    async getEmailsForClaim() {
      return { success: true, data: [] };
    },

    async getUnlinkedEmails() {
      return { success: true, data: [] };
    },

    async linkEmailManually() {
      return { success: false, error: 'שיוך מייל Gmail יחובר בשלב הבא לאחר אישור OAuth' };
    },

    async manualScanEmails() {
      return { scanned: 0, matched: 0, unlinked: 0, note: 'סריקת Gmail תחובר בשלב הבא' };
    },

    async sendEmailFromClaim(params: { claimId?: string; to?: string; subject?: string; body?: string }) {
      if (params?.claimId) {
        const id = generateId('COM');
        const entry = {
          id,
          claimId: params.claimId,
          type: 'mail',
          subject: params.subject || '',
          body: params.body || '',
          email: params.to || '',
          direction: 'out',
          at: nowHe(),
          by: actorEmail,
          note: 'נשמר במערכת — שליחת Gmail תחובר בשלב הבא',
        };
        await tbl('claims_comm_log').insert({ id, claim_id: params.claimId, row_data: entry } as never);
        await appendHistory(params.claimId, 'מייל תועד (שליחה תחובר בהמשך)', params.subject || '', 'mail', '', `to:${params.to || ''}`);
      }
      return { success: true, deferred: true };
    },

    async saveTask(task: Record<string, string>) {
      const row = { ...task };
      row.id = row.id || generateId('TSK');
      row.createdAt = row.createdAt || nowHe();
      const { data: existing } = await tbl('claims_tasks').select('id').eq('id', row.id).maybeSingle();
      if (existing) {
        await tbl('claims_tasks').update({ row_data: row } as never).eq('id', row.id);
      } else {
        await tbl('claims_tasks').insert({ id: row.id, claim_id: row.claimId, row_data: row } as never);
      }
      await appendHistory(row.claimId, `${row.done === 'true' ? 'משימה הושלמה' : 'משימה נוספה'}: ${row.action}`, '', 'task', '', '');
      if (row.done !== 'true') await createNotification(row.claimId, 'task', `משימה: ${row.action}`);
      return { success: true, id: row.id };
    },

    async getTasks(claimId: string | null) {
      return { success: true, data: await loadChild('claims_tasks', claimId) };
    },

    async saveReminder(rem: Record<string, string>) {
      const row = { ...rem };
      row.id = row.id || generateId('REM');
      row.createdAt = nowHe();
      await tbl('claims_reminders').insert({
        id: row.id,
        claim_id: row.claimId,
        action: 'note',
        row_data: row,
      } as never);
      await appendHistory(row.claimId, `תזכורת נוספה: ${row.date}`, '', 'reminder', '', '');
      return { success: true, id: row.id };
    },

    async getReminders(claimId: string | null) {
      let q = tbl('claims_reminders')
        .select('id, claim_id, row_data, action')
        .eq('action', 'note')
        .order('created_at', { ascending: false });
      if (claimId) q = q.eq('claim_id', claimId);
      const { data, error } = await q;
      if (error) return { success: true, data: [] as ClaimRecord[] };
      const rows = ((data || []) as Array<{ id: string; row_data: Record<string, unknown> }>).map((r) => {
        const row = rowFromData(r.row_data);
        row.id = row.id || r.id;
        return row;
      });
      return { success: true, data: rows };
    },

    async upsertMailFollowup(payload: Record<string, unknown>) {
      const { data, error } = await supabase.rpc('claims_upsert_mail_followup' as never, { p_payload: payload } as never);
      if (error) {
        const msg = error.message || '';
        if (msg.includes('closed_claim')) return { success: false, error: 'תיק סגור — לא ניתן להגדיר מעקב מייל' };
        if (msg.includes('invalid_to')) return { success: false, error: 'כתובת נמען לא תקינה' };
        if (msg.includes('not_editable')) return { success: false, error: 'לא ניתן לערוך מעקב שאינו מתוזמן' };
        return { success: false, error: msg };
      }
      return { success: true, ...(data as Record<string, unknown>) };
    },

    async cancelMailFollowup(id: string) {
      const { error } = await supabase.rpc('claims_cancel_mail_followup' as never, { p_id: id } as never);
      if (error) return { success: false, error: error.message };
      return { success: true };
    },

    async retryMailFollowup(id: string) {
      const { data, error } = await supabase.rpc('claims_retry_mail_followup' as never, { p_id: id } as never);
      if (error) return { success: false, error: error.message, realEmailSend: false };
      return { success: true, realEmailSend: false, ...(data as Record<string, unknown>) };
    },

    async listMailFollowups(claimId: string) {
      const { data: rems, error: remErr } = await tbl('claims_reminders')
        .select('id, claim_id, action, mail_kind, mail_to, mail_subject, mail_body, attach_mode, repeat_every_days, stop_at, next_run_at, status, allow_on_closed, created_by, cancelled_at, created_at, row_data')
        .eq('claim_id', claimId)
        .eq('action', 'send_email')
        .order('created_at', { ascending: false });
      if (remErr) return { success: false, data: [] as MailFollowupRow[] };
      const { data: jobs } = await tbl('claims_mail_jobs')
        .select('id, reminder_id, planned_at, status, fail_reason, preview, finished_at, created_at, retry_count')
        .eq('claim_id', claimId)
        .order('planned_at', { ascending: false });
      const jobRows = (jobs || []) as MailJobRow[];
      const data: MailFollowupRow[] = ((rems || []) as Array<Record<string, unknown>>).map((r) => {
        const rd = (r.row_data && typeof r.row_data === 'object' ? r.row_data : {}) as Record<string, unknown>;
        const id = asText(r.id);
        return {
          id,
          claim_id: asText(r.claim_id),
          mail_kind: asText(r.mail_kind) || 'email_once',
          mail_to: asText(r.mail_to),
          mail_subject: asText(r.mail_subject),
          mail_body: asText(r.mail_body),
          attach_mode: asText(r.attach_mode) || 'none',
          repeat_every_days: r.repeat_every_days == null ? '' : String(r.repeat_every_days),
          stop_at: asText(r.stop_at),
          next_run_at: asText(r.next_run_at),
          status: asText(r.status) || 'scheduled',
          allow_on_closed: r.allow_on_closed === true,
          defined_by: asText(rd.owner),
          cancelled_at: asText(r.cancelled_at),
          created_at: asText(r.created_at),
          jobs: jobRows.filter((j) => j.reminder_id === id),
        };
      });
      return { success: true, data };
    },

    async dispatchMailNow() {
      const { data, error } = await supabase.functions.invoke('claims-mail-dispatch', { body: {} });
      if (error) return { success: false, error: error.message, realEmailSend: false };
      return { success: true, realEmailSend: false, ...(data as Record<string, unknown>) };
    },

    async saveCommEntry(entry: Record<string, string>) {
      const row = { ...entry };
      row.id = row.id || generateId('COM');
      row.at = row.at || nowHe();
      row.by = row.by || actorEmail;
      await tbl('claims_comm_log').insert({ id: row.id, claim_id: row.claimId, row_data: row } as never);
      const labels: Record<string, string> = { call: 'שיחת טלפון', wa: 'WhatsApp', mail: 'מייל', note: 'הערה' };
      await appendHistory(row.claimId, labels[row.type] || row.type, row.body || row.note || '', row.type, '', '');
      return { success: true, id: row.id };
    },

    async getCommLog(claimId: string) {
      return { success: true, data: await loadChild('claims_comm_log', claimId) };
    },

    async getNotifications() {
      const { data } = await tbl('claims_notifications').select('id, row_data').order('created_at', { ascending: false });
      const rows = ((data || []) as Array<{ id: string; row_data: Record<string, unknown> }>).map((r) => {
        const row = rowFromData(r.row_data);
        row.id = row.id || r.id;
        return row;
      });
      return { success: true, data: rows.filter((n) => n.read !== 'true') };
    },

    async markNotificationRead(id: string) {
      const { data } = await tbl('claims_notifications').select('row_data').eq('id', id).maybeSingle();
      const row = rowFromData((data as { row_data?: Record<string, unknown> } | null)?.row_data);
      row.id = id;
      row.read = 'true';
      await tbl('claims_notifications').update({ row_data: row } as never).eq('id', id);
      return { success: true };
    },

    async markAllNotificationsRead() {
      const { data } = await tbl('claims_notifications').select('id, row_data');
      const rows = (data || []) as Array<{ id: string; row_data: Record<string, unknown> }>;
      await Promise.all(rows.map((r) => {
        const row = rowFromData(r.row_data);
        row.id = r.id;
        row.read = 'true';
        return tbl('claims_notifications').update({ row_data: row } as never).eq('id', r.id);
      }));
      return { success: true };
    },

    async getHistory(claimId: string) {
      return { success: true, data: await loadChild('claims_history', claimId) };
    },

    async getReportData() {
      const claims = await getAllClaims();
      const tasks = await loadChild('claims_tasks');
      const byCo: Record<string, { count: number; amt: number; paid: number; legal: number }> = {};
      const bySurv: Record<string, { count: number; paid: number }> = {};
      claims.forEach((c) => {
        const co = c.insCompany || 'לא ידוע';
        const surv = c.surveyor || 'לא ידוע';
        if (!byCo[co]) byCo[co] = { count: 0, amt: 0, paid: 0, legal: 0 };
        if (!bySurv[surv]) bySurv[surv] = { count: 0, paid: 0 };
        byCo[co].count += 1;
        byCo[co].amt += Number(c.finAmount) || 0;
        byCo[co].paid += Number(c.finPaid) || 0;
        if (c.status === 'בטיפול משפטי' || c.status === 'הועבר לטיפול משפטי') byCo[co].legal += 1;
        bySurv[surv].count += 1;
        bySurv[surv].paid += Number(c.expSurveyor) || 0;
      });
      const totalAmt = claims.reduce((s, c) => s + (Number(c.finAmount) || 0), 0);
      const totalPaid = claims.reduce((s, c) => s + (Number(c.finPaid) || 0), 0);
      const totalAppr = claims.reduce((s, c) => s + (Number(c.finApproved) || 0), 0);
      const byStatus: Record<string, number> = {};
      claims.forEach((c) => {
        const k = c.status || 'לא ידוע';
        byStatus[k] = (byStatus[k] || 0) + 1;
      });
      return {
        success: true,
        summary: {
          total: claims.length,
          open: claims.filter((c) => c.status !== 'הסתיים' && c.status !== 'שולם').length,
          legal: claims.filter((c) => c.status === 'בטיפול משפטי').length,
          totalAmt,
          totalAppr,
          totalPaid,
          balance: totalAppr - totalPaid,
        },
        byStatus,
        byCompany: byCo,
        bySurveyor: bySurv,
        unlinkedEmails: 0,
        openTasks: tasks.filter((t) => t.done !== 'true').length,
      };
    },

    async globalSearch(query: string) {
      if (!query || query.trim().length < 2) return { success: true, data: [] };
      const q = query.trim().toLowerCase();
      const qDigits = q.replace(/[-\s]/g, '');
      const claims = await getAllClaims();
      const data = claims.filter((c) =>
        (c.clientName || '').toLowerCase().includes(q)
        || (c.clientPhone || '').replace(/[-\s]/g, '').includes(qDigits)
        || (c.plate || '').replace(/[-\s]/g, '').toLowerCase().includes(qDigits)
        || (c.claimNum || '').toLowerCase().includes(q)
        || (c.insCompany || '').toLowerCase().includes(q)
        || (c.id || '').toLowerCase().includes(q)
        || (c.surveyor || '').toLowerCase().includes(q)
        || (c.company_name || '').toLowerCase().includes(q),
      );
      return { success: true, data, query };
    },

    async getInactiveClaims(days: number) {
      const d = days || 14;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - d);
      const claims = await getAllClaims();
      const inactive = claims.filter((c) => {
        if (c.status === 'הסתיים' || c.status === 'שולם' || c.status === 'נסגר') return false;
        const lastAct = c.lastActivityAt || c.updatedAt || c.createdAt;
        if (!lastAct) return true;
        try {
          const parts = lastAct.split(',')[0].trim().split('/');
          const dt = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
          return dt < cutoff;
        } catch {
          return true;
        }
      });
      return { success: true, data: inactive, days: d, count: inactive.length };
    },

    async getTemplates() {
      return { success: true, data: TEMPLATES };
    },

    async fillTemplate(templateKey: string, claimData: Record<string, string>) {
      const tpl = TEMPLATES[templateKey];
      if (!tpl) return { success: false, error: 'תבנית לא נמצאה' };
      const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => claimData[k] || '');
      return {
        success: true,
        subject: tpl.subject ? fill(tpl.subject) : '',
        body: fill(tpl.body),
        name: tpl.name,
      };
    },

    async getCloseReasons() {
      return { success: true, data: CLOSE_REASONS };
    },

    async closeClaim(claimId: string, closeReason: string, closeNote: string, finalStatus: string) {
      const c = await getClaimById(claimId);
      if (!c) return { success: false, error: 'תיק לא נמצא' };
      const status = finalStatus || 'הסתיים';
      await appendHistory(claimId, `תיק נסגר: ${closeReason}`, closeNote || '', 'close', c.status, status);
      await createNotification(claimId, 'close', `תיק נסגר: ${closeReason}`);
      return this.saveClaim({ ...c, status, closeReason, closeNote: closeNote || '' });
    },

    async exportExternalSummary(claimId: string, extra?: { mailBody?: string; docNames?: string[] }) {
      const c = await getClaimById(claimId);
      if (!c) return { success: false, error: 'תיק לא נמצא', text: '' };
      const lines = [
        '══════════════════════════════════════════════',
        '  סיכום חיצוני לתביעה — מותר להעברה',
        '  (ללא הערות פנימיות / היסטוריית עובדים)',
        '══════════════════════════════════════════════',
        `מספר תיק:      ${c.id}`,
        `לקוח:          ${c.clientName || '—'}`,
        `רכב:           ${c.plate || '—'} ${c.carModel || ''}`.trim(),
        `תאריך אירוע:   ${c.eventDate || '—'}`,
        `סוג תביעה:     ${c.claimKind || '—'}`,
        `חברת ביטוח:    ${c.insCompany || '—'}`,
        `מספר תביעה:    ${c.claimNum || '—'}`,
        `פוליסה:        ${c.policyNum || '—'}`,
        `שמאי:          ${c.surveyor || '—'}`,
        `סכום תביעה:    ${c.finAmount || '—'}₪`,
        `סטטוס:         ${c.status || '—'}`,
        '',
      ];
      if (extra?.mailBody) {
        lines.push('── תוכן מייל מיובא ──', extra.mailBody.slice(0, 4000), '');
      }
      if (extra?.docNames?.length) {
        lines.push('── מסמכים מצורפים ──', ...extra.docNames.map((n) => `• ${n}`), '');
      }
      lines.push(`הופק: ${nowHe()}`);
      return { success: true, text: lines.join('\n'), claimId, kind: 'external' as const };
    },

    async exportClaimSummary(claimId: string) {
      const c = await getClaimById(claimId);
      if (!c) return { success: false, error: 'תיק לא נמצא' };
      const hist = (await loadChild('claims_history', claimId));
      const comm = (await loadChild('claims_comm_log', claimId));
      const tasks = (await loadChild('claims_tasks', claimId));
      const lines = [
        '══════════════════════════════════════════════',
        '  היסטוריה פנימית — לא לשלוח לחברת ביטוח / עו"ד',
        '══════════════════════════════════════════════',
        `מספר תיק:      ${c.id}`,
        `נפתח:          ${c.createdAt || '—'}`,
        `עדכון אחרון:   ${c.updatedAt || '—'}`,
        `טופל ע״י:      ${c.updatedByName || c.createdByName || '—'}`,
        '',
        '── פרטי לקוח / רכב ─────────────────────',
        `שם:            ${c.clientName || '—'}`,
        `טלפון:         ${c.clientPhone || '—'}`,
        `מספר רכב:      ${c.plate || '—'}`,
        `דגם:           ${c.carModel || '—'}`,
        `חברה:          ${c.company_name || '—'}`,
        `vehicle_id:    ${c.vehicle_id || '—'}`,
        '',
        '── חברת ביטוח ─────────────────────────',
        `חברה:          ${c.insCompany || '—'}`,
        `מספר תביעה:   ${c.claimNum || '—'}`,
        '',
        '── כספי ────────────────────────────────',
        `סכום תביעה:   ${c.finAmount || '—'}₪`,
        `סכום אושר:    ${c.finApproved || '—'}₪`,
        `סכום שולם:    ${c.finPaid || '—'}₪`,
        `יתרה:          ${c.finBalance || '—'}₪`,
        '',
        `סטטוס:         ${c.status}`,
        c.closeReason ? `סיבת סגירה:    ${c.closeReason}` : '',
        '',
      ].filter((l) => l !== undefined);
      if (tasks.length) {
        lines.push(`── משימות (${tasks.length}) ──`);
        tasks.forEach((t) => lines.push(`${t.done === 'true' ? '✅' : '⬜'} ${t.action}`));
        lines.push('');
      }
      if (comm.length) {
        lines.push(`── יומן תקשורת (${comm.length}) ──`);
        comm.forEach((e) => lines.push(`${e.at} | ${e.type} | ${(e.body || e.note || '').slice(0, 120)}`));
        lines.push('');
      }
      if (hist.length) {
        lines.push(`── היסטוריה (${hist.length}) ──`);
        hist.slice(0, 30).forEach((h) => lines.push(`${h.at} | ${h.action}${h.note ? ` – ${h.note}` : ''} · ${h.by || ''}`));
      }
      lines.push('');
      lines.push(`הופק: ${nowHe()} · ${actorName}`);
      return { success: true, text: lines.join('\n'), claimId };
    },

    async searchVehicles(query: string): Promise<{ success: boolean; data: ClaimsVehicleHit[] }> {
      const { data, error } = await supabase.rpc('claims_search_vehicles' as never, { p_q: query || '' } as never);
      if (error) return { success: false, data: [] };
      return { success: true, data: (data || []) as ClaimsVehicleHit[] };
    },

    async listAssignees() {
      const { data, error } = await supabase.rpc('claims_list_assignees' as never);
      if (error) return { success: false, data: [] as Array<{ id: string; full_name: string; company_name: string }> };
      return { success: true, data: (data || []) as Array<{ id: string; full_name: string; company_name: string }> };
    },

    async assignClaim(claimId: string, userId: string) {
      const { error } = await supabase.rpc('claims_assign' as never, { p_claim_id: claimId, p_user_id: userId } as never);
      if (error) return { success: false, error: error.message };
      return { success: true };
    },

    async invokeDocs(action: string, body: Record<string, unknown> = {}) {
      const { data, error } = await supabase.functions.invoke('claims-docs', { body: { action, ...body } });
      if (error) return { success: false, error: error.message, data };
      return (data || { success: false }) as Record<string, unknown> & { success?: boolean; error?: string };
    },

    async invokeIntake(action: string, body: Record<string, unknown> = {}) {
      const { data, error } = await supabase.functions.invoke('claims-intake', { body: { action, ...body } });
      const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      if (error) return { success: false, error: error.message, ...payload };
      return { ...payload, success: payload.success !== false };
    },

    async invokeGmail(action: string, body: Record<string, unknown> = {}) {
      const { data, error } = await supabase.functions.invoke('claims-gmail', { body: { action, ...body } });
      const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      if (error) return { ...payload, success: false, error: error.message, realEmailSend: payload.realEmailSend === true };
      return { ...payload, success: payload.success !== false, realEmailSend: payload.realEmailSend === true };
    },

    async importGmailMessage(claimId: string, messageId: string) {
      let start = 0;
      let last: Record<string, unknown> = {};
      for (let i = 0; i < 40; i++) {
        const r = await this.invokeGmail('import_message', { claim_id: claimId, message_id: messageId, start });
        last = r;
        if (!r.success) return r;
        if (r.done) return r;
        start = Number(r.start || 0);
      }
      return { ...last, success: false, error: 'import_incomplete', hint: 'יותר מדי קבצים לסבב אחד — לחץ שוב לייבוא להשלמת היתרה' };
    },

    async staffUpload(claimId: string, docRequestId: string, file: File, extra?: { doc_kind?: string }) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const form = new FormData();
      form.set('action', 'staff_upload');
      form.set('claim_id', claimId);
      if (docRequestId) form.set('doc_request_id', docRequestId);
      if (extra?.doc_kind) form.set('doc_kind', extra.doc_kind);
      form.set('file', file);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claims-docs`, {
        method: 'POST',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form,
      });
      const json = await res.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!res.ok || json.success === false) return { success: false, error: json.error || `HTTP ${res.status}` };
      return { success: true };
    },
  };
}

export type ClaimsApi = ReturnType<typeof createClaimsApi>;
