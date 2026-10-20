// social-meta — Facebook Page + Instagram publishing for the Social Center
// (ניהול שיווק 2 → קידום ברשתות חברתיות). STAGING ONLY.
//
// Security model
// - Every browser route requires header `x-social-key` == SOCIAL_ADMIN_KEY (owner passphrase).
// - Meta tokens live only in public.social_accounts (RLS on, no policies) and never leave this function.
// - oauth/callback is opened by Meta's redirect; it is bound to a one-time social_oauth_sessions row.
// - run-scheduled is called by pg_cron with `x-social-cron` == SOCIAL_CRON_SECRET.
//
// Secrets: META_APP_ID, META_APP_SECRET, SOCIAL_ADMIN_KEY, SOCIAL_CRON_SECRET,
//          optional META_LOGIN_CONFIG_ID, META_GRAPH_VERSION, GEMINI_API_KEY / CLAUDE_API_KEY / OPENAI_API_KEY (AI text).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") || "v23.0"}`;
const FN_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-meta`;
const REDIRECT_URI = `${FN_URL}/oauth/callback`;
const BUCKET = "social-media";
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
];
const ALLOWED_RETURN = /^(https:\/\/orin1607-ctrl\.github\.io|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\//;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-social-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const env = (k: string) => (Deno.env.get(k) || "").trim();

function safeEq(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function graph(path: string, params: Record<string, string> = {}, method = "GET") {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  let init: RequestInit = { method };
  if (method === "GET") Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  else init = { method, body: new URLSearchParams(params) };
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    throw new Error(`Meta: ${e.message || `HTTP ${res.status}`}${e.code ? ` (code ${e.code}${e.error_subcode ? "/" + e.error_subcode : ""})` : ""}`);
  }
  return data;
}

async function business(id: string) {
  const { data } = await db.from("social_businesses").select("id,name,website").eq("id", id).maybeSingle();
  if (!data) throw new Error("עסק לא מוכר");
  return data;
}

/* ---------------- status ---------------- */
async function status(businessId: string) {
  const biz = await business(businessId);
  const { data: accts } = await db.from("social_accounts")
    .select("platform,external_id,name,username,picture_url,connected_at").eq("business_id", businessId);
  const by = (p: string) => (accts || []).find((a) => a.platform === p) || null;
  return {
    business: biz,
    metaAppConfigured: !!(env("META_APP_ID") && env("META_APP_SECRET")),
    redirectUri: REDIRECT_URI,
    facebook: by("facebook"),
    instagram: by("instagram"),
  };
}

/* ---------------- OAuth ---------------- */
async function oauthStart(businessId: string, returnUrl: string) {
  await business(businessId);
  if (!env("META_APP_ID") || !env("META_APP_SECRET")) throw new Error("אפליקציית Meta עדיין לא הוגדרה (META_APP_ID / META_APP_SECRET)");
  if (!ALLOWED_RETURN.test(returnUrl || "")) throw new Error("כתובת חזרה לא מורשית");
  const { data, error } = await db.from("social_oauth_sessions")
    .insert({ business_id: businessId, return_url: returnUrl }).select("id").single();
  if (error) throw error;
  const u = new URL("https://www.facebook.com/dialog/oauth");
  u.searchParams.set("client_id", env("META_APP_ID"));
  u.searchParams.set("redirect_uri", REDIRECT_URI);
  u.searchParams.set("state", data.id);
  u.searchParams.set("response_type", "code");
  // Business-type apps use a Facebook Login for Business configuration that carries the permissions.
  if (env("META_LOGIN_CONFIG_ID")) {
    u.searchParams.set("config_id", env("META_LOGIN_CONFIG_ID"));
    u.searchParams.set("override_default_response_type", "true");
  } else {
    u.searchParams.set("scope", SCOPES.join(","));
    u.searchParams.set("auth_type", "rerequest");
  }
  return { url: u.toString() };
}

async function oauthCallback(url: URL) {
  const state = url.searchParams.get("state") || "";
  const { data: sess } = await db.from("social_oauth_sessions").select("*").eq("id", state).maybeSingle();
  if (!sess || Date.now() - new Date(sess.created_at).getTime() > 20 * 60_000) {
    return new Response("Session expired — חזרו למערכת ונסו שוב.", { status: 400 });
  }
  const back = (q: Record<string, string>) => {
    const r = new URL(sess.return_url);
    Object.entries(q).forEach(([k, v]) => r.searchParams.set(k, v));
    return Response.redirect(r.toString(), 302);
  };
  const metaErr = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (metaErr) {
    await db.from("social_oauth_sessions").update({ error: metaErr }).eq("id", state);
    return back({ social_oauth: "error", social_session: state });
  }
  try {
    const short = await graph("oauth/access_token", {
      client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET"),
      redirect_uri: REDIRECT_URI, code: url.searchParams.get("code") || "",
    });
    const long = await graph("oauth/access_token", {
      grant_type: "fb_exchange_token", client_id: env("META_APP_ID"),
      client_secret: env("META_APP_SECRET"), fb_exchange_token: short.access_token,
    });
    // Page tokens obtained from a long-lived user token do not expire.
    const pages = await graph("me/accounts", {
      access_token: long.access_token, limit: "100",
      fields: "id,name,access_token,picture{url},tasks,instagram_business_account{id,username,name,profile_picture_url}",
    });
    await db.from("social_oauth_sessions").update({ pages: pages.data || [] }).eq("id", state);
    return back({ social_oauth: "ok", social_session: state });
  } catch (e) {
    await db.from("social_oauth_sessions").update({ error: String((e as Error).message) }).eq("id", state);
    return back({ social_oauth: "error", social_session: state });
  }
}

async function sessionPages(sessionId: string) {
  const { data: s } = await db.from("social_oauth_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!s) throw new Error("החיבור לא נמצא — נסו שוב");
  return {
    business_id: s.business_id,
    error: s.error,
    pages: (s.pages || []).map((p: any) => ({
      id: p.id, name: p.name, picture: p.picture?.data?.url || null,
      canPost: !p.tasks || p.tasks.includes("CREATE_CONTENT") || p.tasks.includes("MANAGE"),
      instagram: p.instagram_business_account
        ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username }
        : null,
    })),
  };
}

async function selectPage(sessionId: string, pageId: string) {
  const { data: s } = await db.from("social_oauth_sessions").select("*").eq("id", sessionId).maybeSingle();
  const page = (s?.pages || []).find((p: any) => p.id === pageId);
  if (!s || !page) throw new Error("העמוד לא נמצא בחיבור הזה");
  // A page can belong to one business only — keeps Dalia and Yoni's garage fully separate.
  const { data: other } = await db.from("social_accounts").select("business_id")
    .eq("platform", "facebook").eq("external_id", pageId).neq("business_id", s.business_id).maybeSingle();
  if (other) throw new Error(`העמוד כבר מחובר לעסק אחר (${other.business_id})`);
  const rows: any[] = [{
    business_id: s.business_id, platform: "facebook", external_id: page.id, name: page.name,
    picture_url: page.picture?.data?.url || null, access_token: page.access_token, connected_at: new Date().toISOString(),
  }];
  const ig = page.instagram_business_account;
  if (ig) rows.push({
    business_id: s.business_id, platform: "instagram", external_id: ig.id, name: ig.name || ig.username,
    username: ig.username, picture_url: ig.profile_picture_url || null, access_token: page.access_token,
    connected_at: new Date().toISOString(),
  });
  else await db.from("social_accounts").delete().eq("business_id", s.business_id).eq("platform", "instagram");
  const { error } = await db.from("social_accounts").upsert(rows, { onConflict: "business_id,platform" });
  if (error) throw error;
  // Drop every token copy held in the handshake row.
  await db.from("social_oauth_sessions").delete().eq("id", sessionId);
  return status(s.business_id);
}

async function verify(businessId: string) {
  const { data: accts } = await db.from("social_accounts").select("*").eq("business_id", businessId);
  const out: Record<string, unknown> = {};
  for (const a of accts || []) {
    try {
      if (a.platform === "facebook") {
        const p = await graph(a.external_id, { fields: "id,name,link,fan_count", access_token: a.access_token });
        const perms = await graph("me/permissions", { access_token: a.access_token }).catch(() => null);
        out.facebook = { ok: true, page: p, permissions: perms?.data?.filter((x: any) => x.status === "granted").map((x: any) => x.permission) };
      } else {
        const ig = await graph(a.external_id, { fields: "id,username,media_count", access_token: a.access_token });
        const lim = await graph(`${a.external_id}/content_publishing_limit`, { fields: "quota_usage,config", access_token: a.access_token }).catch(() => null);
        out.instagram = { ok: true, account: ig, publishingLimit: lim?.data?.[0] || null };
      }
    } catch (e) {
      out[a.platform] = { ok: false, error: (e as Error).message };
    }
  }
  return out;
}

/* ---------------- media ---------------- */
async function upload(businessId: string, base64: string, contentType = "image/jpeg") {
  await business(businessId);
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) throw new Error("סוג קובץ לא נתמך");
  const bytes = Uint8Array.from(atob(base64.replace(/^data:[^,]+,/, "")), (c) => c.charCodeAt(0));
  if (bytes.length > 8 * 1024 * 1024) throw new Error("התמונה גדולה מ-8MB");
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  const path = `${businessId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
  return { path, url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

/* ---------------- AI text ---------------- */
async function aiText(businessId: string, brief: string, tone: string, platform: string) {
  const biz = await business(businessId);
  const prompt = `אתה קופירייטר ישראלי לרשתות חברתיות. כתוב פוסט אחד בעברית עבור העסק "${biz.name}"${biz.website ? ` (${biz.website})` : ""}.
נושא / בריף: ${brief}
טון: ${tone || "מקצועי, חם ואמין"}. פלטפורמה: ${platform || "פייסבוק ואינסטגרם"}.
דרישות: פתיח שתופס תשומת לב, 2–4 פסקאות קצרות, קריאה לפעולה ברורה, עד 3 אימוג'ים, ו-3 עד 6 האשטגים בעברית/אנגלית בסוף.
אל תמציא מחירים, טלפונים, כתובות או הבטחות שלא ניתנו בבריף. החזר את טקסט הפוסט בלבד, בלי הסברים.`;

  const errors: string[] = [];
  const gem = env("GEMINI_API_KEY");
  if (gem) {
    for (const model of [env("GEMINI_MODEL"), "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter(Boolean)) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": gem },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8 } }),
        });
        const d = await r.json();
        const t = d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("").trim();
        if (t) return { text: t, engine: `Gemini ${model}` };
        errors.push(`${model}: ${d?.error?.status || r.status}`);
      } catch (e) { errors.push(`${model}: ${(e as Error).message}`); }
    }
  }
  const claude = env("CLAUDE_API_KEY");
  if (claude) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": claude, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: env("SOCIAL_CLAUDE_MODEL") || "claude-haiku-5-5", max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
      });
      const d = await r.json();
      const t = d?.content?.map((c: any) => c.text || "").join("").trim();
      if (t) return { text: t, engine: "Claude" };
      errors.push(`claude: ${d?.error?.message || r.status}`);
    } catch (e) { errors.push(`claude: ${(e as Error).message}`); }
  }
  const oai = env("OPENAI_API_KEY");
  if (oai) {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${oai}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: env("OPENAI_MODEL") || "gpt-4o-mini", messages: [{ role: "user", content: prompt }] }),
      });
      const d = await r.json();
      const t = d?.choices?.[0]?.message?.content?.trim();
      if (t) return { text: t, engine: "OpenAI" };
      errors.push(`openai: ${d?.error?.message || r.status}`);
    } catch (e) { errors.push(`openai: ${(e as Error).message}`); }
  }
  throw new Error("יצירת טקסט AI נכשלה: " + (errors.join(" | ") || "אין מפתח AI מוגדר"));
}

/* ---------------- posts ---------------- */
const POST_COLS = "id,business_id,body,image_url,targets,status,scheduled_at,results,published_at,created_at,updated_at";

async function listPosts(businessId: string) {
  const { data, error } = await db.from("social_posts").select(POST_COLS)
    .eq("business_id", businessId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return { posts: data };
}

async function savePost(p: any) {
  await business(p.business_id);
  const targets = (p.targets || []).filter((t: string) => t === "facebook" || t === "instagram");
  const row: any = {
    business_id: p.business_id, body: String(p.body || ""), image_url: p.image_url || null,
    image_path: p.image_path || null, targets, updated_at: new Date().toISOString(),
    scheduled_at: p.scheduled_at || null, status: p.scheduled_at ? "scheduled" : "draft",
  };
  if (p.id) {
    const { data: cur } = await db.from("social_posts").select("business_id,status").eq("id", p.id).maybeSingle();
    if (!cur || cur.business_id !== p.business_id) throw new Error("הפוסט לא נמצא בעסק הזה");
    if (["published", "publishing"].includes(cur.status)) throw new Error("פוסט שפורסם אינו ניתן לעריכה");
    const { data, error } = await db.from("social_posts").update(row).eq("id", p.id).select(POST_COLS).single();
    if (error) throw error;
    return { post: data };
  }
  const { data, error } = await db.from("social_posts").insert(row).select(POST_COLS).single();
  if (error) throw error;
  return { post: data };
}

async function deletePost(businessId: string, id: string) {
  const { error } = await db.from("social_posts").delete().eq("id", id).eq("business_id", businessId)
    .in("status", ["draft", "scheduled", "failed"]);
  if (error) throw error;
  return { ok: true };
}

async function waitIgContainer(id: string, token: string) {
  for (let i = 0; i < 10; i++) {
    const s = await graph(id, { fields: "status_code,status", access_token: token });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram לא הצליח לעבד את התמונה: ${s.status || s.status_code}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Instagram עדיין מעבד את התמונה — נסו שוב בעוד דקה");
}

async function publishPost(businessId: string, id: string) {
  const { data: post } = await db.from("social_posts").select("*").eq("id", id).eq("business_id", businessId).maybeSingle();
  if (!post) throw new Error("הפוסט לא נמצא");
  if (["published", "publishing"].includes(post.status)) throw new Error("הפוסט כבר פורסם");
  if (!post.targets?.length) throw new Error("לא נבחר ערוץ פרסום");
  await db.from("social_posts").update({ status: "publishing" }).eq("id", id);

  const { data: accts } = await db.from("social_accounts").select("*").eq("business_id", businessId);
  const acct = (p: string) => (accts || []).find((a) => a.platform === p);
  const results: Record<string, any> = { ...(post.results || {}) };

  for (const target of post.targets as string[]) {
    if (results[target]?.ok) continue; // retry only what failed
    const a = acct(target);
    try {
      if (!a) throw new Error(target === "facebook" ? "עמוד פייסבוק לא מחובר" : "חשבון אינסטגרם לא מחובר");
      if (target === "facebook") {
        const r = post.image_url
          ? await graph(`${a.external_id}/photos`, { url: post.image_url, caption: post.body, access_token: a.access_token }, "POST")
          : await graph(`${a.external_id}/feed`, { message: post.body, access_token: a.access_token }, "POST");
        const postId = r.post_id || r.id;
        results.facebook = { ok: true, id: postId, url: `https://www.facebook.com/${postId}`, at: new Date().toISOString() };
      } else {
        if (!post.image_url) throw new Error("פוסט באינסטגרם חייב לכלול תמונה");
        const c = await graph(`${a.external_id}/media`, { image_url: post.image_url, caption: post.body, access_token: a.access_token }, "POST");
        await waitIgContainer(c.id, a.access_token);
        const pub = await graph(`${a.external_id}/media_publish`, { creation_id: c.id, access_token: a.access_token }, "POST");
        const link = await graph(pub.id, { fields: "permalink", access_token: a.access_token }).catch(() => ({}));
        results.instagram = { ok: true, id: pub.id, url: (link as any).permalink || null, at: new Date().toISOString() };
      }
    } catch (e) {
      results[target] = { ok: false, error: (e as Error).message, at: new Date().toISOString() };
    }
  }
  const oks = (post.targets as string[]).filter((t) => results[t]?.ok).length;
  const st = oks === post.targets.length ? "published" : oks ? "partial" : "failed";
  const { data } = await db.from("social_posts").update({
    status: st, results, published_at: oks ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }).eq("id", id).select(POST_COLS).single();
  return { post: data };
}

async function runScheduled() {
  const { data } = await db.from("social_posts").select("id,business_id")
    .eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).limit(10);
  const out = [];
  for (const p of data || []) {
    try { out.push({ id: p.id, status: (await publishPost(p.business_id, p.id)).post?.status }); }
    catch (e) { out.push({ id: p.id, error: (e as Error).message }); }
  }
  return { ran: out.length, out };
}

async function disconnect(businessId: string) {
  await db.from("social_accounts").delete().eq("business_id", businessId);
  return status(businessId);
}

/* ---------------- router ---------------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const route = url.pathname.split("/social-meta/")[1]?.replace(/\/$/, "") || "";

  try {
    if (route === "oauth/callback") return await oauthCallback(url);
    if (route === "run-scheduled") {
      if (!safeEq(req.headers.get("x-social-cron") || "", env("SOCIAL_CRON_SECRET"))) return json({ error: "unauthorized" }, 401);
      return json(await runScheduled());
    }
    if (!safeEq(req.headers.get("x-social-key") || "", env("SOCIAL_ADMIN_KEY"))) {
      return json({ error: "מפתח גישה שגוי או חסר", code: "AUTH" }, 401);
    }
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const biz = String(body.business_id || url.searchParams.get("business_id") || "");

    switch (route) {
      case "ping": return json({ ok: true });
      case "businesses": {
        const { data } = await db.from("social_businesses").select("id,name,website").order("created_at");
        return json({ businesses: data });
      }
      case "status": return json(await status(biz));
      case "oauth/start": return json(await oauthStart(biz, body.return_url));
      case "oauth/pages": return json(await sessionPages(body.session_id));
      case "oauth/select": return json(await selectPage(body.session_id, body.page_id));
      case "verify": return json(await verify(biz));
      case "disconnect": return json(await disconnect(biz));
      case "upload": return json(await upload(biz, body.base64, body.content_type));
      case "ai-text": return json(await aiText(biz, body.brief || "", body.tone || "", body.platform || ""));
      case "posts": return json(await listPosts(biz));
      case "posts/save": return json(await savePost({ ...body, business_id: biz }));
      case "posts/delete": return json(await deletePost(biz, body.id));
      case "posts/publish": return json(await publishPost(biz, body.id));
      default: return json({ error: "route not found", route }, 404);
    }
  } catch (e) {
    console.error(route, e);
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});
