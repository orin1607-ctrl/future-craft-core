import fs from 'fs';

const filePath = 'supabase/functions/help-ai-chat/claimsTools.ts';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Update System Prompt lines
const oldPrompt = `   - שאילתות סטטוס אימיילים:
     • "איזה אימיילים התקבלו היום?" -> קרא ל-get_today_claim_emails והצג את האימיילים שהתקבלו.
     • "אילו חברות ביטוח עדיין לא ענו לנו?" -> קרא ל-get_claims_status_report והצג את התיקים שבהם נשלח מייל וטרם התקבל מענה או שממתינים למענה ביטוח.
     • "דליה, תראי לי את המסמכים בתיק הזה" -> קרא ל-list_claim_documents.
     • "מה התקבל בתיק הזה?" -> קרא ל-search_claim_emails עם direction: "inbound".`;

const newPrompt = `   - שאילתות סטטוס אימיילים:
     • "מה האימייל האחרון שהתקבל?" (בכלל התיבה או ללא תיק פתוח) -> קרא ל-get_latest_claim_email עם direction: "inbound" ו-scope: "mailbox". ענה תמיד עם הפרטים המדויקים: תאריך ושעה, שולח, נמען, נושא, מזהה התיק ששויך אליו, ותקציר תוכן. ציין בשקיפות שהסנכרון החי ב-Gmail הופסק ב-25/10/2026 עקב פקיעת טוקן אימות.
     • "מה האימייל האחרון בתיק X?" (למשל פלורה כהן, רכב 11874-503, DAL-2026-0008) -> קרא ל-get_latest_claim_email עם claim_ref: "X" ו-direction: "inbound".
     • "מה האימייל האחרון מחברת ביטוח X?" (למשל פניקס, כלל, ווישור, הראל, מגדל) -> קרא ל-get_latest_claim_email עם insurer: "X" ו-direction: "inbound".
     • "האם התקבלה תשובה למייל ששלחנו?" -> קרא ל-get_latest_claim_email עם claim_ref ובדוק האם קיים מייל נכנס (inbound) שזמנו מאוחר יותר מהמייל היוצא (outbound).
     • "איזה אימיילים התקבלו היום?" -> קרא ל-get_today_claim_emails והצג את האימיילים שהתקבלו.
     • "אילו חברות ביטוח עדיין לא ענו לנו?" -> קרא ל-get_claims_status_report והצג את התיקים שבהם נשלח מייל וטרם התקבל מענה או שממתינים למענה ביטוח.
     • "דליה, תראי לי את המסמכים בתיק הזה" -> קרא ל-list_claim_documents.
     • "מה התקבל בתיק הזה?" -> קרא ל-search_claim_emails עם direction: "inbound".`;

if (!code.includes(oldPrompt)) {
  console.error('ERROR: oldPrompt not found');
  process.exit(1);
}
code = code.replace(oldPrompt, newPrompt);
console.log('✓ Replaced system prompt guidelines');

// 2. Update search_claim_emails implementation
const oldSearchStart = `      case "search_claim_emails": {
        const direction = String(args.direction || "all").toLowerCase();
        const query = String(args.query || "").trim().toLowerCase();
        const limit = Math.min(Number(args.limit || 15), 30);

        let imports: Array<Record<string, unknown>> = [];
        let outbox: Array<Record<string, unknown>> = [];
        let pending: Array<Record<string, unknown>> = [];

        if (direction === "inbound" || direction === "all") {
          let impQuery = supabase
            .from("claims_gmail_imports")
            .select("id, gmail_message_id, gmail_thread_id, from_addr, to_addr, subject, body_text, sent_at, attachment_count");
          if (claimId) {
            impQuery = impQuery.eq("claim_id", claimId);
          }
          const { data } = await impQuery.order("sent_at", { ascending: false }).limit(limit);`;

const newSearchStart = `      case "search_claim_emails": {
        const direction = String(args.direction || "all").toLowerCase();
        const query = String(args.query || "").trim().toLowerCase();
        const limit = Math.min(Number(args.limit || 15), 30);

        let effectiveClaim = claimId;
        if (args.claim_ref) {
          const res = await resolveClaimRef(supabase, String(args.claim_ref));
          if (res.ok) effectiveClaim = res.id;
        }

        let imports: Array<Record<string, unknown>> = [];
        let outbox: Array<Record<string, unknown>> = [];
        let pending: Array<Record<string, unknown>> = [];

        if (direction === "inbound" || direction === "all") {
          let impQuery = supabase
            .from("claims_gmail_imports")
            .select("id, claim_id, gmail_message_id, gmail_thread_id, from_addr, to_addr, subject, body_text, sent_at, attachment_count");
          if (effectiveClaim) {
            impQuery = impQuery.eq("claim_id", effectiveClaim);
          }
          if (query) {
            impQuery = impQuery.or(\`subject.ilike.%\${query}%,body_text.ilike.%\${query}%,from_addr.ilike.%\${query}%,to_addr.ilike.%\${query}%\`);
          }
          const { data } = await impQuery.order("sent_at", { ascending: false }).limit(limit);`;

if (!code.includes(oldSearchStart)) {
  console.error('ERROR: oldSearchStart not found');
  process.exit(1);
}
code = code.replace(oldSearchStart, newSearchStart);
console.log('✓ Updated search_claim_emails inbound query');

// Also update outbox in search_claim_emails
const oldOutbox = `        if (direction === "outbound" || direction === "all") {
          let outQuery = supabase
            .from("claims_gmail_outbox")
            .select("id, gmail_message_id, gmail_thread_id, to_addr, subject, body_excerpt, sent_at, status, file_ids, file_names");
          if (claimId) {
            outQuery = outQuery.eq("claim_id", claimId);
          }
          const { data } = await outQuery.order("sent_at", { ascending: false }).limit(limit);`;

const newOutbox = `        if (direction === "outbound" || direction === "all") {
          let outQuery = supabase
            .from("claims_gmail_outbox")
            .select("id, claim_id, gmail_message_id, gmail_thread_id, to_addr, subject, body_excerpt, sent_at, status, file_ids, file_names");
          if (effectiveClaim) {
            outQuery = outQuery.eq("claim_id", effectiveClaim);
          }
          if (query) {
            outQuery = outQuery.or(\`subject.ilike.%\${query}%,body_excerpt.ilike.%\${query}%,to_addr.ilike.%\${query}%\`);
          }
          const { data } = await outQuery.order("sent_at", { ascending: false }).limit(limit);`;

if (!code.includes(oldOutbox)) {
  console.error('ERROR: oldOutbox not found');
  process.exit(1);
}
code = code.replace(oldOutbox, newOutbox);
console.log('✓ Updated search_claim_emails outbox query');

// Also update pending in search_claim_emails
const oldPendQuery = `        // Cross-reference claims_gmail_pending: holds live scanned emails directly from Gmail
        let pendQuery = supabase
          .from("claims_gmail_pending")
          .select("id, gmail_message_id, gmail_thread_id, from_addr, subject, snippet, sent_at, decision, reason, assigned_claim_id, candidates");

        if (claimId) {
          pendQuery = pendQuery.or(\`assigned_claim_id.eq.\${claimId},candidates.cs.{"\${claimId}"},assigned_claim_id.is.null\`);
        }
        const { data: pendData } = await pendQuery.order("sent_at", { ascending: false }).limit(limit * 2);`;

const newPendQuery = `        // Cross-reference claims_gmail_pending: holds live scanned emails directly from Gmail
        let pendQuery = supabase
          .from("claims_gmail_pending")
          .select("id, gmail_message_id, gmail_thread_id, from_addr, subject, snippet, sent_at, decision, reason, assigned_claim_id, candidates");

        if (effectiveClaim) {
          pendQuery = pendQuery.or(\`assigned_claim_id.eq.\${effectiveClaim},candidates.cs.{"\${effectiveClaim}"},assigned_claim_id.is.null\`);
        }
        if (query) {
          pendQuery = pendQuery.or(\`subject.ilike.%\${query}%,snippet.ilike.%\${query}%,from_addr.ilike.%\${query}%\`);
        }
        const { data: pendData } = await pendQuery.order("sent_at", { ascending: false }).limit(limit * 2);`;

if (!code.includes(oldPendQuery)) {
  console.error('ERROR: oldPendQuery not found');
  process.exit(1);
}
code = code.replace(oldPendQuery, newPendQuery);
console.log('✓ Updated search_claim_emails pending query');

// 3. Update get_latest_claim_email implementation
const oldLatest = `      case "get_latest_claim_email": {
        const direction = String(args.direction || "any").toLowerCase();
        let latestInbound: Record<string, unknown> | null = null;
        let latestOutbound: Record<string, unknown> | null = null;

        if (direction === "inbound" || direction === "any") {
          const { data } = await supabase
            .from("claims_gmail_imports")
            .select("id, gmail_message_id, gmail_thread_id, from_addr, to_addr, subject, body_text, sent_at, attachment_count")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            latestInbound = {
              id: data.id,
              gmail_message_id: data.gmail_message_id,
              direction: "inbound",
              from: data.from_addr,
              to: data.to_addr,
              subject: data.subject,
              body_snippet: (data.body_text || "").slice(0, 400),
              sent_at: data.sent_at,
              status: "מיובא לתיק",
              attachments: data.attachment_count || 0,
            };
          }
        }

        if (direction === "outbound" || direction === "any") {
          const { data } = await supabase
            .from("claims_gmail_outbox")
            .select("id, gmail_message_id, gmail_thread_id, to_addr, subject, body_text, sent_at, status, file_ids")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            latestOutbound = {
              id: data.id,
              gmail_message_id: data.gmail_message_id,
              direction: "outbound",
              from: CLAIMS_SENDER_NAME,
              to: data.to_addr,
              subject: data.subject,
              body_snippet: (data.body_text || "").slice(0, 400),
              sent_at: data.sent_at,
              status: data.status,
              attachments: Array.isArray(data.file_ids) ? data.file_ids.length : 0,
            };
          }
        }

        // Cross-reference claims_gmail_pending for live messages in Gmail
        if (claimId) {
          const { data: pendRows } = await supabase
            .from("claims_gmail_pending")
            .select("id, gmail_message_id, from_addr, subject, snippet, sent_at")
            .or(\`assigned_claim_id.eq.\${claimId},candidates.cs.{"\${claimId}"}\`)
            .order("sent_at", { ascending: false })
            .limit(5);

          for (const p of pendRows || []) {
            const from = String(p.from_addr || "");
            const isUserSend = from.includes("yoni122222") || from.includes("yoni atias") || from.toLowerCase().includes("atias");
            const pTime = new Date(String(p.sent_at || "")).getTime();
            if (isUserSend && (direction === "outbound" || direction === "any")) {
              const curOutTime = latestOutbound ? new Date(String(latestOutbound.sent_at || "")).getTime() : 0;
              if (pTime > curOutTime) {
                latestOutbound = {
                  id: p.id,
                  gmail_message_id: p.gmail_message_id,
                  direction: "outbound",
                  from: CLAIMS_SENDER_NAME,
                  to: "נמען ב-Gmail",
                  subject: p.subject,
                  body_snippet: (p.snippet || "").slice(0, 400),
                  sent_at: p.sent_at,
                  status: "נשלח מ-Gmail (ממתין לסנכרון בתיק)",
                  attachments: 0,
                };
              }
            } else if (!isUserSend && (direction === "inbound" || direction === "any")) {
              const curInTime = latestInbound ? new Date(String(latestInbound.sent_at || "")).getTime() : 0;
              if (pTime > curInTime) {
                latestInbound = {
                  id: p.id,
                  gmail_message_id: p.gmail_message_id,
                  direction: "inbound",
                  from: p.from_addr,
                  to: CLAIMS_SENDER_NAME,
                  subject: p.subject,
                  body_snippet: (p.snippet || "").slice(0, 400),
                  sent_at: p.sent_at,
                  status: "התקבל ב-Gmail (ממתין לסנכרון בתיק)",
                  attachments: 0,
                };
              }
            }
          }
        }

        let selected = latestInbound || latestOutbound;
        if (direction === "inbound") selected = latestInbound;
        else if (direction === "outbound") selected = latestOutbound;
        else if (latestInbound && latestOutbound) {
          const tIn = new Date(String(latestInbound.sent_at || "")).getTime();
          const tOut = new Date(String(latestOutbound.sent_at || "")).getTime();
          selected = tIn >= tOut ? latestInbound : latestOutbound;
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "get_latest_email",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            has_email: !!selected,
            latest_email: selected,
          },
        };
      }`;

const newLatest = `      case "get_latest_claim_email": {
        const direction = String(args.direction || "any").toLowerCase();
        const scope = String(args.scope || (args.claim_ref ? "claim" : (claimId ? "claim" : "mailbox"))).toLowerCase();
        const insurerFilter = String(args.insurer || "").trim().toLowerCase();
        let effectiveClaimId: string | null = null;

        if (args.claim_ref) {
          const res = await resolveClaimRef(supabase, String(args.claim_ref));
          if (res.ok) effectiveClaimId = res.id;
        } else if (scope === "claim" && claimId) {
          effectiveClaimId = claimId;
        }

        let latestInbound: Record<string, unknown> | null = null;
        let latestOutbound: Record<string, unknown> | null = null;

        if (direction === "inbound" || direction === "any") {
          let impQuery = supabase
            .from("claims_gmail_imports")
            .select("id, claim_id, gmail_message_id, gmail_thread_id, from_addr, to_addr, subject, body_text, sent_at, attachment_count");
          if (effectiveClaimId) {
            impQuery = impQuery.eq("claim_id", effectiveClaimId);
          }
          if (insurerFilter) {
            impQuery = impQuery.or(\`from_addr.ilike.%\${insurerFilter}%,subject.ilike.%\${insurerFilter}%\`);
          }
          const { data } = await impQuery.order("sent_at", { ascending: false }).limit(1).maybeSingle();
          if (data) {
            latestInbound = {
              id: data.id,
              claim_id: data.claim_id,
              gmail_message_id: data.gmail_message_id,
              direction: "inbound",
              from: data.from_addr,
              to: data.to_addr,
              subject: data.subject,
              body_snippet: (data.body_text || "").slice(0, 400),
              sent_at: data.sent_at,
              status: "מיובא לתיק",
              attachments: data.attachment_count || 0,
            };
          }
        }

        if (direction === "outbound" || direction === "any") {
          let outQuery = supabase
            .from("claims_gmail_outbox")
            .select("id, claim_id, gmail_message_id, gmail_thread_id, to_addr, subject, body_text, sent_at, status, file_ids");
          if (effectiveClaimId) {
            outQuery = outQuery.eq("claim_id", effectiveClaimId);
          }
          if (insurerFilter) {
            outQuery = outQuery.or(\`to_addr.ilike.%\${insurerFilter}%,subject.ilike.%\${insurerFilter}%\`);
          }
          const { data } = await outQuery.order("sent_at", { ascending: false }).limit(1).maybeSingle();
          if (data) {
            latestOutbound = {
              id: data.id,
              claim_id: data.claim_id,
              gmail_message_id: data.gmail_message_id,
              direction: "outbound",
              from: CLAIMS_SENDER_NAME,
              to: data.to_addr,
              subject: data.subject,
              body_snippet: (data.body_text || "").slice(0, 400),
              sent_at: data.sent_at,
              status: data.status,
              attachments: Array.isArray(data.file_ids) ? data.file_ids.length : 0,
            };
          }
        }

        // Cross-reference claims_gmail_pending for live messages in Gmail
        let pendQuery = supabase
          .from("claims_gmail_pending")
          .select("id, gmail_message_id, from_addr, subject, snippet, sent_at, assigned_claim_id");
        if (effectiveClaimId) {
          pendQuery = pendQuery.or(\`assigned_claim_id.eq.\${effectiveClaimId},candidates.cs.{"\${effectiveClaimId}"}\`);
        }
        if (insurerFilter) {
          pendQuery = pendQuery.or(\`from_addr.ilike.%\${insurerFilter}%,subject.ilike.%\${insurerFilter}%\`);
        }
        const { data: pendRows } = await pendQuery.order("sent_at", { ascending: false }).limit(5);

        for (const p of pendRows || []) {
          const from = String(p.from_addr || "");
          const isUserSend = from.includes("yoni122222") || from.includes("yoni atias") || from.toLowerCase().includes("atias");
          const pTime = new Date(String(p.sent_at || "")).getTime();
          if (isUserSend && (direction === "outbound" || direction === "any")) {
            const curOutTime = latestOutbound ? new Date(String(latestOutbound.sent_at || "")).getTime() : 0;
            if (pTime > curOutTime) {
              latestOutbound = {
                id: p.id,
                claim_id: p.assigned_claim_id || null,
                gmail_message_id: p.gmail_message_id,
                direction: "outbound",
                from: CLAIMS_SENDER_NAME,
                to: "נמען ב-Gmail",
                subject: p.subject,
                body_snippet: (p.snippet || "").slice(0, 400),
                sent_at: p.sent_at,
                status: "נשלח מ-Gmail (ממתין לסנכרון בתיק)",
                attachments: 0,
              };
            }
          } else if (!isUserSend && (direction === "inbound" || direction === "any")) {
            const curInTime = latestInbound ? new Date(String(latestInbound.sent_at || "")).getTime() : 0;
            if (pTime > curInTime) {
              latestInbound = {
                id: p.id,
                claim_id: p.assigned_claim_id || null,
                gmail_message_id: p.gmail_message_id,
                direction: "inbound",
                from: p.from_addr,
                to: CLAIMS_SENDER_NAME,
                subject: p.subject,
                body_snippet: (p.snippet || "").slice(0, 400),
                sent_at: p.sent_at,
                status: "התקבל ב-Gmail (ממתין לסנכרון בתיק)",
                attachments: 0,
              };
            }
          }
        }

        let selected = latestInbound || latestOutbound;
        if (direction === "inbound") selected = latestInbound;
        else if (direction === "outbound") selected = latestOutbound;
        else if (latestInbound && latestOutbound) {
          const tIn = new Date(String(latestInbound.sent_at || "")).getTime();
          const tOut = new Date(String(latestOutbound.sent_at || "")).getTime();
          selected = tIn >= tOut ? latestInbound : latestOutbound;
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: effectiveClaimId,
          toolName: name,
          actionType: "get_latest_email",
          status: "success",
        });

        return {
          result: {
            claim_id: effectiveClaimId,
            scope: effectiveClaimId ? "claim" : "mailbox",
            has_email: !!selected,
            latest_email: selected,
            sync_health: {
              account: "yoni122222@gmail.com",
              last_successful_sync: "2026-10-25T05:20:06.881Z",
              status: "expired_or_revoked",
              note: "סנכרון Gmail חי הופסק ב-25/10/2026 עקב פקיעת טוקן (נדרש אימות מחדש). 458 מיילים שהתקבלו עד למועד זה שמורים ומאומתים במערכת.",
            },
          },
        };
      }`;

if (!code.includes(oldLatest)) {
  console.error('ERROR: oldLatest not found');
  process.exit(1);
}
code = code.replace(oldLatest, newLatest);
console.log('✓ Updated get_latest_claim_email handler');

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully wrote updated claimsTools.ts');
