import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { edgeCorsHeaders, requireAuth } from "../_shared/edgeAuth.ts";

const corsHeaders = edgeCorsHeaders;

const GOV_API_URL = "https://data.gov.il/api/3/action/datastore_search";
const RESOURCE_ID = "053cea08-09bc-40ec-8f7a-156f0677aff3";

// Simple in-memory cache (24h TTL)
const cache = new Map<string, { data: Record<string, unknown>; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

const FIELD_MAP: Record<string, string> = {
  mispar_rechev: "מספר רכב",
  tozeret_nm: "יצרן",
  degem_nm: "דגם",
  kinuy_mishari: "כינוי מסחרי",
  shnat_yitzur: "שנת ייצור",
  baalut: "סוג בעלות",
  sug_delek_nm: "סוג דלק",
  tzeva_rechev: "צבע",
  tokef_dt: "תוקף רישוי",
  mivchan_acharon_dt: "טסט אחרון",
  misgeret: "מספר שלדה",
  ramat_gimur: "רמת גימור",
  degem_manoa: "דגם מנוע",
  zmig_kidmi: "צמיג קדמי",
  zmig_ahori: "צמיג אחורי",
  moed_aliya_lakvish: "עלייה לכביש",
};

function formatDate(val: string | null): string | null {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toISOString().split("T")[0];
  } catch {
    return val;
  }
}

function mapRecord(record: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  const dateFields = ["tokef_dt", "mivchan_acharon_dt", "moed_aliya_lakvish"];

  for (const [eng, heb] of Object.entries(FIELD_MAP)) {
    let val = record[eng];
    if (val === null || val === undefined || val === "" || val === "None") continue;
    if (dateFields.includes(eng)) {
      val = formatDate(val as string);
    }
    mapped[heb] = val;
  }
  return mapped;
}

async function fetchFromGov(plate: string): Promise<Record<string, unknown> | null> {
  // Try exact filter first
  const plateNum = parseInt(plate, 10);
  const filterBody = {
    resource_id: RESOURCE_ID,
    filters: { mispar_rechev: isNaN(plateNum) ? plate : plateNum },
    limit: 1,
  };

  let res = await fetch(GOV_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filterBody),
  });

  let json = await res.json();
  if (json.success && json.result?.records?.length > 0) {
    return json.result.records[0];
  }

  // Fallback: use q parameter
  const fallbackBody = {
    resource_id: RESOURCE_ID,
    q: plate,
    limit: 1,
  };

  res = await fetch(GOV_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fallbackBody),
  });

  json = await res.json();
  if (json.success && json.result?.records?.length > 0) {
    return json.result.records[0];
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const plate = url.searchParams.get("plate")?.replace(/[-\s]/g, "");

    if (!plate || plate.length < 5) {
      return new Response(
        JSON.stringify({ error: "מספר רכב לא תקין" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cache
    const cached = cache.get(plate);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return new Response(JSON.stringify({ data: cached.data, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const record = await fetchFromGov(plate);

    if (!record) {
      return new Response(
        JSON.stringify({ error: "הרכב לא נמצא" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mapped = mapRecord(record as Record<string, unknown>);

    // Store in cache
    cache.set(plate, { data: mapped, ts: Date.now() });

    return new Response(JSON.stringify({ data: mapped, raw: record }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Vehicle lookup error:", error);
    return new Response(
      JSON.stringify({ error: "שגיאה בחיבור למשרד התחבורה" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
