// supabase/functions/help-ai-chat/claimsTools.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface ClaimsPendingAction {
  preview_id: string;
  summary: string;
  tool_name: string;
  action_type: string;
  parameters: Record<string, unknown>;
}

export const CLAIMS_GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "search_claim_emails",
        description: "חיפוש מיילים שנכנסו או יצאו עבור התיק הפתוח (כותרת, תוכן, שולח, נמען, תאריך)",
        parameters: {
          type: "OBJECT",
          properties: {
            direction: {
              type: "STRING",
              description: "כיוון המייל: 'inbound' (נכנסים), 'outbound' (יוצאים), או 'all' (הכל)",
            },
            query: {
              type: "STRING",
              description: "מחרוזת חיפוש בנושא או בתוכן",
            },
            limit: {
              type: "NUMBER",
              description: "מספר תוצאות מקסימלי (ברירת מחדל 15)",
            },
          },
        },
      },
      {
        name: "get_latest_claim_email",
        description: "קבלת המייל האחרון ביותר בתיק (נכנס או יוצא) עם פרטים מלאים ותקציר תוכן",
        parameters: {
          type: "OBJECT",
          properties: {
            direction: {
              type: "STRING",
              description: "כיוון: 'inbound' (המייל הנכנס האחרון), 'outbound' (המייל היוצא האחרון), או 'any' (האחרון ביותר מכל סוג)",
            },
          },
        },
      },
      {
        name: "read_email_content",
        description: "קריאת תוכן מלא של מייל ספציפי בתיק לפי מזהה המייל",
        parameters: {
          type: "OBJECT",
          properties: {
            email_id: {
              type: "STRING",
              description: "מזהה המייל (id)",
            },
            direction: {
              type: "STRING",
              description: "כיוון המייל: 'inbound' או 'outbound'",
            },
          },
          required: ["email_id"],
        },
      },
      {
        name: "get_email_attachments",
        description: "פירוט הקבצים המצורפים למייל ספציפי בתיק (שמות, גדלים, סוגים)",
        parameters: {
          type: "OBJECT",
          properties: {
            email_id: {
              type: "STRING",
              description: "מזהה המייל",
            },
          },
          required: ["email_id"],
        },
      },
      {
        name: "check_insurance_reply",
        description: "בדיקה האם חברת הביטוח ענתה לתיק, מתי ענתה, ומה היה תוכן התשובה האחרונה",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "check_customer_email_sent",
        description: "בדיקה האם נשלח מייל ללקוח התיק, מתי נשלח, מה היה הנושא ומה הסטטוס",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "draft_email_reply",
        description: "הכנת טיוטת תשובה למייל נכנס בתיק (כולל כתובת נמען, נושא Re: וציטוט)",
        parameters: {
          type: "OBJECT",
          properties: {
            import_id: {
              type: "STRING",
              description: "מזהה המייל הנכנס (אופציונלי - ברירת מחדל: המייל הנכנס האחרון)",
            },
          },
        },
      },
      {
        name: "list_claim_documents",
        description: "רשימת כל התמונות והמסמכים הקיימים בתיק הפתוח (תמונות שמאי, חשבוניות, שמאות, רישיון רכב וכו')",
        parameters: {
          type: "OBJECT",
          properties: {
            filter_type: {
              type: "STRING",
              description: "סוג סינון: 'photos' (תמונות בלבד), 'docs' (מסמכים ומסמכי PDF בלבד), או 'all' (הכל)",
            },
          },
        },
      },
      {
        name: "list_claim_share_links",
        description: "רשימת קישורי שיתוף פעילים והיסטוריים שנוצרו עבור התיק (עבור שמאי, ביטוח, לקוח)",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "preview_send_claim_email",
        description: "הכנת תצוגה מקדימה (Preview) לשליחת מייל מתוך התיק דרך Gmail. אם לא צוינו נושא, גוף או מזהי קבצים, המערכת תבחר אוטומטית נושא מתאים, גוף מקצועי ואת תמונות התיק. דורש אישור מפורש של המשתמש לפני שליחה בפועל.",
        parameters: {
          type: "OBJECT",
          properties: {
            to: {
              type: "STRING",
              description: "כתובת מייל הנמען (חובה)",
            },
            cc: {
              type: "STRING",
              description: "כתובת מייל להעתק (אופציונלי)",
            },
            subject: {
              type: "STRING",
              description: "נושא המייל (אופציונלי - ברירת מחדל: נושא מתאים עם מספר התביעה/הרכב)",
            },
            body: {
              type: "STRING",
              description: "תוכן גוף המייל (אופציונלי - ברירת מחדל: נוסח פנייה מקצועי ממוסך אורן)",
            },
            file_ids: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "מזהי קבצים מתוך התיק לצירוף (אופציונלי - אם לא צוין, מצרף אוטומטית את תמונות התיק)",
            },
          },
        },
      },
      {
        name: "preview_create_claim_share_link",
        description: "הכנת תצוגה מקדימה ליצירת קישור שיתוף מאובטח לתמונות ומסמכים בתיק. אם לא צוינו מזהי קבצים ספציפיים, המערכת בוחרת אוטומטית את תמונות התיק. דורש אישור מפורש של המשתמש לפני יצירה.",
        parameters: {
          type: "OBJECT",
          properties: {
            recipient_name: {
              type: "STRING",
              description: "שם הנמען עבורו מיועד הקישור (למשל: שמאי משה כהן, חברת שלמה, הלקוח)",
            },
            recipient_kind: {
              type: "STRING",
              description: "סוג נמען: 'surveyor', 'insurance', 'client', 'garage', או 'other'",
            },
            recipient_email: {
              type: "STRING",
              description: "מייל הנמען (אופציונלי)",
            },
            recipient_phone: {
              type: "STRING",
              description: "טלפון הנמען (אופציונלי)",
            },
            file_ids: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "מזהי הקבצים לשיתוף (אופציונלי - אם לא צוין, נבחרות אוטומטית תמונות התיק)",
            },
            ttl_hours: {
              type: "NUMBER",
              description: "תוקף הקישור בשעות (ברירת מחדל 72)",
            },
          },
          required: ["recipient_name"],
        },
      },
      {
        name: "preview_revoke_claim_share_link",
        description: "הכנת תצוגה מקדימה לביטול קישור שיתוף קיים בתיק. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            share_id: {
              type: "STRING",
              description: "מזהה קישור השיתוף לביטול",
            },
          },
          required: ["share_id"],
        },
      },
      {
        name: "preview_update_claim_status",
        description: "הכנת תצוגה מקדימה לעדכון סטטוס התיק. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            new_status: {
              type: "STRING",
              description: "הסטטוס החדש המבוקש",
            },
            reason: {
              type: "STRING",
              description: "סיבת שינוי הסטטוס",
            },
          },
          required: ["new_status"],
        },
      },
      {
        name: "preview_create_claim_task",
        description: "הכנת תצוגה מקדימה ליצירת משימה חדשה בתיק התביעה. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            task_description: {
              type: "STRING",
              description: "תיאור המשימה לביצוע",
            },
          },
          required: ["task_description"],
        },
      },
      {
        name: "preview_close_claim_task",
        description: "הכנת תצוגה מקדימה לסגירת משימה פתוחה בתיק. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            task_id: {
              type: "STRING",
              description: "מזהה המשימה לסגירה",
            },
          },
          required: ["task_id"],
        },
      },
      {
        name: "preview_add_claim_note",
        description: "הכנת תצוגה מקדימה להוספת הערה להיסטוריית התיק. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            note: {
              type: "STRING",
              description: "תוכן ההערה להוספה לתיק",
            },
          },
          required: ["note"],
        },
      },
    ],
  },
];

export const CLAIMS_SYSTEM_PROMPT_INSTRUCTIONS = `
אתה עוזר AI תפעולי חכם של דליה במודול ניהול תביעות.
התפקיד שלך הוא לסייע למשתמש לעבוד על התיק הפתוח בכל פעולה:
1. מיילים בתיק (Gmail): חיפוש מיילים, הצגת המייל האחרון, בדיקה האם חברת הביטוח ענתה, בדיקה האם נשלח מייל ללקוח, קריאת שרשורים והכנת טיוטות מענה.
2. תמונות ומסמכים: הצגת כל התמונות והמסמכים הקיימים בתיק (שמאות, חשבוניות, רישיון רכב, תמונות שמאי, תמונות מוסך).
3. קישורי שיתוף: הצגת קישורים פעילים, יצירת קישורי שיתוף מאובטחים חדשים לשמאי/ביטוח/לקוח, וביטול קישורים.
4. שליחת מיילים: שליחת מיילים ללקוח או לחברת הביטוח עם קבצים מצורפים מתוך התיק.
5. תפעול התיק: שינוי סטטוס, יצירת וסגירת משימות, הוספת הערות בתיק.

כללי בטיחות ואישורים קריטיים:
- פעולות קריאה (READ): כגון חיפוש מיילים, בדיקת מענה מביטוח, רשימת תמונות/מסמכים, בדיקת קישורים — מבוצעות באופן אוטומטי מיידי דרך הכלים הרלוונטיים. ענה תמיד בעברית ברורה ותמציתית עם הנתונים האמיתיים שנשלפו.
- פעולות כתיבה (WRITE / SEND / REVOKE / UPDATE): כגון שליחת מייל, יצירת קישור שיתוף, ביטול קישור, שינוי סטטוס תיק, יצירת משימה, סגירת משימה, הוספת הערה — אסור לבצע ישירות ללא אישור!
- עבור כל פעולת כתיבה, חובה לקרוא לכלי ה-Preview המתאים (preview_send_claim_email, preview_create_claim_share_link, וכו').
- כלי ה-Preview מכין את הפעולה ומציג למשתמש כרטיס אישור אינטראקטיבי בממשק. בתשובתך, הסבר בעברית מה הכנת ובקש מהמשתמש ללחוץ על "אישור" כדי לבצע.
- לעולם אל תמציא מידע שאינו קיים בתיק. השתמש תמיד בכלים לקבלת נתונים חיים.
`;

export async function recordAiAudit(
  supabase: ReturnType<typeof createClient>,
  entry: {
    userId: string;
    userName?: string;
    claimId?: string | null;
    conversationId?: string | null;
    toolName: string;
    actionType: string;
    userPrompt?: string;
    previewSummary?: string;
    previewPayload?: Record<string, unknown> | null;
    approvedBy?: string | null;
    approvedByName?: string | null;
    executionAction?: string;
    stateBefore?: Record<string, unknown> | null;
    stateAfter?: Record<string, unknown> | null;
    status: "success" | "preview_created" | "approved" | "executed" | "cancelled" | "failed";
    errorMessage?: string | null;
  },
) {
  try {
    await supabase.from("claims_ai_audit_log").insert({
      user_id: entry.userId,
      user_name: entry.userName || "",
      claim_id: entry.claimId || null,
      conversation_id: entry.conversationId || null,
      tool_name: entry.toolName,
      action_type: entry.actionType,
      user_prompt: entry.userPrompt || "",
      preview_summary: entry.previewSummary || null,
      preview_payload: entry.previewPayload || null,
      approved_by: entry.approvedBy || null,
      approved_by_name: entry.approvedByName || null,
      execution_action: entry.executionAction || null,
      state_before: entry.stateBefore || null,
      state_after: entry.stateAfter || null,
      status: entry.status,
      error_message: entry.errorMessage || null,
    });
  } catch (err) {
    console.error("Failed to insert claims_ai_audit_log:", err);
  }
}

export async function executeClaimsTool(
  name: string,
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  userId: string,
  userName: string,
): Promise<{ result: unknown; preview?: ClaimsPendingAction }> {
  try {
    switch (name) {
      case "search_claim_emails": {
        const direction = String(args.direction || "all").toLowerCase();
        const query = String(args.query || "").trim().toLowerCase();
        const limit = Math.min(Number(args.limit || 15), 30);

        let imports: Array<Record<string, unknown>> = [];
        let outbox: Array<Record<string, unknown>> = [];

        if (direction === "inbound" || direction === "all") {
          const { data } = await supabase
            .from("claims_gmail_imports")
            .select("id, gmail_message_id, gmail_thread_id, from_addr, to_addr, subject, body_text, sent_at, attachment_count")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(limit);
          imports = (data || []).map((m) => ({
            id: m.id,
            direction: "inbound",
            from: m.from_addr,
            to: m.to_addr,
            subject: m.subject,
            snippet: (m.body_text || "").slice(0, 200),
            sent_at: m.sent_at,
            attachments: m.attachment_count || 0,
          }));
        }

        if (direction === "outbound" || direction === "all") {
          const { data } = await supabase
            .from("claims_gmail_outbox")
            .select("id, gmail_message_id, gmail_thread_id, to_addr, subject, body_text, sent_at, status, file_ids")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(limit);
          outbox = (data || []).map((m) => ({
            id: m.id,
            direction: "outbound",
            from: "מוסך אורן",
            to: m.to_addr,
            subject: m.subject,
            snippet: (m.body_text || "").slice(0, 200),
            sent_at: m.sent_at,
            status: m.status,
            attachments: Array.isArray(m.file_ids) ? m.file_ids.length : 0,
          }));
        }

        let combined = [...imports, ...outbox].sort((a, b) => {
          return new Date(String(b.sent_at || 0)).getTime() - new Date(String(a.sent_at || 0)).getTime();
        });

        if (query) {
          combined = combined.filter((m) => {
            const subj = String(m.subject || "").toLowerCase();
            const snip = String(m.snippet || "").toLowerCase();
            const from = String(m.from || "").toLowerCase();
            const to = String(m.to || "").toLowerCase();
            return subj.includes(query) || snip.includes(query) || from.includes(query) || to.includes(query);
          });
        }

        return {
          result: {
            claim_id: claimId,
            total_found: combined.length,
            emails: combined.slice(0, limit),
          },
        };
      }

      case "get_latest_claim_email": {
        const direction = String(args.direction || "any").toLowerCase();
        let latestImport: Record<string, unknown> | null = null;
        let latestOutbox: Record<string, unknown> | null = null;

        if (direction === "inbound" || direction === "any") {
          const { data } = await supabase
            .from("claims_gmail_imports")
            .select("id, from_addr, to_addr, subject, body_text, sent_at, attachment_count")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            latestImport = {
              id: data.id,
              direction: "inbound",
              from: data.from_addr,
              to: data.to_addr,
              subject: data.subject,
              snippet: (data.body_text || "").slice(0, 400),
              sent_at: data.sent_at,
              attachments: data.attachment_count || 0,
            };
          }
        }

        if (direction === "outbound" || direction === "any") {
          const { data } = await supabase
            .from("claims_gmail_outbox")
            .select("id, to_addr, subject, body_text, sent_at, status, file_ids")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            latestOutbox = {
              id: data.id,
              direction: "outbound",
              from: "מוסך אורן",
              to: data.to_addr,
              subject: data.subject,
              snippet: (data.body_text || "").slice(0, 400),
              sent_at: data.sent_at,
              status: data.status,
              attachments: Array.isArray(data.file_ids) ? data.file_ids.length : 0,
            };
          }
        }

        let chosen = latestImport;
        if (direction === "outbound") chosen = latestOutbox;
        else if (direction === "any" && latestOutbox && latestImport) {
          const importTime = new Date(String(latestImport.sent_at || 0)).getTime();
          const outboxTime = new Date(String(latestOutbox.sent_at || 0)).getTime();
          chosen = outboxTime > importTime ? latestOutbox : latestImport;
        } else if (direction === "any" && latestOutbox) {
          chosen = latestOutbox;
        }

        if (!chosen) {
          return { result: { found: false, message: "לא נמצאו מיילים בתיק הזה" } };
        }

        return { result: { found: true, email: chosen } };
      }

      case "read_email_content": {
        const emailId = String(args.email_id || "").trim();
        const dir = String(args.direction || "").toLowerCase();

        if (dir === "outbound") {
          const { data } = await supabase
            .from("claims_gmail_outbox")
            .select("id, to_addr, subject, body_text, sent_at, status, file_ids")
            .eq("id", emailId)
            .eq("claim_id", claimId)
            .maybeSingle();
          if (!data) return { result: { error: "מייל יוצא לא נמצא" } };
          return {
            result: {
              id: data.id,
              direction: "outbound",
              from: "מוסך אורן",
              to: data.to_addr,
              subject: data.subject,
              body: data.body_text,
              sent_at: data.sent_at,
              status: data.status,
              file_ids: data.file_ids,
            },
          };
        }

        const { data } = await supabase
          .from("claims_gmail_imports")
          .select("id, from_addr, to_addr, subject, body_text, sent_at, attachment_count, headers_preview")
          .eq("id", emailId)
          .eq("claim_id", claimId)
          .maybeSingle();

        if (!data) return { result: { error: "מייל נכנס לא נמצא" } };

        return {
          result: {
            id: data.id,
            direction: "inbound",
            from: data.from_addr,
            to: data.to_addr,
            subject: data.subject,
            body: data.body_text,
            sent_at: data.sent_at,
            attachment_count: data.attachment_count || 0,
          },
        };
      }

      case "get_email_attachments": {
        const emailId = String(args.email_id || "").trim();
        const { data } = await supabase
          .from("claims_documents")
          .select("id, original_name, doc_kind, mime_type, created_at")
          .eq("claim_id", claimId)
          .eq("source", "gmail");

        return {
          result: {
            claim_id: claimId,
            email_id: emailId,
            attachments: (data || []).map((d) => ({
              id: d.id,
              filename: d.original_name,
              kind: d.doc_kind,
              mime_type: d.mime_type,
              uploaded_at: d.created_at,
            })),
          },
        };
      }

      case "check_insurance_reply": {
        const { data: claim } = await supabase
          .from("claims_records")
          .select("id, plate, client_name, row_data")
          .eq("id", claimId)
          .maybeSingle();

        const insCompany = (claim?.row_data && typeof claim.row_data === "object"
          ? String((claim.row_data as Record<string, unknown>).insCompany || "")
          : "").trim();

        const { data: imports } = await supabase
          .from("claims_gmail_imports")
          .select("id, from_addr, subject, body_text, sent_at")
          .eq("claim_id", claimId)
          .order("sent_at", { ascending: false });

        const insuranceKeywords = [
          "shlomo", "six", "faxtviot", "migdal", "clal", "menora", "phoenix", "fenix",
          "ayalon", "harel", "we-sure", "direct", "bitoach", "ביטוח", "שירביט",
          insCompany.toLowerCase(),
        ].filter(Boolean);

        const matching = (imports || []).filter((m) => {
          const from = String(m.from_addr || "").toLowerCase();
          const subj = String(m.subject || "").toLowerCase();
          return insuranceKeywords.some((kw) => kw.length > 2 && (from.includes(kw) || subj.includes(kw)));
        });

        if (matching.length === 0) {
          return {
            result: {
              replied: false,
              insurance_company: insCompany || "לא הוגדרה",
              message: "לא נמצאו הודעות מחברת הביטוח בתיק זה",
            },
          };
        }

        const latest = matching[0];
        return {
          result: {
            replied: true,
            insurance_company: insCompany || "זוהתה מהמייל",
            latest_reply_date: latest.sent_at,
            from: latest.from_addr,
            subject: latest.subject,
            snippet: (latest.body_text || "").slice(0, 300),
            total_replies_found: matching.length,
          },
        };
      }

      case "check_customer_email_sent": {
        const { data: claim } = await supabase
          .from("claims_records")
          .select("id, client_name, row_data")
          .eq("id", claimId)
          .maybeSingle();

        const row = (claim?.row_data && typeof claim.row_data === "object" ? claim.row_data : {}) as Record<string, unknown>;
        const clientEmail = String(row.clientEmail || row.email || "").trim().toLowerCase();
        const clientName = String(claim?.client_name || row.clientName || "").trim();

        const { data: sends } = await supabase
          .from("claims_gmail_outbox")
          .select("id, to_addr, subject, body_text, sent_at, status")
          .eq("claim_id", claimId)
          .order("sent_at", { ascending: false });

        const matches = (sends || []).filter((s) => {
          const to = String(s.to_addr || "").toLowerCase();
          if (clientEmail && to.includes(clientEmail)) return true;
          return true; // Any outbox on this claim
        });

        return {
          result: {
            client_name: clientName,
            client_email: clientEmail || "לא מוגדר במפורש בכרטיס",
            sent: matches.length > 0,
            total_sent: matches.length,
            latest_sent: matches[0]
              ? {
                  date: matches[0].sent_at,
                  to: matches[0].to_addr,
                  subject: matches[0].subject,
                  status: matches[0].status,
                }
              : null,
          },
        };
      }

      case "draft_email_reply": {
        let importId = String(args.import_id || "").trim();
        let targetImport: Record<string, unknown> | null = null;

        if (importId) {
          const { data } = await supabase
            .from("claims_gmail_imports")
            .select("id, from_addr, subject, body_text, sent_at")
            .eq("id", importId)
            .eq("claim_id", claimId)
            .maybeSingle();
          targetImport = data;
        } else {
          const { data } = await supabase
            .from("claims_gmail_imports")
            .select("id, from_addr, subject, body_text, sent_at")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          targetImport = data;
        }

        if (!targetImport) {
          return { result: { error: "לא נמצא מייל נכנס להכנת תשובה" } };
        }

        const subj = String(targetImport.subject || "").trim();
        const replySubj = subj.toLowerCase().startsWith("re:") ? subj : `Re: ${subj}`;
        const quote = String(targetImport.body_text || "").slice(0, 300);

        return {
          result: {
            import_id: targetImport.id,
            to: targetImport.from_addr,
            subject: replySubj,
            original_date: targetImport.sent_at,
            quoted_snippet: quote,
            suggested_opening: "שלום,\nבהמשך לפנייתכם בנושא תביעה זו,",
          },
        };
      }

      case "list_claim_documents": {
        const filterType = String(args.filter_type || "all").toLowerCase();
        const { data } = await supabase
          .from("claims_documents")
          .select("id, original_name, doc_kind, mime_type, source, created_at")
          .eq("claim_id", claimId)
          .order("created_at", { ascending: false });

        let rows = data || [];
        if (filterType === "photos") {
          rows = rows.filter((d) => {
            const m = String(d.mime_type || "").toLowerCase();
            const k = String(d.doc_kind || "").toLowerCase();
            return m.startsWith("image/") || k.includes("photo") || k.includes("garage_photo") || k.includes("damage");
          });
        } else if (filterType === "docs") {
          rows = rows.filter((d) => {
            const m = String(d.mime_type || "").toLowerCase();
            return m === "application/pdf" || !m.startsWith("image/");
          });
        }

        return {
          result: {
            claim_id: claimId,
            filter_applied: filterType,
            total_count: rows.length,
            files: rows.map((r) => ({
              id: r.id,
              name: r.original_name,
              kind: r.doc_kind,
              mime_type: r.mime_type,
              is_photo: String(r.mime_type || "").startsWith("image/"),
              uploaded_at: r.created_at,
            })),
          },
        };
      }

      case "list_claim_share_links": {
        const { data } = await supabase
          .from("claims_share_links")
          .select("id, recipient_name, recipient_kind, file_ids, expires_at, revoked_at, created_at, open_count")
          .eq("claim_id", claimId)
          .order("created_at", { ascending: false });

        const now = Date.now();
        const links = (data || []).map((l) => {
          const filesCount = Array.isArray(l.file_ids) ? l.file_ids.length : 0;
          const isRevoked = !!l.revoked_at;
          const isExpired = new Date(l.expires_at).getTime() <= now;
          const status = isRevoked ? "revoked" : isExpired ? "expired" : "active";
          return {
            id: l.id,
            recipient_name: l.recipient_name,
            recipient_kind: l.recipient_kind,
            files_count: filesCount,
            expires_at: l.expires_at,
            status,
            opened_times: l.open_count || 0,
            created_at: l.created_at,
          };
        });

        return {
          result: {
            claim_id: claimId,
            total: links.length,
            links,
          },
        };
      }

      // PREVIEW / WRITE TOOLS
      case "preview_send_claim_email": {
        let to = String(args.to || "").trim();
        const cc = String(args.cc || "").trim();
        let subject = String(args.subject || "").trim();
        let body = String(args.body || "").trim();
        let fileIds = Array.isArray(args.file_ids) ? (args.file_ids as string[]) : [];

        if (!to) {
          const { data: claim } = await supabase
            .from("claims_records")
            .select("client_name, row_data")
            .eq("id", claimId)
            .maybeSingle();
          const row = (claim?.row_data && typeof claim.row_data === "object" ? claim.row_data : {}) as Record<string, unknown>;
          to = String(row.clientEmail || row.email || "").trim() || (claim?.client_name ? `${claim.client_name}` : "לקוח התיק");
        }

        if (!subject) {
          subject = `מסמכים ותמונות עבור תביעה ${claimId}`;
        }
        if (!body) {
          body = "שלום,\nמצורפים המסמכים והתמונות בנושא תביעה זו.\nבברכה,\nמוסך אורן";
        }

        if (fileIds.length === 0) {
          const { data: docs } = await supabase
            .from("claims_documents")
            .select("id, original_name, mime_type, doc_kind")
            .eq("claim_id", claimId)
            .order("created_at", { ascending: false });
          const photos = (docs || []).filter((d) => {
            const m = String(d.mime_type || "").toLowerCase();
            const k = String(d.doc_kind || "").toLowerCase();
            return m.startsWith("image/") || k.includes("photo") || k.includes("damage");
          });
          const chosen = photos.length > 0 ? photos : (docs || []);
          fileIds = chosen.slice(0, 15).map((d) => d.id);
        }

        let fileNames: string[] = [];
        if (fileIds.length > 0) {
          const { data: docs } = await supabase
            .from("claims_documents")
            .select("id, original_name")
            .eq("claim_id", claimId)
            .in("id", fileIds);
          fileNames = (docs || []).map((d) => d.original_name);
        }

        const previewId = crypto.randomUUID();
        const summary = `שליחת מייל אל ${to} בנושא "${subject}" (${fileIds.length > 0 ? `${fileIds.length} קבצים מצורפים: ${fileNames.join(", ")}` : "ללא קבצים מצורפים"})`;

        const pendingAction: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "send_email",
          parameters: {
            claim_id: claimId,
            to,
            cc,
            subject,
            body,
            file_ids: fileIds,
            file_names: fileNames,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "send_email",
          previewSummary: summary,
          previewPayload: pendingAction.parameters,
          status: "preview_created",
        });

        return {
          result: {
            is_preview: true,
            preview_id: previewId,
            summary,
            status: "waiting_for_user_approval",
            message: "התצוגה המקדימה מוכנה. הפעולה תבוצע רק לאחר שהמשתמש יאשר אותה במפורש בצ'אט.",
          },
          preview: pendingAction,
        };
      }

      case "preview_create_claim_share_link": {
        const recipientName = String(args.recipient_name || "").trim();
        const recipientKind = String(args.recipient_kind || "surveyor").trim();
        const recipientEmail = String(args.recipient_email || "").trim();
        const recipientPhone = String(args.recipient_phone || "").trim();
        let fileIds = Array.isArray(args.file_ids) ? (args.file_ids as string[]) : [];
        const ttlHours = Number(args.ttl_hours || 72);

        if (!recipientName) return { result: { error: "שם נמען חובה" } };

        if (fileIds.length === 0) {
          const { data: docs } = await supabase
            .from("claims_documents")
            .select("id, original_name, mime_type, doc_kind")
            .eq("claim_id", claimId)
            .order("created_at", { ascending: false });
          const photos = (docs || []).filter((d) => {
            const m = String(d.mime_type || "").toLowerCase();
            const k = String(d.doc_kind || "").toLowerCase();
            return m.startsWith("image/") || k.includes("photo") || k.includes("damage");
          });
          const chosen = photos.length > 0 ? photos : (docs || []);
          fileIds = chosen.slice(0, 20).map((d) => d.id);
        }

        if (fileIds.length === 0) return { result: { error: "לא נמצאו קבצים בתיק לשיתוף" } };

        let fileNames: string[] = [];
        const { data: docs } = await supabase
          .from("claims_documents")
          .select("id, original_name")
          .eq("claim_id", claimId)
          .in("id", fileIds);
        fileNames = (docs || []).map((d) => d.original_name);

        const previewId = crypto.randomUUID();
        const summary = `יצירת קישור שיתוף מאובטח עבור ${recipientName} (${fileIds.length} קבצים: ${fileNames.join(", ")}, תוקף: ${ttlHours} שעות)`;

        const pendingAction: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "create_share_link",
          parameters: {
            claim_id: claimId,
            recipient_name: recipientName,
            recipient_kind: recipientKind,
            recipient_email: recipientEmail,
            recipient_phone: recipientPhone,
            file_ids: fileIds,
            file_names: fileNames,
            ttl_hours: ttlHours,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "create_share_link",
          previewSummary: summary,
          previewPayload: pendingAction.parameters,
          status: "preview_created",
        });

        return {
          result: {
            is_preview: true,
            preview_id: previewId,
            summary,
            status: "waiting_for_user_approval",
            message: "התצוגה המקדימה מוכנה. הפעולה תבוצע רק לאחר שהמשתמש יאשר אותה במפורש בצ'אט.",
          },
          preview: pendingAction,
        };
      }

      case "preview_revoke_claim_share_link": {
        const shareId = String(args.share_id || "").trim();
        if (!shareId) return { result: { error: "מזהה קישור שיתוף חובה" } };

        const { data: share } = await supabase
          .from("claims_share_links")
          .select("id, recipient_name")
          .eq("id", shareId)
          .eq("claim_id", claimId)
          .maybeSingle();

        const recName = share?.recipient_name || shareId;
        const previewId = crypto.randomUUID();
        const summary = `ביטול קישור השיתוף המאובטח עבור ${recName} (מזהה: ${shareId})`;

        const pendingAction: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "revoke_share_link",
          parameters: {
            claim_id: claimId,
            share_id: shareId,
            recipient_name: recName,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "revoke_share_link",
          previewSummary: summary,
          previewPayload: pendingAction.parameters,
          status: "preview_created",
        });

        return {
          result: {
            is_preview: true,
            preview_id: previewId,
            summary,
            status: "waiting_for_user_approval",
          },
          preview: pendingAction,
        };
      }

      case "preview_update_claim_status": {
        const newStatus = String(args.new_status || "").trim();
        const reason = String(args.reason || "").trim();
        if (!newStatus) return { result: { error: "סטטוס חדש חובה" } };

        const { data: claim } = await supabase
          .from("claims_records")
          .select("id, status")
          .eq("id", claimId)
          .maybeSingle();

        const oldStatus = claim?.status || "לא ידוע";
        const previewId = crypto.randomUUID();
        const summary = `שינוי סטטוס התיק מ-"${oldStatus}" ל-"${newStatus}"${reason ? ` (סיבה: ${reason})` : ""}`;

        const pendingAction: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "update_status",
          parameters: {
            claim_id: claimId,
            old_status: oldStatus,
            new_status: newStatus,
            reason,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "update_status",
          previewSummary: summary,
          previewPayload: pendingAction.parameters,
          status: "preview_created",
        });

        return {
          result: {
            is_preview: true,
            preview_id: previewId,
            summary,
            status: "waiting_for_user_approval",
          },
          preview: pendingAction,
        };
      }

      case "preview_create_claim_task": {
        const taskDescription = String(args.task_description || "").trim();
        if (!taskDescription) return { result: { error: "תיאור משימה חובה" } };

        const previewId = crypto.randomUUID();
        const summary = `יצירת משימה חדשה בתיק: "${taskDescription}"`;

        const pendingAction: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "create_task",
          parameters: {
            claim_id: claimId,
            task_description: taskDescription,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "create_task",
          previewSummary: summary,
          previewPayload: pendingAction.parameters,
          status: "preview_created",
        });

        return {
          result: {
            is_preview: true,
            preview_id: previewId,
            summary,
            status: "waiting_for_user_approval",
          },
          preview: pendingAction,
        };
      }

      case "preview_close_claim_task": {
        const taskId = String(args.task_id || "").trim();
        if (!taskId) return { result: { error: "מזהה משימה חובה" } };

        const { data: task } = await supabase
          .from("claims_tasks")
          .select("id, row_data")
          .eq("id", taskId)
          .eq("claim_id", claimId)
          .maybeSingle();

        const taskRow = (task?.row_data && typeof task.row_data === "object" ? task.row_data : {}) as Record<string, unknown>;
        const taskDesc = String(taskRow.action || taskId);
        const previewId = crypto.randomUUID();
        const summary = `סגירת משימה בתיק: "${taskDesc}"`;

        const pendingAction: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "close_task",
          parameters: {
            claim_id: claimId,
            task_id: taskId,
            task_description: taskDesc,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "close_task",
          previewSummary: summary,
          previewPayload: pendingAction.parameters,
          status: "preview_created",
        });

        return {
          result: {
            is_preview: true,
            preview_id: previewId,
            summary,
            status: "waiting_for_user_approval",
          },
          preview: pendingAction,
        };
      }

      case "preview_add_claim_note": {
        const note = String(args.note || "").trim();
        if (!note) return { result: { error: "תוכן הערה חובה" } };

        const previewId = crypto.randomUUID();
        const summary = `הוספת הערה להיסטוריית התיק: "${note}"`;

        const pendingAction: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "add_note",
          parameters: {
            claim_id: claimId,
            note,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "add_note",
          previewSummary: summary,
          previewPayload: pendingAction.parameters,
          status: "preview_created",
        });

        return {
          result: {
            is_preview: true,
            preview_id: previewId,
            summary,
            status: "waiting_for_user_approval",
          },
          preview: pendingAction,
        };
      }

      default:
        return { result: { error: `כלי לא מוכר: ${name}` } };
    }
  } catch (err) {
    console.error(`Error executing tool ${name}:`, err);
    return { result: { error: err instanceof Error ? err.message : "שגיאה בביצוע הכלי" } };
  }
}

export async function executeClaimsPendingAction(
  supabase: ReturnType<typeof createClient>,
  pending: ClaimsPendingAction,
  userId: string,
  userName: string,
  authHeader: string,
): Promise<{ success: boolean; message: string; data?: unknown; error?: string }> {
  const { action_type, parameters, preview_id, summary } = pending;
  const claimId = String(parameters.claim_id || "");

  if (!claimId) {
    return { success: false, message: "מזהה תיק חסר", error: "missing_claim_id" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

  try {
    switch (action_type) {
      case "send_email": {
        const to = String(parameters.to || "");
        const cc = String(parameters.cc || "");
        const subject = String(parameters.subject || "");
        const body = String(parameters.body || "");
        const fileIds = Array.isArray(parameters.file_ids) ? parameters.file_ids : [];

        // Call claims-gmail edge function with caller's auth header
        const res = await fetch(`${supabaseUrl}/functions/v1/claims-gmail`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({
            action: "send_claim",
            confirm: true,
            claim_id: claimId,
            to,
            cc,
            subject,
            body,
            file_ids: fileIds,
            idempotency_key: `ai-send-${preview_id.slice(0, 16)}`,
          }),
        });

        const data = await res.json().catch(() => ({ error: "שגיאה בתשובה משרת המייל" }));
        if (!res.ok || data.success === false) {
          const errMsg = data.error || data.message || `שגיאת שליחה ${res.status}`;
          await recordAiAudit(supabase, {
            userId,
            userName,
            claimId,
            toolName: "preview_send_claim_email",
            actionType: "send_email",
            previewSummary: summary,
            previewPayload: parameters,
            approvedBy: userId,
            approvedByName: userName,
            executionAction: "send_claim",
            status: "failed",
            errorMessage: errMsg,
          });
          return { success: false, message: `שליחת המייל נכשלה: ${errMsg}`, error: errMsg };
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_send_claim_email",
          actionType: "send_email",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "send_claim",
          stateAfter: { outbox_id: data.outbox_id, gmail_message_id: data.gmail_message_id },
          status: "executed",
        });

        return {
          success: true,
          message: `המייל נשלח בהצלחה דרך Gmail אל ${to}`,
          data,
        };
      }

      case "create_share_link": {
        const res = await fetch(`${supabaseUrl}/functions/v1/claims-docs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({
            action: "create_share",
            claim_id: claimId,
            recipient_name: parameters.recipient_name,
            recipient_kind: parameters.recipient_kind,
            recipient_email: parameters.recipient_email || "",
            recipient_phone: parameters.recipient_phone || "",
            file_ids: parameters.file_ids,
            ttl_hours: parameters.ttl_hours || 72,
          }),
        });

        const data = await res.json().catch(() => ({ error: "שגיאה ביצירת הקישור" }));
        if (!res.ok || data.success === false) {
          const errMsg = data.error || data.message || `שגיאה ${res.status}`;
          await recordAiAudit(supabase, {
            userId,
            userName,
            claimId,
            toolName: "preview_create_claim_share_link",
            actionType: "create_share_link",
            previewSummary: summary,
            previewPayload: parameters,
            approvedBy: userId,
            approvedByName: userName,
            status: "failed",
            errorMessage: errMsg,
          });
          return { success: false, message: `יצירת הקישור נכשלה: ${errMsg}`, error: errMsg };
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_create_claim_share_link",
          actionType: "create_share_link",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "create_share",
          stateAfter: { share_id: data.id, url: data.url },
          status: "executed",
        });

        return {
          success: true,
          message: `קישור השיתוף המאובטח נוצר בהצלחה עבור ${parameters.recipient_name}`,
          data,
        };
      }

      case "revoke_share_link": {
        const res = await fetch(`${supabaseUrl}/functions/v1/claims-docs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({
            action: "revoke_share",
            claim_id: claimId,
            share_id: parameters.share_id,
          }),
        });

        const data = await res.json().catch(() => ({ error: "שגיאה בביטול הקישור" }));
        if (!res.ok || data.success === false) {
          const errMsg = data.error || data.message || `שגיאה ${res.status}`;
          await recordAiAudit(supabase, {
            userId,
            userName,
            claimId,
            toolName: "preview_revoke_claim_share_link",
            actionType: "revoke_share_link",
            previewSummary: summary,
            status: "failed",
            errorMessage: errMsg,
          });
          return { success: false, message: `ביטול הקישור נכשל: ${errMsg}`, error: errMsg };
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_revoke_claim_share_link",
          actionType: "revoke_share_link",
          previewSummary: summary,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "revoke_share",
          status: "executed",
        });

        return {
          success: true,
          message: `קישור השיתוף בוטל בהצלחה`,
          data,
        };
      }

      case "update_status": {
        const newStatus = String(parameters.new_status || "");
        const oldStatus = String(parameters.old_status || "");
        const reason = String(parameters.reason || "");

        const { error: updErr } = await supabase
          .from("claims_records")
          .update({
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", claimId);

        if (updErr) {
          return { success: false, message: `עדכון הסטטוס נכשל: ${updErr.message}`, error: updErr.message };
        }

        const histId = `H-${Date.now()}`;
        await supabase.from("claims_history").insert({
          id: histId,
          claim_id: claimId,
          row_data: {
            action: "שינוי סטטוס ע''י דליה AI",
            note: reason || `עודכן מ-${oldStatus} ל-${newStatus}`,
            type: "status_change",
            valueBefore: oldStatus,
            valueAfter: newStatus,
            by: userName || "דליה AI",
            at: new Date().toISOString(),
          },
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_update_claim_status",
          actionType: "update_status",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          stateBefore: { status: oldStatus },
          stateAfter: { status: newStatus },
          executionAction: "update_status",
          status: "executed",
        });

        return {
          success: true,
          message: `סטטוס התיק עודכן בהצלחה ל-"${newStatus}"`,
        };
      }

      case "create_task": {
        const taskDesc = String(parameters.task_description || "");
        const taskId = `TSK-${Date.now()}`;

        const taskRow = {
          id: taskId,
          claimId: claimId,
          action: taskDesc,
          done: false,
          workStatus: "open",
          createdAt: new Date().toISOString(),
          createdBy: userName || "דליה AI",
          owner: userName || "דליה AI",
        };

        const { error: insErr } = await supabase.from("claims_tasks").insert({
          id: taskId,
          claim_id: claimId,
          row_data: taskRow,
        });

        if (insErr) {
          return { success: false, message: `יצירת המשימה נכשלה: ${insErr.message}`, error: insErr.message };
        }

        await supabase.from("claims_history").insert({
          id: `H-${Date.now()}`,
          claim_id: claimId,
          row_data: {
            action: "יצירת משימה ע''י דליה AI",
            note: taskDesc,
            type: "task_create",
            by: userName || "דליה AI",
            at: new Date().toISOString(),
          },
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_create_claim_task",
          actionType: "create_task",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          stateAfter: { task_id: taskId, action: taskDesc },
          executionAction: "create_task",
          status: "executed",
        });

        return {
          success: true,
          message: `המשימה "${taskDesc}" נוצרה בהצלחה`,
          data: { taskId },
        };
      }

      case "close_task": {
        const taskId = String(parameters.task_id || "");
        const { data: existing } = await supabase
          .from("claims_tasks")
          .select("id, row_data")
          .eq("id", taskId)
          .eq("claim_id", claimId)
          .maybeSingle();

        const row = (existing?.row_data && typeof existing.row_data === "object" ? existing.row_data : {}) as Record<string, unknown>;
        const updatedRow = {
          ...row,
          done: true,
          workStatus: "done",
          closedAt: new Date().toISOString(),
          closedBy: userName || "דליה AI",
        };

        const { error: updErr } = await supabase
          .from("claims_tasks")
          .update({ row_data: updatedRow })
          .eq("id", taskId)
          .eq("claim_id", claimId);

        if (updErr) {
          return { success: false, message: `סגירת המשימה נכשלה: ${updErr.message}`, error: updErr.message };
        }

        await supabase.from("claims_history").insert({
          id: `H-${Date.now()}`,
          claim_id: claimId,
          row_data: {
            action: "סגירת משימה ע''י דליה AI",
            note: String(row.action || taskId),
            type: "task_close",
            by: userName || "דליה AI",
            at: new Date().toISOString(),
          },
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_close_claim_task",
          actionType: "close_task",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "close_task",
          status: "executed",
        });

        return {
          success: true,
          message: `המשימה נסגרה בהצלחה`,
        };
      }

      case "add_note": {
        const note = String(parameters.note || "");
        const histId = `H-${Date.now()}`;

        const { error: insErr } = await supabase.from("claims_history").insert({
          id: histId,
          claim_id: claimId,
          row_data: {
            action: "הערת דליה AI",
            note,
            type: "ai_note",
            by: userName || "דליה AI",
            at: new Date().toISOString(),
          },
        });

        if (insErr) {
          return { success: false, message: `הוספת ההערה נכשלה: ${insErr.message}`, error: insErr.message };
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_add_claim_note",
          actionType: "add_note",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "add_note",
          status: "executed",
        });

        return {
          success: true,
          message: `ההערה נוספה בהצלחה להיסטוריית התיק`,
        };
      }

      default:
        return { success: false, message: `פעולה לא מוכרת: ${action_type}`, error: "unknown_action_type" };
    }
  } catch (err) {
    console.error("executeClaimsPendingAction error:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "שגיאה בביצוע הפעולה",
      error: "execution_error",
    };
  }
}
