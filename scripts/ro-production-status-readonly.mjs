/**
 * Owner-approved Production READ-ONLY status (RO-1 … RO-7).
 * SELECT / GET / list only. Never writes to Production.
 * Never downloads customer document bytes or lists document filenames.
 *
 * node scripts/ro-production-status-readonly.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const PROD_HOST = 'https://dalia-car.online';
const FAKE_DOC = 'qa-readonly-does-not-exist-20260819.bin';
const OUT = join(process.cwd(), 'public/project-001/production-readonly-status.json');
const WRITE = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|copy|vacuum|reindex|cluster|security|notify|listen|do\s+|call\s+|execute\s+|reset\s+|set\s+)\b/i;

const report = {
  id: 'production-readonly-status',
  at: new Date().toISOString(),
  environment: 'production-read-only',
  productionRef: PROD_REF,
  productionHost: 'dalia-car.online',
  productionTouched: false,
  productionChanged: false,
  readOnly: true,
  customerDocumentsOpened: false,
  checks: {},
};

function abortIfNotSelect(sql) {
  const body = String(sql)
    .replace(/--.*$/gm, '')
    .replace(/'(?:\\'|[^'])*'/g, "''")
    .trim();
  if (!/^(select|with)\b/i.test(body)) throw new Error('ABORT: SQL must start with SELECT/WITH');
  if (WRITE.test(body)) throw new Error(`ABORT: write-like SQL blocked: ${body.slice(0, 80)}`);
}

function extractRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    if (payload.length && (payload[0]?.kind || payload[0]?.name || payload[0]?.proname || payload[0]?.id || payload[0]?.version || payload[0]?.policyname)) {
      return payload;
    }
    if (payload.length && Array.isArray(payload[0]?.rows)) return payload[0].rows;
    return payload;
  }
  if (typeof payload === 'string') {
    try {
      return extractRows(JSON.parse(payload));
    } catch {
      return [];
    }
  }
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function dbQuery(sql) {
  abortIfNotSelect(sql);
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-prod-ro');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${PROD_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  const raw = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return extractRows(raw);
}

function getKeys(ref) {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${ref} -o json`, {
    encoding: 'utf8',
  });
  const keys = JSON.parse(raw);
  return {
    service:
      keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
      keys.find((k) => k.name === 'service_role')?.api_key,
    anon:
      keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
      keys.find((k) => k.name === 'anon')?.api_key,
  };
}

function maskEmail(email) {
  const e = String(email || '');
  if (!e.includes('@')) return 'none';
  const [, domain] = e.split('@');
  if (/example\.invalid$/i.test(e) || /^qa[-.]/i.test(e.split('@')[0] || '')) return `qa:${domain}`;
  const h = createHash('sha256').update(e.toLowerCase()).digest('hex').slice(0, 8);
  return `u:${h}@${domain}`;
}

function rec(id, title, status, detail) {
  report.checks[id] = { id, title, status, ...detail };
  console.log(status, id, title, detail.plain || detail.error || '');
}

async function main() {
  if (PROD_REF === STAGING_REF) throw new Error('ABORT_REF_COLLIDE');

  // RO-1 bucket public flag
  try {
    const rows = dbQuery(`
      SELECT id, public, file_size_limit, allowed_mime_types IS NOT NULL AS has_mime_limit
      FROM storage.buckets
      WHERE id = 'documents'
    `);
    const bucket = rows[0] || null;
    const isPublic = bucket?.public === true || bucket?.public === 't' || bucket?.public === 'true';
    rec('RO-1', 'documents bucket public/private', bucket ? (isPublic ? 'OPEN' : 'PROTECTED') : 'UNKNOWN', {
      plain: bucket
        ? (isPublic
          ? 'ה-bucket documents ב-Production ציבורי (public=true). מסמכים יכולים להיות נגישים בלי התחברות אם יש גם מדיניות/URL ציבורי.'
          : 'ה-bucket documents ב-Production מסומן private.')
        : 'לא נמצא bucket בשם documents.',
      bucketPublic: isPublic,
      bucketFound: Boolean(bucket),
      safe: !isPublic,
      dangerous: isPublic,
      wroteProduction: false,
    });
  } catch (e) {
    rec('RO-1', 'documents bucket public/private', 'ERROR', {
      error: String(e.message || e).slice(0, 400),
      wroteProduction: false,
    });
  }

  // RO-2 policies
  try {
    const c4 = dbQuery(`
      SELECT schemaname, tablename, policyname, cmd, roles::text AS roles, qual, with_check
      FROM pg_policies
      WHERE (
        schemaname = 'public'
        AND tablename IN ('driver_declarations', 'driving_exams')
        AND policyname IN (
          'Anonymous can view by token',
          'Anonymous can update by token',
          'Anon view exam by token',
          'Anon submit exam by token'
        )
      )
      OR (
        schemaname = 'storage'
        AND (
          policyname IN (
            'Anonymous can view declaration signatures',
            'Anonymous can upload declaration signatures',
            'documents_read_public',
            'Authenticated users can view documents',
            'Authenticated users can upload documents'
          )
          OR policyname ILIKE '%document%'
        )
      )
      ORDER BY schemaname, tablename, policyname
    `);
    const names = c4.map((r) => `${r.schemaname}.${r.tablename}:${r.policyname}:${r.cmd}`);
    const c4Open = c4.some((r) =>
      ['Anonymous can view by token', 'Anonymous can update by token', 'Anon view exam by token', 'Anon submit exam by token'].includes(r.policyname),
    );
    const publicRead = c4.some((r) => r.policyname === 'documents_read_public' || r.policyname === 'Authenticated users can view documents');
    const anonViewSig = c4.some((r) => r.policyname === 'Anonymous can view declaration signatures');
    rec('RO-2', 'C4 and document policies', c4Open || publicRead || anonViewSig ? 'OPEN' : 'ABSENT_OR_SCOPED', {
      plain: c4Open
        ? 'מדיניות C4 האנונימית (USING token/true) קיימת ב-Production.'
        : 'שמות מדיניות C4 הידועים לא נמצאו. עדיין יש לבדוק התנהגות anon בנפרד.',
      c4NamedPoliciesPresent: c4Open,
      documentsPublicReadPolicyPresent: publicRead,
      anonViewDeclarationSignaturesPresent: anonViewSig,
      policies: c4.map((r) => ({
        obj: `${r.schemaname}.${r.tablename}`,
        name: r.policyname,
        cmd: r.cmd,
        roles: r.roles,
        using: String(r.qual || '').slice(0, 180),
      })),
      names,
      safe: !c4Open && !publicRead && !anonViewSig,
      dangerous: c4Open || publicRead || anonViewSig,
      wroteProduction: false,
    });
  } catch (e) {
    rec('RO-2', 'C4 and document policies', 'ERROR', {
      error: String(e.message || e).slice(0, 400),
      wroteProduction: false,
    });
  }

  // RO-3 RPCs + related function/trigger flags
  try {
    const rpcs = dbQuery(`
      SELECT p.proname AS name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'get_declaration_by_token',
          'sign_declaration_by_token',
          'get_driving_exam_by_token',
          'start_driving_exam_by_token',
          'submit_driving_exam_by_token'
        )
      ORDER BY 1
    `);
    const required = [
      'get_declaration_by_token',
      'sign_declaration_by_token',
      'get_driving_exam_by_token',
      'start_driving_exam_by_token',
      'submit_driving_exam_by_token',
    ];
    const have = rpcs.map((r) => r.name);
    let handleFlags = { error: null };
    try {
      const defs = dbQuery(`
        SELECT pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
        LIMIT 1
      `);
      const def = String(defs[0]?.def || '');
      handleFlags = {
        exists: Boolean(def),
        assignsFromClientMetadata: /raw_user_meta_data/i.test(def) && /super_admin|app_role/i.test(def),
        alwaysDriver: /'driver'/i.test(def) && /is_active/i.test(def),
      };
    } catch (e) {
      handleFlags = { error: String(e.message || e).slice(0, 200) };
    }
    let lockTrigger = { error: null };
    try {
      const tgs = dbQuery(`
        SELECT tgname
        FROM pg_trigger
        WHERE tgrelid = 'public.profiles'::regclass
          AND NOT tgisinternal
        ORDER BY 1
      `);
      lockTrigger = { names: tgs.map((r) => r.tgname) };
    } catch (e) {
      lockTrigger = { error: String(e.message || e).slice(0, 200) };
    }
    rec('RO-3', 'token sign RPCs exist', required.every((n) => have.includes(n)) ? 'PRESENT' : 'MISSING', {
      plain: required.every((n) => have.includes(n))
        ? 'חמשת ה-RPCs של חתימה לפי token קיימים ב-Production.'
        : `חסרים RPCs: ${required.filter((n) => !have.includes(n)).join(', ') || '(none listed)'}`,
      present: have,
      missing: required.filter((n) => !have.includes(n)),
      handle_new_user: handleFlags,
      profileTriggers: lockTrigger,
      safe: required.every((n) => have.includes(n)),
      dangerous: have.length === 0,
      wroteProduction: false,
    });
  } catch (e) {
    rec('RO-3', 'token sign RPCs exist', 'ERROR', {
      error: String(e.message || e).slice(0, 400),
      wroteProduction: false,
    });
  }

  // RO-4 live frontend bundle (public GET, no login)
  try {
    const htmlRes = await fetch(`${PROD_HOST}/`, { redirect: 'follow' });
    const html = await htmlRes.text();
    const bundle = (html.match(/assets\/index-[^"']+\.js/) || [])[0] || null;
    let js = '';
    let jsStatus = null;
    if (bundle) {
      const jsRes = await fetch(`${PROD_HOST}/${bundle}`);
      jsStatus = jsRes.status;
      js = await jsRes.text();
    }
    const markers = {
      getPublicUrl: js.includes('getPublicUrl'),
      createSignedUrl: js.includes('createSignedUrl'),
      documentSignedTtl: js.includes('DOCUMENT_SIGNED_URL_TTL') || js.includes('createSignedUrl'),
      get_declaration_by_token: js.includes('get_declaration_by_token'),
      sign_declaration_by_token: js.includes('sign_declaration_by_token'),
      tableEqToken: /driver_declarations[\s\S]{0,80}token/.test(js) && !js.includes('get_declaration_by_token'),
      tokenScopedAccess: js.includes('get_declaration_by_token'),
      devRoute: js.includes('/dev/vehicle-card') || js.includes('DevVehicleHubPreview'),
    };
    const usesPublicDocs = markers.getPublicUrl && !markers.createSignedUrl;
    rec('RO-4', 'live dalia-car.online bundle', htmlRes.ok && bundle ? 'GOT_BUNDLE' : 'ERROR', {
      plain: usesPublicDocs
        ? 'האתר החי עדיין משתמש בקישור ציבורי למסמכים ולא ב-signed URL, ואין RPC לחתימה ב-bundle.'
        : 'נקרא ה-bundle החי; ראו markers.',
      http: htmlRes.status,
      bundle,
      jsStatus,
      jsBytes: js.length,
      markers,
      matchesStagingSecurityFrontend: Boolean(markers.createSignedUrl && markers.get_declaration_by_token),
      safe: Boolean(markers.createSignedUrl && markers.get_declaration_by_token && !markers.getPublicUrl),
      dangerous: Boolean(markers.getPublicUrl || markers.tableEqToken || markers.devRoute),
      wroteProduction: false,
    });
  } catch (e) {
    rec('RO-4', 'live dalia-car.online bundle', 'ERROR', {
      error: String(e.message || e).slice(0, 400),
      wroteProduction: false,
    });
  }

  // RO-5 migrations
  try {
    let rows = [];
    let source = 'supabase_migrations.schema_migrations';
    try {
      rows = dbQuery(`
        SELECT version::text AS version
        FROM supabase_migrations.schema_migrations
        WHERE version LIKE '20260818%' OR version LIKE '20260819%'
        ORDER BY 1
      `);
    } catch (e) {
      source = 'fallback_schema_migrations';
      try {
        rows = dbQuery(`
          SELECT version::text AS version
          FROM schema_migrations
          WHERE version::text LIKE '20260818%' OR version::text LIKE '20260819%'
          ORDER BY 1
        `);
      } catch (e2) {
        throw new Error(`${e.message} | ${e2.message}`);
      }
    }
    const versions = rows.map((r) => r.version);
    rec('RO-5', 'P0 migrations recorded on Production', versions.length ? 'PRESENT' : 'ABSENT', {
      plain: versions.length
        ? `נרשמו migrations של אוגוסט 18/19: ${versions.join(', ')}`
        : 'אין רשומות schema_migrations ל-20260818* / 20260819*. תיקוני P0 כנראה לא הוחלו כ-migration רשום.',
      source,
      versions,
      safe: versions.some((v) => String(v).startsWith('20260818221000')) && versions.some((v) => String(v).startsWith('20260818220000')),
      dangerous: versions.length === 0,
      wroteProduction: false,
    });
  } catch (e) {
    rec('RO-5', 'P0 migrations recorded on Production', 'ERROR', {
      error: String(e.message || e).slice(0, 400),
      wroteProduction: false,
    });
  }

  const keys = getKeys(PROD_REF);
  const anon = createClient(PROD_URL, keys.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const admin = createClient(PROD_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Permission probes without opening customer files
  const fakePublic = await fetch(`${PROD_URL}/storage/v1/object/public/documents/${FAKE_DOC}`, { method: 'GET' });
  const fakeText = (await fakePublic.text()).slice(0, 120);
  const anonDecl = await anon.from('driver_declarations').select('id', { count: 'exact', head: true });
  const anonExam = await anon.from('driving_exams').select('id', { count: 'exact', head: true });
  report.permissionProbes = {
    fakePublicDocumentPath: {
      path: FAKE_DOC,
      status: fakePublic.status,
      bodyPreview: fakeText,
      note: 'נתיב מזויף בלבד. לא נפתח מסמך לקוח.',
    },
    anonDeclarationCountHead: {
      count: anonDecl.count,
      error: anonDecl.error?.message || null,
      note: 'count/head בלבד. לא הוחזרו שורות או תוכן.',
    },
    anonExamCountHead: {
      count: anonExam.count,
      error: anonExam.error?.message || null,
    },
  };

  // RO-6 counts only, hashed classification, no raw emails, no full dump
  try {
    const roleRows = dbQuery(`
      SELECT role::text AS role, count(*)::int AS n
      FROM public.user_roles
      GROUP BY 1
      ORDER BY 2 DESC
    `);
    const inactive = dbQuery(`
      SELECT count(*)::int AS n
      FROM public.profiles
      WHERE is_active = false
    `);
    const sessions = dbQuery(`
      SELECT count(*)::int AS session_count,
             count(*) FILTER (WHERE not_after IS NULL OR not_after > now())::int AS not_expired
      FROM auth.sessions
    `);
    const inactiveLive = dbQuery(`
      SELECT count(*)::int AS n
      FROM auth.sessions s
      JOIN public.profiles p ON p.id = s.user_id
      WHERE p.is_active = false
        AND (s.not_after IS NULL OR s.not_after > now())
    `);
    const saLive = dbQuery(`
      SELECT count(*)::int AS n
      FROM auth.sessions s
      JOIN public.user_roles ur ON ur.user_id = s.user_id
      WHERE ur.role = 'super_admin'
        AND (s.not_after IS NULL OR s.not_after > now())
    `);

    let authCount = null;
    let testLike = 0;
    let privileged = 0;
    let listErr = null;
    try {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      listErr = error?.message || null;
      const users = data?.users || [];
      authCount = users.length;
      const { data: roles } = await admin.from('user_roles').select('user_id, role');
      const privIds = new Set(
        (roles || [])
          .filter((r) => r.role === 'super_admin' || r.role === 'fleet_manager')
          .map((r) => r.user_id),
      );
      privileged = privIds.size;
      for (const u of users) {
        const kind = maskEmail(u.email);
        if (kind.startsWith('qa:')) testLike += 1;
      }
    } catch (e) {
      listErr = String(e.message || e).slice(0, 200);
    }

    rec('RO-6', 'privileged accounts and sessions (counts only)', 'COUNTED', {
      plain: `ספירות בלבד. אימיילים לא נשמרו בדוח. super_admin sessions חיים וחשבונות מושבתים עם session — ראו מספרים.`,
      roleCounts: Object.fromEntries(roleRows.map((r) => [r.role, r.n])),
      inactiveProfiles: inactive[0]?.n ?? null,
      sessions: sessions[0] || null,
      inactiveProfilesWithLiveSession: inactiveLive[0]?.n ?? null,
      superAdminLiveSessions: saLive[0]?.n ?? null,
      authUsersListed: authCount,
      privilegedUserIds: privileged,
      testLikeEmails: testLike,
      listError: listErr,
      emailsStored: false,
      wroteProduction: false,
    });
  } catch (e) {
    rec('RO-6', 'privileged accounts and sessions (counts only)', 'ERROR', {
      error: String(e.message || e).slice(0, 400),
      wroteProduction: false,
    });
  }

  // RO-7 function list metadata only — no deploy, no download into repo
  try {
    const wanted = [
      'change-user-password',
      'document-request',
      'request-human-callback',
      'check-driver-availability',
      'auth-login-challenge',
      'gupshup-webhook',
    ];
    let listed = [];
    let listRaw = '';
    try {
      listRaw = execSync(`npx --yes supabase functions list --project-ref ${PROD_REF}`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      listed = String(listRaw)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    } catch (e) {
      listRaw = String(e.stdout || e.message || e).slice(0, 800);
    }
    const present = {};
    for (const name of wanted) {
      present[name] = listed.some((l) => l.includes(name)) || String(listRaw).includes(name);
    }
    rec('RO-7', 'edge functions exist on Production', wanted.every((n) => present[n]) ? 'PRESENT' : 'PARTIAL', {
      plain: 'רשימת פונקציות בלבד. לא הורד קוד ולא הושווה checksum, כדי לא לדרוס את קבצי Staging המקומיים.',
      present,
      missing: wanted.filter((n) => !present[n]),
      listPreview: String(listRaw).slice(0, 1200),
      sourceComparedToStaging: false,
      skippedWrite: 'functions download would overwrite local Staging sources; skipped as not strictly GET-safe for the workspace.',
      wroteProduction: false,
    });
  } catch (e) {
    rec('RO-7', 'edge functions exist on Production', 'ERROR', {
      error: String(e.message || e).slice(0, 400),
      wroteProduction: false,
    });
  }

  const c4LiveOpen =
    Number(report.permissionProbes?.anonDeclarationCountHead?.count) > 0 ||
    (report.checks['RO-2']?.c4NamedPoliciesPresent === true);
  report.summary = {
    documentsBucketPublic: report.checks['RO-1']?.bucketPublic ?? null,
    c4NamedPoliciesPresent: report.checks['RO-2']?.c4NamedPoliciesPresent ?? null,
    c4AnonCanCountDeclarations: report.permissionProbes?.anonDeclarationCountHead?.count ?? null,
    tokenRpcsPresent: report.checks['RO-3']?.missing?.length === 0,
    liveSiteUsesPublicDocumentUrls: report.checks['RO-4']?.markers?.getPublicUrl ?? null,
    liveSiteUsesTokenRpc: report.checks['RO-4']?.markers?.get_declaration_by_token ?? null,
    p0MigrationsRecorded: (report.checks['RO-5']?.versions || []).length > 0,
    criticalLikely: Boolean(
      report.checks['RO-1']?.bucketPublic ||
      report.checks['RO-2']?.c4NamedPoliciesPresent ||
      c4LiveOpen,
    ),
  };

  mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ wrote: OUT, summary: report.summary, productionChanged: false }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
