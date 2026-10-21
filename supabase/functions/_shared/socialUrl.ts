// The account address a social link points to, or null when no whole, unambiguous address can be read from it.
// Readers used to test only the start of an href and store all of it, so tracking parameters (?mibextid=…&rdid=…),
// HTML pieces from pages that embed markup in JavaScript ("…/514735495304471 rel=") and share buttons reached the
// registry. Same rules as pg_temp.social_canon in 20261021233000_national_registry_social_junk_cleanup_staging.sql.
export const SOCIAL_NETS = ["facebook", "instagram", "linkedin", "tiktok", "youtube", "twitter", "whatsapp"] as const;

const HOST = /^https?:\/\/(?:www\.|m\.|mobile\.|web\.|he-il\.|[a-z]{2}\.)?(facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com|twitter\.com|x\.com|wa\.me|api\.whatsapp\.com)\/(.*)$/i;
const FB_NOT_PAGE = /^(sharer|sharer\.php|share\.php|plugins|dialog|tr|login|login\.php|policies|events|watch|hashtag|story\.php|permalink\.php|photo\.php|photo|media|home\.php|help|business|gaming|marketplace|reel|reels|stories|l\.php|privacy|legal|ads|search|video\.php|watch\.php)$/i;
const NET_HOST: Record<string, string[]> = {
  facebook: ["facebook.com"], instagram: ["instagram.com"], linkedin: ["linkedin.com"], tiktok: ["tiktok.com"],
  youtube: ["youtube.com"], twitter: ["twitter.com", "x.com"], whatsapp: ["wa.me", "api.whatsapp.com"],
};

export function socialUrl(net: string, raw: string): string | null {
  const m = String(raw || "").replace(/^[\s ‎‏]+|[\s ‎‏]+$/g, "").match(HOST);
  if (!m || !NET_HOST[net]?.includes(m[1].toLowerCase())) return null;
  const rest = m[2], path = rest.split("#")[0].split("?")[0];
  const apath = path.split("&")[0].split(";")[0], seg = apath.split("/")[0];
  // a handle must fill the whole path segment: "facebook.com/לב אחד" is not the page "לב"
  const wholeEscapes = (s: string) => !/%(?![0-9A-Fa-f]{2})/.test(s);
  switch (net) {
    case "facebook": {
      if (/^profile\.php$/i.test(seg)) { const id = rest.match(/^profile\.php\?(?:[^#]*&)?id=(\d{5,})(?:&|#|$)/i); return id ? `https://www.facebook.com/profile.php?id=${id[1]}` : null; }
      if (/^(p|people|pages)$/i.test(seg)) { const id = apath.match(/^[a-z]+\/(?:[^/]+\/)*?[^/]*?[/-](\d{10,})\/?$/i); return id ? `https://www.facebook.com/${id[1]}` : null; }
      if (/^share$/i.test(seg)) { const c = apath.match(/^share\/([A-Za-z0-9]{6,20})\/?$/); return c ? `https://www.facebook.com/share/${c[1]}` : null; }
      if (/^(pg|groups)$/i.test(seg)) { const n = apath.split("/")[1] || ""; return /^[\p{L}\p{N}._%-]{2,400}$/u.test(n) && wholeEscapes(n) ? `https://www.facebook.com/${/^groups$/i.test(seg) ? "groups/" : ""}${n}` : null; }
      if (FB_NOT_PAGE.test(seg)) return null;
      if (!/^[\p{L}\p{N}._%-]{2,400}$/u.test(seg) || /\.(php|html?|js|css|png|jpe?g)$/i.test(seg) || !wholeEscapes(seg)) return null;
      return `https://www.facebook.com/${(seg.match(/-(\d{10,})$/) || [])[1] || seg}`;
    }
    case "instagram":
      if (/^(p|reel|reels|tv|explore|accounts|stories|direct|about|legal)$/i.test(seg) || /^\d{10,}$/.test(seg)) return null;
      return /^[A-Za-z0-9._]{2,30}$/.test(seg) ? `https://www.instagram.com/${seg}/` : null;
    case "linkedin": {
      // company slugs may contain "&" (".../company/johnson-&-johnson"); one that ends with it was cut off
      const x = path.split(";")[0].match(/^(company|school|showcase)\/([^/]{2,150})(?:\/|$)/i);
      return x && /^[\p{L}\p{N}._%&-]+$/u.test(x[2]) && !x[2].endsWith("&") && wholeEscapes(x[2]) ? `https://www.linkedin.com/${x[1].toLowerCase()}/${x[2]}` : null;
    }
    case "tiktok": { const x = apath.match(/^@([A-Za-z0-9._]{2,24})(?:\/|$)/); return x ? `https://www.tiktok.com/@${x[1]}` : null; }
    case "youtube": {
      if (/^channel\/UC[A-Za-z0-9_-]{22}/.test(apath)) return `https://www.youtube.com/channel/${apath.split("/")[1].slice(0, 24)}`;
      // channel names and @handles may be Hebrew (often percent-encoded)
      const n = apath.split("/")[1] || "";
      if (/^(c|user)$/i.test(seg)) return /^[\p{L}\p{N}._%-]{2,400}$/u.test(n) && wholeEscapes(n) ? `https://www.youtube.com/${seg.toLowerCase()}/${n}` : null;
      return /^@[\p{L}\p{N}._%-]{3,400}$/u.test(seg) && wholeEscapes(seg) ? `https://www.youtube.com/${seg}` : null;
    }
    case "twitter":
      // a post (/status/…) may be someone else's: not the business's account
      return /^[A-Za-z0-9_]{1,15}$/.test(seg) && !/^[^/]+\/status\//i.test(apath) && !/^(intent|share|home|i|search|hashtag|login|signup|explore|settings)$/i.test(seg) ? `https://x.com/${seg}` : null;
    case "whatsapp": {
      const d = m[1].toLowerCase() === "wa.me" ? (seg.match(/^(\d{9,15})$/) || [])[1] : (rest.match(/^send\/?\?(?:[^#]*&)?phone=\+?(\d{9,15})(?:&|#|$)/i) || [])[1];
      return d ? `https://wa.me/${d}` : null;
    }
  }
  return null;
}

// first account address per network among the links of a page
export function socialsFrom(links: string[], into: Record<string, string> = {}) {
  for (const h of links) for (const net of SOCIAL_NETS) if (!into[net]) { const u = socialUrl(net, h); if (u) { into[net] = u; break; } }
  return into;
}
