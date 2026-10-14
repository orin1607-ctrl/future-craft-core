// Fictitious data only. The OCR path of the server reader, with a stand-in for Gemini's transcription.
import { runServerRead, type RunDoc } from "./_shared/claimDocumentReadRun.ts";
import { documentLabel } from "./_shared/claimDocumentLabel.ts";

const OCR_TEXT = [
  "מסמך פיקטיבי לבדיקה בלבד",
  'מוסך בדיקה בע"מ',
  "חשבונית מס מספר 90017",
  "תאריך: 05/10/2026",
  "תביעה מספר: QA-AI-001",
  "מספר רכב: 99-002-18",
  "תיקון פח וצבע — דלת קדמית ימין 3,200.00",
  "החלפת פנס אחורי 650.00",
  'מע"מ 18% 693.00',
  'סה"כ לתשלום: 4,543.00 ₪',
].join("\n");

const bytes = Deno.readFileSync(`${Deno.args[0]}/invoice.png`);
const doc: RunDoc = { id: "QA-DOC-INVOICE", claim_id: "DAL-QA-AI-001", content_sha256: "f".repeat(64), original_name: "FICTITIOUS-invoice-scan.png", mime_type: "image/png", byte_size: bytes.length, created_at: new Date().toISOString(), doc_meta: {} };
let sentMime = "";
const saved: Record<string, string> = {};
const t0 = performance.now();
const summary = await runServerRead([doc], {
  elapsedMs: () => performance.now() - t0,
  download: async () => bytes,
  extractText: async () => "",
  ocr: async (_b, mime) => { sentMime = mime; return { kind: "document", text: OCR_TEXT }; },
  save: async (_d, read, job) => { Object.assign(saved, read, job); return true; },
}, { customerApproved: true, ocrApproved: true });
console.log("summary:", JSON.stringify(summary), "| mime sent to OCR:", sentMime);
const label = documentLabel(saved);
console.log(`status=${saved.read_status} source=${saved.read_source} type=${saved.read_doc_type}`);
console.log(`claim=${saved.read_claim_nums} | plate=${saved.read_plates} | date=${saved.read_dates} | amounts=${saved.read_amounts} | title=${label?.title}`);

// A damage photo must not get invented document details.
const photo: Record<string, string> = {};
await runServerRead([{ ...doc, id: "QA-PHOTO", original_name: "car.jpg", mime_type: "image/jpeg" }], {
  elapsedMs: () => 0, download: async () => bytes, extractText: async () => "",
  ocr: async () => ({ kind: "vehicle_photo", text: "" }),
  save: async (_d, read, job) => { Object.assign(photo, read, job); return true; },
}, { customerApproved: true, ocrApproved: true });
console.log(`photo: status=${photo.read_status} type=${photo.read_doc_type} amounts=${photo.read_amounts ?? "-"}`);
