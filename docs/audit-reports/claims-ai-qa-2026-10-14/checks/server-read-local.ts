// Local run of the server reader on the fictitious QA documents. No network: OCR is not passed in.
import * as pdfjs from "npm:pdfjs-dist@6.3.289/legacy/build/pdf.mjs";
import { runServerRead, readRunConfig, pickDocuments, allowedClaims, type RunDoc } from "./_shared/claimDocumentReadRun.ts";
import { readPdfTextLayer } from "./_shared/claimPdfText.ts";
import { documentLabel } from "./_shared/claimDocumentLabel.ts";
const dir = Deno.args[0];
const file = (n: string) => Deno.readFileSync(`${dir}/${n}`);
const sha = async (b: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b))).map((x) => x.toString(16).padStart(2, "0")).join("");
const bytes: Record<string, Uint8Array> = { "QA-DOC-SURVEY": file("survey.pdf"), "QA-DOC-INVOICE": file("invoice.png"), "REAL-DOC": file("survey.pdf") };
const now = new Date().toISOString();
const docs: RunDoc[] = [
  { id: "QA-DOC-SURVEY", claim_id: "DAL-QA-AI-001", content_sha256: await sha(bytes["QA-DOC-SURVEY"]), original_name: "FICTITIOUS-survey.pdf", mime_type: "application/pdf", byte_size: bytes["QA-DOC-SURVEY"].length, created_at: now, doc_meta: {} },
  { id: "QA-DOC-INVOICE", claim_id: "DAL-QA-AI-001", content_sha256: await sha(bytes["QA-DOC-INVOICE"]), original_name: "FICTITIOUS-invoice-scan.png", mime_type: "image/png", byte_size: bytes["QA-DOC-INVOICE"].length, created_at: now, doc_meta: {} },
  { id: "REAL-DOC", claim_id: "DAL-2026-0003", content_sha256: await sha(bytes["REAL-DOC"]), original_name: "x.pdf", mime_type: "application/pdf", byte_size: 1, created_at: now, doc_meta: {} },
];
const cfg = readRunConfig([
  { key: "CLAIMS_DOC_READ_ENABLED", value: "true" }, { key: "CLAIMS_DOC_READ_FROM", value: "2026-10-01T00:00:00Z" },
  { key: "CLAIMS_DOC_READ_MAX_PER_RUN", value: "3" }, { key: "CLAIMS_DOC_READ_ONLY_CLAIMS", value: "DAL-QA-AI-001,DAL-2026-0003" },
]);
const allowed = allowedClaims(cfg, false);
const picked = pickDocuments(docs, cfg, new Date(), allowed);
console.log("allowed:", [...allowed!], "| taken:", picked.take.map((d) => d.id), "| skipped:", JSON.stringify(picked.skipped));
const saved: Record<string, any> = {};
const t0 = performance.now();
const summary = await runServerRead(picked.take, {
  elapsedMs: () => performance.now() - t0,
  download: async (d) => bytes[d.id],
  extractText: (b) => readPdfTextLayer(pdfjs as never, b),
  save: async (d, read, job) => { saved[d.id] = { ...read, ...job }; return true; },
}, { customerApproved: true, ocrApproved: false });
console.log("summary:", JSON.stringify(summary));
for (const [id, r] of Object.entries(saved)) {
  const label = documentLabel(r as Record<string, string>);
  console.log(`\n${id}: status=${r.read_status ?? "-"} job=${r.read_job_state ?? "-"} source=${r.read_source ?? "-"}`);
  if (r.read_status === "ready") console.log(`  type=${r.read_doc_type} | claim=${r.read_claim_nums} (${r.read_claim_src}) | plate=${r.read_plates} | dates=${r.read_dates} | amounts=${r.read_amounts} | missing=${r.read_missing || "-"}\n  title=${label?.title} | needs_review=${label?.needsReview}`);
}
