/**
 * Staging-only server-side reading of claim documents (runs with the computer off once scheduled).
 * Called only by the internal scheduler (x-dalia-internal-key = DALIA_EDGE_INTERNAL_SECRET).
 *
 * Off by default, three separate switches must all be on before any document is read:
 *   1. Code gate DOCUMENT_READ_CUSTOMER_DOCS (claimDocumentReadJob.ts) — needs a reviewed deploy.
 *      While it is off, only claims listed in CLAIMS_DOC_READ_ONLY_CLAIMS are read (a pilot).
 *   2. claims_config CLAIMS_DOC_READ_ENABLED = 'true' — the stop switch, no deploy needed.
 *   3. A schedule (pg_cron) calling this function — not created here.
 *
 * Reads the PDF text layer only, with the same analysis as the browser reader. No OCR here,
 * no Gemini, no outside service. Logs and responses carry ids and counts only, never document text.
 * The original file is never changed; results go into doc_meta (read_* and read_job_*).
 *
 * Actions: "status" (counts only), "dry_run" (which ids would be read, no download), "run".
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import * as pdfjs from "npm:pdfjs-dist@6.3.289/legacy/build/pdf.mjs";
import { serverReadGate } from "../_shared/claimDocumentReadJob.ts";
import {
  RUN_CONFIG_KEYS,
  allowedClaims,
  mergeServerResult,
  pickDocuments,
  readRunConfig,
  runServerRead,
  type RunDoc,
} from "../_shared/claimDocumentReadRun.ts";
import { readPdfTextLayer } from "../_shared/claimPdfText.ts";

const STAGING_REF = "usfeoerkpcafxxlyuldl";
const PROD_REF = "qasomfndnjuixgjmjwcm";
const BUCKET = "claims-docs";
const CANDIDATE_LIMIT = 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isInternalScheduler(req: Request) {
  return sameSecret(req.headers.get("x-dalia-internal-key") || "", Deno.env.get("DALIA_EDGE_INTERNAL_SECRET") || "");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (!supabaseUrl.includes(STAGING_REF) || supabaseUrl.includes(PROD_REF)) {
    return json({ ok: false, error: "wrong_project", processed: 0 }, 403);
  }
  if (!isInternalScheduler(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as { action?: string };
  const action = String(body.action || "status");
  const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });

  const { data: cfgRows } = await sb.from("claims_config").select("key, value").in("key", [...RUN_CONFIG_KEYS]);
  const cfg = readRunConfig((cfgRows || []) as Array<{ key: string; value: string | null }>);
  const gate = serverReadGate();

  // Candidates: documents without a good read, oldest first. Freshness by fingerprint is rechecked in pickDocuments.
  const allowed = allowedClaims(cfg, gate.customerApproved);
  let q = sb.from("claims_documents")
    .select("id, claim_id, content_sha256, storage_path, original_name, mime_type, byte_size, doc_meta, created_at")
    .or("doc_meta->>read_status.is.null,doc_meta->>read_status.not.in.(ready,unreadable)")
    // Parked documents (left for the browser reader or a person) must not crowd out new ones.
    .or("doc_meta->>read_job_state.is.null,doc_meta->>read_job_state.not.in.(needs_ocr,too_large,failed)")
    .order("created_at", { ascending: true })
    .limit(CANDIDATE_LIMIT);
  if (!cfg.backlog && cfg.from) q = q.gte("created_at", cfg.from);
  if (allowed) q = q.in("claim_id", allowed.size ? [...allowed] : ["__none__"]);
  const { data: rows, error: rowsErr } = await q;
  if (rowsErr) return json({ ok: false, error: "select_failed" }, 500);

  // Skip documents of deleted claims.
  const claimIds = [...new Set((rows || []).map((r) => String(r.claim_id)))];
  const { data: claims } = claimIds.length
    ? await sb.from("claims_records").select("id, row_data").in("id", claimIds)
    : { data: [] as Array<{ id: string; row_data: Record<string, unknown> | null }> };
  const live = new Set((claims || []).filter((c) => !(c.row_data && (c.row_data as Record<string, unknown>).deletedAt)).map((c) => String(c.id)));
  const docs = (rows || []).filter((r) => live.has(String(r.claim_id))) as unknown as RunDoc[];

  const picked = pickDocuments(docs, cfg, new Date(), allowed);
  const state = {
    gate_customer_docs: gate.customerApproved,
    enabled: cfg.enabled,
    from: cfg.from || null,
    backlog: cfg.backlog,
    max_per_run: cfg.maxPerRun,
    only_claims: cfg.onlyClaims.length,
    ...(cfg.problem ? { problem: cfg.problem } : {}),
  };

  if (action === "status") {
    return json({ ok: true, ...state, candidates: docs.length, would_take: picked.take.length, skipped: picked.skipped });
  }
  if (action === "dry_run") {
    return json({ ok: true, ...state, would_read: picked.take.map((d) => d.id), skipped: picked.skipped });
  }
  if (action !== "run") return json({ ok: false, error: "unknown_action" }, 400);

  if (!gate.customerApproved && !cfg.onlyClaims.length) {
    return json({ ok: false, error: "customer_docs_not_approved", ...state, processed: 0 }, 403);
  }
  if (!cfg.enabled) return json({ ok: true, stopped: true, reason: cfg.problem || "disabled", ...state, processed: 0 });

  const started = performance.now();
  const summary = await runServerRead(picked.take, {
    elapsedMs: () => performance.now() - started,
    download: async (doc) => {
      if (!doc.storage_path) return null;
      const { data, error } = await sb.storage.from(BUCKET).download(doc.storage_path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    extractText: (bytes) => readPdfTextLayer(pdfjs as never, bytes),
    save: async (doc, read, job) => {
      const { data: latestRow } = await sb.from("claims_documents").select("doc_meta").eq("id", doc.id).eq("claim_id", doc.claim_id).maybeSingle();
      if (!latestRow) return false;
      const latest = (latestRow.doc_meta && typeof latestRow.doc_meta === "object" ? latestRow.doc_meta : {}) as Record<string, string>;
      const merged = mergeServerResult(latest, doc.claim_id, doc.content_sha256, read, job);
      if (!merged.ok) return false;
      if (merged.unchanged) return true;
      const { error } = await sb.from("claims_documents").update({ doc_meta: merged.meta }).eq("id", doc.id).eq("claim_id", doc.claim_id);
      return !error;
    },
  }, { customerApproved: true }); // picked.take is already limited to the allowed claims

  console.log(JSON.stringify({ fn: "claims-doc-read", ...summary, ms: Math.round(performance.now() - started) }));
  return json({ ok: true, ...state, ...summary });
});
