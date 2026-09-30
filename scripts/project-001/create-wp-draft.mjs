import fs from "node:fs";

async function main() {
  const envText = fs.readFileSync(".env.openai", "utf8");
  const creds = {};
  for (const line of envText.split("\n")) {
    if (line.includes("=") && !line.trim().startsWith("#")) {
      const [k, ...v] = line.trim().split("=");
      creds[k.trim()] = v.join("=").trim();
    }
  }

  const wpUrl = (creds.WP_URL || "https://dalia-c.com").replace(/\/+$/, "");
  const username = creds.WP_USERNAME;
  const password = creds.WP_APP_PASSWORD;

  if (!username || !password) {
    throw new Error("Missing WP credentials in .env.openai");
  }

  const auth = "Basic " + Buffer.from(username + ":" + password).toString("base64");

  // Load local draft
  const draftFile = "scripts/project-001/latest-generated-draft.json";
  const draft = JSON.parse(fs.readFileSync(draftFile, "utf8"));

  console.log("Checking if draft already exists on WordPress to avoid duplicates...");
  const searchRes = await fetch(wpUrl + "/wp-json/wp/v2/posts?search=" + encodeURIComponent("קצין רכב") + "&status=any", {
    headers: { Authorization: auth, "User-Agent": "Mozilla/5.0" }
  });
  const existingPosts = await searchRes.json();
  const alreadyExists = existingPosts.find(p => p.title?.rendered?.includes("קצין רכב"));

  let postData;
  if (alreadyExists) {
    console.log("Post already exists on WordPress! ID:", alreadyExists.id, "Status:", alreadyExists.status);
    postData = alreadyExists;
  } else {
    console.log("Creating single controlled WordPress Draft...");
    const payload = {
      title: draft.title,
      content: draft.content_html,
      excerpt: draft.meta_description,
      status: "draft" // STRICTLY DRAFT ONLY
    };

    const createRes = await fetch(wpUrl + "/wp-json/wp/v2/posts", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
      },
      body: JSON.stringify(payload)
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error("Failed to create WP draft: " + createRes.status + " " + errText);
    }

    postData = await createRes.json();
    console.log("Draft created successfully!");
  }

  console.log("Draft ID:", postData.id);
  console.log("Status:", postData.status);
  console.log("Post Type:", postData.type);
  console.log("Canonical Link:", postData.link);

  const previewUrl = `https://dalia-c.com/?p=${postData.id}&preview=true`;
  const editUrl = `https://dalia-c.com/wp-admin/post.php?post=${postData.id}&action=edit`;

  console.log("Preview URL:", previewUrl);
  console.log("Edit URL:", editUrl);

  // Update json files
  draft.wp_draft_id = postData.id;
  draft.wp_status = postData.status;
  draft.wp_preview_url = previewUrl;
  draft.wp_edit_url = editUrl;

  fs.writeFileSync("scripts/project-001/latest-generated-draft.json", JSON.stringify(draft, null, 2), "utf8");
  fs.writeFileSync("public/project-001/latest-generated-draft.json", JSON.stringify(draft, null, 2), "utf8");
  console.log("Updated both draft JSON files with WordPress draft metadata.");
}

main().catch(err => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
