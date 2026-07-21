/**
 * Deploy gupshup-webhook + replay captured Make DLR (Meta 131047) for known message_id.
 * No WhatsApp send. Production untouched.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const sbToken = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const STAGING = 'usfeoerkpcafxxlyuldl';
const MSG = '0353ce86-a0bf-4e97-9344-5618e1192032';

const payload = {
  entry: [{
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '972546500305',
          phone_number_id: '689295480929918',
        },
        statuses: [{
          biz_opaque_callback_data: '033TikDF0eJTBHZxfqia6o||CommonSegWAMetadata||0',
          errors: [{
            code: 131047,
            error_data: {
              details: 'Message failed to send because more than 24 hours have passed since the customer last replied to this number.',
            },
            href: 'https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/',
            message: 'Re-engagement message',
            title: 'Re-engagement message',
          }],
          gs_id: MSG,
          id: '033TikDF0eJTBHZxfqia6o',
          meta_msg_id: 'wamid.HBgMOTcyNTM0MzM4NjAxFQIAERgSMzg2NzY4RkU0MjM3QkMxODBCAA==',
          recipient_id: '972534338601',
          status: 'failed',
          timestamp: '1784632549',
        }],
      },
    }],
    id: '1192839012642441',
  }],
  gs_app_id: '496709e8-b5fc-4de9-9c75-bc87455482dd',
  object: 'whatsapp_business_account',
};

const out = {
  id: 'replay-make-dlr-to-staging',
  env: 'staging',
  production_touched: false,
  no_whatsapp_send: true,
  message_id: MSG,
};

async function main() {
  if (!sbToken) throw new Error('SUPABASE_ACCESS_TOKEN missing');
  process.env.SUPABASE_ACCESS_TOKEN = sbToken;
  execSync(`npx --yes supabase functions deploy gupshup-webhook --project-ref ${STAGING} --use-api`, {
    encoding: 'utf8',
    timeout: 180000,
  });
  out.deploy_ok = true;

  const keysRes = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/api-keys`, {
    headers: { Authorization: `Bearer ${sbToken}`, apikey: sbToken },
  });
  const keys = await keysRes.json();
  const srk = Array.isArray(keys)
    ? keys.find((k) => k.name === 'service_role' || (k.tags || []).includes('service_role'))?.api_key
    : null;
  if (!srk) throw new Error('no service_role');

  const base = `https://${STAGING}.supabase.co`;
  // Also test Make-style double-encoded / wrapped body
  const variants = [
    { name: 'raw_meta', body: payload },
    { name: 'make_toJSON_string', body: JSON.stringify(payload) },
    { name: 'make_wrapped_data', body: { data: payload } },
  ];
  out.replays = [];
  for (const v of variants) {
    const res = await fetch(`${base}/functions/v1/gupshup-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: srk,
        Authorization: `Bearer ${srk}`,
      },
      body: typeof v.body === 'string' ? JSON.stringify(v.body) : JSON.stringify(v.body),
    });
    out.replays.push({ name: v.name, http: res.status });
  }

  const rowRes = await fetch(
    `${base}/rest/v1/incident_notification_deliveries?provider_message_id=eq.${MSG}&channel=eq.whatsapp&select=status,dlr_event,dlr_error_code,error_message,status_history,updated_at&limit=1`,
    { headers: { apikey: srk, Authorization: `Bearer ${srk}` } },
  );
  const rows = await rowRes.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  out.db = row
    ? {
        status: row.status,
        dlr_event: row.dlr_event,
        dlr_error_code: row.dlr_error_code,
        error_message: row.error_message,
        history_len: Array.isArray(row.status_history) ? row.status_history.length : 0,
      }
    : null;
  out.ok = row?.status === 'failed' && String(row?.dlr_error_code) === '131047';

  console.log('---REPLAY_MAKE_DLR---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---REPLAY_MAKE_DLR_DONE---');
  fs.writeFileSync('/tmp/replay-make-dlr.json', JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main().catch((e) => {
  out.error = String(e.message || e).slice(0, 400);
  console.log('---REPLAY_MAKE_DLR---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---REPLAY_MAKE_DLR_DONE---');
  process.exit(1);
});
