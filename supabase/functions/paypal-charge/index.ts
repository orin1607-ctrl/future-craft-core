import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { edgeCorsHeaders, requireAuth } from "../_shared/edgeAuth.ts";

const corsHeaders = edgeCorsHeaders;

const PAYPAL_API = "https://api-m.paypal.com"; // Use https://api-m.sandbox.paypal.com for sandbox

async function getPayPalAccessToken(): Promise<string> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const secret = Deno.env.get("PAYPAL_SECRET");
  if (!clientId || !secret) throw new Error("PayPal credentials not configured");

  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal auth failed [${res.status}]: ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function createPayPalOrder(accessToken: string, amount: number, companyName: string, description: string) {
  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "ILS",
            value: amount.toFixed(2),
          },
          description: `${description} - ${companyName}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal create order failed [${res.status}]: ${body}`);
  }

  return await res.json();
}

async function capturePayPalOrder(accessToken: string, orderId: string) {
  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal capture failed [${res.status}]: ${body}`);
  }

  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req, { roles: ['super_admin'], allowInternal: true });
    if ("error" in auth) return auth.error;
    const { ctx } = auth;

    const supabase = ctx.supabaseAdmin;

    const { action, subscription_id, order_id } = await req.json();

    if (action === "charge_all_due") {
      if (!ctx.isInternalCall && ctx.role !== "super_admin") {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Cron job: charge all subscriptions due today
      const today = new Date();
      const dayOfMonth = today.getDate();

      const { data: subs, error: subsError } = await supabase
        .from("company_subscriptions")
        .select("*")
        .eq("status", "active")
        .eq("billing_day", dayOfMonth)
        .gt("monthly_price", 0);

      if (subsError) throw subsError;

      const results = [];
      const accessToken = await getPayPalAccessToken();

      for (const sub of subs || []) {
        try {
          const order = await createPayPalOrder(
            accessToken,
            sub.monthly_price,
            sub.company_name,
            `מנוי חודשי - ${sub.plan_name}`
          );

          // Auto-capture the order
          const capture = await capturePayPalOrder(accessToken, order.id);

          const captureStatus = capture.status;
          const isCompleted = captureStatus === "COMPLETED";

          // Update subscription dates
          const nextDate = new Date(today);
          nextDate.setMonth(nextDate.getMonth() + 1);

          await supabase
            .from("company_subscriptions")
            .update({
              last_payment_date: today.toISOString(),
              next_payment_date: nextDate.toISOString(),
              payment_method: "PayPal",
            })
            .eq("id", sub.id);

          results.push({
            company: sub.company_name,
            status: isCompleted ? "success" : "pending",
            paypal_order_id: order.id,
          });
        } catch (err) {
          results.push({
            company: sub.company_name,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return new Response(JSON.stringify({ charged: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_order") {
      // Manual: create a PayPal order for a specific subscription
      const { data: sub } = await supabase
        .from("company_subscriptions")
        .select("*")
        .eq("id", subscription_id)
        .single();

      if (!sub) throw new Error("Subscription not found");

      const accessToken = await getPayPalAccessToken();
      const order = await createPayPalOrder(
        accessToken,
        sub.monthly_price,
        sub.company_name,
        `מנוי חודשי - ${sub.plan_name}`
      );

      // Find approval URL
      const approvalUrl = order.links?.find((l: any) => l.rel === "approve")?.href;

      return new Response(
        JSON.stringify({ order_id: order.id, approval_url: approvalUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "capture_order") {
      // After user approves, capture the payment
      const accessToken = await getPayPalAccessToken();
      const capture = await capturePayPalOrder(accessToken, order_id);

      if (capture.status === "COMPLETED" && subscription_id) {
        const today = new Date();
        const nextDate = new Date(today);
        nextDate.setMonth(nextDate.getMonth() + 1);

        await supabase
          .from("company_subscriptions")
          .update({
            last_payment_date: today.toISOString(),
            next_payment_date: nextDate.toISOString(),
            payment_method: "PayPal",
          })
          .eq("id", subscription_id);
      }

      return new Response(JSON.stringify({ status: capture.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "test_connection") {
      // Test PayPal credentials
      const accessToken = await getPayPalAccessToken();
      return new Response(
        JSON.stringify({ success: true, message: "PayPal connection successful" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("PayPal charge error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
