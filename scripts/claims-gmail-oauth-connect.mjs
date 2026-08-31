/**
 * Claims Gmail OAuth — Staging only. Opens a LOCAL scopes page first.
 * GCP project: oren-car-claims (NOT project001aimarketing / Gemini / dalia-fleetos).
 * Credentials: integrations/google/credentials.claims-oauth.json (gitignored).
 * Redirect URI: http://127.0.0.1:4521/oauth2callback
 * Mailbox required: yoni122222@gmail.com
 * Does not send mail. Does not use GAS / ANYONE_ANONYMOUS / marketing client.
 *
 * node scripts/claims-gmail-oauth-connect.mjs
 */
import { createServer } from 'http';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PORT = 4521;
const REDIRECT = `http://127.0.0.1:${PORT}/oauth2callback`;
const ALLOWED = 'yoni122222@gmail.com';
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-gmail-oauth-staging-2026-08-31');
mkdirSync(OUT, { recursive: true });

const claimsCredPath = join(ROOT, 'integrations/google/credentials.claims-oauth.json');
if (!existsSync(claimsCredPath)) {
  throw new Error('missing integrations/google/credentials.claims-oauth.json — use oren-car-claims client, not marketing');
}
const creds = JSON.parse(readFileSync(claimsCredPath, 'utf8'));
const block = creds.web || creds.installed;
if (!block?.client_id || !block?.client_secret) throw new Error('missing OAuth web client');
if (String(block.project_id || creds.web?.project_id || '') !== 'oren-car-claims') {
  throw new Error('refused: credentials are not from oren-car-claims');
}

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-gmail-oauth-store');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${tmp}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120000,
  });
}
function sqlLit(v) {
  return `'${String(v ?? '').replace(/'/g, "''")}'`;
}

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

const state = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: block.client_id,
  redirect_uri: REDIRECT,
  response_type: 'code',
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: 'false',
  login_hint: ALLOWED,
  scope: SCOPES.join(' '),
  state,
}).toString();

const introHtml = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>חיבור Gmail לתביעות</title>
<style>
body{font-family:Heebo,Arial,sans-serif;background:#071022;color:#e5e7eb;margin:0;padding:32px;line-height:1.55}
.card{max-width:720px;margin:0 auto;background:#0b1220;border:1px solid #1f2937;border-radius:14px;padding:28px}
h1{color:#93c5fd;font-size:22px} h2{color:#fbbf24;font-size:15px}
code,pre{background:#111827;padding:2px 6px;border-radius:6px;font-size:12px}
.btn{display:inline-block;margin-top:18px;padding:12px 18px;background:#2563eb;color:#fff;border-radius:10px;text-decoration:none;font-weight:700}
.warn{color:#fca5a5} .ok{color:#86efac}
</style></head><body><div class="card">
<h1>לפני אישור Google</h1>
<p>חשבון מותר: <b>${ALLOWED}</b> · סביבה: Oren Car Staging בלבד.</p>
<p class="warn">לא תתבצע שליחת מייל אמיתית. Follow-up נשאר Dry Run. אין שינוי מיילים קיימים בתיבה.</p>
<h2>Scopes שיידרשו</h2>
<ol>
<li><code>openid</code> — זיהוי חשבון Google בלי תוכן התיבה.</li>
<li><code>userinfo.email</code> — לוודא שהחשבון הוא בדיוק ${ALLOWED}. אחרת החיבור יידחה.</li>
<li><code>gmail.readonly</code> — קריאת מיילים ומצורפים לייבוא לתביעה. לא מוחק, לא מסמן כנקרא, לא מעביר.</li>
<li><code>gmail.compose</code> — יצירת טיוטה בלבד. האפליקציה חוסמת send. שימו לב: Google מאפשר שליחה ב-scope הזה, אבל הקוד שלנו לא קורא ל-messages.send / drafts.send.</li>
</ol>
<h2>איפה נשמר ה-token</h2>
<p>Refresh token נשמר בטבלת <code>claims_gmail_connection</code> ב-Staging. אין GRANT ל-authenticated/anon. Edge קורא עם service_role. ה-Frontend מקבל רק סטטוס (מחובר/אימייל), לא את הטוקן. אין סיסמת Gmail בשום מקום.</p>
<h2>איך מבטלים</h2>
<p>בתביעות → Gmail → «בטל חיבור» (super_admin), וגם ב-Google Account → Third-party access → הסרת האפליקציה.</p>
<h2>איך עובד לא מקבל את התיבה</h2>
<p>עובד Claims לא מקבל OAuth token ולא נכנס ל-Gmail.com. הוא יכול לייבא/לבחור מייל רק מתוך תיק שהוא מורשה לטפל בו, דרך Edge.</p>
<p>לא משתמשים ב-GAS / ANYONE_ANONYMOUS / החיבור של yonia191177.</p>
<a class="btn" href="${authUrl}">אני מאשר וממשיך למסך Google</a>
</div></body></html>`;

let finished = false;

const server = createServer(async (req, res) => {
  const u = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  if (u.pathname === '/' || u.pathname === '/scopes') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(introHtml);
    return;
  }
  if (u.pathname !== '/oauth2callback') {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  if (finished) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('already connected');
    return;
  }
  try {
    if (u.searchParams.get('error')) throw new Error(u.searchParams.get('error'));
    if (u.searchParams.get('state') !== state) throw new Error('state_mismatch');
    const code = u.searchParams.get('code');
    if (!code) throw new Error('missing code');
    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: block.client_id,
        client_secret: block.client_secret,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokRes.json();
    if (!tokRes.ok) throw new Error(tokens.error_description || tokens.error || 'exchange_failed');
    if (!tokens.refresh_token) throw new Error('no_refresh_token — revoke prior access and retry');
    const meRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me = await meRes.json();
    const email = String(me.email || '').toLowerCase();
    if (email !== ALLOWED) {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tokens.refresh_token }),
      }).catch(() => undefined);
      throw new Error(`wrong_account:${email}`);
    }
    const granted = String(tokens.scope || '');
    if (!granted.includes('gmail.readonly') || !granted.includes('gmail.compose')) {
      throw new Error(`missing_scope:${granted}`);
    }
    dbQuery(`
INSERT INTO public.claims_gmail_connection (id, connected_email, refresh_token, scopes, google_sub, connected_at, revoked_at, last_ok_at)
VALUES (
  'staging',
  ${sqlLit(email)},
  ${sqlLit(tokens.refresh_token)},
  ${sqlLit(granted)},
  ${sqlLit(me.id || '')},
  now(),
  NULL,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  connected_email = EXCLUDED.connected_email,
  refresh_token = EXCLUDED.refresh_token,
  scopes = EXCLUDED.scopes,
  google_sub = EXCLUDED.google_sub,
  connected_at = now(),
  revoked_at = NULL,
  last_ok_at = now();
`);
    writeFileSync(join(OUT, 'oauth-connect.json'), JSON.stringify({
      at: new Date().toISOString(),
      ok: true,
      email,
      scopes: granted,
      hasRefresh: true,
      tokenReturnedToClient: false,
      realEmailSend: false,
      staging: STAGING_REF,
    }, null, 2), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html lang="he" dir="rtl"><body style="font-family:Arial;background:#071022;color:#86efac;padding:40px;text-align:center">
<h1>החיבור הצליח</h1><p>${email} מחובר ל-Claims Staging. לא נשלח מייל. אפשר לסגור את החלון.</p></body></html>`);
    finished = true;
    console.log('OAUTH_OK', email);
    setTimeout(() => process.exit(0), 800);
  } catch (e) {
    const msg = String(e.message || e);
    writeFileSync(join(OUT, 'oauth-connect.json'), JSON.stringify({ ok: false, error: msg, realEmailSend: false }, null, 2));
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html lang="he" dir="rtl"><body style="font-family:Arial;background:#071022;color:#fca5a5;padding:40px;text-align:center">
<h1>חיבור נכשל</h1><p>${msg.replace(/[<>]/g, '')}</p></body></html>`);
    console.error('OAUTH_FAIL', msg);
    setTimeout(() => process.exit(1), 1200);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('SCOPES_PAGE', `http://127.0.0.1:${PORT}/`);
  console.log('AUTH_URL_READY');
  console.log('WAITING_FOR_OWNER_CONSENT');
});
