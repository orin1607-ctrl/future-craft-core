import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { assertCompanyAccess, edgeCorsHeaders, requireAuth } from "../_shared/edgeAuth.ts";

const corsHeaders = edgeCorsHeaders;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req, { roles: ['super_admin', 'fleet_manager'] });
    if ('error' in auth) return auth.error;
    const { ctx } = auth;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const { to, order } = await req.json();
    if (!to || !order) {
      return new Response(JSON.stringify({ error: "Missing 'to' or 'order'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const denied = assertCompanyAccess(ctx, order.company_name);
    if (denied) return denied;

    const executionDate = order.execution_date
      ? new Date(order.execution_date).toLocaleDateString("he-IL")
      : "לא נקבע";

    const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#2563eb;color:#fff;padding:24px 32px;">
        <h1 style="margin:0;font-size:22px;">הזמנת עבודה ${order.order_number}</h1>
        <p style="margin:8px 0 0;opacity:0.85;font-size:14px;">${order.company_name}</p>
      </div>
      <div style="padding:24px 32px;">
        <p style="font-size:16px;color:#374151;">שלום,</p>
        <p style="font-size:15px;color:#374151;margin-top:8px;">מצורפים פרטי הזמנת העבודה:</p>
        <table dir="rtl" style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold;width:140px;">מספר הזמנה</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${order.order_number}</td></tr>
          <tr><td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold;">תיאור</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${order.description}</td></tr>
          <tr><td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold;">סוג עבודה</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${order.work_type || "—"}</td></tr>
          <tr><td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold;">סכום מאושר</td><td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:bold;color:#2563eb;">₪${Number(order.approved_amount || 0).toLocaleString()}</td></tr>
          <tr><td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold;">תאריך ביצוע</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${executionDate}</td></tr>
          <tr><td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold;">מוציא הזמנה</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${order.ordering_user || "—"}</td></tr>
        </table>
        ${order.notes ? `<p style="font-size:14px;color:#6b7280;border-top:1px dashed #d1d5db;padding-top:12px;"><strong>הערות:</strong> ${order.notes}</p>` : ""}
        <p style="font-size:14px;color:#6b7280;margin-top:20px;">בברכה,<br/>${order.company_name}</p>
      </div>
    </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Fleet System <onboarding@resend.dev>",
        to: [to],
        subject: `הזמנת עבודה ${order.order_number} - ${order.description}`,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Resend error [${res.status}]: ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending supplier order email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
