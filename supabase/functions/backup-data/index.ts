import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALL_TABLES = [
  "profiles", "user_roles", "vehicles", "drivers", "faults", "fault_messages",
  "fault_status_log", "fault_referrals", "expenses", "accidents", "service_orders",
  "service_order_messages", "vehicle_handovers", "vehicle_exchanges", "vehicle_inspections",
  "inspection_items", "routes", "trip_logs", "customers", "customer_deals",
  "customer_agreements", "suppliers", "supplier_work_orders", "companions",
  "vehicle_companions", "custom_alerts", "company_settings", "company_subscriptions", "declaration_templates",
  "document_metadata", "driver_health_declarations", "driver_notifications",
  "internal_messages", "emergency_categories", "emergency_logs", "promotions",
  "system_logs", "temporary_drivers", "dev_tasks", "approval_requests", "work_assignments",
  "work_assignment_messages", "work_assignment_status_log"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user is super_admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden - super_admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type } = await req.json();

    if (type === "data") {
      const backup: Record<string, unknown[]> = {};
      const errors: string[] = [];

      for (const table of ALL_TABLES) {
        try {
          let allRows: unknown[] = [];
          let from = 0;
          const pageSize = 1000;
          let hasMore = true;

          while (hasMore) {
            const { data, error } = await adminClient
              .from(table)
              .select("*")
              .range(from, from + pageSize - 1);

            if (error) {
              errors.push(`${table}: ${error.message}`);
              hasMore = false;
            } else {
              allRows = allRows.concat(data || []);
              hasMore = (data?.length || 0) === pageSize;
              from += pageSize;
            }
          }

          backup[table] = allRows;
        } catch (e) {
          errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      const result = {
        backup_type: "data",
        created_at: new Date().toISOString(),
        tables: backup,
        table_counts: Object.fromEntries(
          Object.entries(backup).map(([k, v]) => [k, v.length])
        ),
        errors: errors.length > 0 ? errors : undefined,
      };

      return new Response(JSON.stringify(result, null, 2), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="backup_data_${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }

    if (type === "files") {
      // List all files in the documents bucket
      const { data: files, error: listError } = await adminClient.storage
        .from("documents")
        .list("", { limit: 10000 });

      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Recursively list all files
      const allFiles: { path: string; size: number; created_at: string }[] = [];

      async function listRecursive(prefix: string) {
        const { data, error } = await adminClient.storage
          .from("documents")
          .list(prefix, { limit: 10000 });

        if (error || !data) return;

        for (const item of data) {
          const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id) {
            // It's a file
            allFiles.push({
              path: fullPath,
              size: (item as any).metadata?.size || 0,
              created_at: item.created_at || "",
            });
          } else {
            // It's a folder
            await listRecursive(fullPath);
          }
        }
      }

      await listRecursive("");

      // Generate signed URLs for each file
      const fileLinks = [];
      for (const file of allFiles) {
        const { data: signedUrl } = await adminClient.storage
          .from("documents")
          .createSignedUrl(file.path, 3600); // 1 hour expiry

        fileLinks.push({
          path: file.path,
          size: file.size,
          created_at: file.created_at,
          download_url: signedUrl?.signedUrl || null,
        });
      }

      const result = {
        backup_type: "files",
        created_at: new Date().toISOString(),
        total_files: fileLinks.length,
        files: fileLinks,
      };

      return new Response(JSON.stringify(result, null, 2), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="backup_files_${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid type. Use "data" or "files"' }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
