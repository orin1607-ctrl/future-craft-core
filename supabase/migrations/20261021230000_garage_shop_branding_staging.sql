-- Migration: 20261021230000_garage_shop_branding_staging.sql
-- Description: Per-garage branding settings (garage_shop_settings) and enriched get_garage_quote_by_token RPC for STAGING

CREATE TABLE IF NOT EXISTS public.garage_shop_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_company_name text NOT NULL UNIQUE DEFAULT '',
  shop_name text NOT NULL DEFAULT 'מוסך יוני',
  shop_title text NOT NULL DEFAULT 'מוסך יוני – פחחות וצבע לרכב',
  subtitle text NOT NULL DEFAULT 'מומחים לפחחות, צבע ושיקום רכב',
  logo_url text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '050-0000000',
  address text NOT NULL DEFAULT 'ישראל',
  email text NOT NULL DEFAULT 'yoni191177@gmail.com',
  business_id text NOT NULL DEFAULT '',
  footer_note text NOT NULL DEFAULT 'תודה שבחרתם במוסך יוני – פחחות וצבע לרכב. נשמח לעמוד לשירותכם.',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.garage_shop_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "garage_shop_settings_select_shop" ON public.garage_shop_settings;
DROP POLICY IF EXISTS "garage_shop_settings_insert_shop" ON public.garage_shop_settings;
DROP POLICY IF EXISTS "garage_shop_settings_update_shop" ON public.garage_shop_settings;
DROP POLICY IF EXISTS "garage_shop_settings_delete_super_admin" ON public.garage_shop_settings;

CREATE POLICY "garage_shop_settings_select_shop" ON public.garage_shop_settings
  FOR SELECT TO authenticated
  USING (
    public.garage_shop_visible(shop_company_name)
    OR shop_company_name = ''
  );

CREATE POLICY "garage_shop_settings_insert_shop" ON public.garage_shop_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.garage_shop_visible(shop_company_name)
  );

CREATE POLICY "garage_shop_settings_update_shop" ON public.garage_shop_settings
  FOR UPDATE TO authenticated
  USING (
    public.garage_shop_visible(shop_company_name)
  )
  WITH CHECK (
    public.garage_shop_visible(shop_company_name)
  );

CREATE POLICY "garage_shop_settings_delete_super_admin" ON public.garage_shop_settings
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Seed default branding for Yoni's Garage (מוסך יוני – פחחות וצבע לרכב)
INSERT INTO public.garage_shop_settings (
  shop_company_name,
  shop_name,
  shop_title,
  subtitle,
  logo_url,
  phone,
  address,
  email,
  business_id,
  footer_note
) VALUES (
  '',
  'מוסך יוני',
  'מוסך יוני – פחחות וצבע לרכב',
  'מומחים לפחחות, צבע ושיקום רכב מתקדם',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80" width="240" height="80"><rect width="240" height="80" rx="14" fill="%230f172a"/><rect x="3" y="3" width="234" height="74" rx="11" fill="none" stroke="%2338bdf8" stroke-width="2"/><g transform="translate(185, 16)"><circle cx="24" cy="24" r="22" fill="%230284c7"/><path d="M12 28 L16 19 L32 19 L36 28 Z" fill="%23ffffff"/><rect x="10" y="26" width="28" height="8" rx="3" fill="%2338bdf8"/><circle cx="16" cy="34" r="4" fill="%230f172a" stroke="%23ffffff" stroke-width="2"/><circle cx="32" cy="34" r="4" fill="%230f172a" stroke="%23ffffff" stroke-width="2"/></g><text x="170" y="36" font-family="Heebo, Arial, sans-serif" font-size="22" font-weight="900" fill="%23ffffff" text-anchor="end" direction="rtl">מוסך יוני</text><text x="170" y="58" font-family="Heebo, Arial, sans-serif" font-size="13" font-weight="700" fill="%2338bdf8" text-anchor="end" direction="rtl">פחחות וצבע לרכב</text></svg>',
  '',
  '',
  'yoni191177@gmail.com',
  '',
  'תודה שבחרתם במוסך יוני – פחחות וצבע לרכב.'
)
ON CONFLICT (shop_company_name) DO UPDATE
SET
  shop_name = EXCLUDED.shop_name,
  shop_title = EXCLUDED.shop_title,
  logo_url = CASE WHEN public.garage_shop_settings.logo_url = '' THEN EXCLUDED.logo_url ELSE public.garage_shop_settings.logo_url END;

-- Enhance get_garage_quote_by_token to include per-garage branding and case pricing/media info
CREATE OR REPLACE FUNCTION public.get_garage_quote_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_row public.garage_quote_links%ROWTYPE;
  v_case public.garage_cases%ROWTYPE;
  v_shop public.garage_shop_settings%ROWTYPE;
  v_shop_json jsonb;
  v_media jsonb := '[]'::jsonb;
  v_global_price numeric := null;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'קישור הצעת המחיר אינו תקין';
  END IF;

  SELECT * INTO v_row
  FROM public.garage_quote_links
  WHERE token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND OR v_row.status = 'revoked' THEN
    RAISE EXCEPTION 'הצעת המחיר לא נמצאה או שהקישור בוטל';
  END IF;

  -- Load per-shop branding (exact match or default '')
  SELECT * INTO v_shop
  FROM public.garage_shop_settings
  WHERE shop_company_name = coalesce(v_row.shop_company_name, '')
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_shop
    FROM public.garage_shop_settings
    WHERE shop_company_name = ''
    LIMIT 1;
  END IF;

  IF FOUND THEN
    v_shop_json := jsonb_build_object(
      'shop_company_name', v_shop.shop_company_name,
      'shop_name', v_shop.shop_name,
      'shop_title', v_shop.shop_title,
      'subtitle', v_shop.subtitle,
      'logo_url', v_shop.logo_url,
      'phone', v_shop.phone,
      'address', v_shop.address,
      'email', v_shop.email,
      'business_id', v_shop.business_id,
      'footer_note', v_shop.footer_note
    );
  ELSE
    v_shop_json := jsonb_build_object(
      'shop_company_name', coalesce(v_row.shop_company_name, ''),
      'shop_name', CASE WHEN coalesce(v_row.shop_company_name, '') <> '' THEN v_row.shop_company_name ELSE 'מוסך יוני' END,
      'shop_title', CASE WHEN coalesce(v_row.shop_company_name, '') <> '' THEN v_row.shop_company_name ELSE 'מוסך יוני – פחחות וצבע לרכב' END,
      'subtitle', 'פחחות וצבע לרכב',
      'logo_url', '',
      'phone', '',
      'address', '',
      'email', 'yoni191177@gmail.com',
      'business_id', '',
      'footer_note', 'תודה שבחרתם במוסך יוני – פחחות וצבע לרכב.'
    );
  END IF;

  -- Load case_data for global price or extra fields if present
  SELECT * INTO v_case
  FROM public.garage_cases
  WHERE id = v_row.case_id
  LIMIT 1;

  IF FOUND AND v_case.case_data IS NOT NULL THEN
    BEGIN
      IF (v_case.case_data->>'finalApprovedAmount') IS NOT NULL AND (v_case.case_data->>'finalApprovedAmount') <> '' THEN
        v_global_price := (v_case.case_data->>'finalApprovedAmount')::numeric;
      ELSIF (v_case.case_data->>'workOrderAmount') IS NOT NULL AND (v_case.case_data->>'workOrderAmount') <> '' THEN
        v_global_price := (v_case.case_data->>'workOrderAmount')::numeric;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_global_price := null;
    END;
  END IF;

  -- Load damage/quote photos metadata for this case
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', gm.id,
    'title', gm.title,
    'category', gm.category,
    'storage_path', gm.storage_path,
    'mime_type', gm.mime_type
  )), '[]'::jsonb)
  INTO v_media
  FROM public.garage_media gm
  WHERE gm.garage_case_id = v_row.case_id
    AND gm.category IN ('damage', 'quote_photos', 'intake', 'angles');

  RETURN jsonb_build_object(
    'id', v_row.id,
    'token', v_row.token,
    'case_id', v_row.case_id,
    'case_number', v_row.case_number,
    'quote_version', v_row.quote_version,
    'quote_title', v_row.quote_title,
    'customer_name', v_row.customer_name,
    'recipient_phone', v_row.recipient_phone,
    'recipient_email', v_row.recipient_email,
    'vehicle_plate', v_row.vehicle_plate,
    'quote_date', v_row.quote_date,
    'work_type', v_row.work_type,
    'quote_works', v_row.quote_works,
    'quote_parts', v_row.quote_parts,
    'priced_subtotal', v_row.priced_subtotal,
    'global_price', v_global_price,
    'priced_lines_count', v_row.priced_lines_count,
    'unpriced_lines_count', v_row.unpriced_lines_count,
    'vat_rate', v_row.vat_rate,
    'vat_mode', v_row.vat_mode,
    'damage_photos_attached', v_row.damage_photos_attached,
    'damage_photos_count', v_row.damage_photos_count,
    'damage_photos', v_media,
    'quote_notes', v_row.quote_notes,
    'status', v_row.status,
    'sent_at', v_row.sent_at,
    'signed_at', v_row.signed_at,
    'signer_name', v_row.signer_name,
    'signature_data_url', v_row.signature_data_url,
    'shop_branding', v_shop_json,
    'created_at', v_row.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_garage_quote_by_token(text) TO anon, authenticated;
