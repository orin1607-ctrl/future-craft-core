// social-meta — Facebook Page + Instagram publishing for the Social Center
// (ניהול שיווק 2 → קידום ברשתות חברתיות). STAGING ONLY.
//
// Security model
// - Every browser route requires header `x-social-key`: the owner key (SOCIAL_ADMIN_KEY) or a paired
//   device token (_shared/socialAuth.ts).
// - Meta tokens live only in public.social_accounts (RLS on, no policies) and never leave this function.
// - oauth/callback is opened by Meta's redirect; it is bound to a one-time social_oauth_sessions row.
// - run-scheduled is called by pg_cron with `x-social-cron` == SOCIAL_CRON_SECRET.
//
// Secrets: META_APP_ID, META_APP_SECRET, SOCIAL_ADMIN_KEY, SOCIAL_CRON_SECRET,
//          optional META_LOGIN_CONFIG_ID, META_GRAPH_VERSION, GEMINI_API_KEY / CLAUDE_API_KEY / OPENAI_API_KEY (AI text).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkSocialKey } from "../_shared/socialAuth.ts";

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
const POST_COLS = "id,business_id,body,image_url,image_urls,targets,status,scheduled_at,results,published_at,series_id,test_mode,created_at,updated_at";

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
    business_id: p.business_id, body: String(p.body || ""),
    image_urls: (p.image_urls || (p.image_url ? [p.image_url] : [])).slice(0, 10),
    image_url: (p.image_urls || [])[0] || p.image_url || null,
    image_path: p.image_path || null, targets, updated_at: new Date().toISOString(),
    scheduled_at: p.scheduled_at || null, status: p.scheduled_at ? "scheduled" : "draft",
    series_id: p.series_id || null, test_mode: !!p.test_mode,
  };
  if (row.series_id) {
    const { data: s } = await db.from("post_series").select("business_id,status").eq("id", row.series_id).maybeSingle();
    if (!s || s.business_id !== p.business_id) throw new Error("הסדרה לא נמצאה בעסק הזה");
    if (["cancelled", "completed"].includes(s.status)) throw new Error("הסדרה הסתיימה – צרו סדרה חדשה");
    if (!row.scheduled_at) throw new Error("פוסט בסדרה חייב מועד פרסום");
  }
  if (p.id) {
    const { data: cur } = await db.from("social_posts").select("business_id,status").eq("id", p.id).maybeSingle();
    if (!cur || cur.business_id !== p.business_id) throw new Error("הפוסט לא נמצא בעסק הזה");
    if (["published", "publishing", "partial", "attention"].includes(cur.status)) throw new Error("פוסט שפורסם (או שהפרסום שלו לא הסתיים) אינו ניתן לעריכה");
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
    .in("status", ["draft", "scheduled", "failed", "paused", "cancelled"]);
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

const postImages = (p: any): string[] =>
  (p.image_urls?.length ? p.image_urls : p.image_url ? [p.image_url] : []).slice(0, 10);

// dry = run every Meta call that proves the post would go through, but leave nothing public.
async function publishFacebook(a: any, body: string, images: string[], dry = false) {
  const tok = a.access_token;
  if (dry) {
    const ids = [];
    for (const url of images) ids.push((await graph(`${a.external_id}/photos`, { url, published: "false", access_token: tok }, "POST")).id);
    for (const id of ids) await graph(id, { access_token: tok }, "DELETE");
    return { ok: true, dry: true, photosChecked: ids.length };
  }
  let r;
  if (images.length === 1) {
    r = await graph(`${a.external_id}/photos`, { url: images[0], caption: body, access_token: tok }, "POST");
  } else if (images.length > 1) {
    // Multi-photo post: upload each photo unpublished, then attach them to one feed post.
    const params: Record<string, string> = { message: body, access_token: tok };
    for (let i = 0; i < images.length; i++) {
      const ph = await graph(`${a.external_id}/photos`, { url: images[i], published: "false", access_token: tok }, "POST");
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: ph.id });
    }
    r = await graph(`${a.external_id}/feed`, params, "POST");
  } else {
    r = await graph(`${a.external_id}/feed`, { message: body, access_token: tok }, "POST");
  }
  const postId = r.post_id || r.id;
  return { ok: true, id: postId, url: `https://www.facebook.com/${postId}`, at: new Date().toISOString() };
}

// Meta sometimes answers container creation with a transient "Fatal (code -1)" / code 2; retry those.
async function igCreate(igId: string, params: Record<string, string>) {
  for (let i = 0; ; i++) {
    try { return await graph(`${igId}/media`, params, "POST"); }
    catch (e) {
      if (i >= 2 || !/code (-1|1|2)[/)]/.test((e as Error).message)) throw e;
      await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
    }
  }
}

async function publishInstagram(a: any, body: string, images: string[], dry = false) {
  const tok = a.access_token;
  if (!images.length) throw new Error("פוסט באינסטגרם חייב לכלול תמונה");
  let creation: string;
  if (images.length === 1) {
    creation = (await igCreate(a.external_id, { image_url: images[0], caption: body, access_token: tok })).id;
  } else {
    const children = [];
    for (const url of images) {
      const c = await igCreate(a.external_id, { image_url: url, is_carousel_item: "true", access_token: tok });
      await waitIgContainer(c.id, tok);
      children.push(c.id);
    }
    creation = (await igCreate(a.external_id, { media_type: "CAROUSEL", children: children.join(","), caption: body, access_token: tok })).id;
  }
  await waitIgContainer(creation, tok);
  if (dry) return { ok: true, dry: true, containerReady: creation, items: images.length }; // never published; Meta expires it in 24h
  const pub = await graph(`${a.external_id}/media_publish`, { creation_id: creation, access_token: tok }, "POST");
  const link = await graph(pub.id, { fields: "permalink", access_token: tok }).catch(() => ({}));
  return { ok: true, id: pub.id, url: (link as any).permalink || null, at: new Date().toISOString() };
}

async function publishPost(businessId: string, id: string, opts: { scheduled?: boolean } = {}) {
  const { data: post } = await db.from("social_posts").select("*").eq("id", id).eq("business_id", businessId).maybeSingle();
  if (!post) throw new Error("הפוסט לא נמצא");
  if (!post.targets?.length) throw new Error("לא נבחר ערוץ פרסום");
  // Atomic claim: only one caller (button, cron tick, retry) can move a post into "publishing".
  // A post whose outcome is unknown ("publishing" / "attention") is never picked up again automatically.
  const allowed = opts.scheduled ? ["scheduled"] : ["draft", "scheduled", "failed", "partial", "paused"];
  const claim = await db.from("social_posts").update({ status: "publishing", publishing_started_at: new Date().toISOString() })
    .eq("id", id).in("status", allowed).select("id");
  if (claim.error) throw claim.error;
  if (!claim.data?.length) throw new Error(post.status === "published" ? "הפוסט כבר פורסם" : "הפוסט כבר בתהליך פרסום או לא זמין לפרסום");

  let testMode = !!post.test_mode;
  if (post.series_id) {
    const { data: s } = await db.from("post_series").select("test_mode").eq("id", post.series_id).maybeSingle();
    testMode = testMode || !!s?.test_mode;
  }
  const { data: accts } = await db.from("social_accounts").select("*").eq("business_id", businessId);
  const acct = (p: string) => (accts || []).find((a) => a.platform === p);
  const results: Record<string, any> = { ...(post.results || {}) };

  for (const target of post.targets as string[]) {
    if (results[target]?.ok && !results[target]?.dry) continue; // retry only what failed — never re-publish a success
    const a = acct(target);
    try {
      if (!a) throw new Error(target === "facebook" ? "עמוד פייסבוק לא מחובר" : "חשבון אינסטגרם לא מחובר");
      const images = postImages(post);
      results[target] = target === "facebook"
        ? await publishFacebook(a, post.body, images, testMode)
        : await publishInstagram(a, post.body, images, testMode);
      if (testMode) results[target] = { ...results[target], at: new Date().toISOString(), note: "מצב בדיקה – לא פורסם בפועל" };
    } catch (e) {
      results[target] = { ok: false, error: (e as Error).message, at: new Date().toISOString() };
    }
  }
  const oks = (post.targets as string[]).filter((t) => results[t]?.ok).length;
  const st = oks === post.targets.length ? "published" : oks ? "partial" : "failed";
  const { data } = await db.from("social_posts").update({
    status: st, results, published_at: oks ? new Date().toISOString() : null, updated_at: new Date().toISOString(), publishing_started_at: null,
  }).eq("id", id).select(POST_COLS).single();
  if (post.series_id) await finishSeriesIfDone(post.series_id);
  return { post: data };
}

async function finishSeriesIfDone(seriesId: string) {
  const { count } = await db.from("social_posts").select("id", { count: "exact", head: true })
    .eq("series_id", seriesId).in("status", ["scheduled", "paused", "publishing"]);
  if (!count) await db.from("post_series").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", seriesId).eq("status", "approved");
}

/* Cron tick (every 5 minutes). A scheduled post is published when it is due AND either it is a single post the
   owner scheduled, or it belongs to a series the owner approved (and did not pause). */
async function runScheduled() {
  const now = new Date();
  // A publish that never finished (timeout / crash): its result is unknown, so stop and ask the owner.
  const stale = new Date(now.getTime() - 10 * 60000).toISOString();
  await db.from("social_posts").update({ status: "attention", results: { error: "הפרסום לא הסתיים – בדקו בעמוד אם הפוסט עלה לפני ניסיון חוזר" } })
    .eq("status", "publishing").lt("publishing_started_at", stale);

  const { data } = await db.from("social_posts").select("id,business_id,series_id")
    .eq("status", "scheduled").lte("scheduled_at", now.toISOString()).order("scheduled_at").limit(10);
  const seriesIds = [...new Set((data || []).map((p) => p.series_id).filter(Boolean))];
  const { data: series } = seriesIds.length ? await db.from("post_series").select("id,status").in("id", seriesIds) : { data: [] as any[] };
  const okSeries = new Set((series || []).filter((s) => s.status === "approved").map((s) => s.id));
  const out = [];
  for (const p of data || []) {
    if (p.series_id && !okSeries.has(p.series_id)) { out.push({ id: p.id, wait: "series not approved" }); continue; }
    try { out.push({ id: p.id, status: (await publishPost(p.business_id, p.id, { scheduled: true })).post?.status }); }
    catch (e) { out.push({ id: p.id, error: (e as Error).message }); }
  }
  return { ran: out.length, out };
}

/* ---------------- post series & calendar ---------------- */
const SERIES_COLS = "id,name,status,test_mode,approved_at,created_at,updated_at";
async function seriesList(businessId: string) {
  const { data: series, error } = await db.from("post_series").select(SERIES_COLS).eq("business_id", businessId).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  const ids = (series || []).map((s) => s.id);
  const { data: posts } = ids.length ? await db.from("social_posts").select("series_id,status,scheduled_at").in("series_id", ids) : { data: [] as any[] };
  return {
    series: (series || []).map((s) => {
      const mine = (posts || []).filter((p) => p.series_id === s.id);
      const upcoming = mine.filter((p) => p.status === "scheduled" && p.scheduled_at).map((p) => p.scheduled_at).sort();
      const counts: Record<string, number> = {};
      mine.forEach((p) => counts[p.status] = (counts[p.status] || 0) + 1);
      return { ...s, total: mine.length, counts, next_at: upcoming[0] || null, last_at: upcoming[upcoming.length - 1] || null };
    }),
  };
}
async function seriesCreate(businessId: string, b: any) {
  await business(businessId);
  if (!String(b.name || "").trim()) throw new Error("תנו שם לסדרה");
  const { data, error } = await db.from("post_series").insert({ business_id: businessId, name: String(b.name).slice(0, 120), test_mode: !!b.test_mode }).select(SERIES_COLS).single();
  if (error) throw error;
  return { series: data };
}
async function seriesControl(businessId: string, b: any) {
  const { data: s } = await db.from("post_series").select("*").eq("id", b.id).eq("business_id", businessId).maybeSingle();
  if (!s) throw new Error("הסדרה לא נמצאה");
  const now = new Date().toISOString();
  const set = async (status: string, extra: any = {}) => {
    const { error } = await db.from("post_series").update({ status, updated_at: now, ...extra }).eq("id", s.id);
    if (error) throw error;
  };
  if (b.action === "approve") {
    // The one explicit approval: from now on the posts of this series publish at their times without asking again.
    if (b.confirm !== "מאשר") throw new Error("נדרש אישור מפורש");
    if (!["draft", "paused"].includes(s.status)) throw new Error("אפשר לאשר רק סדרה בטיוטה או בהשהיה");
    const { count } = await db.from("social_posts").select("id", { count: "exact", head: true }).eq("series_id", s.id).eq("status", "scheduled");
    if (!count) throw new Error("אין בסדרה פוסטים מתוזמנים");
    await set("approved", { approved_at: now });
  } else if (b.action === "pause") {
    if (s.status !== "approved") throw new Error("הסדרה לא פעילה");
    await set("paused");
  } else if (b.action === "cancel") {
    await set("cancelled");
    await db.from("social_posts").update({ status: "cancelled", updated_at: now }).eq("series_id", s.id).in("status", ["scheduled", "paused", "draft"]);
  } else if (b.action === "test") {
    if (s.status === "approved") throw new Error("השהו את הסדרה לפני שינוי מצב בדיקה");
    const { error } = await db.from("post_series").update({ test_mode: !!b.on, updated_at: now }).eq("id", s.id);
    if (error) throw error;
  } else throw new Error("פעולה לא מוכרת");
  return seriesList(businessId);
}
async function postControl(businessId: string, b: any) {
  const now = new Date().toISOString();
  const map: Record<string, [string[], string]> = {
    pause: [["scheduled"], "paused"], resume: [["paused"], "scheduled"], cancel: [["scheduled", "paused", "draft", "failed", "attention"], "cancelled"],
    reschedule: [["scheduled", "paused", "draft", "failed", "cancelled"], "scheduled"], review: [["attention"], "failed"],
  };
  const m = map[b.action]; if (!m) throw new Error("פעולה לא מוכרת");
  const patch: any = { status: m[1], updated_at: now };
  if (b.action === "reschedule") {
    if (!b.scheduled_at || new Date(b.scheduled_at) < new Date()) throw new Error("יש לבחור מועד עתידי");
    patch.scheduled_at = b.scheduled_at;
  }
  if (b.action === "resume") {
    const { data: cur } = await db.from("social_posts").select("scheduled_at").eq("id", b.id).maybeSingle();
    if (!cur?.scheduled_at) throw new Error("לפוסט אין מועד פרסום");
  }
  const { data, error } = await db.from("social_posts").update(patch).eq("id", b.id).eq("business_id", businessId).in("status", m[0]).select(POST_COLS);
  if (error) throw error;
  if (!data?.length) throw new Error("לא ניתן לבצע את הפעולה במצב הנוכחי של הפוסט");
  return { post: data[0] };
}
async function calendar(businessId: string, b: any) {
  const from = b.from || new Date(Date.now() - 7 * 864e5).toISOString();
  const to = b.to || new Date(Date.now() + 60 * 864e5).toISOString();
  const { data, error } = await db.from("social_posts").select(POST_COLS).eq("business_id", businessId)
    .or(`and(scheduled_at.gte.${from},scheduled_at.lte.${to}),and(published_at.gte.${from},published_at.lte.${to})`)
    .order("scheduled_at", { ascending: true }).limit(500);
  if (error) throw error;
  return { posts: data };
}

// Proves publish rights without anything going public: Facebook gets an unpublished photo that is
// deleted at once, Instagram gets a media container that is never passed to media_publish.
async function dryRun(businessId: string, imageUrls: string[]) {
  const { data: accts } = await db.from("social_accounts").select("*").eq("business_id", businessId);
  const appToken = `${env("META_APP_ID")}|${env("META_APP_SECRET")}`;
  const out: Record<string, unknown> = {};
  for (const a of accts || []) {
    const r: Record<string, unknown> = {};
    try {
      const dbg = await graph("debug_token", { input_token: a.access_token, access_token: appToken });
      r.token = { valid: dbg.data?.is_valid, type: dbg.data?.type, expires: dbg.data?.expires_at || 0, scopes: dbg.data?.scopes };
      r.check = a.platform === "facebook"
        ? await publishFacebook(a, "dry-run", imageUrls, true)
        : await publishInstagram(a, "dry-run (not published)", imageUrls, true);
      r.ok = true;
    } catch (e) {
      r.ok = false; r.error = (e as Error).message;
    }
    out[a.platform] = r;
  }
  return out;
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
    if (!(await checkSocialKey(db, req.headers.get("x-social-key") || "")).ok) {
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
      case "dry-run": return json(await dryRun(biz, body.image_urls || [body.image_url]));
      case "disconnect": return json(await disconnect(biz));
      case "upload": return json(await upload(biz, body.base64, body.content_type));
      case "ai-text": return json(await aiText(biz, body.brief || "", body.tone || "", body.platform || ""));
      case "posts": return json(await listPosts(biz));
      case "posts/save": return json(await savePost({ ...body, business_id: biz }));
      case "posts/delete": return json(await deletePost(biz, body.id));
      case "posts/publish": return json(await publishPost(biz, body.id));
      case "posts/control": return json(await postControl(biz, body));
      case "posts/calendar": return json(await calendar(biz, body));
      case "series/list": return json(await seriesList(biz));
      case "series/create": return json(await seriesCreate(biz, body));
      case "series/control": return json(await seriesControl(biz, body));
      default: return json({ error: "route not found", route }, 404);
    }
  } catch (e) {
    console.error(route, e);
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});
