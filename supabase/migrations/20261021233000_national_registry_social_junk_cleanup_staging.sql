-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Social links collected before 21.10.2026 by the website readers (website_crawl, enr:web_deep, enr:site_identify) were
-- checked only at their start (the SOCIAL_RX patterns had no end), so the whole href was stored: tracking parameters
-- chained with "&" (?mibextid=…&rdid=…&share_url=…), HTML pieces ("…/514735495304471 rel=", "…>אר"), trailing spaces /
-- line breaks, links cut at "&" (".../company/shikun&"), and posts that name no account (instagram.com/reel/…, photo.php).
-- They show on the business card and in exports. This migration:
--   1. copies every affected contact point and the card's socials to nr_backup_20261021 first;
--   2. repairs a value to the account address only when it can be read whole and unambiguously from the stored link
--      (page name / profile.php?id / numeric page id of /p/ /people/ /pages/ links / channel id / @handle); several broken
--      copies of the same account, or a copy of an address that already exists, are merged into one row (sources united);
--   3. removes a contact point that holds no account address at all;
--   4. on the card (nr_businesses.socials) replaces / removes a key only when it holds that exact bad value.
-- The readers are fixed in nr-enrichment and national-registry-collector (socialUrl), so new values are stored clean.
BEGIN;

CREATE SCHEMA IF NOT EXISTS nr_backup_20261021;
CREATE TABLE IF NOT EXISTS nr_backup_20261021.social_junk_cp AS SELECT * FROM public.nr_contact_points WHERE false;
CREATE TABLE IF NOT EXISTS nr_backup_20261021.social_junk_biz AS SELECT id, socials FROM public.nr_businesses WHERE false;

-- The account address a stored social link points to, or NULL when no whole, unambiguous address can be read from it.
-- Works on the stored display text (original case: YouTube channel ids are case sensitive). The handle has to fill the
-- whole path segment, so "facebook.com/לב אחד" or "instagram.com/514735495304471 rel=" are not cut down to a wrong name.
CREATE OR REPLACE FUNCTION pg_temp.social_canon(p_net text, p_raw text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  WITH u AS (SELECT regexp_match(btrim(p_raw, E' \t\r\n ‏‎'),
                '^https?://(?:www\.|m\.|mobile\.|web\.|he-il\.|[a-z]{2}\.)?(facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com|twitter\.com|x\.com)/(.*)$', 'i') m),
  p AS (SELECT lower(m[1]) host, m[2] rest, split_part(split_part(m[2], '#', 1), '?', 1) path FROM u),
  q AS (SELECT host, rest, path, split_part(split_part(path, '&', 1), ';', 1) apath, split_part(split_part(split_part(path, '&', 1), ';', 1), '/', 1) seg FROM p)
  SELECT CASE
    WHEN host IS NULL THEN NULL
    WHEN p_net = 'facebook' AND host = 'facebook.com' THEN CASE
      WHEN seg ~* '^profile\.php$' THEN (SELECT 'https://www.facebook.com/profile.php?id=' || x[1] FROM regexp_match(rest, '^profile\.php\?(?:[^#]*&)?id=(\d{5,})(&|#|$)', 'i') x)
      WHEN seg ~* '^(p|people|pages)$' THEN (SELECT 'https://www.facebook.com/' || x[1] FROM regexp_match(apath, '^[a-z]+/(?:[^/]+/)*?[^/]*?[/-](\d{10,})/?$', 'i') x)
      WHEN seg ~* '^share$' THEN (SELECT 'https://www.facebook.com/share/' || x[1] FROM regexp_match(apath, '^share/([A-Za-z0-9]{6,20})/?$', 'i') x)
      WHEN seg ~* '^(pg|groups)$' THEN (SELECT 'https://www.facebook.com/' || CASE WHEN lower(seg) = 'groups' THEN 'groups/' ELSE '' END || n
                                          FROM split_part(apath, '/', 2) n WHERE n ~ '^[[:alnum:]._%-]+$' AND length(n) BETWEEN 2 AND 400 AND n !~ '%(?![0-9A-Fa-f]{2})')
      WHEN seg ~* '^(sharer|sharer\.php|share\.php|plugins|dialog|tr|login|login\.php|policies|events|watch|hashtag|story\.php|permalink\.php|photo\.php|photo|media|home\.php|help|business|gaming|marketplace|reel|reels|stories|l\.php|privacy|legal|ads|search|video\.php|watch\.php)$' THEN NULL
      WHEN seg ~ '^[[:alnum:]._%-]+$' AND length(seg) BETWEEN 2 AND 400 AND seg !~* '\.(php|html?|js|css|png|jpe?g)$' AND seg !~ '%(?![0-9A-Fa-f]{2})'
        THEN 'https://www.facebook.com/' || coalesce((regexp_match(seg, '-(\d{10,})$'))[1], seg)
      END
    WHEN p_net = 'instagram' AND host = 'instagram.com' THEN CASE
      WHEN seg ~* '^(p|reel|reels|tv|explore|accounts|stories|direct|about|legal)$' THEN NULL
      WHEN seg ~ '^\d{10,}$' THEN NULL  -- a Facebook page id put into an Instagram link
      WHEN seg ~ '^[A-Za-z0-9._]{2,30}$' THEN 'https://www.instagram.com/' || seg || '/' END
    WHEN p_net = 'linkedin' AND host = 'linkedin.com' THEN (
      -- company slugs may contain "&" (".../company/johnson-&-johnson"); one that ends with it was cut off
      SELECT 'https://www.linkedin.com/' || lower(x[1]) || '/' || x[2] FROM regexp_match(split_part(path, ';', 1), '^(company|school|showcase)/([^/]{2,150})(/|$)', 'i') x
       WHERE x[2] ~ '^[[:alnum:]._%&-]+$' AND x[2] !~ '&$' AND x[2] !~ '%(?![0-9A-Fa-f]{2})')
    WHEN p_net = 'tiktok' AND host = 'tiktok.com' THEN
      (SELECT 'https://www.tiktok.com/@' || x[1] FROM regexp_match(apath, '^@([A-Za-z0-9._]{2,24})(/|$)') x)
    WHEN p_net = 'youtube' AND host = 'youtube.com' THEN CASE
      WHEN apath ~ '^channel/UC[A-Za-z0-9_-]{22}' THEN 'https://www.youtube.com/channel/' || substr(split_part(apath, '/', 2), 1, 24)
      -- channel names and @handles may be Hebrew (often percent-encoded)
      WHEN seg ~* '^(c|user)$' THEN (SELECT 'https://www.youtube.com/' || lower(seg) || '/' || n FROM split_part(apath, '/', 2) n
                                     WHERE n ~ '^[[:alnum:]._%-]+$' AND length(n) BETWEEN 2 AND 400 AND n !~ '%(?![0-9A-Fa-f]{2})')
      WHEN seg ~ '^@[[:alnum:]._%-]+$' AND length(seg) BETWEEN 4 AND 401 AND seg !~ '%(?![0-9A-Fa-f]{2})' THEN 'https://www.youtube.com/' || seg END
    WHEN p_net = 'twitter' AND host IN ('twitter.com', 'x.com') THEN
      -- a post (/status/…) may be someone else's: not the business's account
      (SELECT 'https://x.com/' || seg WHERE seg ~ '^[A-Za-z0-9_]{1,15}$' AND apath !~* '^[^/]+/status/'
          AND seg !~* '^(intent|share|home|i|search|hashtag|login|signup|explore|settings)$')
  END FROM q
$f$;

-- why a stored social value is junk: a share button, markup / whitespace / chained parameters, a post without an account, cut off
CREATE OR REPLACE FUNCTION pg_temp.social_junk(p_raw text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN p_raw ~* 'facebook\.com/(sharer|share\.php|plugins|dialog|tr)([/.?]|$)' OR p_raw ~* '(twitter|x)\.com/(intent|share|home)([/?]|$)' THEN 'share'
    WHEN p_raw ~ '[][[:space:]"''<>{}\\;&]' OR p_raw ~ E'[ ‎‏]' THEN 'markup'
    WHEN p_raw ~* 'facebook\.com/p/?$|instagram\.com/(p|reel|reels|tv)(/|$)' THEN 'not_account'
    WHEN p_raw ~ '%(?![0-9A-Fa-f]{2})' THEN 'cut_off'
  END
$f$;

-- affected rows: junk, unless the repaired address is the stored one already (".../company/johnson-&-johnson")
CREATE TEMP TABLE sj ON COMMIT DROP AS
SELECT c.*, pg_temp.social_junk(c.display) why, f.fix, lower(rtrim(f.fix, '/')) fixv
  FROM public.nr_contact_points c, LATERAL (SELECT pg_temp.social_canon(c.subkind, c.display) fix) f
 WHERE c.kind = 'social' AND c.subkind IN ('facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'twitter')
   AND pg_temp.social_junk(c.display) IS NOT NULL AND f.fix IS DISTINCT FROM c.display;

CREATE TEMP TABLE before_counts ON COMMIT DROP AS
SELECT subkind, why, count(*) n, count(*) FILTER (WHERE fix IS NOT NULL) repairable FROM sj GROUP BY 1, 2;

INSERT INTO nr_backup_20261021.social_junk_cp
  SELECT c.* FROM public.nr_contact_points c WHERE c.id IN (SELECT id FROM sj);
INSERT INTO nr_backup_20261021.social_junk_biz
  SELECT b.id, b.socials FROM public.nr_businesses b WHERE b.id IN (SELECT business_id FROM sj);

-- where each repaired address goes: a clean row that already holds it, else the oldest broken copy
CREATE TEMP TABLE sj_keep ON COMMIT DROP AS
SELECT g.business_id, g.fixv, g.fix,
       coalesce((SELECT o.id FROM public.nr_contact_points o
                  WHERE o.business_id = g.business_id AND o.kind = 'social' AND o.value = g.fixv AND o.id NOT IN (SELECT id FROM sj)
                  ORDER BY o.id LIMIT 1), g.min_id) keep_id,
       g.srcs, g.first_seen
  FROM (SELECT business_id, fixv, min(fix) fix, min(id) min_id, min(first_seen_at) first_seen,
               (SELECT array_agg(DISTINCT s ORDER BY s) FROM sj s2, unnest(s2.sources) s WHERE s2.business_id = sj.business_id AND s2.fixv = sj.fixv) srcs
          FROM sj WHERE fix IS NOT NULL GROUP BY business_id, fixv) g;

-- the card: a key that holds exactly a bad value takes the repaired address, or the best remaining link, or is removed
CREATE TEMP TABLE sj_card ON COMMIT DROP AS
SELECT DISTINCT ON (sj.business_id, sj.subkind) sj.business_id, sj.subkind, k.fix
  FROM sj JOIN public.nr_businesses b ON b.id = sj.business_id AND b.socials ->> sj.subkind = sj.display
  LEFT JOIN sj_keep k ON k.business_id = sj.business_id AND k.fixv = sj.fixv
 ORDER BY sj.business_id, sj.subkind, sj.id;

-- 1) broken copies that are merged into another row, and values with no account address
DELETE FROM public.nr_contact_points c USING sj
 WHERE c.id = sj.id AND NOT EXISTS (SELECT 1 FROM sj_keep k WHERE k.keep_id = c.id);
-- 2) the kept row: repaired address, united sources
UPDATE public.nr_contact_points c SET
  value = k.fixv,
  display = CASE WHEN c.id IN (SELECT id FROM sj) THEN k.fix ELSE c.display END,
  sources = (SELECT array_agg(DISTINCT s ORDER BY s) FROM unnest(c.sources || k.srcs) s),
  first_seen_at = least(c.first_seen_at, k.first_seen)
  FROM sj_keep k WHERE c.id = k.keep_id;

-- (one key at a time: a business can hold two bad keys)
DO $$
DECLARE r record; v text;
BEGIN
  FOR r IN SELECT * FROM sj_card LOOP
    v := coalesce(r.fix, (SELECT c.display FROM public.nr_contact_points c WHERE c.business_id = r.business_id AND c.kind = 'social'
                            AND c.subkind = r.subkind ORDER BY c.verified DESC, c.src_groups DESC NULLS LAST, c.id LIMIT 1));
    UPDATE public.nr_businesses b SET socials = CASE WHEN v IS NULL THEN b.socials - r.subkind ELSE jsonb_set(b.socials, ARRAY[r.subkind], to_jsonb(v)) END
     WHERE b.id = r.business_id;
  END LOOP;
END $$;

-- has_facebook / has_instagram / … flags of the touched businesses
UPDATE public.nr_businesses SET updated_at = now() WHERE id IN (SELECT business_id FROM sj);
SELECT public.nr_refresh_flags(now());

SELECT (SELECT json_agg(json_build_object('subkind', subkind, 'why', why, 'n', n, 'repairable', repairable) ORDER BY subkind, why) FROM before_counts) affected,
       (SELECT count(*) FROM nr_backup_20261021.social_junk_cp) backed_up_cp,
       (SELECT count(*) FROM sj_keep) kept_repaired,
       (SELECT count(*) FROM sj WHERE fix IS NULL) removed_no_address,
       (SELECT count(*) FROM sj) - (SELECT count(*) FROM sj WHERE fix IS NULL) - (SELECT count(*) FROM sj_keep k WHERE k.keep_id IN (SELECT id FROM sj)) merged_duplicates,
       (SELECT count(*) FROM sj_card) card_keys_fixed,
       (SELECT count(*) FROM public.nr_contact_points c WHERE c.kind = 'social' AND pg_temp.social_junk(c.display) IS NOT NULL
           AND pg_temp.social_canon(c.subkind, c.display) IS DISTINCT FROM c.display) still_junk;

COMMIT;
