// Full Supabase Export - generates a complete recreation package as a ZIP
// Includes: schema DDL, migrations, RLS policies, auth users, storage metadata,
// edge function secrets (key names only), project config, and data dump.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// deno-lint-ignore-file no-explicit-any
// @ts-ignore - JSZip via esm
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tables (public schema) to dump as data
const PUBLIC_TABLES = [
  "profiles","user_roles","vehicles","drivers","faults","fault_messages",
  "fault_status_log","fault_referrals","expenses","accidents","service_orders",
  "service_order_messages","vehicle_handovers","vehicle_exchanges","vehicle_inspections",
  "inspection_items","routes","trip_logs","customers","customer_deals",
  "customer_agreements","suppliers","supplier_work_orders","companions",
  "vehicle_companions","custom_alerts","company_settings","company_subscriptions","declaration_templates",
  "document_metadata","driver_health_declarations","driver_notifications",
  "internal_messages","emergency_categories","emergency_logs","promotions",
  "system_logs","temporary_drivers","dev_tasks","approval_requests","work_assignments",
  "work_assignment_messages","work_assignment_status_log","driver_declarations",
  "driving_exams","practical_driving_exams","vehicle_insurance_history","vehicle_tasks",
  "voice_campaigns","voice_prompts","voice_scenarios","voice_scenario_runs",
  "campaign_customers","call_logs"
];

// Names of secrets the project uses (values NOT exported for security)
const SECRET_KEY_NAMES = [
  "SUPABASE_URL","SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_URL",
  "SUPABASE_PUBLISHABLE_KEY","SUPABASE_JWKS",
  "RESEND_API_KEY",
  "PAYPAL_CLIENT_ID","PAYPAL_SECRET",
  "TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_PHONE_NUMBER",
  "ELEVENLABS_API_KEY","ELEVENLABS_AGENT_ID","ELEVENLABS_AGENT_PHONE_NUMBER_ID",
  "LOVABLE_API_KEY"
];

const EDGE_FUNCTIONS = [
  "backup-data","book-pickup-slot","change-user-password","check-driver-availability",
  "check-exam-expiry","create-admin-user","elevenlabs-conversation-token","help-ai-chat",
  "notify-accident-email","notify-service-order-email","paypal-charge",
  "request-human-callback","send-password-reset","send-supplier-order-email",
  "twilio-outbound-call","vehicle-lookup","full-supabase-export"
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is super_admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).single();
    if (roleRow?.role !== "super_admin") return json({ error: "Forbidden - super_admin only" }, 403);

    const zip = new JSZip();
    const errors: string[] = [];

    // ---------- 1. README ----------
    zip.file("README.md", buildReadme());

    // ---------- 2. Schema DDL via pg_catalog (extract through RPC if available, otherwise via REST) ----------
    // We use a SQL function we create on the fly via PostgREST? Not allowed.
    // Instead use a maintained set of queries through the admin REST PostgREST 'rpc' on built-in or via pg-meta.
    // Supabase exposes pg-meta at /pg-meta/default but not via JS client. We'll use direct fetch.
    const pgMeta = async (path: string) => {
      const res = await fetch(`${supabaseUrl}/pg-meta/default${path}`, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });
      if (!res.ok) throw new Error(`pg-meta ${path} -> ${res.status}`);
      return res.json();
    };

    let schemaInfo: any = {};
    try {
      const [tables, columns, indexes, triggers, fns, policies, extensions, roles, schemas] = await Promise.all([
        pgMeta("/tables?included_schemas=public").catch(() => []),
        pgMeta("/columns?included_schemas=public").catch(() => []),
        pgMeta("/indexes?included_schemas=public").catch(() => []),
        pgMeta("/triggers?included_schemas=public").catch(() => []),
        pgMeta("/functions?included_schemas=public").catch(() => []),
        pgMeta("/policies?included_schemas=public").catch(() => []),
        pgMeta("/extensions").catch(() => []),
        pgMeta("/roles").catch(() => []),
        pgMeta("/schemas").catch(() => []),
      ]);
      schemaInfo = { tables, columns, indexes, triggers, functions: fns, policies, extensions, roles, schemas };
    } catch (e) {
      errors.push(`pg-meta unavailable, falling back: ${(e as Error).message}`);
    }

    // Fallback: query information_schema/pg_catalog through PostgREST views? Not possible for system schemas.
    // We'll instead extract schema via a server-side RPC we add. Try calling 'export_schema_ddl' if exists.
    let ddlText = "";
    try {
      const { data: ddl, error: ddlErr } = await admin.rpc("export_schema_ddl");
      if (!ddlErr && typeof ddl === "string") ddlText = ddl;
    } catch (_) { /* ignore */ }

    if (!ddlText) {
      // Build a best-effort DDL from schemaInfo
      ddlText = buildDDLFromMeta(schemaInfo);
      errors.push("Used best-effort DDL builder. For 100% accurate DDL, install pg_dump on a server and run against SUPABASE_DB_URL.");
    }

    zip.folder("schema")!.file("schema.sql", ddlText);
    zip.folder("schema")!.file("schema_meta.json", JSON.stringify(schemaInfo, null, 2));

    // ---------- 3. Migrations equivalent ----------
    const migrationsFolder = zip.folder("supabase")!.folder("migrations")!;
    const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    migrationsFolder.file(`${ts}_full_schema.sql`, ddlText);

    // RLS policies as a separate migration file
    const policiesSql = buildPoliciesSQL(schemaInfo.policies || []);
    migrationsFolder.file(`${ts}_rls_policies.sql`, policiesSql);

    // ---------- 4. Auth users export ----------
    const authUsers: any[] = [];
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) { errors.push(`auth.listUsers p${page}: ${error.message}`); break; }
      authUsers.push(...(data?.users || []));
      if (!data || data.users.length < 1000) break;
      page++;
      if (page > 50) break; // safety
    }
    zip.folder("auth")!.file("users.json", JSON.stringify({
      exported_at: new Date().toISOString(),
      total: authUsers.length,
      note: "Passwords are stored as bcrypt hashes in auth.users. Re-import via Supabase Admin API or pg_dump of the auth schema.",
      users: authUsers.map((u: any) => ({
        id: u.id, email: u.email, phone: u.phone,
        email_confirmed_at: u.email_confirmed_at,
        phone_confirmed_at: u.phone_confirmed_at,
        confirmed_at: u.confirmed_at,
        last_sign_in_at: u.last_sign_in_at,
        created_at: u.created_at, updated_at: u.updated_at,
        role: u.role, aud: u.aud,
        app_metadata: u.app_metadata,
        user_metadata: u.user_metadata,
        identities: u.identities,
        is_anonymous: u.is_anonymous,
        is_sso_user: u.is_sso_user,
        banned_until: u.banned_until,
      })),
    }, null, 2));

    // ---------- 5. RLS policies, roles, permissions ----------
    zip.folder("security")!.file("policies.json", JSON.stringify(schemaInfo.policies || [], null, 2));
    zip.folder("security")!.file("roles.json", JSON.stringify(schemaInfo.roles || [], null, 2));
    zip.folder("security")!.file("policies.sql", policiesSql);

    // ---------- 6. Secrets (key names only, NOT values) ----------
    const presentSecrets = SECRET_KEY_NAMES.filter(k => {
      const v = Deno.env.get(k);
      return typeof v === "string" && v.length > 0;
    });
    const secretsTxt = [
      "# Edge Function Secrets (key names only — values intentionally omitted for security)",
      "# Recreate these in Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets",
      "",
      ...SECRET_KEY_NAMES.map(k => `${k}=${presentSecrets.includes(k) ? "<configured-in-source-project>" : "<not-set>"}`),
    ].join("\n");
    zip.folder("config")!.file("edge_function_secrets.env.example", secretsTxt);

    // ---------- 7. Storage bucket structure & metadata ----------
    const { data: buckets } = await admin.storage.listBuckets();
    const bucketsInfo: any = { buckets: buckets || [], objects: {} };
    for (const b of buckets || []) {
      const allFiles: any[] = [];
      const walk = async (prefix: string) => {
        const { data, error } = await admin.storage.from(b.name).list(prefix, { limit: 10000 });
        if (error || !data) return;
        for (const it of data) {
          const full = prefix ? `${prefix}/${it.name}` : it.name;
          if (it.id) {
            allFiles.push({
              path: full,
              size: (it as any).metadata?.size || 0,
              mimetype: (it as any).metadata?.mimetype,
              created_at: it.created_at,
              updated_at: it.updated_at,
              last_accessed_at: it.last_accessed_at,
              etag: (it as any).metadata?.eTag,
            });
          } else {
            await walk(full);
          }
        }
      };
      await walk("");
      bucketsInfo.objects[b.name] = allFiles;
    }
    zip.folder("storage")!.file("buckets_metadata.json", JSON.stringify(bucketsInfo, null, 2));
    zip.folder("storage")!.file("buckets.sql", buildBucketsSQL(buckets || []));

    // ---------- 8. Project config ----------
    const projectConfig = {
      generated_at: new Date().toISOString(),
      supabase_url: supabaseUrl,
      project_ref: supabaseUrl.match(/https?:\/\/([^.]+)\./)?.[1] || null,
      anon_key: anonKey,
      // Service role key is sensitive — included ONLY because user explicitly requested it.
      service_role_key: serviceRoleKey,
      database_url: Deno.env.get("SUPABASE_DB_URL") || "<not exposed to edge function>",
      jwt_jwks: Deno.env.get("SUPABASE_JWKS") || null,
      edge_functions: EDGE_FUNCTIONS,
      configured_secret_keys: presentSecrets,
      warning: "service_role_key and database_url grant full admin access. Store securely; rotate after migration.",
    };
    zip.folder("config")!.file("project.json", JSON.stringify(projectConfig, null, 2));
    zip.folder("config")!.file("supabase_config.toml", buildSupabaseConfigToml(projectConfig.project_ref || ""));

    // ---------- 9. Data dump (parity with backup-data) ----------
    const dataFolder = zip.folder("data")!;
    const tableCounts: Record<string, number> = {};
    for (const table of PUBLIC_TABLES) {
      try {
        let all: any[] = [];
        let from = 0; const pageSize = 1000; let more = true;
        while (more) {
          const { data, error } = await admin.from(table).select("*").range(from, from + pageSize - 1);
          if (error) { errors.push(`${table}: ${error.message}`); more = false; }
          else { all = all.concat(data || []); more = (data?.length || 0) === pageSize; from += pageSize; }
        }
        tableCounts[table] = all.length;
        dataFolder.file(`${table}.json`, JSON.stringify(all, null, 2));
      } catch (e) {
        errors.push(`${table}: ${(e as Error).message}`);
      }
    }
    dataFolder.file("_summary.json", JSON.stringify({ table_counts: tableCounts, exported_at: new Date().toISOString() }, null, 2));

    // ---------- 10. Errors / log ----------
    if (errors.length) zip.file("EXPORT_ERRORS.log", errors.join("\n"));

    const blob = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new Response(blob, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="full_supabase_export_${new Date().toISOString().slice(0,10)}.zip"`,
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildReadme(): string {
  return `# Full Supabase Export

This archive contains everything needed to recreate the Supabase project on a fresh instance.

## Contents
- \`schema/schema.sql\` — Full DDL (tables, columns, indexes, constraints, extensions, functions, triggers).
- \`schema/schema_meta.json\` — Raw pg-meta JSON.
- \`supabase/migrations/*\` — Migration files ready to drop into a Supabase CLI project.
- \`auth/users.json\` — Auth users metadata. Passwords are bcrypt-hashed inside auth.users; use pg_dump of the \`auth\` schema for full restore including password hashes.
- \`security/policies.{sql,json}\` — Row-Level Security policies.
- \`security/roles.json\` — Database roles & grants snapshot.
- \`storage/buckets_metadata.json\` — All buckets and the list of objects with size + MIME (no file contents).
- \`storage/buckets.sql\` — SQL to recreate buckets and their public/private flags.
- \`config/project.json\` — Project URL, anon key, service role key, DB URL, configured secret keys.
- \`config/edge_function_secrets.env.example\` — Names of every Edge Function secret used by the project (values omitted).
- \`config/supabase_config.toml\` — supabase/config.toml stub.
- \`data/*.json\` — Per-table JSON dump of every public table.

## How to recreate the project
1. Create a new Supabase project (or run \`supabase init\` locally).
2. Copy \`supabase/migrations/*\` into your new project's \`supabase/migrations/\` and run \`supabase db push\`.
3. Restore Auth: use the Supabase Admin API \`auth.admin.createUser\` for each entry in \`auth/users.json\`, OR run \`pg_dump --schema=auth\` against the source DB and \`psql\` it into the target. Password hashes only round-trip via the pg_dump path.
4. Recreate buckets by running \`storage/buckets.sql\`, then re-upload the files referenced in \`storage/buckets_metadata.json\` (file contents are not in this archive — generate signed URLs from the source project to download them).
5. Set every secret listed in \`config/edge_function_secrets.env.example\` in **Project Settings → Edge Functions → Secrets**.
6. Deploy the edge functions listed in \`config/project.json.edge_functions\`.
7. Import data: for each file in \`data/\`, INSERT into the matching table (consider order due to foreign keys; profiles & user_roles depend on auth.users existing first).

## Security warning
\`config/project.json\` contains the service-role key and (when available) the DB connection string. Anyone with these can read and modify all data. **Store the archive securely and rotate keys after migration.**
`;
}

function buildDDLFromMeta(meta: any): string {
  const out: string[] = [
    "-- Auto-generated DDL from pg-meta snapshot.",
    "-- For an exact replica, prefer: pg_dump --schema-only \"$SUPABASE_DB_URL\"",
    "",
    "CREATE SCHEMA IF NOT EXISTS public;",
    "",
  ];

  // Extensions
  for (const ext of meta.extensions || []) {
    if (ext.installed_version) out.push(`CREATE EXTENSION IF NOT EXISTS "${ext.name}";`);
  }
  out.push("");

  // Tables + columns
  const cols = (meta.columns || []) as any[];
  const colsByTable: Record<string, any[]> = {};
  for (const c of cols) {
    const k = `${c.schema}.${c.table}`;
    (colsByTable[k] ||= []).push(c);
  }

  for (const t of meta.tables || []) {
    const k = `${t.schema}.${t.name}`;
    const cs = (colsByTable[k] || []).sort((a, b) => (a.ordinal_position || 0) - (b.ordinal_position || 0));
    out.push(`-- Table: ${k}`);
    out.push(`CREATE TABLE IF NOT EXISTS "${t.schema}"."${t.name}" (`);
    const lines: string[] = [];
    for (const c of cs) {
      const def = c.default_value ? ` DEFAULT ${c.default_value}` : "";
      const nn = c.is_nullable ? "" : " NOT NULL";
      lines.push(`  "${c.name}" ${c.data_type}${def}${nn}`);
    }
    out.push(lines.join(",\n"));
    out.push(`);`);
    if (t.rls_enabled) out.push(`ALTER TABLE "${t.schema}"."${t.name}" ENABLE ROW LEVEL SECURITY;`);
    out.push("");
  }

  // Indexes
  for (const idx of meta.indexes || []) {
    if (idx.index_definition) out.push(`${idx.index_definition};`);
  }
  out.push("");

  // Functions
  for (const fn of meta.functions || []) {
    if (fn.complete_statement) out.push(`${fn.complete_statement}\n`);
  }

  // Triggers
  for (const tr of meta.triggers || []) {
    if (tr.complete_statement) out.push(`${tr.complete_statement};`);
  }

  return out.join("\n");
}

function buildPoliciesSQL(policies: any[]): string {
  const out = [
    "-- Row Level Security Policies",
    "-- Generated from pg-meta",
    "",
  ];
  for (const p of policies) {
    out.push(`-- Policy: ${p.name} on ${p.schema}.${p.table}`);
    const using = p.definition ? ` USING (${p.definition})` : "";
    const wc = p.check ? ` WITH CHECK (${p.check})` : "";
    const roles = (p.roles || []).join(", ") || "public";
    out.push(`CREATE POLICY "${p.name}" ON "${p.schema}"."${p.table}" AS ${p.action || "PERMISSIVE"} FOR ${p.command || "ALL"} TO ${roles}${using}${wc};`);
    out.push("");
  }
  return out.join("\n");
}

function buildBucketsSQL(buckets: any[]): string {
  const out = ["-- Recreate storage buckets", ""];
  for (const b of buckets) {
    out.push(`INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)`);
    out.push(`VALUES ('${b.id}', '${b.name}', ${b.public}, ${b.file_size_limit ?? "NULL"}, ${b.allowed_mime_types ? "ARRAY[" + b.allowed_mime_types.map((m: string) => `'${m}'`).join(",") + "]" : "NULL"})`);
    out.push(`ON CONFLICT (id) DO NOTHING;`);
    out.push("");
  }
  return out.join("\n");
}

function buildSupabaseConfigToml(projectRef: string): string {
  return `# Recreate the project in supabase/config.toml
project_id = "${projectRef}"

[api]
enabled = true
port = 54321
schemas = ["public", "storage", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["https://localhost:3000"]
jwt_expiry = 3600
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
enable_signup = true

[storage]
enabled = true
file_size_limit = "50MiB"
`;
}
